---
name: prism-modules
description: 开发、修改、排错和审查 Prism JavaScript 资源模块，接入原生资源库、详情、播放、字幕和弹幕，制作 .prs 集合与 .prism 加密分发文件。用于 PrismMetadata、Prism API 及第三方模块开发；不用于泛化的应用 UI 重构。
---

# Prism 模块开发

Prism 协议 v1：一个模块是一份 JavaScript 源码，声明 `PrismMetadata` 并通过 `Prism` 调用宿主 API。`.prs` 是分发集合，`.prism` 是加密模块，`.js` 是开发源码。模块的列表、详情、设置和播放由宿主原生框架展示。

## 按任务读取

模块开发不要求主项目源码；只需本 skill/独立 SDK 与 Node.js，真实 UI 和播放验收使用已编译的 Prism 客户端。入口保持简短，具体契约在以下参考中。只读与当前任务有关的章节；不要根据字段名字猜行为。

- 第一次开发：先看[独立开发包](references/sdk.md)，再读[快速入门](references/quick-start.md)与[声明/参数全表](references/manifest.md)。[协议速查](references/protocol.md)是总目录。
- 资源页或详情：读[媒体模型](references/media.md)与[资源库/缓存](references/resources.md)；使用 [catalog.js](assets/catalog.js) 对接结构化服务，[library.js](assets/library.js) 演示分集和版本。
- 网络、存储、错误和性能：读[宿主 API](references/runtime.md)，注意 HTTP 与 TMDB 的返回包装不同、每次调用新建上下文。
- 播放、字幕或弹幕：读[播放服务](references/playback.md)，配套 [subtitles.js](assets/subtitles.js) 和 [danmaku.js](assets/danmaku.js)。
- 测试与故障定位：读[测试手册](references/testing.md)，运行对应示例并按真实接口编写断言。
- 加密和发布文件：读[集合/更新/分发](references/distribution.md)及[加密规范](references/encryption.md)。
- 宿主架构问题：读[架构与边界](references/architecture.md)，再核对实现；扩展协议时同步实现、文档与示例，不能仅通过文档宣称已支持。

## 组织与数据约定

1. 稳定模块 ID 标识安装单位，更新保持 ID 并递增版本。栏目 ID 标识功能入口；共享一个 functionName 的栏目仍分别保存参数、筛选与缓存。
2. 简单资源库由 modules 中的列表和顶层 search 组成；复杂首页可声明 library.homeFunction / browseFunction / sources。模块只返回结构数据，不自建网页导航、设置或播放器。
3. 媒体库接入由模块允许、用户单独开启；无明确 TMDB ID 和 movie/tv 类型的资源始终留在模块页面，不通过标题猜测合并。
4. 自有作品用 type:url、稳定 id 和不透明 link。`loadDetail(link)` 接收字符串；普通列表、搜索、资源等函数接收参数对象。详情补充字段不能破坏作品原有身份。
5. 剧集放 episodeItems，每集的版本放 childItems；电影版本也放 childItems。下一集和切版本使用被选条目自己的 link，不能复用整部剧的路由或丢弃多版本。
6. 播放返回资源数组，与媒体卡片分开；一次性地址在播放时解析。参数声明、请求头和选择的版本应贯穿完整链路。
7. globalParams、栏目 params、search.params 分作用域。constant 和 userId 由宿主确定；belongTo 控制条件设置；凭据声明 secret:true，由宿主保存。
8. 每次调用新建 JSContext。跨调用状态使用 Prism.storage；显式协作数据可用 Prism.sharedCache。共享缓存无自动 TTL，不保存账号凭据；不要依赖全局变量常驻。

## 开发与验证

根据用户的数据源和真实返回结构实现；未知接口先查看模块自身代码、服务样例或接口说明，不要求提供宿主源码，不编造字段和地址。业务函数顶部不要发网络请求，安装阶段只读取元数据。

先用离线固定响应测试真实的解析与路由，再验证宿主行为：列表/搜索 → 详情 → 分集/版本 → 播放资源。覆盖空页、分页、错误响应、取消与身份保留中实际相关的情况。测试只服务于当前模块，不强制接入无关字幕或弹幕能力。

```sh
node <skill目录>/scripts/prism-module.mjs check source.js
node <skill目录>/scripts/test-example.mjs <skill目录>/assets/library.js
node <skill目录>/scripts/test-module-examples.mjs
```

示例测试是可复用起点，不是任意模块的通用通过证明。按实际数据源修改断言；用一个错误的栏目常量或版本路由临时副本验证断言能失败，丢弃副本。

第三方用已编译的 Prism 客户端导入验收；离线通过不等于实际播放通过。只有宿主维护者另行持有主工程时，才运行工程内的 `tools/test-prism-modules.py SIMULATOR_UUID` 和 `node tools/test-module-encryption.mjs`；它们不是模块作者的前置条件。默认仅本地和模拟器验证；加密打包不代表真机测试、发布或发送授权。

## 集合与加密交付

使用 SDK 的公共打包密钥，不要求模块作者创建或取得宿主私钥。提供的 [公钥](assets/prism-public-key.json) 与支持该 keyId 的 Prism 构建配套；轮换时使用宿主最新公开密钥。

```sh
node <skill目录>/scripts/prism-module.mjs pack source.js <skill目录>/assets/prism-public-key.json dist/library.prism
node <skill目录>/scripts/prism-module.mjs index "模块集合" dist/modules.prs dist/library.prism
```

打包器只对自己开发、信任的源码执行。工具会读取元数据、校验入口、加密并生成集合摘要；不上传源码。集合中的相对 URL 按输出目录计算；部署时保留相对目录，或填写已授权的绝对 HTTPS 地址。更新重新生成加密文件与集合摘要，并保留模块身份。

加密保护分发源码和完整性，不证明作者身份，不承诺客户端无法逆向。交付只包含用户要求的源码或密文、`.prs`、必要公开资源与说明；不包含私钥、账号凭据或宿主源码。用户仅要求制作模块时，不自动上传或发布。
