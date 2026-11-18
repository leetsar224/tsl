# 播放资源、字幕与弹幕服务

三个服务复用现有播放器及原生控件，不允许模块另建播放器界面。只声明实际提供的能力；独立字幕或弹幕模块不需要虚构媒体列表。

## 动态播放资源

```js
// PrismMetadata.modules 中的一项
{id:"loadResource",type:"stream",functionName:"resolve",cacheDuration:0,params:[]}
```

resolve(params) 可同步或异步返回 Resource[]。标准输入是当前播放上下文与有效配置合并的结果：

| 参数 | 可用条件 |
| --- | --- |
| id / link | 所选作品、分集或版本的原始身份 |
| type | movie 或 tv |
| title | 当前作品/条目标题，不能作可靠唯一标识 |
| seriesName / episodeName | 自有分集链路可提供剧名/集名 |
| tmdbId | 明确匹配的作品才提供 |
| season / episode | 有真实季集信息时提供 |
| videoUrl | 原条目本身带直链时可提供 |
| airDate / premiereDate / runtime | 有日期或时长时提供；runtime 单位秒 |
| resourceId | 已选择的资源或版本 ID，重试/续播保留 |
| sourceId | 模块声明多源时注入 |
| libraryOnly | 从插件资源库进入时为 true；仅查询当前插件自身资源，包含起播、重试和续集 |
| 全局和入口参数 | 依照当前设置与条件注入 |

参数不是固定全量对象，缺失字段不会自动猜出。脚本应按自己的路由选接口；全局 TMDB 查询没有自有 link 时，可按明确 tmdbId/type/season/episode 解析。

| Resource 字段 | 类型 | 意义 |
| --- | --- | --- |
| url | string，必需 | 有效 HTTP(S) 地址；无效项会被过滤 |
| name | string | 资源/线路名称 |
| id | string | 可选，推荐稳定文件 ID，避免顺序改变导致选中错位 |
| description | string | 分辨率、编码或线路说明 |
| customHeaders | object<string,string> | 播放请求头；headers 为别名 |
| playerType | string | system 优先系统内核；app 沿用应用策略 |
| size | number | 可选文件字节数 |
| fileName / tags | string / string[] | 0.1.1 起，原始文件名及技术标签，用于紧凑版本卡片与 Badge |
| height / videoRange / bitRate | number / string / number | 0.1.1 起，可选视频高度、色彩范围及 bit/s 码率；未知时省略 |
| tmdbId / mediaType | number / string | 可省略；若提供，不应与本次请求身份冲突 |

```js
function resolve(params) {
  const result = Prism.http.get(params.apiBase + "/resolve", {params:{link:params.link}}).data;
  return [{id:"original",name:"原始版本",url:result.url,customHeaders:result.headers || {},playerType:"app"}];
}
```

点击播放、切源、电影重试和剧集续播时重新请求资源。自有详情先补全，再调用动态 stream 入口；只有 link 的版本也可选择。stream 返回空时仍可使用本次详情给出的有效直链。下一集优先匹配稳定版本 ID；同一插件中可按相同技术标签唯一匹配，旧模块继续兼容唯一同名版本。多个候选或无法确定时提示重新选择，不以文件大小或列表序号判断版本。正常缓冲、HLS 播放列表刷新、播放器 seek 不由模块自行轮询处理。网络错误应抛出异常。模块不能保证某个容器、编码、HDR 或音轨一定被当前内核支持。

### 一次性 URL 与重定向

不能被预探测消耗的单次链接可添加 `customHeaders:{"X-Prism-Skip-Redirect-Probe":"1"}`。它是宿主内部标志，不区分头名大小写，实际网络请求会移除。稳定直链不需要默认添加；该标志不代替授权头，不负责续签，也不让 302 目标永久有效。

## 字幕搜索

模块也可在作品、分集、版本或播放线路上声明 `externalSubtitles`。播放器沿当前版本保留字幕请求头，按需加载 HTTP(S) 字幕。开启自动字幕时会尝试带 `isDefault:true` 的轨道。独立字幕搜索仍由专用字幕入口提供。

固定入口 id:loadSubtitle、type:subtitle、functionName 自定。接收当前可用的播放上下文，返回字幕候选数组：

```js
[{id:"sub-42",title:"简体中文",lang:"zh",url:"https://your-service.example/subtitles/42.zip",
  customHeaders:{"User-Agent":"YourModule"}}]
```

| 字段 | 说明 |
| --- | --- |
| id | 稳定字幕候选身份，同一模块去重 |
| title / lang | 标题与语言；name/language 为输入别名 |
| url | HTTP(S) 普通字幕或 ZIP，必须有效 |
| customHeaders | 下载该字幕所需的字符串请求头 |
| count | 当前不控制下载、选择或 UI 数量；无需填写 |

当前会依次查询启用且声明 subtitle 能力的模块，合并候选。字幕服务不依赖“接入媒体库”开关。单次下载最多 8 MiB、20 秒，要求 2xx；ZIP 通过文件头识别，不只看扩展名。

## ZIP 内字幕选择

顶层 `resolveSubtitleArchive(params)` 可选，不放进 modules。它运行在新的上下文，获得全局参数和字幕搜索时的上下文，以及：

| 参数 | 类型/内容 |
| --- | --- |
| archiveName / archiveUrl | 文件名、下载地址 |
| subtitleId / subtitleName / subtitleLanguage | 当前候选身份、名称、语言 |
| files | JSON 字符串：所有普通文件描述 |
| subtitleFiles | JSON 字符串：支持的字幕文件描述 |

