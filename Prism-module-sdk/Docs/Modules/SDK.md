# Prism 独立模块开发包

第三方开发者可以不持有 Prism 主项目源码。编写模块、离线测试、加密和生成集合只需要本开发包、文本编辑器与 Node.js 18+。可运行的 Prism 客户端用于最终界面和播放验收；它不要求向开发者开放宿主实现。

## 包含的公开文件

```text
Prism-module-sdk/
  README.md                         本说明
  Docs/Modules/                     完整开发手册和公共打包密钥
  Examples/Modules/                 五份模块源码模板
  types/prism.d.ts                  元数据、媒体和宿主 API 类型声明
  tools/prism-module.mjs            项目生成、迁移、声明检查、加密与集合工具
  tools/prism-contract.mjs          声明字段与版本校验
  tools/prism-run.mjs               按入口运行、固定响应回放与结果诊断
  tools/prism-dev.mjs               仅本机访问的模块开发服务
  tools/test-prism-example.mjs      媒体/分集/版本示例断言
  tools/test-module-examples.mjs    数据源/字幕/弹幕示例断言
  tools/test-module-sdk.mjs         项目生成、迁移与本地服务回归
  skills/prism-modules/             可选 AI 开发 skill，带独立参考和工具
  SDK-MANIFEST.json                 文件清单与 SHA-256
```

不需要 npm install、Swift 编译器或 Xcode。文档中讲解宿主维护者回归和密钥管理的部分用于说明平台边界，不是第三方作者的安装步骤；相应内部脚本不在 SDK 内。

## 解压后直接运行

在本开发包根目录执行：

```sh
node tools/prism-module.mjs check Examples/Modules/catalog.js
node tools/prism-module.mjs run Examples/Modules/library.js series --params '{"page":1}'
node tools/test-prism-example.mjs
node tools/test-module-examples.mjs
node tools/test-module-sdk.mjs
node tools/prism-module.mjs pack Examples/Modules/catalog.js Docs/Modules/prism-public-key.json dist/catalog.prism
node tools/prism-module.mjs index "开发示例" dist/modules.prs dist/catalog.prism
```

复制示例到自己的工作目录，修改模块 ID 和数据源逻辑，再为自己的业务编写断言。加密工具只使用公开密钥；开发者不生成、不接收宿主私钥。真实服务接口与用户自己的测试凭据由模块开发者提供。

`check` 和 `pack` 默认校验 SDK 对应客户端版本，指定其他版本时添加 `--target 版本`。打包时使用同样的字段和入口校验。

入门见[快速入门](QuickStart.md)，完整索引见[开发手册](README.md)。详细测试边界见[测试与排错](Testing.md)。

## 可以独立完成与必须用客户端验收的部分

| 工作 | 所需环境 |
| --- | --- |
| 阅读协议、编写 JS、配置元数据与参数 | SDK + 编辑器 |
| 声明检查、离线模拟请求和断言 | SDK + Node.js |
| 生成 .prism 和 .prs | SDK + Node.js + 包内公钥 |
| 对接真实服务、验证请求与响应 | 自己的授权接口/测试配置 |
| 原生 UI、平台缓存、字幕渲染、实际起播 | 支持协议 v1 和对应 keyId 的 Prism 客户端 |
| 修改宿主功能或运行宿主内部回归 | 仅维护者需要主工程，不属于模块开发 |

Node 测试不是完整 Prism 模拟器，不能证明视频内核、系统权限或原生交互正确。客户端暂时不可用时，仍可完成开发与打包，但应把客户端验收标为未完成。

## AI skill 的使用

可将开发包中的 skills/prism-modules 安装到所用 AI 工具的技能目录。该目录自带文档、示例、打包公钥和工具，不需要关联主项目。开发者也可以完全手写模块，skill 不是运行依赖。

## 公开交付范围

开发包按固定文件清单生成，只有协议文档、第三方示例、Node 工具、公钥和 skill。不存在宿主 Swift 源码、工程文件、安装包、内部测试、账号配置或宿主私钥。发布新的开发包时，使用与目标客户端匹配的协议和公钥，并重新核对文件清单。

## 新建项目与本地调试

```sh
node tools/prism-module.mjs create my-module yourname.catalog
cd my-module
npm run check
npm run dev
```

项目包含 module.js、类型声明、编辑器检查配置和独立工具。开发服务默认监听 127.0.0.1:8787，只允许读取目录内的 .js/.prs/.rex/.prism，拒绝目录逃逸与其他文件类型；不代理 API 或处理浏览器跨域。将模块网址导入模拟器，编辑后服务直接返回新内容并打印变更；递增模块 version 后在客户端检查更新。它不自动覆盖已安装模块。可用 `serve directory 端口` 更改端口。

TypeScript 类型用于编辑器提示；运行时仍接收普通 JavaScript，TS 编译由作者自己的构建流程完成。
