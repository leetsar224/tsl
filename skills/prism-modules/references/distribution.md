# 集合、安装、更新与分发

开发源码为 `.js`，加密模块为 `.prism`，集合为 `.prs`。集合只列出可安装文件，不打包执行环境，也不递归包含其他集合。加密的算法、封装和宿主密钥管理见[加密规范](encryption.md)。

## 集合字段

```json
{
  "format": "prism.collection",
  "version": 1,
  "title": "我的模块集合",
  "description": "这个集合提供的内容",
  "modules": [
    {
      "id": "yourname.catalog",
      "title": "我的资源库",
      "description": "独立资源、搜索和分集",
      "version": "1.0.0",
      "url": "./catalog.prism"
    }
  ]
}
```

这是结构示意，正式文件使用打包工具生成 SHA-256 后再完善显示信息。

| 字段 | 类型 | 要求 |
| --- | --- | --- |
| format | string | 必须为 prism.collection |
| version | integer | 必须为 1；它是集合格式版本，不是模块版本 |
| title / description | string | 可选集合说明 |
| icon | string | 可选数据；当前集合选择界面不承诺展示图标 |
| modules | Entry[] | 1–500 项，ID 不重复 |
| Entry.id | string | 必需，必须等于所下载模块的真实 ID |
| Entry.title | string | 必需，集合选择页显示的名称 |
| Entry.url | string | 必需，HTTP(S) 绝对地址或相对集合 URL 的地址 |
| Entry.version | string | 可选；填写时必须等于模块真实版本 |
| Entry.sha256 | string | 可选，64 位十六进制；正式分发推荐保留工具生成值 |
| Entry.description | string | 可选，集合选择页说明 |
| Entry.icon | string | 可选数据；当前集合选择界面不承诺展示图标 |

从 URL 安装时，相对路径以实际下载来源解析；直接粘贴集合内容时，没有来源基地址，使用绝对 HTTP(S) URL。不要把本机文件路径、file://、data: 或带密码的 URL 放进集合。条目必须是模块，不能再指向集合。

## 打包器

Node.js 18+，不依赖 npm 包。所有路径相对于当前工作目录，路径含空格时用 shell 引号。

```sh
node <skill目录>/scripts/prism-module.mjs check source.js
node <skill目录>/scripts/prism-module.mjs pack source.js <skill目录>/assets/prism-public-key.json dist/catalog.prism
node <skill目录>/scripts/prism-module.mjs index "我的集合" dist/modules.prs dist/catalog.prism
```

check 读取元数据、验证基础字段、重复 ID/参数、TTL 和已声明函数；它不执行业务入口，不证明服务、UI 或媒体格式正常。Node VM 限时执行不是安全沙箱，只对自己开发、信任的源码运行。

pack 校验源码后生成认证加密封装，每次使用新临时密钥和 nonce；相同源码重新打包，文件及 SHA-256 也会不同。默认 loadDetail 与可选字幕回调不在声明函数列表中，仍应通过离线调用测试。

index 可同时读取 `.js` 和 `.prism`，按输出集合所在目录计算相对 URL并编码文件名，自动记录 ID、版本、完整文件字节 SHA-256；超过 500 项或重复 ID 会失败。它不复制资源文件，上传时保持目录关系。加密文件只公开必要身份，工具用模块 ID 作为默认展示标题；可修改集合 title/description/icon，但不要更改模块身份、版本或文件摘要。

CLI 出错返回非零退出码；check 不修改源码，pack/index 会覆盖指定输出文件。不要将源码路径当加密输出路径。宿主私钥初始化仅由宿主维护者进行，模块作者使用公共密钥即可。

## 安装校验顺序

```text
下载或读取输入
 → 判断集合 / 模块
 → 若为集合，选择条目并下载
 → 校验完整文件 SHA-256（声明时）
 → 若为密文，认证解密
 → 读取 PrismMetadata
 → 验证协议、ID、版本、能力与地址
 → 原生确认页
 → 保存模块记录
```

源码最多 2 MiB，下载输入/密文封装最多 3,000,000 字节，UTF-8 编码；模块下载超时 20 秒并要求 HTTP 200。加密模块安装后保存原密文，运行时临时解密；声明信息可以在设置里查看，并非保密字段。

SHA-256 校验的是分发文件的完整字节，包括换行。不要在生成集合后再次格式化加密 JSON、转换行尾或让 CDN 改写正文；有改动就重新生成索引。公钥可公开，认证加密与摘要都不等于作者身份认证或可信度背书。

## 更新规则与操作顺序

1. 修改业务代码，保持模块 id 不变，递增 version；更新 changelog。
2. 运行声明检查和与变化相关的业务断言。
3. 重新生成 `.prism` 及 `.prs` 摘要。
4. 先使新模块文件可下载，再发布引用它的集合，避免集合指向尚不存在的文件。
5. 在模块设置的“检查更新”中读取、核对并安装。

优先检查 metadata.updateUrl，否则检查原安装集合/模块 URL。集合里原 ID 被删除、文件摘要不符、条目版本不符、脚本 ID 改变、密钥未知或版本不递增都会拒绝更新，旧版保留。当前没有集合订阅自动更新所有模块的后台服务，也没有同版本覆盖或降级安装。

更新保留启停状态与仍适用的用户配置，不会自行开启媒体库接入。删除凭据声明会清除对应 Keychain 项；重命名参数或栏目 ID 等于更换配置作用域。Prism.storage 不自动迁移，作者应使用版本化状态并提供合理缺省值。

## 发布前核对

只交付预定的模块文件、集合及公开资源。不要附带宿主工程、私钥、账号配置、测试录制数据或含令牌的日志。私钥不属于第三方开发 SDK。

确认托管地址直接返回文件、MIME 不导致网页包装、相对路径和大小写正确；检查集合 ID/版本/摘要与产物一致。源码包和密文包可以有不同分发地址，但同一个安装模块仍使用同一个 ID，不能让更新地址长期指向旧版本。
