// Example API contract: shows -> episodes -> comments; the service is developer supplied.
PrismMetadata = {
  schemaVersion:1,id:"example.prism.danmaku",title:"分段弹幕示例",version:"1.1.0",requiredVersion:"0.1.0",
  author:"Prism",description:"保留作品与分集身份，按播放时间请求弹幕。",
  globalParams:[{name:"apiBase",title:"API 地址",type:"input"}],
  modules:[
    {id:"searchDanmu",type:"danmu",functionName:"findShows",params:[]},
    {id:"getDetail",type:"danmu",functionName:"findEpisodes",params:[]},
    {id:"getComments",type:"danmu",functionName:"initialComments",params:[]},
    {id:"getCommentsWithSegmentTime",type:"danmu",functionName:"segmentComments",params:[]}
  ]
};
function request(params,path,query) {
  const base = String(params.apiBase || "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw Error("请配置弹幕 API 地址");
  const data = Prism.http.get(base + path,{params:query || {}}).data;
  if (!data || !Array.isArray(data.items)) throw Error("弹幕接口缺少 items 数组");
  return data.items;
}
function findShows(params) {
  return {animes:request(params,"/shows",{keyword:params.seriesName || params.title || "",season:params.season || 1})
    .map(row => ({animeId:String(row.id),animeTitle:row.name}))};
}
function findEpisodes(params) {
  return request(params,"/shows/" + encodeURIComponent(params.animeId) + "/episodes")
    .map(row => ({episodeId:String(row.id),episodeTitle:row.name,episodeNumber:Number(row.number)}));
}
// Retained only for this playback session; the host can discard it at any time.
const windows = new Map();
function segmentComments(params) {
  const start = Math.max(0,Math.floor(Number(params.segmentTime || 0) / 30) * 30);
  const key = String(params.commentId) + ":" + start;
  if (windows.has(key)) return windows.get(key);
  const result = {comments:request(params,"/episodes/" + encodeURIComponent(params.commentId) + "/comments",{start:start,end:start + 30})
    .map(row => ({cid:String(row.id),p:[Number(row.time),1,16777215].join(","),m:row.text}))};
  windows.set(key,result);
  if (windows.size > 4) windows.delete(windows.keys().next().value);
  return result;
}
function initialComments(params) { windows.clear(); return {segmentList:[]}; }