文件描述 `{path,name,extension,size}` 中 path 为 ZIP 内相对路径、extension 为小写、size 为字节数。支持 srt/ass/ssa/vtt/sub。必须 JSON.parse 后选择，不把 JSON 字符串当数组。

```js
function resolveSubtitleArchive(params) {
  const files = JSON.parse(params.subtitleFiles || "[]");
  const preferred = files.find(file => file.extension === "ass") || files[0];
  return preferred ? preferred.path : null;
}
```

返回路径字符串、字符串数组、`{path}` 或 `{files:[...]}` 均可；只使用第一个实际存在的支持字幕。函数抛错会显示错误；函数缺失、返回空或找不到路径时，按语言命中文件名、否则首个候选回退。null 不是“禁止选择字幕”。多集包的具体季集选择见 [subtitles.js](../../Examples/Modules/subtitles.js)。

ZIP 支持 Stored/Deflate；拒绝加密、分卷、符号链接、重复路径、绝对路径和目录穿越；最多 256 个条目，单文件 8 MiB，解压合计 32 MiB，校验长度与 CRC。RAR/7z 和外部解压程序不属于当前契约。

## 弹幕的身份传递

四个服务入口均 type:danmu，入口 ID 固定，functionName 可自定：

| ID | 主要输入 | 返回形态 |
| --- | --- | --- |
| searchDanmu | title/seriesName/type，可能有 tmdbId/season/episode/link | `{animes:[{animeId,animeTitle}]}` |
| getDetail | 选中项的 animeId 与原上下文 | `[{episodeId,episodeTitle,episodeNumber}]` |
| getComments | 选中的 episodeId 作为 **commentId** | 评论数据，或 `{segmentList:[...]}` 初始化目录 |
| getCommentsWithSegmentTime | 同一个 commentId + segmentTime（秒） | 新版 30 秒窗口评论 |
| getDanmuWithSegmentTime | 同一个 commentId + segmentTime（秒） | 指定时段评论数据 |

```text
服务作品 ID → animeId → getDetail
服务分集 ID → episodeId → commentId → getComments / getDanmuWithSegmentTime
```

选中作品后 title 可能变成该候选标题，seriesName 保留原查询剧名；不要通过 title 变化重猜季数。分集 ID 即使是数字，后续 commentId 也可能为字符串，服务请求中按字符串或 URL 编码使用。

searchDanmu 候选可以内联 episodes，省去下一次请求。没有内联 episodes 且没有 getDetail 入口时，会直接以 animeId 作为单个评论身份；这是适合明确直达评论接口的简化链路，不代表宿主能猜出多个分集。

返回 episodeNumber 可帮助宿主定位当前集；可选顶层 extractEpisodeNumber(title) 仅用于未返回编号时的解析。没有可靠分集匹配时由用户选择，不按列表位置猜第一集。

自动搜索并发查询已启用来源并按安装顺序匹配与回退；手动搜索可指定来源。仅未配置任何弹幕模块时回退内置来源，用户停用的模块不会被自动重新启用。自动加载、手动搜索与重载均保留作品和分集上下文。不要把 capabilities 中的 danmaku 与入口 type 的 danmu 拼写混淆。

新版入口优先于旧版。getComments 在会话首次调用或切集后初始化，即使返回空 segmentList，也继续调用分片入口；新版请求按 30 秒窗口，旧版按 15 秒窗口推进。评论调用保留同一个 JSContext，可用 Map 缓存目录/片段，但必须限制容量和 TTL；取消、配置变化和更新会清理会话，下次调用重新初始化。字幕搜索与普通资源调用没有此会话例外。

## 评论格式与分段

推荐对象格式：`{comments:[{cid:"c1",p:"12.5,1,16777215",m:"示例"}]}`，也接受裸对象数组。p 的前三项为绝对时间秒、模式整数、RGB 颜色整数。

另可返回 `[[12.5,"5","#fff","","示例"]]`，数组字段依次为时间、模式、颜色、保留空字段、文本。模式 5 顶部、4 底部，其余滚动；颜色可为整数或十六进制颜色文本。XML 字符串也可交给宿主已有解析器。

时间必须有限且非负，文字非空。段内 time 仍使用整部媒体的绝对秒数，不能每段都从 0 计时。segmentTime 是请求位置，不保证单调增长；拖动可能回到之前的段，按段起始时间计算并缓存即可。完整链路见 [danmaku.js](../../Examples/Modules/danmaku.js)。

## 配套示例的服务契约

这些接口是教学模板要求的响应形态，不是可直接访问的公共服务。接入真实服务时修改请求与映射函数，保持输出 Prism 契约不变。

| 示例 | GET 路径与查询 | 原始响应 |
| --- | --- | --- |
| subtitles.js | /subtitles，title 与存在的 tmdbId/season/episode | `{items:[{id,name,language,url}]}` |
| danmaku.js 搜索 | /shows，keyword/season | `{items:[{id,name}]}` |
| danmaku.js 分集 | /shows/编码后的作品ID/episodes | `{items:[{id,name,number}]}` |
| danmaku.js 评论 | /episodes/编码后的评论ID/comments，start/end | `{items:[{id,time,text}]}` |

字幕示例用 SxxExx 文件命名选择季集，再优先匹配语言，避免 E02 误命中 E020；其他命名规则要修改选择器。弹幕示例把 segmentTime 向下取整到 30 秒边界，短期保留最多 4 个窗口，输出保留服务提供的绝对 time；固定白色滚动模式仅为示例，真实来源有模式/颜色时可按协议映射。
