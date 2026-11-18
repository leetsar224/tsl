# 媒体模型、详情、分集与版本

模块输出数据，宿主转换为已有的资源卡、详情页和播放器。字段名是契约；任意附加字段不会自动成为界面内容。下面使用 MediaItem 表示 JavaScript 对象，不需要导入类型或构造类。

## 身份与导航

| 场景 | type | 身份与行为 |
| --- | --- | --- |
| 自有电影或剧集 | url | 稳定 id + 不透明 link；进入模块详情 |
| 已知 TMDB 作品 | tmdb | 正整数 id + movie/tv；进入原生 TMDB 详情 |
| 目录 | folder | 稳定 id/link；进入模块 library.browseFunction |

`type:"url"` 的名字不要求 link 真的是 HTTP 地址，它可以是 `show:42`。媒体 id 负责收藏、缓存和去重，link 负责模块路由，可以不同。它们都不能随刷新随机变化，也不能用展示标题或数组下标代替稳定业务身份。

普通 TMDB 项使用数字 id；混合列表也接受 `movie.550` / `tv.123`。当没有可靠对应关系时，不填写 tmdbId。其他平台编号本身不提供可用的原生在线详情服务，使用 url 并自行提供详情。

## MediaItem 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string / number | 完整条目应提供；同列表重复 ID 仅保留第一项 |
| type | string | url、tmdb、folder；完整条目显式填写 |
| mediaType | string | movie / tv；有 TMDB ID 时必须明确类型 |
| tmdbId | positive integer | 可选显式绑定；必须是实际对应作品 |
| link | string | 自有详情/目录/文件的原始路由 |
| title | string | 完整条目应提供；详情补充时可省略 |
| subtitle | string | 卡片副标题；缺省时可从 releaseDate 取年份 |
| description | string | 简介 |
| releaseDate | string | 推荐 YYYY-MM-DD，不依赖宿主猜测格式 |
| rating | number | 评分数值；使用一致尺度，建议 0–10 |
| posterPath | string | 竖向海报 |
| backdropPath | string | 横向图片 |
| coverUrl | string | 通用图片回退 |
| detailPoster | string | 详情专用海报 |
| backdropPaths | string[] | 剧照 |
| trailers | `{url:string,coverUrl?:string}[]` | 预告片，不是任意 HTML 嵌入 |
| externalSubtitles | `{url,title?,language?,isDefault?,customHeaders?}[]` | 与此作品、分集或版本绑定的外挂字幕 |
| genreItems | `{id:string,title:string}[]` | 可点击分类；ID 缺失的项不会形成有效分类路由 |
| peoples | `{id:string,title:string,avatar?:string,role?:string}[]` | 人物资料与原始路由 |
| genreTitle | string | 可选逗号分隔分类文字；不能替代可点击 genreItems |
| relatedItems | MediaItem[] | 推荐作品，保持每个作品自己的身份 |
| episodeItems | MediaItem[] | 剧集的真实分集 |
| childItems | MediaItem[] | 当前电影或分集的可选文件版本 |
| season / episode | integer | 真实季/集编号，不能按数组位置推测 |
| videoUrl | string | 可选直接播放地址；短期地址应由播放入口解析 |
| customHeaders | object<string,string> | 播放请求头 |
| playerType | string | system 或 app，表达选择偏好，不保证所有编码可播 |
| previewUrl | string | HTTP(S) 预览媒体；详情页“播放预览”使用原生播放器 |
| duration | number | 秒 |
| durationText | string | 展示时长文本 |
| size | number | 文件字节数，可选 |

输入容错别名包括 name→title、overview→description、posterUrl/poster_url/poster→posterPath、backdrop→backdropPath、backdropImageUrls→backdropPaths、headers→customHeaders。新模块使用表中规范字段。详情时长优先显示 durationText，否则由 duration 秒换算；coverUrl 可作为海报及收藏封面回退。previewUrl 使用原生播放入口。

每次解析最多取列表前 2000 项；递归解析深度有限（超过 4 层停止），不用于任意嵌套树。目录通过下一次调用下钻。分集与版本采用“作品 → 分集 → 文件”结构即可。

## 图片位置与回退

| 显示位置 | 优先顺序 |
| --- | --- |
| 竖向海报 | posterPath → backdropPath → coverUrl |
| 横向图片 | backdropPath → coverUrl → posterPath |
| 详情海报 | detailPoster → 竖向海报 |
| 剧照 | backdropPaths，独立数组 |

