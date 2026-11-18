# 本地测试、宿主验证与排错

开发模块至少验证两件事：向数据源发送了正确请求，以及把响应转换成了正确的 Prism 数据。只检查“返回了一个数组”无法发现错季、错集或错误分类。

## 使用现成测试

```sh
node <skill目录>/scripts/prism-module.mjs check <skill目录>/assets/catalog.js
node <skill目录>/scripts/test-example.mjs
node <skill目录>/scripts/test-module-examples.mjs
```

library 的测试覆盖列表、独立详情、分集、多版本与播放路由。新增示例测试覆盖 sourceId、凭据头、分类/人物筛选、分页、URL 编码、字幕季集选择以及弹幕身份和分段时间。所有请求使用离线响应，不连接账号或真实服务。

测试文件可指定例子目录：

```sh
node <skill目录>/scripts/test-module-examples.mjs /path/to/copied/examples
```

脚本同时修改三个临时内存副本，分别让分类、字幕选择、弹幕 ID 出错，确认失败来自断言。副本不写回源码。它证明这些关键断言能捕捉错误，不证明所有业务情况已经覆盖。

## 给自己的模块写断言

独立 SDK 可执行普通栏目 ID、`@search`、`@detail`、`@home`、`@browse` 和 `@subtitleArchive`。动态选项用 `@options:参数名` 或 `@options:栏目ID:参数名` 测试。优先用真实响应脱敏后的固定数据重放请求。

```sh
node <skill目录>/scripts/prism-module.mjs run <skill目录>/assets/library.js series --params '{"page":1}'
node <skill目录>/scripts/prism-module.mjs run my-module.js movies --params '{"page":2}' --fixtures fixtures.json
```

`fixtures.json` 是数组。HTTP 项写 `{"method":"request","match":{"url":"https://api.example.test/items","params":{"page":2}},"response":{"statusCode":200,"data":{"items":[]}}}`。TMDB 项使用 `"method":"tmdb"`，在 `match.api` 指定路径，`response` 直接写正文。执行报告包括参数、结果、字段问题、请求及日志，会遮盖凭据和 URL 查询参数。未匹配请求或字段错误以非零退出，固定响应不会访问网络。客户端诊断可进一步执行实时请求和检查原生卡片。

下面是一个有明确契约的离线测试骨架；apiBase 是示例地址，URL 与返回字段需换成自己模块实际使用的接口。

```js
import vm from "node:vm";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const calls = [];
const context = vm.createContext({Prism:{http:{get(url, options) {
  calls.push({url,options});
  return {status:200,data:{items:[{id:"show-7",name:"剧集",kind:"tv"}]}};
}}}});
vm.runInContext(readFileSync("source.js","utf8"), context, {timeout:1000});
const result = await context.list({apiBase:"https://fixture.invalid",sourceId:"main",kind:"tv",page:2});
assert.equal(calls[0].options.params.kind,"tv");
assert.equal(calls[0].options.params.page,2);
assert.equal(result[0].mediaType,"tv");
assert.equal(result[0].id,"show-7");
assert.equal(result[0].tmdbId,undefined);
```

这个 mock 只支持所测试的 HTTP 路径，不能替代完整宿主。实际测试应拒绝未预期 URL，或者返回结构正确但内容错误的数据，再用请求 ID 和结果断言识别错误。TMDB mock 直接返回正文，HTTP mock 返回 `{data,...}`，不要把两者混为一谈。

普通列表/详情/字幕跨调用测试应重新创建 VM，共享的只有模拟 Prism.storage。弹幕分片另需覆盖同会话复用和会话失效后重建，确认首次初始化、跳转与失败重试。只针对自己可信的源码执行 Node VM；不要把它用于未知模块的恶意代码隔离。

## 按能力选择测试

| 能力 | 至少覆盖 | 常见有效反例 |
| --- | --- | --- |
| 列表 | 请求分类、页码、稳定 ID、合法字段 | 服务始终返回第一页但数组结构有效 |
| 搜索 | keyword、分页声明、空结果 | 搜索参数未传导致返回热门列表 |
| 自有详情 | 原 link、缺失路由、补充字段 | 把 id 当 link 或把对象当字符串 |
| 多源 | sourceId 进入请求，账号请求头正确 | 切换线路仍请求默认线路 |
| 分集/版本 | 第二集、第二版本的真实路由 | 每次都返回第一集第一版本 |
| 字幕 | 原剧名、季集、包内相对路径 | 首项为合法但错误集数的字幕 |
| 弹幕 | animeId → episodeId → commentId | 用作品 ID 请求评论也返回合法列表 |
| 错误处理 | 401、空页、格式变化分开 | 把所有失败 catch 后返回 [] |
| 集合/加密 | ID/版本/摘要、密钥支持、保留密文 | 更新集合后没有替换对应包 |

修改一个常量、字段名或路由临时副本后重新运行；若仍通过，补针对性断言。不要将接口返回值和期望值由同一段映射代码生成，否则测试会复制错误。

## 客户端验收：不需要源码

使用支持当前协议的 Prism 客户端导入自己的源码、加密文件网址或集合网址，然后验证：

