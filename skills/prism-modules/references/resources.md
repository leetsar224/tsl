# 资源库、数据源、原生页面与缓存

一个模块是独立的数据来源。资源页面、模块参数、详情、分集和播放入口沿用宿主原生组件；数据源可安排栏目与内容，不提供 HTML 布局、CSS 或独立导航栈。

## 选择资源页组织方式

| 需求 | 声明 | 页面行为 |
| --- | --- | --- |
| 单列表 | 一个普通 Feature | 直接显示该栏目 |
| 多栏目 | 多个普通 Feature | 底部栏目选择，参数与缓存按入口 ID 隔离 |
| 只有搜索 | modules:[] + search | 搜索可进入模块资源页，首页可为空 |
| 分区首页 | library.homeFunction | 调用自定义首页函数，返回多个分区 |
| 目录下钻 | library.browseFunction + folder | 点击目录后请求对应目录内容 |
| 多线路/站点 | library.sources | 原生底部菜单切换，注入 sourceId |
| 纯播放/字幕/弹幕服务 | 对应服务 Feature | 接入播放流程，不强制生成空的资源库列表 |

自定义首页模式不会再显示普通的“首页栏目切换”菜单。首页应自己返回分区，并通过 featureId 为各分区绑定更多内容入口；sources 菜单仍可存在。

## 分区返回值

首页推荐返回 `{sections:[Section,...]}`。Section 数组也可直接返回。普通列表返回 MediaItem[]；不要在同一数组中混用分区对象和媒体对象。

```js
function home(params) {
  return {sections: [
    {id: "featured", title: "精选", layout: "hero", items: [/* MediaItem */]},
    {id: "movies", title: "电影", layout: "poster", featureId: "movies", items: [/* MediaItem */]},
    {id: "recent", title: "最近更新", layout: "landscape", featureId: "recent", items: [/* MediaItem */]},
    {id: "folders", title: "目录", layout: "list", items: [
      {id: "archive", type: "folder", title: "归档", link: "folder:archive"}
    ]}
  ]};
}
```

| 字段 | 类型 | 约定 |
| --- | --- | --- |
| id | string | 稳定分区 ID，推荐显式提供 |
| title | string | 原生标题 |
| layout | string | poster 海报网格、landscape 横向卡片、list 列表、hero 轮播；未识别值按海报布局处理 |
| featureId | string | 指向 modules[].id，或顶层搜索的 search；用于分区更多入口及条目的来源归属 |
| items | MediaItem[] | 作品或目录 |

featureId 的 `Id` 是小写开头；某些宿主内部详情上下文会带 featureID，开发者不要把内部参数名误写到分区结构里。分区没有绑定实际存在的入口时，不能靠标题自动获得分页或分类回跳。

`{items:[...]}`、`{data:[...]}` 是列表包装；它们不会自动把同一个对象上的 layout/title 当成分区。需要分区样式时使用上面的 sections 结构。hero 使用原生轮播，导航标题、按钮与动效仍由宿主管理。

## 数据源与目录

```js
library: {
  homeFunction: "home", browseFunction: "browse", allowIntegration: false,
  sources: [{id:"main",title:"主线路"},{id:"backup",title:"备用线路"}]
}
```

sourceId 由当前选择注入；未选或旧选择已被移除时取声明的第一项。它影响内容缓存身份。多个来源之间不要使用同一个作品 ID 指代完全不同的内容；必要时把站点身份包含进 id/link。

browse(params) 收到目录的 id/link、全局参数和 sourceId；返回下一层作品或 folder。目录入口应独立命名，直接解析传入路由。不要把目录写成 url 类型，否则宿主会当作作品详情打开。普通目录页没有自动 cursor 分页契约；大目录应拆分成层级，或由分页 Feature 提供作品列表。

默认 loadDetail(link) 不带 sourceId 参数。多源作品详情若依赖当前选择，应声明 detailFunction 获得参数对象，或者把来源身份编码进自己的 link。完整例子见 [catalog.js](../assets/catalog.js)。

## 设置页面由声明生成

模块管理展示 Logo、作者、说明、版本、ID、网站、能力与更新信息；全局、栏目和搜索配置按作用域生成原生控件。复杂页面不能通过返回任意 schema 就获得自定义表单组件；可用配置类型以[参数参考](manifest.md)为准。

模块设置包含启停、允许时的媒体库接入、参数与首页栏目、检查更新、缓存清理、脚本存储重置和移除。清缓存与重置脚本存储是不同操作，不要把登录凭据放进脚本状态后又依赖清缓存保留登录。

