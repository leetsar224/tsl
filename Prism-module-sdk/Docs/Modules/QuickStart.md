# 从零开发第一个 Prism 模块

本手册对应 Prism 模块协议 v1，最低宿主版本示例为 0.1.0。第三方开发者不需要 Prism 主项目源码、Xcode 工程或宿主私钥。使用独立开发包即可编写、检查和打包模块；最终页面与播放验收使用支持协议 v1 的 Prism 客户端。无需创建插件工程或打包原生二进制。Node.js 18+ 用于本地检查和加密；应用内执行环境是 JavaScriptCore，不能直接使用 Node API。

## 选择模板

| 需要实现 | 模板 | 应先改什么 |
| --- | --- | --- |
| 熟悉列表、搜索、独立电影/剧集、分集和版本 | [library.js](../../Examples/Modules/library.js) | 模块 ID、媒体目录及自己的数据 |
| 对接自己的 JSON 服务，分区、目录、线路、动态起播 | [catalog.js](../../Examples/Modules/catalog.js) | API 请求与返回映射，保持宿主字段不变 |
| 搜索字幕、从 ZIP 中选择分集字幕 | [subtitles.js](../../Examples/Modules/subtitles.js) | 搜索接口与包内文件命名规则 |
| 作品匹配、弹幕分集和按分钟加载 | [danmaku.js](../../Examples/Modules/danmaku.js) | 三阶段服务接口与原始 ID 映射 |

后三个模板的 API 是明确写出的教学契约，没有现成线上服务。先跑离线测试，再替换成自己的接口。不要把示例地址当作可用资源服务。

## 最小可安装源码

以下文件不访问网络，能显示一张独立资源卡及补充详情：

```js
PrismMetadata = {
  schemaVersion: 1, id: "yourname.demo", title: "我的第一个模块", version: "1.0.0",
  requiredVersion: "0.1.0", description: "离线开发演示", author: "你的署名",
  library: {allowIntegration: false},
  modules: [{id: "movies", title: "电影", functionName: "movies", params: []}]
};
function movies() {
  return [{id: "one", type: "url", mediaType: "movie", title: "演示电影", link: "item:one"}];
}
function loadDetail(link) {
  return link === "item:one" ? {description: "这是模块自己的详情。"} : null;
}
```

保存为 `source.js`。它没有播放资源，因此不能用它验证播放成功；加入自己的播放入口时阅读[媒体与详情](Media.md)和[播放服务](Playback.md)。

## 本地检查与测试

下面的相对路径以独立开发包的解压根目录为工作目录。开发包保留 Docs/Modules、Examples/Modules 和 tools 三个公开目录，不需要主工程。独立使用开发 skill 时，打包器位于 skill 的 scripts 目录，示例位于 assets 目录。

```sh
node tools/prism-module.mjs check source.js
node tools/test-prism-example.mjs
node tools/test-module-examples.mjs
```

第一条只验证声明和已声明函数是否存在，不会替你验证服务可用性。后两条验证配套示例；自己修改模块时应同步修改自己的断言。检查失败会返回非零退出码。

对接服务时先实现最短链路：列表 → 详情 → 一条播放资源。确认身份和路由正确后再加入分页、分集、版本、字幕或弹幕。某项能力不需要就不声明，避免制造空入口。

## 在应用中安装

1. 打开“模块管理”，点击“添加模块”。
2. 选择“从文件导入”读取本地 `.js` / `.prism`；本地 `.prs` 集合及相邻模块使用“从集合目录导入”。也可粘贴完整源码，或填写 `.js` / `.prism` / `.prs` 的 HTTP(S) 地址。
3. 读取声明；如果是集合，先选择其中一个模块。
4. 核对 ID、版本和声明，再确认安装。
5. 进入该模块的设置，填写 API 地址、凭据和默认栏目。
6. 打开资源库中的模块页面，验证列表、搜索、详情和播放。

文件选择后会显示读取状态，并在当前导航中进入模块信息页，点击“安装此版本”完成。集合目录需只含一个 `.prs` / `.rex` 集合，其模块文件保留在同一目录内。本文不假定支持自定义安装 URL Scheme。直接粘贴源码时，Logo、网站和更新地址使用绝对 HTTP(S) 地址。

“允许接入媒体库”与“已经接入”是两回事。新安装默认不接入；模块允许且用户开启后，只有明确 TMDB 身份的内容才参与聚合。

## 制作可分发文件

```sh
node tools/prism-module.mjs pack source.js Docs/Modules/prism-public-key.json dist/library.prism
node tools/prism-module.mjs index "我的模块集合" dist/modules.prs dist/library.prism
```

上传时保持相对目录关系；文件应返回原始内容，不能返回仓库网页或登录页面。集合里的展示标题、说明和图标可手工完善；从加密文件生成集合时，工具默认以模块 ID 作展示标题。不要改动 id/version/sha256 来伪装别的包。

制作文件不会自动发布，也不会向任何服务器上传源码。详见[集合与发布](Distribution.md)。

## 第一次交付应能回答

- 模块是列表、播放服务、字幕还是弹幕？哪些入口会出现在资源库？
- 作品、栏目、分集和文件版本各用哪个稳定 ID？下一步收到的 link 是什么？
- 用户在哪填写配置？哪些是凭据？更换账号后哪些数据失效？
- 空结果和请求失败是否区分？是否能恢复旧缓存？
- 哪个地址负责更新？新版本是否保留原 ID？

具体排错路径和可复制的离线测试见[测试与排错](Testing.md)。