1. 模块声明、Logo、参数表单和启停正常。
2. 列表、搜索、分类、目录与数据源切换正确。
3. 独立详情、第二集及第二文件版本使用正确的路由。
4. 实际播放、字幕、弹幕和更新保留设置符合预期。
5. 清缓存、断网后旧内容展示和无效凭据的错误提示正常。

Node 离线断言只能验证脚本与数据契约，不能模拟原生 UI、Keychain、播放器或网络桥接的全部行为。客户端是验收环境，主项目源码不是开发依赖。若尚未获得适配协议 v1 的客户端，可以先完成离线开发和打包，但不能据此宣称已通过实际播放验收。

可以使用已编译的模拟器应用测试；开发者无需自行编译宿主。真实接口应使用自己的授权测试配置，记录响应形态而非敏感数据。

## 宿主维护者的附加回归

下面命令只供持有宿主源码的维护者使用，不包含在第三方 SDK，也不是模块开发的必需步骤：

```sh
python3 tools/test-prism-modules.py SIMULATOR_UUID
node tools/test-module-encryption.mjs
```

第一条构建隔离的模拟器验证应用，测试安装、数据适配、缓存、字幕、弹幕与加密更新；不使用生产账号。第二条检查 Node 加密与 CryptoKit 解密互通、篡改拒绝及打包摘要。它们验证平台，不会自动覆盖第三方自己的全部业务逻辑。

## 症状 → 检查点

| 现象/错误 | 优先检查 |
| --- | --- |
| 无法读取声明 | 是否为 JS 原文；schemaVersion 是否为 1；顶层是否调用 Prism 或缺失全局声明 |
| 检查声明通过，运行缺入口 | functionName 拼写、全局作用域；默认详情和可选回调也要单独测试 |
| 同名函数包含多个栏目 | 栏目 ID 是否独立；自定义首页/目录函数是否与多个 Feature 重名 |
| 模块不出现在资源库 | 是否只有服务能力；是否启用；是否真的声明列表、搜索或 homeFunction |
| 无 TMDB 的条目没进全局媒体库 | 这是既定隔离规则；去模块页面查找，不按名称补 ID |
| 有 TMDB 仍未聚合 | movie/tv、正整数 ID、模块许可、用户接入开关、模块启用状态 |
| 只有第一页 | 是否在对应 Feature/Search 声明 page/offset；接口是否实际使用该值 |
| 翻页后内容重复 | 服务是否忽略页码；是否给不同作品复用相同 ID |
| 分类或演员不能跳转 | 是否有 id；featureId 是否绑定实际入口；是否处理 genreId/peopleId |
| 详情参数是 undefined | 默认 loadDetail 只收字符串；需要参数对象时声明 detailFunction |
| 海报错误/缓慢 | 是否把非 TMDB 相对路径当图片路径；列表是否额外请求每条详情 |
| 设置项不显示 | constant/page/offset/userId 被隐藏；belongTo 条件；搜索关键词由搜索框提供 |
| 配置修改没生效 | 是否重名被入口默认值覆盖；业务代码是否硬编码；是否误用自己的长期缓存 |
| HTTP 401/403 | 当前参数、凭据和头；不要把凭据写进源码或打印出来 |
| HTTP 3xx 被当错误 | 默认会跟随；若要读原跳转，allow_redirects:false |
| 模块异步结果超时 | Promise 是否完成；是否使用不存在的定时器/浏览器 API |
| 下一集或切版本错误 | 是否将该集/文件 link 传给解析接口；是否返回真实季集 |
| 字幕选错 | JSON.parse、真实包内 path、季集与语言优先级；null 会自动回退 |
| 弹幕错季/错集 | 原始服务 ID 是否贯穿三阶段，不能只按候选 title 重猜 |
| `.prs` 无法安装 | format/version/modules、重复 ID、相对 URL 基址、模块 ID/版本一致性 |
| 模块摘要不一致 | 打包后是否改换行/格式化、CDN 是否改写、索引是否过旧 |
| 不包含解密密钥 | 当前宿主未包含该 keyId；使用匹配公钥或更新宿主，不能交付私钥给用户 |
| 完整性校验失败 | 密文/nonce/tag/认证字段被改动或文件损坏；重新下载并核对摘要 |
| 更新提示已是最新 | 新版本未递增或 updateUrl 仍指向旧包；不支持同版本覆盖和降级 |

## 当前不能依赖的能力

不提供任意网页执行、DOM/浏览器会话、脚本自带 UI、系统命令、文件系统、原生插件二进制、后台常驻任务、强制中断纯 JS 死循环、发布者身份认证或自动聚合非 TMDB 内容。`sectionMode` 不改变执行策略，`count` 字幕字段不触发包内批量选择。

已解析但没有专用展示行为的字段不应被宣传为完整 UI 能力。扩展平台时应同步宿主、文档、示例和断言；仅增加 JSON 字段或文档段落不构成实现。

模块设置中的“运行诊断与调试”可直接运行声明入口并查看脱敏日志、参数字段、耗时与返回概要。诊断只保存在内存，不输出返回正文；网络错误应结合模块服务状态判断。新入口需同时通过原生导入的函数存在性验证和 SDK check。
