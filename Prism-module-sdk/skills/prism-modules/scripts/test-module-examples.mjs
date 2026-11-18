#!/usr/bin/env node
// Author-side tests: no network, accounts, simulator or production data.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {metadata} from './prism-module.mjs';

const directory = resolve(process.argv[2] || fileURLToPath(new URL('../assets',import.meta.url)));
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual,expected,message); checks++; };
const source = name => readFileSync(join(directory,name + '.js'),'utf8');
function moduleHost(text, respond, retain = false) {
  let context;
  const state = new Map(), calls = [];
  const meta = metadata(text);
  return {meta,calls,call(name,params) {
    // Only danmaku comments retain a playback context.
    if (!context || !retain) { context = vm.createContext({Prism:{
      http:{get(url,options = {}) { calls.push({url,options}); return {data:respond(url,options),status:200}; }},
      storage:{get:(key,fallback) => state.get(key) ?? fallback,set:(key,value) => state.set(key,value),remove:key => state.delete(key)}
    }});
    vm.runInContext(text,context,{timeout:1000}); }
    context.__params = params;
    const result = vm.runInContext(`${name}(__params)`,context,{timeout:1000});
    return JSON.parse(JSON.stringify(result));
  }};
}
function catalogContracts(text) {
  const movie = {id:'movie-one',name:'电影',kind:'movie',poster:'https://images.invalid/a.jpg'};
  const series = {id:'show/7',name:'剧集',kind:'tv'};
  const host = moduleHost(text,(url,{params}) => {
    if (url.endsWith('/items')) return {items:params.page > 1 ? [] : [params.kind === 'tv' ? series : movie]};
    if (url.endsWith('/search')) return {items:params.keyword === '剧集' ? [series] : []};
    if (url.endsWith('/folders/archive')) return {items:[movie]};
    if (url.endsWith('/items/show%2F7')) return series;
    if (url.endsWith('/resolve')) return {streams:[{id:'original',label:'原始',url:'https://media.invalid/one.mp4',headers:{Referer:'https://media.invalid/'}}]};
    throw Error('Unexpected request ' + url);
  });
  const params = {apiBase:'https://fixture.invalid/',token:'fixture-token',sourceId:'backup'};
  const home = host.call('home',params);
  equal(home.sections.map(row => row.layout),['posterRow','landscape','list'],'native layouts');
  equal(home.sections[0].featureId,'movies','section to feature route');
  equal(home.sections[2].items[0].type,'folder','folder is not a detail item');
  equal(host.calls[0].options.params.source,'backup','source selection reaches API');
  equal(host.calls[0].options.headers.Authorization,'Bearer fixture-token','current credentials reach request');
  const shows = host.call('list',{...params,kind:'tv',page:1,count:20,genreId:'drama',peopleId:'person-9'});
  equal(shows[0].mediaType,'tv','shared list function respects selected category');
  equal(shows[0].link,'item:show/7','opaque route retains complete source ID');
  equal(shows[0].tmdbId,undefined,'module-owned item is not assigned a guessed TMDB ID');
  equal(host.calls.at(-1).options.params.person,'person-9','person filter reaches API');
  equal(host.calls.at(-1).options.params.genre,'drama','genre filter reaches API');
  equal(host.call('list',{...params,kind:'tv',page:2}).length,0,'empty page ends pagination');
  equal(host.call('search',{...params,keyword:'剧集',page:1})[0].id,'show/7','search identity');
  equal(host.call('browse',{...params,link:'folder:archive'})[0].id,'movie-one','folder route');
  equal(host.call('itemDetail',{...params,link:shows[0].link}).id,'show/7','detail route');
  equal(host.calls.at(-1).url,'https://fixture.invalid/items/show%2F7','opaque ID is encoded once');
  equal(host.call('resolve',{...params,link:'file:second'})[0].url,'https://media.invalid/one.mp4','resolved playback resource');
  equal(host.calls.at(-1).options.params.link,'file:second','selected version reaches resolver');
  assert.throws(() => host.call('list',{}),/API/); checks++;
  assert.throws(() => moduleHost(text,() => ({unexpected:[]})).call('list',params),/items/); checks++;
  equal(host.meta.library.allowIntegration,false,'library integration is explicitly disallowed');
}
function subtitleContracts(text) {
  const host = moduleHost(text,() => ({items:[{id:'archive',name:'字幕包',language:'zh',url:'https://subs.invalid/show.zip'}]}));
  const params = {apiBase:'https://fixture.invalid',title:'第2集',seriesName:'剧集',season:1,episode:2};
  const rows = host.call('findSubtitles',params);
  equal(rows[0].lang,'zh','subtitle language mapping');
  equal(host.calls[0].options.params.title,'剧集','original series title is sent');
  equal(host.calls[0].options.params.episode,2,'episode context sent');
  const files = ['S01E01.zh.srt','S01E02.en.srt','S01E020.zh.srt','S01E02.zh.ass'].map(name => ({name,path:'Season 1/' + name}));
  equal(host.call('resolveSubtitleArchive',{...params,subtitleLanguage:'zh',subtitleFiles:JSON.stringify(files)}),'Season 1/S01E02.zh.ass','matching episode and language, not first valid file');
  equal(host.call('resolveSubtitleArchive',{...params,episode:3,subtitleFiles:JSON.stringify(files)}),null,'unmatched episode explicitly allows host fallback');
}
function danmakuContracts(text) {
  const host = moduleHost(text,(url) => {
    if (url.endsWith('/shows')) return {items:[{id:'show/7',name:'候选作品'}]};
    if (url.endsWith('/shows/show%2F7/episodes')) return {items:[{id:'ep/2',name:'第二集',number:2}]};
    // Return plausible wrong data too: request assertions must catch the wrong ID.
    return {items:[{id:'comment',time:82.5,text:'示例'}]};
  }, true);
  const params = {apiBase:'https://fixture.invalid',title:'原剧名',seriesName:'原剧名',season:1};
  const show = host.call('findShows',params).animes[0];
  const episodes = host.call('findEpisodes',{...params,animeId:show.animeId,title:show.animeTitle});
  equal(host.calls.at(-1).url,'https://fixture.invalid/shows/show%2F7/episodes','show ID threads into episode request');
  equal(episodes[0].episodeNumber,2,'real episode number retained');
  const context = {...params,animeId:show.animeId,commentId:episodes[0].episodeId};
  equal(host.call('initialComments',context),{segmentList:[]},'initialization advertises segmented comments');
  const comments = host.call('segmentComments',{...context,segmentTime:83});
  equal(host.calls.at(-1).url,'https://fixture.invalid/episodes/ep%2F2/comments','selected episode ID threads into comment request');
  equal(host.calls.at(-1).options.params.start,60,'segment starts at requested 30-second window');
  equal(host.calls.at(-1).options.params.end,90,'segment end');
  equal(comments.comments[0].p,'82.5,1,16777215','absolute time preserved');
  host.call('segmentComments',{...context,segmentTime:12});
  equal(host.calls.at(-1).options.params.start,0,'backwards seek requests earlier segment');
  const requests = host.calls.length;
  host.call('segmentComments',{...context,segmentTime:14});
  equal(host.calls.length,requests,'same playback window reuses cached comments');
  host.call('initialComments',context);
  host.call('segmentComments',{...context,segmentTime:14});
  equal(host.calls.length,requests+1,'reinitialization discards old session cache');
}
for (const name of ['library','catalog','subtitles','danmaku']) { metadata(source(name)); checks++; }
catalogContracts(source('catalog'));
subtitleContracts(source('subtitles'));
danmakuContracts(source('danmaku'));
const passed = checks;
for (const [name,run,before,after] of [
  ['catalog',catalogContracts,'kind:params.kind','kind:"movie"'],
  ['subtitles',subtitleContracts,'best ? best.path','best ? files[0].path'],
  ['danmaku',danmakuContracts,'encodeURIComponent(params.commentId)','encodeURIComponent(params.animeId)']
]) {
  const original = source(name), changed = original.replace(before,after);
  assert.notEqual(changed,original);
  assert.throws(() => run(changed),error => error?.code === 'ERR_ASSERTION','mutation must fail an assertion, not an unrelated exception');
}
console.log(`Prism author examples: ${passed} assertions and 3 mutation checks passed.`);
