import { readFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import vm from 'node:vm';
import { isDeepStrictEqual } from 'node:util';
import { object } from './prism-contract.mjs';

function resolveEntry(meta, id) {
  if (id.startsWith('@options:')) {
    const parts = id.slice('@options:'.length).split(':');
    const scope = parts.length === 2 ? resolveEntry(meta,parts[0]).params : meta.globalParams;
    const parameter = scope?.find(item => item.name === parts.at(-1) && item.type === 'enumeration');
    if (!parameter?.dynamicOptions) throw Error(`No dynamic options for ${id}`);
    return {functionName:parameter.dynamicOptions.functionName,kind:'options',params:parts.length === 2 ? scope : []};
  }
  if (id === '@search' && meta.search) return {...meta.search, kind:'media'};
  if (id === '@detail') return {functionName:meta.detailFunction ?? 'loadDetail', kind:'detail', stringArgument:!meta.detailFunction};
  if (id === '@home' && meta.library?.homeFunction) return {functionName:meta.library.homeFunction,kind:'media'};
  if (id === '@browse' && meta.library?.browseFunction) return {functionName:meta.library.browseFunction,kind:'media'};
  if (id === '@subtitleArchive') return {functionName:'resolveSubtitleArchive',kind:'archive'};
  const feature = meta.modules?.find(feature => feature.id === id);
  if (feature) return {...feature, kind:feature.type ?? 'media'};
  throw Error(`Unknown entry ID ${id}. Available: ${(meta.modules ?? []).map(feature => feature.id).join(', ')}`);
}

function argumentsFor(meta, entry, supplied) {
  if (entry.stringArgument) {
    if (typeof supplied.link !== 'string') throw Error('params.link: expected a detail route string');
    return supplied.link;
  }
  const widget = meta.compatibility?.format === 'widget';
  const declarations = [...(meta.globalParams ?? []), ...(entry.params ?? [])];
  const values = widget ? Object.fromEntries(Object.entries(supplied).map(([key,value]) => [key,String(value)])) : {...supplied};
  const visible = (parameter, state) => {
    const raw = parameter.conditions ?? parameter.belongTo;
    return (raw == null ? [] : Array.isArray(raw) ? raw : [raw]).every(condition =>
      Object.hasOwn(state,condition.paramName) && condition.value.map(String).includes(String(state[condition.paramName])));
  };
  if (widget) {
    for (let round = 0; round <= declarations.length; round++) {
      const previous = {...values};
      for (const parameter of declarations) {
        const {name,type} = parameter;
        if (!visible(parameter, values)) {
          if (!Object.hasOwn(supplied,name)) delete values[name];
          continue;
        }
        const defaults = {page:parameter.startPage === 0 ? 0 : 1, offset:0, count:0, language:'zh-CN',
          timezone:'Asia/Shanghai', folder:'-1', userId:'prism-test', configId:'prism-test-config',
          input:parameter.placeholders?.[0]?.value, enumeration:parameter.enumOptions?.[0]?.value};
        const fallback = ['page','offset','userId','configId'].includes(type) ? defaults[type] : parameter.value ?? defaults[type];
        if (values[name] == null && fallback != null) values[name] = String(fallback);
      }
      if (isDeepStrictEqual(previous,values)) break;
    }
  } else {
    for (const parameter of declarations) {
      const {name,type} = parameter;
      const fallback = parameter.value ?? parameter.enumOptions?.[0]?.value ?? (type === 'language' ? 'zh-CN' : '');
      let value = supplied[name] ?? String(fallback);
      if (type === 'userId') value = 'prism-test';
      if (type === 'constant') value = String(fallback);
      if (['page','offset','count'].includes(type)) {
        value = /^[-+]?\d+$/.test(String(value)) ? Number(value) : ({page:1,offset:0,count:20})[type];
      } else if (type === 'number') value = Number(value) || 0;
      else if (type === 'boolean') value = String(value) === 'true';
      values[name] = value;
    }
    const resolved = {...values};
    for (const parameter of declarations) if (!visible(parameter, resolved)) delete values[parameter.name];
  }
  const sources = meta.library?.sources ?? [];
  if (!widget && sources.length) values.sourceId = sources[0].id;
  return values;
}

function issuesFor(result, kind) {
  const issues = [];
  const add = (path,message) => { if (issues.length < 40) issues.push({level:'error',path,message}); };
  function check(value, path, depth = 0) {
    if (depth > 6 || issues.length >= 40) return;
    if (Array.isArray(value)) {
      value.slice(0,2000).forEach((item,index) => check(item,`${path}[${index}]`,depth+1));
      return;
    }
    if (!object(value) || Object.keys(value).length === 0) { add(path,'expected an object'); return; }
    if (kind === 'options') {
      for (const key of ['title','value']) if (typeof value[key] !== 'string') add(`${path}.${key}`,'expected a string');
      return;
    }
    for (const key of ['title','name','type','mediaType','link']) {
      if (key in value && typeof value[key] !== 'string') add(`${path}.${key}`,'expected a string');
    }
    if (kind === 'stream' || kind === 'subtitle') {
      let url;
      try { url = new URL(value.url ?? value.videoUrl); } catch {}
      if (!url || !['http:','https:'].includes(url.protocol)) add(`${path}.url`,'expected an HTTP(S) URL');
    }
    for (const key of ['sections','items','data','episodeItems','childItems','relatedItems']) {
      if (key in value) check(value[key],`${path}.${key}`,depth+1);
    }
  }
  if (!['media','media_list','search','detail','stream','subtitle','options'].includes(kind)) return issues;
  if (kind === 'options' && !Array.isArray(result)) { add('$','expected an options array'); return issues; }
  if (result == null && kind === 'detail') return issues;
  check(result,'$');
  return issues;
}

function redact(value, secrets) {
  if (typeof value === 'string') {
    let safe = value.replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>#]+/gi, '$1?[redacted]')
      .replace(/\b(authorization|cookie|token|password|secret|api[_-]?key)\b\s*[=:]\s*[^,\r\n}]+/gi, '$1=[redacted]');
    for (const secret of secrets) safe = safe.replaceAll(secret,'[redacted]');
    return safe;
  }
  if (Array.isArray(value)) return value.map(item => redact(item,secrets));
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key,item]) =>
    [key, /^(authorization|cookie|set-cookie)$/i.test(key) || /token|secret|password|api[_-]?key/i.test(key) ? '[redacted]' : redact(item,secrets)]));
  return value;
}

