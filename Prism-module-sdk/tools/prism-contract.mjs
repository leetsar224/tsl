export const hostVersion = '0.1.1';
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/;
const handlerPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const capabilities = new Set(['catalog', 'search', 'stream', 'subtitle', 'danmaku', 'library']);
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireField(condition, path, message) {
  if (!condition) throw Error(`${path}: ${message}`);
}

function array(value, path) {
  if (value == null) return [];
  requireField(Array.isArray(value), path, 'expected an array');
  return value;
}

function stringFields(value, path, fields) {
  for (const field of fields) {
    if (value[field] != null) requireField(typeof value[field] === 'string', `${path}.${field}`, 'expected a string');
  }
}

function unique(rows, key, path) {
  const names = new Set();
  for (const [index, row] of rows.entries()) {
    requireField(object(row) && typeof row[key] === 'string' && row[key].length && !names.has(row[key]),
      `${path}[${index}].${key}`, 'expected a unique nonempty string');
    names.add(row[key]);
  }
}

function cacheDuration(value, path) {
  if (value != null) requireField(typeof value === 'number' && value >= 0 && value <= 86400, path, 'expected 0–86400 seconds');
}

function conditions(parameter) {
  const value = parameter.conditions ?? parameter.belongTo;
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function checkParameters(value, path, handlers) {
  const params = array(value, path);
  unique(params, 'name', path);
  const scalar = value => ['string', 'number', 'boolean'].includes(typeof value);
  for (const [index, parameter] of params.entries()) {
    const field = `${path}[${index}]`;
    stringFields(parameter, field, ['title', 'type', 'description']);
    for (const key of ['enumOptions', 'placeholders']) {
      requireField(array(parameter[key], `${field}.${key}`).every(option => object(option) && typeof option.title === 'string' && scalar(option.value)),
        `${field}.${key}`, 'expected options with title and value');
    }
    requireField(conditions(parameter).every(condition => object(condition) && typeof condition.paramName === 'string'
      && Array.isArray(condition.value) && condition.value.every(scalar)), `${field}.belongTo`, 'expected a condition or an array of conditions');
    requireField(parameter.secret == null || typeof parameter.secret === 'boolean', `${field}.secret`, 'expected a boolean');
    requireField(parameter.startPage == null || Number.isInteger(parameter.startPage), `${field}.startPage`, 'expected an integer');
    if (parameter.dynamicOptions != null) {
      const options = parameter.dynamicOptions;
      requireField(object(options) && typeof options.functionName === 'string' && handlerPattern.test(options.functionName)
        && array(options.dependsOn, `${field}.dynamicOptions.dependsOn`).every(name => typeof name === 'string'),
      `${field}.dynamicOptions`, 'expected a handler and optional dependency names');
      handlers.push([options.functionName, `${field}.dynamicOptions.functionName`]);
    }
  }
}

export function validateManifest(meta, target = hostVersion) {
  requireField(object(meta) && meta.schemaVersion === 1, 'PrismMetadata.schemaVersion', 'expected protocol version 1');
  requireField(typeof meta.id === 'string' && idPattern.test(meta.id), 'PrismMetadata.id', 'expected a valid module ID');
  requireField(typeof meta.version === 'string' && versionPattern.test(meta.version), 'PrismMetadata.version', 'expected a valid module version');
  requireField(typeof meta.title === 'string' && meta.title.trim(), 'PrismMetadata.title', 'expected a nonempty title');
  stringFields(meta, 'PrismMetadata', ['description', 'author', 'requiredVersion', 'site', 'icon', 'iconurl', 'updateUrl', 'changelog', 'detailFunction']);
  if (target != null) {
    requireField(versionPattern.test(target), '--target', 'expected a host version');
    const compare = new Intl.Collator('en', {numeric: true, sensitivity: 'variant'});
    requireField(meta.requiredVersion == null || compare.compare(meta.requiredVersion, target) <= 0,
      'PrismMetadata.requiredVersion', `requires Prism ${meta.requiredVersion}, target is ${target}`);
  }
  for (const field of ['site','icon','iconurl','updateUrl']) {
    if (!meta[field]) continue;
    let parsed;
    try { parsed = new URL(meta[field], 'https://fixture.invalid/'); } catch {}
    requireField(parsed && ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password,
      `PrismMetadata.${field}`, 'expected an HTTP(S) address or relative path');
  }
  const modules = array(meta.modules, 'modules');
  if (meta.compatibility?.format === 'widget') {
    for (const feature of modules) if (object(feature)) feature.id ??= feature.functionName;
  }
  unique(modules, 'id', 'modules');
  requireField(meta.search == null || object(meta.search), 'search', 'expected an object');
  requireField(meta.library == null || object(meta.library), 'library', 'expected an object');
  requireField(meta.search == null || !modules.some(row => row.id === 'search'), 'modules', 'ID search is reserved by the top-level search');
  const sources = array(meta.library?.sources, 'library.sources');
  unique(sources, 'id', 'library.sources');
  requireField(sources.every(row => typeof row.title === 'string'), 'library.sources', 'source titles must be strings');
  const declared = array(meta.capabilities, 'capabilities');
  requireField(declared.every(value => capabilities.has(value)), 'capabilities', 'unknown module capability');
  const isSearch = feature => feature.type === 'search' || feature.type == null && (Array.isArray(feature.params) ? feature.params : []).some(p => /^(keyword|query|search)$/i.test(p?.name));
  const listing = feature => !isSearch(feature) && (feature.type == null || feature.type === 'media_list')
    && !['searchDanmu','getDetail','getComments','getCommentsWithSegmentTime','getDanmuWithSegmentTime'].includes(feature.id);
  const hasSearch = meta.capabilities == null ? !!meta.search || modules.some(isSearch) : declared.includes('search');
  if (declared.includes('library')) {
    requireField(meta.library?.homeFunction != null || modules.some(listing) || hasSearch, 'capabilities', 'library needs a list, search or home entry');
  } else if (meta.capabilities != null) {
    requireField(meta.library?.homeFunction == null, 'capabilities', 'library.homeFunction requires the library capability');
  }
  if (meta.library) {
    stringFields(meta.library, 'library', ['title','homeFunction','browseFunction']);
    requireField(meta.library.allowIntegration == null || typeof meta.library.allowIntegration === 'boolean', 'library.allowIntegration', 'expected a boolean');
  }
  const handlers = [];
  checkParameters(meta.globalParams, 'globalParams', handlers);
  for (const [path, feature] of [...modules.map((row, index) => [`modules[${index}]`, row]), ...(meta.search ? [['search', meta.search]] : [])]) {
    stringFields(feature, path, ['title','type','description']);
    requireField(typeof feature.functionName === 'string' && handlerPattern.test(feature.functionName), `${path}.functionName`, 'expected a handler name');
    handlers.push([feature.functionName, `${path}.functionName`]);
    for (const key of ['requiresWebView','sectionMode']) {
      requireField(feature[key] == null || typeof feature[key] === 'boolean', `${path}.${key}`, 'expected a boolean');
    }
    cacheDuration(feature.cacheDuration, `${path}.cacheDuration`);
    checkParameters(feature.params, `${path}.params`, handlers);
  }
  cacheDuration(meta.detailCacheDuration, 'detailCacheDuration');
  for (const [name, path] of [[meta.detailFunction, 'detailFunction'], [meta.library?.homeFunction, 'library.homeFunction'], [meta.library?.browseFunction, 'library.browseFunction']]) {
    if (name != null) handlers.push([name, path]);
  }
  for (const [name, path] of handlers) requireField(handlerPattern.test(name), path, 'expected a handler name');
  return handlers;
}

export function validArtifactIdentity(id, version) {
  return typeof id === 'string' && idPattern.test(id) && typeof version === 'string' && versionPattern.test(version);
}
