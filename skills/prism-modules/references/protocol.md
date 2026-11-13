# Prism 模块开发手册

协议版本：1。模块由一个 JavaScript 文件、一个 `PrismMetadata` 声明和具名函数组成。宿主提供网络、存储、参数、原生资源库、详情和播放器；模块提供数据与业务逻辑。

文件约定：开发源码 `.js`，集合索引 **`.prs`**，加密分发模块 **`.prism`**。模块集合不承载执行代码，也不创建另一套运行容器。

本页是协议速查。第一次开发先读入门指南，具体字段和边界按下表查阅；文档以当前宿主实现为准，未实现的能力会明确标注。

| 文档 | 解决的问题 |
| --- | --- |
| [独立开发包](sdk.md) | 没有主项目源码时所需的文件、环境和验证边界 |
| [快速入门](quick-start.md) | 选择模板、运行检查、安装、配置和第一次交付 |
| [声明与参数](manifest.md) | 每个字段的类型、默认值、作用域、条件、分页和能力声明 |
| [宿主 API](runtime.md) | HTTP 请求与错误、TMDB、HTML、存储、执行生命周期和限制 |
| [媒体与详情](media.md) | 媒体字段、图片、两种详情入口、分集、版本和 TMDB 身份 |
| [资源库与缓存](resources.md) | 分区、目录、数据源、原生设置与缓存生命周期 |
| [播放服务](playback.md) | 播放解析、一次性地址、字幕 ZIP、弹幕身份和分段 |
| [集合与发布](distribution.md) | .prs 字段、加密打包、校验、更新和分发顺序 |
| [测试与排错](testing.md) | 离线请求断言、错误副本验证、宿主测试与症状定位 |

- [可运行示例](../assets/library.js)
- [组织架构与检查结果](architecture.md)
- [加密与交付规范](encryption.md)
- [公共打包密钥](../assets/prism-public-key.json)

## 1. 元数据与入口

```js
PrismMetadata = {
  schemaVersion: 1,
  id: "author.library", title: "我的影库", version: "1.0.0",
  requiredVersion: "0.1.0", author: "作者", description: "模块用途",
  icon: "https://example.com/logo.png", site: "https://example.com",
  updateUrl: "https://example.com/library.prism", changelog: "更新说明",
  detailCacheDuration: 60,
  globalParams: [{name: "server", title: "服务地址", type: "input"}],
  modules: [
    {id: "movies", title: "电影", functionName: "loadList", cacheDuration: 3600,
     params: [{name: "kind", type: "constant", value: "movie"}, {name: "page", type: "page"}]},
    {id: "series", title: "剧集", functionName: "loadList", cacheDuration: 3600,
     params: [{name: "kind", type: "constant", value: "tv"}, {name: "page", type: "page"}]},
    {id: "loadResource", title: "播放资源", type: "stream", functionName: "loadResource"}
  ],
  search: {title: "搜索", functionName: "search",
           params: [{name: "keyword", type: "input"}, {name: "page", type: "page"}]}
};
```

`schemaVersion` 必须为 1；`requiredVersion` 是最低 Prism 应用版本。ID 为字母、数字、点、下划线或连字符，首位为字母或数字，最长 128 字符。版本保持稳定的递增规则，推荐三段数字。更新保持同 ID，只接受更高版本。

同函数可以服务多个栏目，但**栏目身份是 id，不是 functionName**。参数、缓存、分类回跳都按入口 ID 隔离。顶层只定义声明与函数；安装读取元数据时没有宿主 API，不能在顶层发请求。

可选 `capabilities` 为 catalog、search、stream、subtitle、danmaku、library；不填写时按实际入口推导。Logo、作者、说明、版本、更新说明均由原生设置页展示。每个模块独立启停、配置、更新与清理数据。

## 2. 资源库与媒体库接入

列表或搜索入口自动形成独立资源库。底部选择栏目，右上打开模块设置；原生框架负责封面、筛选、详情、分集与播放。模块不注入自己的 HTML 页面、导航或播放器。

「接入媒体库」默认关闭，用户按模块开启。模块可声明 `library.allowIntegration: false` 禁止接入。独立资源页不依赖该开关。

- 开启后可参与全局搜索及明确 TMDB 身份的资源匹配。
- 聚合媒体必须有正整数 TMDB ID 与 movie/tv 类型；剧集资源匹配还需季、集。
- 没有明确 TMDB ID 的内容始终留在模块页面，不按标题猜测归并。
- 自有作品的收藏、历史保留模块、作品、link 和栏目身份。
- 返回的播放资源绑定本次查询身份，不要求重复填写 TMDB ID；显式冲突的 ID 或类型会被拒绝。

复杂资源首页可选用 `library: {homeFunction,browseFunction,sources:[{id,title}],allowIntegration}`。homeFunction 返回分区；browseFunction 用于目录下钻，来源选择以 sourceId 注入。简单模块仅声明列表和搜索即可。

分区格式为 `{id,title,layout,featureId,items}`，layout 支持 poster、landscape、list、hero，均对应现有原生组件。featureId 指向可分页栏目；目录条目使用 type:folder。

