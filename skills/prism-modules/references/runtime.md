# 宿主 API、生命周期与存储

本页描述当前 Prism 实现，不假定浏览器、Node 或其他客户端的 API 存在。JavaScript 可以同步返回结果，也可以返回最终可完成的 Promise；数据和参数必须可转换为 JSON。

## 执行生命周期

```text
读取模块声明（无 Prism API）
  → 校验并安装
  → 用户操作触发任务
  → 新建 JSContext，注入 API，执行源码
  → 调用指定函数，接收结果
  → 转换为原生模型并释放上下文
```

同一模块的调用串行执行；普通内容执行队列最多并行运行 3 个任务。不要把顶层变量当持久状态。HTTP 桥接在该任务内等待请求完成，`async`/`Promise.all` 不代表获得无限网络并发。没有定时器、后台常驻循环或宿主事件订阅契约。

普通网络调用最多 20 秒，单运行实例网络预算约 45 秒；取消会终止当前请求。函数返回后，宿主对尚未完成的 Promise 最多额外等待约 2 秒。这个等待不是网络总时限；纯 JS 死循环目前无法强制抢占。不要创建永不完成的 Promise，也不要用 setTimeout 做轮询。

## HTTP API

```js
const response = await Prism.http.get("https://your-service.example/items", {
  params: {page: 1, query: "中文 关键词"},
  headers: {Accept: "application/json"},
  timeout: 10,
  allow_redirects: true
});
```

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| Prism.http.get(url, options?) | HTTP(S) 地址与配置 | HTTPResponse |
| Prism.http.post(url, data, options?) | data 为字符串或 JSON 值 | HTTPResponse |
| Prism.http.request(options) | 包含 url、method、data 等字段 | HTTPResponse |

| options 字段 | 类型 | 行为 |
| --- | --- | --- |
| url | string | request 必填；get/post 的第一个参数覆盖它 |
| method | string | request 默认 GET；get/post 固定对应方法 |
| params | object | 转为查询字符串；同名参数替换 URL 原参数；值建议为标量 |
| headers | object<string,string> | 请求头；不要把值写成数字或嵌套对象 |
| data | string/JSON | 字符串按 UTF-8 原样发送；对象编码 JSON，并在未提供时补 application/json |
| timeout | number | 推荐以秒为单位，限 1–20 秒；大于 300 的值会按毫秒转换，再限制范围 |
| allow_redirects | boolean | 默认 true；false 返回原始 3xx，不访问下一跳 |
| zlibMode | boolean | 默认 false；true 显式解压响应后再解析 JSON，适用于服务确实返回压缩体的情况 |

URL 必须为 HTTP(S)，有 host，不能带 username/password。没有请求域名白名单或浏览器 CORS 机制；HTTP URL 可用不代表应传输明文凭据。会话由宿主管理，不承诺脚本可独立管理 Cookie 仓库。

```js
// JSON 请求
const created = await Prism.http.post(base + "/query", {id: "42"});
// 自己编码表单；宿主不会把对象自动编码为表单
const body = "name=" + encodeURIComponent(name);
const form = await Prism.http.post(base + "/form", body, {
  headers: {"Content-Type":"application/x-www-form-urlencoded"}
});
```

### HTTPResponse 与错误

| 字段 | 类型 | 意义 |
| --- | --- | --- |
| data | JSON 值或 string | 可解析 JSON 则为解析结果，否则为正文字符串 |
| body | string | UTF-8 正文；不能当二进制下载缓冲区 |
| status / statusCode | number | HTTP 状态码，两者同义 |
| headers | object<string,string> | 响应头；键的大小写由服务器/系统返回，查找时不区分大小写 |
| toString() | function | 返回 body |

2xx 视为成功；当 allow_redirects:false 时 3xx 也返回成功响应。其他状态抛出 Error，其 `response` 属性包含上表的数据字段；网络错误/取消/解压失败也抛错，但不保证有 response。

