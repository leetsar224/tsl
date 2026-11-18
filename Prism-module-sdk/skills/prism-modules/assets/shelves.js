// Example API contract, not a public service. Configure your own endpoint.
PrismMetadata = {
  schemaVersion: 1, id: "example.prism.shelves", title: "横滑栏目与子栏目示例", version: "1.0.0",
  requiredVersion: "0.1.1", author: "Prism", description: "独立数据源、分区、目录、分页与动态播放地址。",
  globalParams: [
    {name:"apiBase", title:"API 地址", type:"input", value:""},
    {name:"token", title:"访问令牌", type:"input", secret:true, value:""}
  ],
  library: {title:"我的资源", homeFunction:"home", browseFunction:"browse", allowIntegration:false,
    sources:[{id:"main",title:"主线路"},{id:"backup",title:"备用线路"}]},
  detailFunction:"itemDetail", detailCacheDuration:60,
  modules:[
    {id:"movies",title:"电影",functionName:"list",params:[
      {name:"kind",type:"constant",value:"movie"},{name:"page",type:"page"},{name:"count",type:"count",value:20},
      {name:"genreId",title:"分类",type:"enumeration",enumOptions:[{title:"全部",value:""},{title:"剧情",value:"drama"}]}]},
    {id:"series",title:"剧集",functionName:"list",params:[
      {name:"kind",type:"constant",value:"tv"},{name:"page",type:"page"},{name:"count",type:"count",value:20}]},
    {id:"loadResource",type:"stream",functionName:"resolve",cacheDuration:0,params:[]}
  ],
  search:{title:"搜索",functionName:"search",params:[{name:"keyword",type:"input"},{name:"page",type:"page"}]}
};
function api(params, path, query) {
  const base = String(params.apiBase || "").replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+/.test(base)) throw Error("请在模块参数中填写 API 地址");
  const headers = params.token ? {Authorization:"Bearer " + params.token} : {};
  return Prism.http.get(base + path, {headers:headers, params:Object.assign({source:params.sourceId || "main"},query)}).data;
}
function card(row) {
  if (row == null || row.id == null || !row.name || !["movie","tv"].includes(row.kind)) throw Error("资源缺少 ID、标题或类型");
  return {id:String(row.id),type:"url",mediaType:row.kind,title:row.name,link:"item:" + row.id,
    posterPath:row.poster,backdropPath:row.backdrop,description:row.description,releaseDate:row.date};
}
function rows(data) {
  if (!data || !Array.isArray(data.items)) throw Error("接口响应缺少 items 数组");
  return data.items.map(card);
}
function home(params) {
  // In a real module, these options can come from the service's category tree.
  return {sections:[
    {id:"movies",title:"电影",layout:"posterRow",featureId:"movies",loadMode:"lazy",previewCount:12,
      parameters:{genreId:""},filters:[{parameter:"genreId",title:"电影分类",options:[
        {id:"all",title:"全部电影",value:""},
        {id:"drama",title:"剧情",value:"drama",children:[
          {id:"family",title:"家庭剧情",value:"drama/family"},
          {id:"history",title:"历史剧情",value:"drama/history"}
        ]}
      ]}]},
    {id:"series",title:"剧集",layout:"posterRow",featureId:"series",loadMode:"lazy",previewCount:12}
  ]};
}
function list(params) {
  return rows(api(params,"/items",{kind:params.kind,page:Number(params.page || 1),count:Number(params.count || 20),
    genre:params.genreId || "",person:params.peopleId || ""}));
}
function search(params) {
  return rows(api(params,"/search",{keyword:String(params.keyword || ""),page:Number(params.page || 1)}));
}
function route(link, prefix) {
  if (typeof link !== "string" || !link.startsWith(prefix) || link.length === prefix.length) throw Error("资源路由无效");
  return encodeURIComponent(link.slice(prefix.length));
}
function browse(params) { return rows(api(params,"/folders/" + route(params.link,"folder:"),{})); }
function itemDetail(params) {
  const item = api(params,"/items/" + route(params.link,"item:"),{});
  return card(item); // Extend with episodeItems/childItems as shown in library.js.
}
function resolve(params) {
  const result = api(params,"/resolve",{link:params.link});
  if (!result || !Array.isArray(result.streams)) throw Error("接口响应缺少 streams 数组");
  return result.streams.map(row => {
    if (!/^https?:\/\//.test(row.url || "")) throw Error("资源没有有效播放地址");
    return {id:String(row.id),name:row.label,url:row.url,customHeaders:row.headers || {},playerType:"app",fileName:row.fileName,tags:row.tags,size:row.size};
  });
}