async function execute({source, id, supplied, fixtures, target}) {
  const { metadata } = await import('./prism-module.mjs');
  const meta = metadata(source, target), entry = resolveEntry(meta,id);
  if (entry.requiresWebView) throw Error('This entry requires a web view');
  const argument = argumentsFor(meta,entry,supplied);
  const declarations = [...(meta.globalParams ?? []), ...(entry.params ?? [])];
  const secrets = declarations.filter(p => p.secret ?? (!/^(keyword|query|search)$/i.test(p.name) && /key|token|password|secret/i.test(p.name)))
    .flatMap(p => [p.value, object(argument) ? argument[p.name] : null]).filter(value => typeof value === 'string' && value);
  const calls = [], logs = [], state = new Map(), shared = new Map(), unmatched = [];
  let syntaxContext;
  function request(method, target, options, widget = false) {
    const started = Date.now();
    const identifier = method === 'tmdb' ? 'api' : 'url';
    const call = {method,[identifier]:target,options};
    const match = fixtures.find(row => row.method === method && object(row.match) && Object.entries(row.match)
      .every(([name,value]) => isDeepStrictEqual(structuredClone(call[name] ?? options?.[name]),value)));
    if (!match) {
      calls.push({...call,error:'unmatched fixture',milliseconds:Date.now()-started});
      unmatched.push({level:'error',path:'requests',message:`No fixture for ${method} ${target}`});
      throw Error(`No fixture for ${method} ${target}`);
    }
    if (method === 'tmdb') {
      calls.push({...call,status:200,milliseconds:Date.now()-started});
      return match.response;
    }
    const response = match.response ?? {};
    const status = response.statusCode ?? response.status ?? 200;
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? null);
    const data = options?.base64Data ? Buffer.from(body).toString('base64') : options?.decodable === false ? body : response.data;
    const value = {data,body,status,statusCode:status,headers:response.headers ?? {},toString(){return body;}};
    calls.push({...call,status,milliseconds:Date.now()-started});
    if (response.error || status < 200 || (status >= 300 && (widget || options?.allow_redirects !== false || status >= 400))) {
      const error = Error(response.error ?? `HTTP ${status}`);
      if (!response.error) error.response = value;
      throw error;
    }
    Object.defineProperty(value,'then',{value:(resolve,reject) => Promise.resolve({...value}).then(resolve,reject)});
    return value;
  }
  const httpRequest = (options, widget = false) => {
    const settings = {...options};
    if (widget) {
      for (const key of ['base64Data','zlibMode','allow_redirects','decodable']) {
        if (settings[key] === 'true' || settings[key] === 'false') settings[key] = settings[key] === 'true';
      }
      if (typeof settings.timeout === 'string') settings.timeout = Number(settings.timeout);
    }
    return request('request',settings.url,settings,widget);
  };
  const http = {
    request:httpRequest,
    get:(url,options) => httpRequest({...options,url,method:'GET'}),
    post:(url,data,options) => httpRequest({...options,url,method:'POST',data}),
    requestAsync:async options => httpRequest(options),
    getAsync:async (url,options) => httpRequest({...options,url,method:'GET'}),
    postAsync:async (url,data,options) => httpRequest({...options,url,method:'POST',data})
  };
  const widgetRequest = (method,url,options,data) => {
    const opts = {...options,url,method};
    delete opts.timeout;
    delete opts.decodable;
    if (data !== undefined) opts.data = data;
    return httpRequest(opts,true);
  };
  const storage = {
    get:(key,fallback) => state.get(String(key)) != null ? structuredClone(state.get(String(key))) : fallback,
    set:(key,value) => state.set(String(key),structuredClone(value)),
    remove:key => state.delete(String(key)), keys:() => [...state.keys()].sort(), clear:() => state.clear()
  };
  storage.getAsync = async (...args) => storage.get(...args);
  storage.setAsync = async (...args) => { storage.set(...args); };
  const Prism = {
    server:'', http, storage,
    tmdb:{get:(api,options) => request('tmdb',api,options ?? {})},
    sharedCache:{
      get:(namespace,key) => structuredClone(shared.get(JSON.stringify([namespace,key])) ?? null),
      set:(namespace,key,value) => shared.set(JSON.stringify([namespace,key]),structuredClone(value)),
      remove:(namespace,key) => shared.delete(JSON.stringify([namespace,key]))
    },
    html:{load:(html,options) => {
      if (!syntaxContext.cheerio) {
        const locations = ['./cheerio.bundle.js','../assets/cheerio.bundle.js','../Prs/Resources/BuiltinModules/cheerio.bundle.js'];
        let bundle;
        for (const location of locations) {
          try { bundle = readFileSync(new URL(location,import.meta.url),'utf8'); break; } catch {}
        }
        if (!bundle) throw Error('Prism HTML parser bundle is missing');
        vm.runInContext(bundle,syntaxContext,{timeout:1000});
      }
      return syntaxContext.cheerio.load(html,options);
    }}
  };
  const Widget = {...Prism, i18n: text => meta.i18n?.['zh-CN']?.[text] ?? meta.i18n?.['zh-Hans']?.[text] ?? meta.i18n?.zh?.[text] ?? text,
    tmdb:{get:async (api,options) => Prism.tmdb.get(api,options)},
    http:{
      request:async options => httpRequest(options,true),
      get:async (url,options) => widgetRequest('GET',url,options),
      post:async (url,data,options) => widgetRequest('POST',url,options,data),
      put:async (url,data,options) => widgetRequest('PUT',url,options,data),
      delete:async (url,options) => widgetRequest('DELETE',url,options)
    }};
  const console = Object.fromEntries(['log','info','warn','error'].map(level =>
    [level,(...values) => { if (logs.length < 40) logs.push({level,values:structuredClone(values)}); }]));
  syntaxContext = vm.createContext({Prism,Widget,console,URL,__prismArgument:argument});
  vm.runInContext(source,syntaxContext,{timeout:1000});
  let result, error;
  try {
    result = await vm.runInContext(`${entry.functionName}(__prismArgument)`,syntaxContext,{timeout:3000});
  } catch (failure) { error = String(failure?.message ?? failure); }
  return redact({entry:id,argument,result,issues:[...unmatched,...(error ? [] : issuesFor(result,entry.kind))],calls,logs,error},secrets);
}

