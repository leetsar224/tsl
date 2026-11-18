// Deterministic author-side contracts. Accepts a temporary mutated copy too.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const state = new Map();
const context = vm.createContext({ Prism: { storage: {
  get: key => state.get(key), set: (key, value) => state.set(key, value)
}}});
vm.runInContext(readFileSync(process.argv[2] || new URL('../Examples/Modules/library.js', import.meta.url), 'utf8'), context);
const metadata = context.PrismMetadata;
const list = id => {
  const feature = metadata.modules.find(row => row.id === id);
  const params = Object.fromEntries(feature.params.map(row => [row.name, row.value]));
  return context[feature.functionName]({ ...params, mediaBase: 'https://fixture.invalid', page: 1 });
};
assert.equal(list('movies').length, 2);
const shows = list('series');
assert.equal(shows.length, 1);
assert.equal(shows[0].mediaType, 'tv');
assert.equal(shows[0].tmdbId, undefined);
const detail = context.loadDetail(shows[0].link);
assert.equal(detail.episodeItems.length, 2);
assert.equal(detail.episodeItems[1].childItems.length, 2);
assert.equal(detail.sources, undefined);
assert.equal(detail.episodes, undefined);
assert.equal(detail.recommendations, undefined);
const link = detail.episodeItems[1].childItems[1].link;
const resources = context.loadResource({ link, type: 'tv', mediaBase: 'https://fixture.invalid' });
assert.equal(resources.length, 1);
assert.equal(resources[0].url, 'https://fixture.invalid/episode-2-compact.mp4');
assert.equal(resources[0].tmdbId, undefined);
assert.equal(context.loadDetail('unknown'), null);
assert.equal(context.search({keyword: '独立剧集'}).length, 1);
console.log('Prism example: category, identity, detail, versions, search and resource contracts passed');