```js
try {
  const result = await Prism.http.get(base + "/items");
  if (!Array.isArray(result.data.items)) throw Error("数据源返回了无效列表");
  return result.data.items;
} catch (error) {
  if (error.response && error.response.status === 401) {
    throw Error("凭据失效，请在模块设置中更新令牌");
  }
  throw error; // 不要把请求失败改成 []，否则宿主会以为列表确实为空
}
```

响应接收后检查 16 MiB 上限，显式解压后的数据也限制 16 MiB；不是流式下载 API。不要用它拉完整视频或大文件。一次请求失败后仍有可能留下诊断状态；如自行返回旧数据，应保证返回的是有效非空内容，不依赖“捕获异常就必定抹去诊断”的假设。

## TMDB API

```js
const body = await Prism.tmdb.get("movie/popular", {
  params: {page: 1, language: "zh-CN"}
});
return body.results.map(row => ({
  id: row.id, type: "tmdb", mediaType: "movie", title: row.title,
  posterPath: row.poster_path, backdropPath: row.backdrop_path
}));
```

返回正文，不包含 `.data` 包装。宿主提供配置中的 API 基址与认证，模块不硬编码应用密钥。path 推荐使用不带前导斜线的相对 API 路径。明确传入所需 language/page，不假定服务给出相同默认值。

## HTML 解析

```js
const response = await Prism.http.get(pageURL);
const $ = Prism.html.load(response.body);
const titles = $("article h2").map((_, element) => $(element).text().trim()).get();
```

解析器按需加载，只解析传入 HTML 字符串。不存在 document/window、布局测量、自动执行页面脚本或浏览器登录流程。相对图片和链接应结合实际站点规则转为完整 URL；不能假定 URL、URLSearchParams 等浏览器全局可用。

## 私有存储

| 方法 | 行为 |
| --- | --- |
| Prism.storage.get(key, fallback?) | 读取 JSON 值；缺失或存储值为 null 时返回 fallback；未给 fallback 返回 undefined |
| Prism.storage.set(key, value) | 保存 JSON 可表示的值 |
| Prism.storage.remove(key) | 删除一个键 |
| Prism.storage.getAsync(key, fallback?) | 上述读取的 Promise 包装 |
| Prism.storage.setAsync(key, value) | 上述写入的 Promise 包装，不增加后台执行能力 |

以模块 ID 隔离；同模块不同栏目共享，其他模块不可通过此 API 指定模块 ID 读取。不要保存函数、循环对象、BigInt、undefined 或凭据。更新模块保留私有状态；若结构变化，使用版本化键或显式迁移。

```js
const key = "cursor.v2." + params.sourceId;
Prism.storage.set(key, {page: 2});
const cursor = Prism.storage.get(key, {page: 1});
```

## 显式共享缓存

`get(namespace,key)`、`set(namespace,key,value)`、`remove(namespace,key)` 位于 Prism.sharedCache。缺失项返回 null。namespace 和 key 共同标识一项；namespace 应包含作者/业务前缀和数据版本。

无自动 TTL、无脚本侧全量清除方法，也无访问控制保证。多个模块选用相同 namespace/key 就能共享或覆盖数据；任何登记访问过该项的模块清缓存时，都可能使该项消失。调用方必须能重新加载，不能把共享项当永久配置。

```js
const namespace = "yourname.public-categories.v1";
const cached = Prism.sharedCache.get(namespace, "movie");
if (cached && Date.now() < cached.expiresAt) return cached.items;
// 在自己的函数中获取新数据后保存 {expiresAt,items}；服务凭据不要写入这里。
```

## 日志与其他边界

可调用 console.log/info/warn/error；建议一条消息编码为一个字符串，日志最多保留当前运行时末尾 40 条。不要输出完整令牌、带签名的播放地址或请求头。当前模块管理页提供错误展示，不能假定具有完整网络抓包器、断点调试器或日志导出界面。

Prism.server 是初始化时复制的宿主当前服务器地址，不带凭据；修改这个局部字段不会修改宿主设置，也不能用它表达模块自己的数据源；新模块使用 globalParams 与 library.sources。没有文件系统、系统命令、原生动态库、DOM、fetch、持久 JSContext 或模块自带 UI 的公共契约。
