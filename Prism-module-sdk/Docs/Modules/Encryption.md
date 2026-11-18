# Prism 模块加密与交付 v1

开发者使用公共打包密钥生成 `.prism` 文件，应用在验证后于内存中解密执行。`.prs` 只保存模块地址、身份、版本和可选 SHA-256，不存源码或私钥。普通用户不配置密钥，也不需要外部签名服务。

## 算法与封装

采用 X25519 密钥协商、HKDF-SHA256 派生与 AES-256-GCM 认证加密。算法由 [Apple CryptoKit](https://developer.apple.com/documentation/cryptokit) 和 [Node.js crypto](https://nodejs.org/api/crypto.html) 实现；Prism 只定义封装和生命周期，不发明密码算法。

每个包使用新的临时 X25519 密钥对和随机 12 字节 nonce。输出 UTF-8 JSON：

| 字段 | 约定 |
| --- | --- |
| format | prism.encrypted-module |
| version | 1，封装版本 |
| algorithm | X25519-HKDF-SHA256-A256GCM |
| keyId | 宿主原始公钥 SHA-256 的前 16 位小写十六进制 |
| moduleId / moduleVersion | 绑定的模块身份和版本，与解密后声明一致 |
| ephemeralKey | 32 字节临时公钥，标准 Base64 |
| nonce | 12 字节随机值，标准 Base64 |
| ciphertext | JS 源码的密文，标准 Base64 |
| tag | 16 字节 GCM 认证标签，标准 Base64 |

AAD 精确定义为以下字段依序使用单个 LF 连接，无末尾换行：format、version 的十进制文本、algorithm、keyId、moduleId、moduleVersion、ephemeralKey。

HKDF 的输入为 X25519 共享秘密，salt 为 nonce 原始字节，info 为 UTF-8 `prism.module.encryption.v1` 紧接 AAD，输出 32 字节 AES 密钥。GCM 也以同一 AAD 认证。源码保持原始 UTF-8 字节，不压缩、不改写；源码最多 2 MiB，封装最多 3,000,000 字节。

未知协议/算法/密钥 ID、错误长度、身份不符、损坏标签或密文均失败关闭，不回退成明文执行。原文件以密文保存于模块记录，缓存身份使用分发文件摘要。只有本次读取声明与运行 JSContext 时才生成明文字符串。

## 开发者使用

公共密钥为 [prism-public-key.json](prism-public-key.json)，可随 SDK 与开发 skill 分发，不包含私钥。使用 Node.js 18 或更新版本：

```sh
node tools/prism-module.mjs check source.js
node tools/prism-module.mjs pack source.js Docs/Modules/prism-public-key.json module.prism
node tools/prism-module.mjs index "模块集合" modules.prs module.prism
```

工具本地运行，不上传源码。校验会在无宿主 API 的限时 JS 环境读取声明，因此只对自己开发、信任的源码运行此工具。它不以 Node VM 代替安全沙箱。

## 宿主密钥管理

宿主维护者创建密钥；模块作者不创建宿主私钥，也不执行此步骤。私钥默认放在项目外 `~/.config/prism-modules/keyring.json`，目录 0700、文件 0600。首次配置：

```sh
node tools/prism-module.mjs init-keys /private/location/keyring.json public-key.json
```

已有文件不会被覆盖。Xcode 构建前的 prepare-module-keys.py 从默认位置或 PRISM_MODULE_KEYRING 指定位置读取私钥，在 DerivedData 生成 PrismModuleKeys.swift 供编译；私钥及生成文件均不得进入源码、文档、日志或公开 SDK。正式 Release 缺少密钥时构建失败；无密钥的 Debug 仍可开发明文模块，但不能运行加密模块。

轮换时生成新的密钥对，将新条目加入外部 keyring，并保留旧条目供已安装模块解密；公开打包密钥切换到新条目。先发布包含新密钥的宿主，再用新公钥分发模块。删除旧密钥将使旧包无法运行，须在完成迁移后明确执行。停用或卸载模块不需要更换密钥；宿主更新只接受更高版本，不提供降级安装。

## 保护能力

加密避免直接读取分发文件，GCM 校验检测被修改的封装与内容。任何获得公开打包密钥的人都能制作有效包，所以认证加密和 SHA-256 **不证明作者身份，也不证明模块可信**；安装确认页仍展示来源与声明。

解密能力存在于客户端，具备逆向或进程调试能力的人仍可能提取密钥或运行时源码。它不是 DRM，也不能保护写入模块的服务凭据。凭据应由用户填写并由宿主安全存储。

验证覆盖 Node.js 加密与 CryptoKit 解密、不同包的随机性、协议字段/身份/临时公钥/nonce/密文/tag 篡改、缺失密钥、安装后保留密文及集合摘要匹配。
