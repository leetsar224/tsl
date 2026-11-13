#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, generateKeyPairSync, createPublicKey, diffieHellman, hkdfSync, randomBytes, createCipheriv } from 'node:crypto';
import vm from 'node:vm';

export const algorithm = 'X25519-HKDF-SHA256-A256GCM';
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const encode = value => JSON.stringify(value, null, 2) + '\n';
function write(path, data, mode = 0o644) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, data, { mode }); chmodSync(path, mode);
}
export function metadata(source) {
  if (Buffer.byteLength(source) > 2097152) throw Error('Module source exceeds 2 MiB');
  const context = vm.createContext({});
  vm.runInContext(source, context, { timeout: 1000 });
  const value = JSON.parse(vm.runInContext('JSON.stringify(typeof PrismMetadata === "undefined" ? null : PrismMetadata)', context, { timeout: 100 }));
  if (!value || value.schemaVersion !== 1 || typeof value.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.id) ||
      typeof value.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/.test(value.version) || typeof value.title !== 'string' || !value.title.trim()) throw Error('A valid PrismMetadata schemaVersion 1 is required');
  const unique = (rows, field, label) => {
    if (!Array.isArray(rows) || rows.some(row => typeof row[field] !== 'string' || !row[field]) || new Set(rows.map(row => row[field])).size !== rows.length) throw Error('Invalid or duplicate ' + label);
  };
  const ttl = value => value === undefined || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86400;
  unique(value.modules || [], 'id', 'feature ID');
  unique(value.library?.sources || [], 'id', 'source ID');
  for (const group of [value.globalParams || [], value.search?.params || [], ...(value.modules || []).map(row => row.params || [])]) unique(group, 'name', 'parameter name');
  if (!ttl(value.detailCacheDuration) || (value.modules || []).some(row => !ttl(row.cacheDuration))) throw Error('Cache duration must be 0–86400 seconds');
  if (value.capabilities && (!Array.isArray(value.capabilities) || value.capabilities.some(capability => !['catalog', 'search', 'stream', 'subtitle', 'danmaku', 'library'].includes(capability)))) throw Error('Unknown module capability');
  const handlers = [...(value.modules || []).map(row => row.functionName), value.search?.functionName,
    value.library?.homeFunction, value.library?.browseFunction, value.detailFunction].filter(Boolean);
  for (const name of handlers) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) || !vm.runInContext(`typeof ${name} === 'function'`, context, { timeout: 100 })) throw Error('Declared handler is missing: ' + name);
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
export function seal(source, recipient) {
  const meta = metadata(source);
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
function main([command, ...args]) {
  if (command === 'init-keys' && args.length === 2) { initialize(...args); console.log('Prism encryption key pair created; private key was not printed.'); }
  else if (command === 'check' && args.length === 1) { const meta = metadata(readFileSync(args[0], 'utf8')); console.log(`${meta.id} ${meta.version}: valid Prism module`); }
  else if (command === 'pack' && args.length === 3) {
    if (!args[2].endsWith('.prism')) throw Error('Encrypted module output must end in .prism');
    const envelope = seal(readFileSync(args[0], 'utf8'), JSON.parse(readFileSync(args[1], 'utf8')));
    write(args[2], encode(envelope)); console.log(`${envelope.moduleId} ${envelope.moduleVersion}: encrypted`);
  } else if (command === 'index' && args.length >= 3) {
    const [title, output, ...files] = args;
    if (!output.endsWith('.prs')) throw Error('Collection output must end in .prs');
    const modules = files.map(file => {
      const data = readFileSync(file), text = data.toString('utf8');
      const artifact = text.trimStart().startsWith('{') ? JSON.parse(text) : metadata(text);
      if (artifact.format && artifact.format !== 'prism.encrypted-module') throw Error('Collection entry must be a module');
      const path = relative(dirname(resolve(output)), resolve(file)).split(sep).map(encodeURIComponent).join('/');
      return { id: artifact.moduleId || artifact.id, title: artifact.title || artifact.moduleId, version: artifact.moduleVersion || artifact.version, url: './' + path, sha256: sha256(data) };
    });
    if (modules.length > 500 || new Set(modules.map(row => row.id)).size !== modules.length) throw Error('Too many modules or duplicate module IDs');
    write(output, encode({ format: 'prism.collection', version: 1, title, modules })); console.log('Prism collection created');
  } else throw Error('Usage: prism-module.mjs check source.js | pack source.js public-key.json output.prism | index title output.prs files... | init-keys private-keyring.json public-key.json');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