## 3. 参数、搜索与分页

全局配置放在 globalParams，栏目配置放在 modules[].params，搜索配置放在独立 search.params。列表、搜索及服务入口接收一个参数对象；默认详情接收 link 字符串，参数对象形式的详情需要声明 detailFunction。

| 类型/字段 | 宿主行为 |
| --- | --- |
| input | 文本输入；placeholders:[{title,value}] 提供预设 |
| enumeration | enumOptions:[{title,value}] 生成选择器与筛选 |
| constant | 隐藏固定值，调用者和旧设置不能覆盖 |
| page / offset | 隐藏分页参数，页码从 1 开始，offset 从 0 开始 |
| count | 每页数量，offset 步长默认 20 |
| language | 语言选择器 |
| userId | 持久生成的宿主用户标识，不是第三方账号凭据 |
| boolean / number | 开关或数字输入 |
| secret:true | 安全输入，存入 Keychain |
| belongTo:{paramName,value:[...]} | 条件成立才显示并注入该参数 |

优先级：调用参数 > 当前入口设置 > 全局设置 > 声明默认值。constant、userId 由宿主确定。凭据不可硬编码到模块、Logo URL、更新地址或普通存储。

搜索声明在顶层 search，关键词为 params.keyword。只有声明 page/offset 才传分页参数。空数组表示结束；重复返回上一页提示错误。切换筛选重置到第一页。类型和作品 ID 在所有页面必须稳定。

## 4. 媒体、详情与版本

```js
async function loadList(params) {
  return [{id: "show-1", type: "url", mediaType: "tv", title: "独立剧集",
           link: "show:1", posterPath: "https://example.com/poster.jpg"}];
}
async function loadDetail(link) {
  if (link !== "show:1") return null;
  return {description: "剧情简介", episodeItems: [
    {id: "ep-1", type: "url", mediaType: "tv", title: "第一集", link: "episode:1",
     season: 1, episode: 1, childItems: [
       {id: "file-a", title: "原始版本", link: "file:a"},
       {id: "file-b", title: "精简版本", link: "file:b"}
     ]}
  ]};
}
```

自有资源使用 type:url + link。顶层 loadDetail **只接收 link 字符串**，不注册进 modules；返回完整媒体、补充字段或资源数组，未知 link 返回 null。部分字段补全保留列表身份。需要当前配置、凭据或 sourceId 时，可声明 detailFunction 使用参数对象形式的详情入口；见[媒体与详情](media.md)，不要把凭据写入普通存储。

| 字段 | 用途 |
| --- | --- |
| id / type / mediaType | 稳定资源 ID；url/tmdb/folder；movie/tv |
| tmdbId | 明确知道对应关系时提供，不按标题生成 |
| link | 模块自己的不透明路由，不要求等于 id |
| title / description / releaseDate / rating | 标题、简介、日期、评分 |
| posterPath / backdropPath / coverUrl / detailPoster | 竖图、横图、兜底图、详情海报 |
| backdropPaths | 剧照数组 |
| trailers:[{coverUrl,url}] | 预告片 |
| genreItems:[{id,title}] | 分类，点击把字符串 genreId 传回所属列表 |
| peoples:[{id,title,avatar,role}] | 演职人员，点击把字符串 peopleId 传回所属列表 |
| relatedItems | 推荐媒体数组，保持各自身份 |
| episodeItems | 分集数组 |
| childItems | 电影版本，或每集的版本数组 |
| videoUrl / customHeaders | 可选直链与请求头 |
| previewUrl / duration / durationText / playerType | 预览、时长和播放方式数据 |

选择下一集使用该集自己的 link；宿主不解析路由、不推测缺失的真实季集。版本不得压扁成仅保留第一条地址。

TMDB 条目使用 type:tmdb、数字 id + mediaType；混合列表可用 movie.550 / tv.123。它们进入原生 TMDB 详情，不调用自有 loadDetail。其他外部平台 ID 本身不构成 Prism 的在线详情服务，独立资源应使用 type:url 并提供元数据。

图片回退：横图 backdropPath → coverUrl → posterPath；竖图 posterPath → backdropPath → coverUrl；详情海报优先 detailPoster。支持 posterUrl/poster_url 与 backdropImageUrls 别名。TMDB 图片传原始路径，其他图片使用完整 HTTP(S) 地址。

## 5. 播放、字幕与弹幕

播放入口固定 id:loadResource、type:stream，functionName 可自定义。输入作品或分集上下文，返回：

```js
[{name: "原始版本", url: "https://example.com/play", description: "4K | HEVC",
  customHeaders: {"X-Prism-Skip-Redirect-Probe": "1"}, playerType: "app"}]
```

播放结果不是媒体条目。点击播放、刷新或切源时重新解析；一次性地址可用上述内部头禁止预加载探测，实际网络请求移除此头。playerType:system 优先系统内核，app 沿用应用策略。