export async function runCommand([filename,id,...flags], target) {
  let supplied = {}, fixtures = [];
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index], value = flags[index + 1];
    if (flag === '--params' && value) supplied = JSON.parse(value);
    else if (flag === '--fixtures' && value) fixtures = JSON.parse(readFileSync(value,'utf8'));
    else throw Error(`Unknown or incomplete option: ${flag}`);
  }
  if (!object(supplied) || !Array.isArray(fixtures)) throw Error('Use a JSON object for params and an array for fixtures');
  const worker = new Worker(new URL(import.meta.url), {workerData:{source:readFileSync(filename,'utf8'),id,supplied,fixtures,target}});
  try {
    const report = await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(Error('Module run timed out')),12000);
      const settle = callback => value => { clearTimeout(timer); callback(value); };
      worker.once('message',settle(resolve));
      worker.once('error',settle(reject));
      worker.once('exit',settle(code => reject(Error(`Module worker exited (${code})`))));
    });
    console.log(JSON.stringify(report,null,2));
    if (report.error || report.issues?.length) process.exitCode = 1;
  } finally {
    await worker.terminate();
  }
}

if (!isMainThread) {
  try { parentPort.postMessage(await execute(workerData)); }
  catch (error) { parentPort.postMessage({entry:workerData.id,error:String(error?.message ?? error)}); }
}