TMDB 图片可使用 `/abc.jpg` 原始路径；其他数据源使用完整 HTTP(S) 地址。不要把整个对象或 HTML 填进图片字段。相对路径会被当作宿主图片路径处理，不能指望它自动相对于模块 API 地址解析。

## 两种详情入口

默认方式：模块不声明 detailFunction，顶层定义 `loadDetail(link)`，只收到字符串。不能写成 `loadDetail(params)` 后读取 params.id。未知路由返回 null。

需要实时配置、凭据或 sourceId 时，声明 `detailFunction:"itemDetail"`，定义 `itemDetail(params)`；此扩展获得全局配置、id、link、可用的 featureID 与 sourceId。不要为了给默认 loadDetail 传配置而把凭据写入普通存储。

```js
// 在 PrismMetadata 中加入 detailFunction: "itemDetail"
function itemDetail(params) {
  if (!params.link.startsWith("item:")) return null;
  const id = params.link.slice(5);
  const body = Prism.http.get(params.apiBase + "/items/" + encodeURIComponent(id), {
    headers: {Authorization: "Bearer " + params.token}
  }).data;
  return {description: body.summary, backdropPaths: body.images};
}
```

详情可返回完整 MediaItem、补充字段对象或媒体/资源数组。补充对象会合并到原作品；宿主保留基础 id 和来源栏目，省略标题时保留原标题。为了保持路由稳定，完整对象继续返回相同 type/id/link，不能把整部剧的详情换成某一个文件。

带 `link` 的 TMDB 模块卡片也会执行详情回调。补充内容可提供预告、分集与播放版本，原 TMDB 身份用于平台元数据和全局匹配。也接受预告中的 Rex 字段 `videoUrl`。

## 分集与版本实例

```js
{
  id: "show-7", type: "url", mediaType: "tv", title: "示例剧", link: "show:7",
  episodeItems: [
    {id: "ep-1", type: "url", mediaType: "tv", title: "第一集", link: "ep:1", season: 1, episode: 1},
    {id: "ep-2", type: "url", mediaType: "tv", title: "第二集", link: "ep:2", season: 1, episode: 2,
     childItems: [
       {id: "file-2a", type: "url", title: "原画", link: "file:2a"},
       {id: "file-2b", type: "url", title: "精简", link: "file:2b"}
     ]}
  ]
}
```

点击第二集后，播放上下文先绑定 ep:2；选中精简版本后 link/id 指向该文件，同时保留第二集的季集信息。播放入口不能忽略传入 link 再按剧名返回第一集。电影多版本直接放在作品的 childItems；不要把多个文件塞进一个拼接 URL。

## 分类、人物与相关推荐

在详情页点击 genreItems/peoples，宿主回到原列表入口，分别注入 `genreId` / `peopleId`。值按字符串比较，处理后再请求数据源；只在卡片上显示分类文字并不能自动筛选远端数据。

由同一函数服务的多个栏目必须保留独立 feature id，否则分类回跳不能区分电影和剧集。自定义分区用 featureId 指向所属列表；它和内部传递的 featureID 不是同一个字段拼写，见[资源库组织](resources.md)。

## TMDB 聚合规则

独立页面可混合显示自有作品和 TMDB 条目。参与媒体库聚合还必须同时满足模块已启用、允许接入、用户已开启接入、条目有明确正整数 TMDB ID 和 movie/tv 类型。不能用片名、海报相似度或外部站点编号自动补 ID。

全局播放匹配使用明确的 TMDB 作品上下文；剧集匹配需要对应季集。服务返回的播放结果可省略重复 TMDB ID，宿主绑定本次请求；显式冲突的数字 ID 或 mediaType 会被过滤。

## 资源版本的展示字段（Prism 0.1.1 起）

版本条目可选提供 `fileName:string`、`tags:string[]`、`height:number`、`videoRange:string`、`bitRate:number`（bit/s），以及已有的 `size`（字节）。播放 Resource 返回相同字段。仅提供有依据的数据；缺少结构化信息时宿主继续兼容旧描述。

`title` 是紧凑版本摘要；原始文件名放在 fileName。Badge 依据文件名、标签和媒体信息匹配，在版本弹层中单行横滑显示。版本 id/link 继续使用稳定文件路由，不用标题、序号或临时 URL 代替身份。
