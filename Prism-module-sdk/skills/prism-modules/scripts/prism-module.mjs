#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, generateKeyPairSync, createPublicKey, diffieHellman, hkdfSync, randomBytes, createCipheriv } from 'node:crypto';
import vm from 'node:vm';
import { hostVersion, validArtifactIdentity, validateManifest } from './prism-contract.mjs';

export const algorithm = 'X25519-HKDF-SHA256-A256GCM';
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const encode = value => JSON.stringify(value, null, 2) + '\n';
function write(path, data, mode = 0o644) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, data, { mode }); chmodSync(path, mode);
}
export function metadata(source, target = hostVersion) {
  if (Buffer.byteLength(source) > 2097152) throw Error('Module source exceeds 2 MiB');
  const context = vm.createContext({});
  vm.runInContext(source, context, { timeout: 1000 });
  const value = JSON.parse(vm.runInContext('JSON.stringify(typeof PrismMetadata === "undefined" ? null : PrismMetadata)', context, { timeout: 100 }));
  for (const [name, path] of validateManifest(value, target)) {
    if (!vm.runInContext(`typeof ${name} === 'function'`, context, { timeout: 100 })) throw Error(`${path}: missing handler ${name}`);
  }
  return value;
}
export function initialize(privatePath, publicPath) {
  if (existsSync(privatePath) || existsSync(publicPath)) throw Error('Key output already exists; preserve existing keys and use a separate path for rotation');
  const pair = generateKeyPairSync('x25519');
  const jwk = pair.privateKey.export({ format: 'jwk' });
  const publicKey = Buffer.from(jwk.x, 'base64url').toString('base64');
  const keyId = sha256(Buffer.from(publicKey, 'base64')).slice(0, 16);
  const key = { format: 'prism.encryption-key', version: 1, algorithm, keyId, publicKey };
  mkdirSync(dirname(resolve(privatePath)), { recursive: true, mode: 0o700 });
  write(privatePath, encode({ format: 'prism.keyring', version: 1, keys: [{ keyId, privateKey: Buffer.from(jwk.d, 'base64url').toString('base64'), publicKey }] }), 0o600);
  write(publicPath, encode(key));
  return key;
}
export function seal(source, recipient, target = hostVersion) {
  const meta = metadata(source, target);
  const raw = Buffer.from(recipient.publicKey || '', 'base64');
  if (recipient.format !== 'prism.encryption-key' || recipient.version !== 1 || recipient.algorithm !== algorithm || raw.length !== 32 || recipient.keyId !== sha256(raw).slice(0, 16)) throw Error('Invalid Prism encryption public key');
  const recipientKey = createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: raw.toString('base64url') }, format: 'jwk' });
  const ephemeral = generateKeyPairSync('x25519');
  const ephemeralKey = Buffer.from(ephemeral.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64');
  const nonce = randomBytes(12);
  const envelope = { format: 'prism.encrypted-module', version: 1, algorithm, keyId: recipient.keyId, moduleId: meta.id, moduleVersion: meta.version, ephemeralKey };
  const aad = Buffer.from([envelope.format, envelope.version, algorithm, envelope.keyId, meta.id, meta.version, ephemeralKey].join('\n'));
  const secret = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipientKey });
  const key = Buffer.from(hkdfSync('sha256', secret, nonce, Buffer.concat([Buffer.from('prism.module.encryption.v1'), aad]), 32));
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(source, 'utf8'), cipher.final()]);
  key.fill(0); secret.fill(0);
  return { ...envelope, nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
export function migrate(source, target = hostVersion) {
  if (/^\s*(REXENC|FWENC)/.test(source)) throw Error('Encrypted third-party formats require author-provided plaintext or a Prism artifact');
  try { metadata(source, target); return source; } catch (error) {
    if (!/\bWidgetMetadata\b/.test(source)) throw error;
  }
  const converted = source + "\n; if (typeof WidgetMetadata !== 'undefined') { PrismMetadata = Object.assign({}, WidgetMetadata, {schemaVersion:1, requiredVersion:'0.1.0', compatibility:{format:'widget', requiredVersion:WidgetMetadata.requiredVersion}}); }\n";
  metadata(converted, target); return converted;
}
export function scaffold(directory, id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id || '')) throw Error('Provide a valid stable module ID');
  if (existsSync(directory)) throw Error('Project directory already exists');
  const here = dirname(fileURLToPath(import.meta.url));
  const module = `/// <reference path="./types/prism.d.ts" />
PrismMetadata = {
  schemaVersion:1, id:${JSON.stringify(id)}, title:"新模块", version:"1.0.0", requiredVersion:"0.1.0",
  modules:[{id:"movies",title:"电影",functionName:"list",params:[{name:"page",type:"page"}]}]
};
function list(params) {
  if (Number(params.page) > 1) return [];
  return [{id:550,type:"tmdb",mediaType:"movie",title:"示例电影"}];
}
`;
  write(resolve(directory,'module.js'),module);
  for (const name of ['prism-module.mjs','prism-dev.mjs','prism-contract.mjs','prism-run.mjs']) write(resolve(directory,'tools',name), readFileSync(resolve(here,name)));
  const htmlPath = [resolve(here,'cheerio.bundle.js'),resolve(here,'../assets/cheerio.bundle.js'),
    resolve(here,'../Prs/Resources/BuiltinModules/cheerio.bundle.js')].find(existsSync);
  if (htmlPath) {
    write(resolve(directory,'tools/cheerio.bundle.js'), readFileSync(htmlPath));
    const notices = resolve(dirname(htmlPath), 'CHEERIO-LICENSES.txt');
    if (existsSync(notices)) write(resolve(directory,'tools/CHEERIO-LICENSES.txt'), readFileSync(notices));
  }
  const typePath = [resolve(here,'../types/prism.d.ts'),resolve(here,'../assets/prism.d.ts')].find(existsSync);
  if (!typePath) throw Error('SDK type definitions missing');
  write(resolve(directory,'types/prism.d.ts'),readFileSync(typePath));
  write(resolve(directory,'package.json'),encode({private:true,scripts:{check:'node tools/prism-module.mjs check module.js',dev:'node tools/prism-module.mjs serve .'}}));
  write(resolve(directory,'jsconfig.json'),encode({compilerOptions:{checkJs:true,noEmit:true,target:'ES2020',lib:['ES2020']},include:['module.js','types/prism.d.ts']}));
  write(resolve(directory,'README.md'),'# Prism 模块\n\nnpm run check 校验声明；npm run dev 启动本地模块服务。在模拟器导入 http://127.0.0.1:8787/module.js。发布前配置真实数据源、编写固定响应测试并递增版本。\n');
}
async function main([command, ...args]) {
  const targetIndex = args.indexOf('--target');
  if (targetIndex >= 0 && !args[targetIndex + 1]) throw Error('Provide a version after --target');
  const target = targetIndex >= 0 ? args.splice(targetIndex, 2)[1] : hostVersion;
  if (command === 'migrate' && args.length === 2) {
    if (existsSync(args[1])) throw Error('Output already exists');
    const migrated = migrate(readFileSync(args[0],'utf8'), target);
    write(args[1], migrated);
    const meta = metadata(migrated, target);
    console.log(meta.compatibility?.format === 'widget' ? 'Plain Widget module converted. Run its registered entries to verify playback and services.' : 'Prism module copied.');
    if (meta.modules?.some(feature => feature.requiresWebView)) console.warn('modules[].requiresWebView: Prism cannot execute this entry');
    if (meta.continuousPlay != null) console.warn('continuousPlay: Prism follows the host playback preferences');
  } else if (command === 'create' && args.length === 2) { scaffold(...args); console.log('Prism module project created'); }
  else if (command === 'serve' && args.length >= 1 && args.length <= 2) { const {serve} = await import('./prism-dev.mjs'); await serve(args[0],args[1] === undefined ? 8787 : Number(args[1])); }
  else if (command === 'init-keys' && args.length === 2) { initialize(...args); console.log('Prism encryption key pair created; private key was not printed.'); }
  else if (command === 'check' && args.length === 1) { const meta = metadata(readFileSync(args[0], 'utf8'), target); console.log(`${meta.id} ${meta.version}: valid Prism module for ${target}`); }
  else if (command === 'run' && args.length >= 2) {
    const { runCommand } = await import('./prism-run.mjs');
    await runCommand(args, target);
  }
  else if (command === 'pack' && args.length === 3) {
    if (!args[2].endsWith('.prism')) throw Error('Encrypted module output must end in .prism');
    const envelope = seal(readFileSync(args[0], 'utf8'), JSON.parse(readFileSync(args[1], 'utf8')), target);
    write(args[2], encode(envelope)); console.log(`${envelope.moduleId} ${envelope.moduleVersion}: encrypted`);
  } else if (command === 'index' && args.length >= 3) {
    const [title, output, ...files] = args;
    if (!output.endsWith('.prs')) throw Error('Collection output must end in .prs');
    const modules = files.map(file => {
      const data = readFileSync(file), text = data.toString('utf8');
      const encrypted = file.endsWith('.prism');
      if (!encrypted && !file.endsWith('.js')) throw Error('Collection entries must end in .js or .prism');
      const artifact = encrypted ? JSON.parse(text) : metadata(text, target);
      if (encrypted && (artifact.format !== 'prism.encrypted-module' || artifact.version !== 1 || artifact.algorithm !== algorithm
        || !validArtifactIdentity(artifact.moduleId, artifact.moduleVersion))) throw Error('Invalid Prism encrypted module');
      const path = relative(dirname(resolve(output)), resolve(file)).split(sep).map(encodeURIComponent).join('/');
      return { id: encrypted ? artifact.moduleId : artifact.id, title: encrypted ? artifact.moduleId : artifact.title,
        version: encrypted ? artifact.moduleVersion : artifact.version, url: './' + path, sha256: sha256(data) };
    });
    if (modules.length > 500 || new Set(modules.map(row => row.id)).size !== modules.length) throw Error('Too many modules or duplicate module IDs');
    write(output, encode({ format: 'prism.collection', version: 1, title, modules })); console.log('Prism collection created');
  } else throw Error('Usage: prism-module.mjs create directory module.id | serve directory [port] | migrate widget.js output.js | check source.js [--target VERSION] | run source.js entry-id [--params JSON] [--fixtures FILE] | pack source.js public-key.json output.prism [--target VERSION] | index title output.prs files... | init-keys private-keyring.json public-key.json');
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { await main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
