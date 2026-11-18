// Prism module protocol v1. Settings and all pages are rendered by the host.
PrismMetadata = {
  schemaVersion: 1, id: "example.prism.library.v1", title: "模块示例", version: "1.0.0",
  requiredVersion: "0.1.0", author: "Prism", description: "列表、独立详情、分集、多版本、搜索与播放资源示例。",
  detailCacheDuration: 0,
  globalParams: [
    { name: "mediaBase", title: "媒体目录", type: "input", value: "", description: "填写自己的 HTTP(S) 媒体目录后播放。" },
    { name: "account", title: "账号", type: "enumeration", value: "main", enumOptions: [{title:"主账号",value:"main"},{title:"备用账号",value:"backup"}] },
    { name: "backupName", title: "备用账号名称", type: "input", belongTo: {paramName:"account",value:["backup"]} }
  ],
  modules: [
    { id: "movies", title: "电影", functionName: "loadList", cacheDuration: 300, params: [
      {name:"category",type:"constant",value:"movie"}, {name:"page",type:"page"}, {name:"count",title:"每页数量",type:"count",value:20}
    ] },
    { id: "series", title: "剧集", functionName: "loadList", cacheDuration: 300, params: [
      {name:"category",type:"constant",value:"tv"}, {name:"page",type:"page"}, {name:"count",title:"每页数量",type:"count",value:20}
    ] },
    { id:"loadResource",title:"播放资源",functionName:"loadResource",type:"stream",cacheDuration:0,params:[] }
  ],
  search: { title:"搜索",functionName:"search",params:[{name:"keyword",type:"input"},{name:"page",type:"page"}] }
};
var media = [
  {id:"movie",type:"url",link:"media:movie",mediaType:"movie",title:"独立电影",description:"无 TMDB 身份，始终留在本模块。",genreItems:[{id:"drama",title:"剧情"}],peoples:[{id:"author",title:"示例作者",role:"导演"}]},
  {id:"series",type:"url",link:"media:series",mediaType:"tv",title:"独立剧集",description:"分集保留原始路由；每集有两个可选版本。"},
  {id:550,type:"tmdb",mediaType:"movie",title:"搏击俱乐部"}
];
function loadList(params) {
  Prism.storage.set("mediaBase", params.mediaBase || "");
  var rows = media.filter(function(row) {
    return (!params.category || row.mediaType === params.category) &&
      (!params.genreId || (row.genreItems || []).some(function(g){return g.id === String(params.genreId)})) &&
      (!params.peopleId || (row.peoples || []).some(function(p){return p.id === String(params.peopleId)}));
  });
  var count=Number(params.count || 20), start=(Number(params.page || 1)-1)*count;
  return rows.slice(start,start+count);
}
function search(params) {
  return loadList(params).filter(function(row){return row.title.indexOf(String(params.keyword || "")) >= 0});
}
function versions(link) {
  return ["original","compact"].map(function(version,index){return {
    id:link+":"+version,type:"url",link:link+":"+version,title:index ? "精简版本" : "原始版本"
  }});
}
function loadDetail(link) {
  if (link === "media:movie") return Object.assign({},media[0],{childItems:versions(link)});
  if (link === "media:series") return Object.assign({},media[1],{
    episodeItems:[1,2].map(function(episode){var route="episode:"+episode;return {
      id:route,type:"url",link:route,mediaType:"tv",season:1,episode:episode,title:"第 "+episode+" 集",childItems:versions(route)
    }})
  });
  if (/^episode:[12]$/.test(link)) return {id:link,type:"url",link:link,title:"分集",mediaType:"tv",childItems:versions(link)};
  return null;
}
function loadResource(params) {
  var base=String(params.mediaBase || Prism.storage.get("mediaBase") || "").replace(/\/$/,"");
  if (!/^https?:\/\//.test(base)) throw new Error("请在模块设置填写媒体目录");
  var link=String(params.link || ""), episode=/^episode:([12])/.exec(link);
  if (Number(params.tmdbId) === 550 && params.type === "movie") link="media:movie";
  if (!link && params.type === "tv" && Number(params.season) === 1 && [1,2].indexOf(Number(params.episode)) >= 0) episode=["",String(params.episode)];
  if (!episode && link.indexOf("media:movie") !== 0) return [];
  var file=episode ? "episode-"+episode[1] : "movie";
  return ["original","compact"].filter(function(version){return !/:(original|compact)$/.test(link) || link.endsWith(":"+version)}).map(function(version){return {
    name:version === "original" ? "原始版本" : "精简版本",url:base+"/"+file+(version === "compact" ? "-compact" : "")+".mp4",playerType:"app"
  }});
}
