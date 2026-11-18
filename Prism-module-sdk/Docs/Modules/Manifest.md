# 声明、入口与参数参考

本页约定第三方模块应输出的规范格式。宿主某些字段存在容错或自动补值，开发者仍应显式声明必需字段，避免把容错当成协议。未知字段不会自动获得新能力。

## PrismMetadata

`PrismMetadata` 是单个全局对象。可使用赋值或全局变量声明；放在文件开头便于检查。不要使用 ES Module 的 export/import，也不要在顶层调用宿主 API。

| 字段 | 类型 | 必需/默认 | 行为与限制 |
| --- | --- | --- | --- |
| schemaVersion | number | 必需，1 | 原生导入仅接受协议 1 |
| id | string | 必需 | `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`；全局稳定且唯一 |
| title | string | 必需 | 非空显示名称 |
| version | string | 必需 | 1–64 字符，首位字母或数字，之后可含点、加号和连字符；推荐递增三段数字 |
| requiredVersion | string | 可选 | 最低应用版本；高于当前版本会拒绝安装 |
| description | string | 可选 | 模块用途、服务依赖、限制等说明 |
| author | string | 可选 | 作者声明；不是经过验证的发布者身份 |
| icon | string | 可选 | HTTP(S) Logo；省略或失败显示原生占位图 |
| iconurl | string | 可选 | icon 的备用字段，icon 优先 |
| site | string | 可选 | 作者或文档网址，HTTP(S) |
| updateUrl | string | 可选 | 指向模块或 `.prs` 的更新网址；否则沿用安装来源 |
| changelog | string | 可选 | 当前版本说明，在模块设置中显示 |
| globalParams | Parameter[] | 默认空 | 各入口共享的配置声明 |
| modules | Feature[] | 推荐显式数组 | 列表、播放、字幕和弹幕入口；纯搜索模块写空数组 |
| search | Search | 可选 | 顶层独立搜索入口 |
| library | Library | 可选 | 资源页结构、线路以及接入许可 |
| capabilities | string[] | 默认推导 | 一旦显式填写，就以该数组为能力声明，不再补齐遗漏项 |
| detailCacheDuration | number | 默认 60 | 0–86400 秒；0 不保存详情结果 |
| detailFunction | string | 可选 | 参数对象形式的自有详情函数名；未设时使用 `loadDetail(link)` |

Logo、网站、更新地址可相对于下载来源解析；源码直接粘贴时用绝对地址。网址不能包含用户名或密码。版本比较采用数值字符串排序，不实现完整 SemVer 预发行优先级；使用 `1.2.3 → 1.2.4` 最可预测。

### 能力声明

| 值 | 用途 | 典型入口 |
| --- | --- | --- |
| catalog | 内容栏目 | 普通列表 |
| search | 搜索 | 顶层 search |
| stream | 播放解析 | loadResource / stream |
| subtitle | 字幕提供 | loadSubtitle / subtitle |
| danmaku | 弹幕提供 | searchDanmu 等 / danmu |
| library | 独立资源页 | 列表、搜索或 library.homeFunction |

新模块通常省略 capabilities，由结构推导。显式声明 `library.homeFunction` 且同时填写 capabilities 时，应包含 library。只有 `library.allowIntegration:false` 不要求声明自定义首页，也不要求额外列出 library 能力。

## Feature 与 Search

| Feature 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 必须显式提供；同一模块内唯一；作为设置、分页和缓存身份 |
| title / description | string | 可选显示文字 |
| functionName | string | 必需；真实的全局函数名，匹配 `[A-Za-z_$][A-Za-z0-9_$]*` |
| type | string | 普通列表省略；服务入口用 stream、subtitle、danmu；media_list 也作为列表 |
| params | Parameter[] | 默认空 |
| cacheDuration | number | 列表默认 3600，范围 0–86400 秒；服务类入口见各自调用策略 |
| requiresWebView | boolean | 当前只支持省略或 false；true 会在执行时提示不支持网页执行环境 |
| sectionMode | boolean | 当前无独立执行或分页语义；不要用它代替返回 sections 或分段弹幕入口 |

同一个函数可被多个栏目复用。每个栏目使用独立 ID 及其参数。顶层 Search 为 `{title?,functionName,params?}`，占用独立的 `search` 配置和栏目 ID。

固定服务 ID：播放 `loadResource`；字幕 `loadSubtitle`；弹幕 `searchDanmu`、`getDetail`、`getComments`、可选 `getDanmuWithSegmentTime`。函数名可以自定义，服务 ID 按约定填写。

## Library

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| title | string | 可选资源页标题，默认模块标题 |
| homeFunction | string | 可选；接收配置对象并返回原生分区 |
| browseFunction | string | 可选；点击 folder 后接收 id/link 与全局配置 |
| sources | `{id:string,title:string}[]` | 可选，ID 不重复；选择项以 sourceId 注入 |
| allowIntegration | boolean | 可选接入许可；false 禁止媒体库聚合。缺省时有 catalog/search/stream 能力的模块允许用户开启 |

