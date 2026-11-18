#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

/** Read-only loopback server for explicitly selected module development directories. */
export async function serve(directory, port = 8787) {
  const root = await realpath(resolve(directory));
  if (!(await stat(root)).isDirectory()) throw Error('Serve target must be a directory');
  if (!Number.isInteger(Number(port)) || Number(port) < 0 || Number(port) > 65535) throw Error('Invalid port');
  const server = createServer(async (request, response) => {
    try {
      if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = await realpath(resolve(root, '.' + path));
      if (!file.startsWith(root + sep) || !['.js','.prism','.prs','.rex'].includes(extname(file))) { response.writeHead(403); response.end(); return; }
      const info = await stat(file);
      if (!info.isFile() || info.size > 3145728) { response.writeHead(413); response.end(); return; }
      const bytes = await readFile(file), etag = '"' + createHash('sha256').update(bytes).digest('hex') + '"';
      const headers = {'Content-Type': extname(file) === '.js' ? 'text/javascript; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control':'no-cache','ETag':etag};
      if (request.headers['if-none-match'] === etag) { response.writeHead(304, headers); response.end(); return; }
      response.writeHead(200, {...headers,'Content-Length':bytes.length}); response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(Number(port),'127.0.0.1',done); });
  const changed = (_, name) => {
    if (name && ['.js','.prism','.prs','.rex'].includes(extname(name))) console.log('Changed:', name);
  };
  let watcher;
  try { watcher = watch(root, {recursive:true}, changed); } catch { watcher = watch(root, changed); }
  server.on('close', () => watcher.close());
  console.log(`Prism module server: http://127.0.0.1:${server.address().port}/`);
  console.log('Import a module URL in the simulator. Increment version before checking updates. Ctrl+C stops.');
  return server;
}