字幕固定 id:loadSubtitle、type:subtitle，返回 `[{id,title,lang,url}]`。url 可为普通字幕或 ZIP。可选顶层 resolveSubtitleArchive(params) 接收 archiveName/archiveUrl/subtitleId/subtitleName/subtitleLanguage、播放上下文、files/subtitleFiles 两个 JSON 字符串；文件描述含 path/name/extension/size。返回相对路径、路径数组、{path} 或 {files:[...]}；只接受包内实际字幕，不匹配时按语言或首个候选回退。ZIP 在内存解压并校验大小、路径和 CRC。

弹幕入口 type:danmu，ID 固定：

| ID | 输入与输出 |
| --- | --- |
| searchDanmu | 播放上下文 → {animes:[{animeId,animeTitle}]} |
| getDetail | animeId → [{episodeId,episodeTitle,episodeNumber}] |
| getComments | 选中的 episodeId 作为 commentId → 评论 |
| getDanmuWithSegmentTime | 同一 commentId + segmentTime 秒数 → 对应时段评论 |

允许没有 getDetail 的直接分段链路。评论支持 {comments:[{p:"秒,模式,颜色整数",m:"文本"}]}、裸对象数组、[time,pos,color,"",text][] 和 XML。模式 5 顶部、4 底部，其余滚动。分段按进度加载，跳转更新窗口并去重。

## 6. 宿主 API 与生命周期

```js
const response = await Prism.http.get(url, {params:{page:1}, headers:{}, allow_redirects:false});
const body = response.data; // 还返回 body/status/statusCode/headers
await Prism.http.post(url, {name:"value"}, {headers:{}});
const movies = await Prism.tmdb.get("movie/popular", {params:{language:"zh-CN"}});
const rows = movies.results; // tmdb.get 直接返回正文
const $ = Prism.html.load("<h1>标题</h1>");
Prism.storage.set("cursor", {page:1}); Prism.storage.get("cursor"); Prism.storage.remove("cursor");
Prism.sharedCache.set("author.catalog", "movie:1", {title:"作品"});
Prism.sharedCache.get("author.catalog", "movie:1");
Prism.sharedCache.remove("author.catalog", "movie:1");
```

HTTP 默认跟随重定向；allow_redirects:false 返回原始 3xx；zlibMode:true 解压后解析 JSON。网络失败抛错，脚本自行捕获后可返回自己的缓存数据。没有 fetch、Node、文件系统、系统命令或浏览器 DOM。HTML 解析器按需加载。

每次调用有独立 JSContext，同模块串行，不依赖顶层变量常驻。并行队列最多 3 个任务，单 HTTP 最长 20 秒，网络总预算约 45 秒，接收后检查 16 MiB 响应限制。纯 JS 死循环目前没有强制抢占，模块作者应保证函数终止。

| 层级 | 缓存与状态规则 |
| --- | --- |
| 宿主内容缓存 | 模块、版本源码摘要、入口、参数、账号环境与设置隔离；先显示快照，再刷新过期数据 |
| Prism.storage | 模块私有持久状态；重置脚本存储或卸载才清除 |
| Prism.sharedCache | 通过显式 namespace/key 跨模块共享，无自动 TTL，无全局清除 API；清模块缓存会删除该模块登记过的共享项 |

栏目默认 3600 秒，搜索 300 秒，详情默认 60 秒；cacheDuration/detailCacheDuration 可设 0–86400 秒，0 不保存结果。失败保留快照，成功空结果移除旧内容。含直链或头的结果不落盘，最多短时内存复用；播放解析不缓存。单模块最多 32 个磁盘快照/8 MiB，单快照 2 MiB。

## 7. 集合与交付

```json
{"format":"prism.collection","version":1,"title":"我的模块集合","modules":[
  {"id":"author.library","title":"我的影库","version":"1.0.0",
   "url":"./library.prism","sha256":"文件完整字节的 SHA-256，64 位十六进制"}
]}
```

集合命名为 `.prs`，每项指向 `.js` 或 `.prism`，禁止嵌套集合；最多 500 项，ID 不得重复。相对地址以集合 URL 解析；直接粘贴集合内容应使用绝对 HTTP(S) 地址。sha256 可省略，正式分发由工具生成并保留；它用于文件一致性，不证明作者身份。

安装按「读取集合 → 选条目 → 下载 → 摘要校验 → 解密（如需要）→ 读取声明 → 身份和版本校验 → 原生确认页 → 安装」执行。集合的 ID/版本必须与解密后的声明一致。更新优先 updateUrl，否则使用原安装集合/模块地址；失败保留旧版。

```sh
node <skill目录>/scripts/prism-module.mjs check <skill目录>/assets/library.js
node <skill目录>/scripts/prism-module.mjs pack source.js <skill目录>/assets/prism-public-key.json library.prism
node <skill目录>/scripts/prism-module.mjs index "我的模块集合" modules.prs library.prism
```

第三方作者使用独立 SDK 运行离线请求断言，再在已编译的 Prism 客户端导入验证，不需要宿主源码。修改一个字段或路由 ID 的临时副本，确认断言能失败。宿主内部回归只供维护者执行，详见[测试与排错](testing.md)。