模块声明允许接入不会自动启用用户的接入开关。Prism 0.1.1 起，插件资源库内部详情只查询当前插件；接入开关控制全局影视入口的聚合，不改变资源库内部范围。自定义首页、目录函数建议使用独有函数名，避免与多个栏目共用函数造成选择歧义。

## Parameter 全字段

| 字段 | 类型 | 默认/意义 |
| --- | --- | --- |
| name | string | 必需，同一作用域不能重复 |
| title | string | 默认 name |
| type | string | 推荐显式提供，默认按文本配置处理 |
| value | string/number/boolean | 默认值；声明读取时归一为字符串，再按 type 转换 |
| description | string | 参数说明 |
| enumOptions | `{title:string,value:string}[]` | 枚举选项；值可先写为数字，但注入时按参数类型转换 |
| placeholders | `{title:string,value:string}[]` | 文本输入的可选预设，不是默认值 |
| secret | boolean | true 用安全输入及 Keychain；false 明确作为普通值 |
| belongTo | `{paramName:string,value:string[]}` | 同一有效参数集合中，父参数字符串值属于集合才显示和注入 |

默认值优先 value，否则 enumOptions 第一项，否则空字符串。语言参数为空时使用应用当前语言。secret 省略时，非搜索参数名含 key/token/password/secret 会自动按凭据处理；建议显式写 secret，避免例如 `sortKey` 被误判。凭据使用 input，不在 enumOptions/placeholders 中嵌入敏感值；枚举或语言声明会优先生成选择器。

| type | 注入值 | 控件与默认行为 |
| --- | --- | --- |
| input / enumeration / language | string | 文本、枚举、语言选择 |
| constant | 声明值 | 不显示，调用方和保存设置不能覆盖 |
| userId | string | 不显示；宿主持久 UUID，不能当服务登录凭证 |
| page | integer | 不显示；无有效值为 1 |
| offset | integer | 不显示；无有效值为 0 |
| count | integer | 数字输入；无有效值为 20 |
| number | number | 数字输入；无法转换为 0 |
| boolean | boolean | 开关；字符串 `true` 转换为 true，其余为 false |

`count` 控件是数字文本输入，不是自带范围的步进器。参数没有 min/max/required 校验器；业务函数自行检查服务允许的范围，并给出明确错误。

## 多语言显示

i18n 为 `{语言:{原文:译文}}`，翻译模块、栏目、搜索、数据源以及参数/选项显示标题与描述，不改变参数值或 ID。优先完整语言标识，再匹配语言；zh-TW/zh-HK/zh-MO 使用 zh-Hant，缺少译文时保留原文。

### 合并顺序与条件

先读取全局默认值和已保存值，再读取当前入口默认值和已保存值，再合并本次调用参数；同名项后者覆盖前者。最后由宿主强制写入 constant、userId，转换类型，移除不满足 belongTo 的项，并注入当前 sourceId。

因此当前入口声明了与全局同名的参数时，即使用户未编辑该入口，该入口的默认值也会覆盖全局值。只在确实需要覆盖时重名。平台保留 id/link/type/tmdbId/season/episode/genreId/peopleId/keyword/sourceId 等上下文用途，不建议复用它们作为无关配置名。

```js
{ name:"authMode", type:"enumeration", value:"guest",
  enumOptions:[{title:"访客",value:"guest"},{title:"令牌",value:"token"}] },
{ name:"accessToken", title:"访问令牌", type:"input", secret:true,
  belongTo:{paramName:"authMode",value:["token"]} }
```

上面是参数数组中的两个元素。条件隐藏不会删除已经保存的凭据，只是不注入本次调用。切换参数会使内容缓存使用新的身份；删除参数或改名时应说明需要重新配置。

`belongTo` 可写成单个对象或数组，数组中的每项都满足时才显示。枚举可用 `dynamicOptions: {functionName, dependsOn?: string[]}` 声明动态设置项。回调接收当前作用域的参数对象，返回 `[{title, value}]` 字符串选项。声明依赖后，设置页会在依赖值变化时重载。加载失败时使用静态 `enumOptions`。已保存的选项失效后，设置页保留该值并允许重新选择。

## 分页与筛选

- 栏目分页通过声明为 page/offset 的参数名传值，不要求一定名为 page；示例统一使用 page 便于阅读。
- offset 为 `(页码−1) × count`；count 先取调用值，再取入口配置，最低步长 1，缺省 20。
- 搜索只有声明 page/offset 才具有分页输入；顶部搜索预览不等于无限滚动列表。
- 返回空数组表示结束，异常用 throw；不能把失败伪装成空页。
- 翻页后 ID 必须稳定，重复页会被识别，不能每页重新从 1 编号。
- 带 enumOptions、非 secret、可编辑且符合条件的参数可成为原生筛选项；切换筛选重新加载第一页。
