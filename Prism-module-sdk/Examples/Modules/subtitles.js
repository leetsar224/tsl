// Example API contract: GET /subtitles returns {items:[{id,name,language,url}]}.
PrismMetadata = {
  schemaVersion:1,id:"example.prism.subtitles",title:"字幕示例",version:"1.0.0",requiredVersion:"0.1.0",
  author:"Prism",description:"按作品查找字幕，并从压缩包选择对应分集。",
  globalParams:[{name:"apiBase",title:"API 地址",type:"input"}],
  modules:[{id:"loadSubtitle",type:"subtitle",functionName:"findSubtitles",params:[]}]
};
function findSubtitles(params) {
  const base = String(params.apiBase || "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw Error("请配置字幕 API 地址");
  const query = {title:params.seriesName || params.title || ""};
  for (const key of ["tmdbId","season","episode"]) if (params[key] != null) query[key] = params[key];
  const data = Prism.http.get(base + "/subtitles",{params:query}).data;
  if (!data || !Array.isArray(data.items)) throw Error("字幕响应缺少 items 数组");
  return data.items.map(row => ({id:String(row.id),title:row.name,lang:row.language,url:row.url}));
}
function resolveSubtitleArchive(params) {
  const files = JSON.parse(params.subtitleFiles || "[]");
  const season = Number(params.season), episode = Number(params.episode);
  const hasEpisode = Number.isInteger(episode) && episode >= 0;
  const marker = hasEpisode ? "E" + String(episode).padStart(2,"0") : "";
  const fullMarker = hasEpisode && Number.isInteger(season) && season >= 0 ? "S" + String(season).padStart(2,"0") + marker : marker;
  const scoped = hasEpisode ? files.filter(file => new RegExp(fullMarker + "(?![0-9])","i").test(file.name)) : files;
  const language = String(params.subtitleLanguage || "").toLowerCase();
  const best = scoped.find(file => language && file.name.toLowerCase().includes(language)) || scoped[0];
  return best ? best.path : null; // null lets the host apply its documented fallback.
}
