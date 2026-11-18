#!/usr/bin/env node
// Public SDK workflow checks. Only temporary files and a loopback server are used.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {metadata,migrate,scaffold} from './prism-module.mjs';
import {serve} from './prism-dev.mjs';
const root = await mkdtemp(join(tmpdir(),'prism-sdk-test-'));
let server;
let checks = 0;
const check = (value,message) => { assert.ok(value,message); checks++; };
try {
  const project = join(root,'module'); scaffold(project,'example.sdk.workflow');
  const source = await readFile(join(project,'module.js'),'utf8');
  check(metadata(source).id === 'example.sdk.workflow','scaffold is a valid module');
  check(execFileSync(process.execPath,[join(project,'tools/prism-module.mjs'),'check',join(project,'module.js')],{encoding:'utf8'}).includes('valid Prism module'),'copied CLI runs through real and symlinked temporary paths');
  const widget = "WidgetMetadata={id:'example.widget',title:'Widget',version:'1',requiredVersion:'99',modules:[{id:'list',functionName:'list'}]}; function list(){return []}";
  const converted = migrate(widget);
  check(metadata(converted).compatibility.requiredVersion === '99','migration preserves foreign requirements');
  check(metadata(converted).requiredVersion === '0.1.0','migration validates against Prism');
  check(migrate(source) === source,'native sources are unchanged');
  assert.throws(() => migrate('REXENC:fixture')); checks++;
  assert.throws(() => migrate(widget.replace('function list()', 'function absent()'))); checks++;
  assert.throws(() => metadata(source.replace('functionName:"list",','')), /functionName/); checks++;
  assert.throws(() => metadata(source.replace('requiredVersion:"0.1.0"', 'requiredVersion:"99.0.0"')), /requiredVersion/); checks++;
  assert.throws(() => metadata(source, '0.0.1'), /requiredVersion/); checks++;
  assert.throws(() => metadata('PrismMetadata={schemaVersion:1,id:"fixture.no.library",title:"Fixture",version:"1",capabilities:["library"],modules:[]}'), /capabilities/); checks++;
  const fixtures = join(root,'fixtures.json'), executable = join(root,'test.js');
  await writeFile(fixtures, JSON.stringify([{method:'request',match:{url:'https://fixture.invalid/list',params:{page:2}},response:{statusCode:200,data:'<b>Fixture</b>'}}]));
  await writeFile(executable, `
    PrismMetadata={schemaVersion:1,id:"fixture.run",title:"Fixture",version:"1",globalParams:[{name:"access",secret:true}],modules:[
      {id:"movies",functionName:"list",params:[{name:"kind",type:"constant",value:"movie"},{name:"page",type:"page"}]},
      {id:"series",functionName:"list",params:[{name:"kind",type:"constant",value:"tv"},{name:"page",type:"page"}]}
    ]};
    function list(p) {
      const r=Prism.http.get("https://fixture.invalid/list",{params:{page:p.page},headers:{Authorization:p.access}});
      console.log("request",p.access,{"Authorization":p.access});
      return [{id:"result",type:"tmdb",mediaType:p.kind,title:Prism.html.load(r.data)("b").text()}];
    }
  `);
  const output = execFileSync(process.execPath,[join(project,'tools/prism-module.mjs'),'run',executable,'series','--params','{"page":2,"access":"test-access-value"}','--fixtures',fixtures],{encoding:'utf8'});
  const report = JSON.parse(output);
  check(report.result[0].title === 'Fixture' && report.result[0].mediaType === 'tv' && report.calls[0].status === 200,'runner uses exact entry scope and replays HTTP and HTML parsing');
  check(!output.includes('test-access-value') && report.argument.access === '[redacted]','runner sanitizes inputs, request headers and console output');
  await writeFile(join(project,'private.json'),'fixture-private');
  await writeFile(join(root,'outside.js'),'fixture-outside');
  await symlink(join(root,'outside.js'),join(project,'escape.js'));
  server = await serve(project,0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(base+'/module.js');
  check(initial.status === 200 && await initial.text() === source,'server returns complete source');
  const cached = await fetch(base+'/module.js',{headers:{'If-None-Match':initial.headers.get('etag')}});
  check(cached.status === 304,'ETag reflects unchanged bytes');
  await writeFile(join(project,'module.js'),source+'\n// Updated\n');
  check((await (await fetch(base+'/module.js')).text()).includes('// Updated'),'development edits are immediately served');
  check((await fetch(base+'/private.json')).status === 403,'non-module files are not served');
  check((await fetch(base+'/escape.js')).status === 403,'symlinks cannot escape root');
  check((await fetch(base+'/%2e%2e%2foutside.js')).status === 403,'encoded traversal cannot escape root');
  check((await fetch(base+'/module.js',{method:'POST'})).status === 405,'server accepts no writes');
  console.log(`Prism SDK: ${checks} workflow checks passed`);
} finally {
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(root,{recursive:true,force:true});
}