## 三类状态的生命周期

| 状态 | 保存内容 | 更新模块 | 清模块缓存 | 重置脚本存储 | 卸载 |
| --- | --- | --- | --- | --- | --- |
| 原生配置/凭据 | 参数、选择、Keychain | 保留仍声明的凭据和配置；已删除凭据声明会清除 | 保留 | 保留 | 清除 |
| 内容快照 | 列表、搜索、详情结果 | 清除 | 清除 | 清除 | 清除 |
| Prism.storage | 模块私有 JSON | 保留，作者负责结构版本 | 保留 | 清除 | 清除 |
| Prism.sharedCache | 显式共享项 | 清相关项 | 清该模块登记过的项 | 清相关项 | 清相关项 |

更新不会自动开启媒体库接入；如果新声明禁止接入，旧开关会清除。停用模块会清内容/共享缓存，保留配置和私有状态。共享项可能同时被其他模块使用，必须容忍它消失。

## 内容缓存策略

缓存键包含模块 ID、源码摘要、入口、调用参数、全局/栏目/搜索设置、凭据值的派生身份、当前数据源、语言和账号环境。凭据参与计算以隔离账号，不把凭据明文写入缓存文件名。

- 打开页面先显示可用快照；过期时再请求并更新。仍在 TTL 内直接复用，后台没有永久定时刷新任务。
- 列表默认 3600 秒，搜索固定 300 秒，详情默认 60 秒。自定义首页使用当前列表 TTL，缺省 3600 秒。
- 列表 cacheDuration、详情 detailCacheDuration 可设 0–86400；0 表示本次结果不保存。播放解析固定不缓存。
- 刷新失败保留旧快照并展示错误；成功空结果替代旧内容。一次性播放地址不能按无限期旧数据回退。
- 任意层级含播放直链或请求头的结果不写磁盘，内存复用最多 60 秒或更短的 TTL。
- 单模块磁盘最多 32 个快照、合计 8 MiB，单快照最多 2 MiB；进程内容快照内存条目上限 96，按需淘汰。
- 同一缓存键的进行中请求会合并；全部使用者取消时才取消共享任务。

这些是内容缓存，不是 Prism.storage 或网络层缓存的配额承诺。脚本自己保存的状态应保持小、可重建，显式共享缓存的过期时间由脚本维护。

## 性能和失败边界

列表先返回展示需要的基础字段，详情再补全。不要为每张海报串行查询一次详情，或在首页解析全部播放地址；这样既慢，也使结果含直链而无法落盘。

页面请求可能因切换栏目、关键词、数据源或离开页面而取消。不要把“开始请求”当作“已完成更新”提前覆盖自己的状态。业务失败抛出短错误；没有匹配项才返回空列表。媒体库不开启、无 TMDB ID、没有列表入口都是明确配置状态，不应伪装为网络故障。

## 结构化示例的数据源接口

[catalog.js](../assets/catalog.js) 是转换层模板，不定义真实在线服务。示例用 apiBase 指向开发者自己的 API，所有请求传 `source` 查询参数；token 非空时附 `Authorization: Bearer …`。请求列表如下：

| GET 路径 | 额外查询参数 | 示例响应 |
| --- | --- | --- |
| /items | kind、page、count，列表时还含 genre/person | `{items:[UpstreamItem]}` |
| /search | keyword、page | `{items:[UpstreamItem]}` |
| /folders/编码后的目录键 | 无 | `{items:[UpstreamItem]}` |
| /items/编码后的作品键 | 无 | 单个 UpstreamItem |
| /resolve | link | `{streams:[{id,label,url,headers?}]}` |

UpstreamItem 为 `{id,name,kind,poster?,backdrop?,description?,date?}`，kind 为 movie/tv。模板将它映射为 Prism 的 title/mediaType/posterPath 等规范字段，不直接透传原始 API 对象。缺少 items 数组、作品 ID/标题/类型或有效播放地址时抛出错误，不把结构变化当成空列表。

例子中的 `item:show/7` 会把真实作品键 `show/7` 编码成路径片段 `show%2F7`。路由编码只处理原始业务 ID 一次，不能重复编码整个 URL。目录使用 folder: 前缀，作品使用 item: 前缀；生产模块可以设计自己的格式，但在列表、详情和播放之间必须一致。

此模板的首页同时请求电影与剧集各 6 项，展示一个目录入口；它并不提前请求每部作品详情和播放地址。分集与多版本映射参照 [library.js](../assets/library.js)，按你的服务返回增加 episodeItems 与 childItems。
