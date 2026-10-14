# Quality Guidelines

> 服务层(API 封装层)的质量标准。

---

## Overview

服务层代码直接与外部系统交互,错误的代价是**数据损坏或用户凭据泄露**。因此本层的质量标准聚焦三件事:

1. **并发安全** —— 远端文件是共享资源
2. **编码正确** —— 规则文件含中文,Base64 处理不当会静默损毁
3. **凭据边界** —— 不泄露、不误报

无 lint 工具、无测试框架、无 CI。**质量靠约定与代码审查维持。**

---

## Required Patterns

### 必须: UTF-8 安全的 Base64

浏览器的 `btoa`/`atob` 只处理 Latin-1。规则文件含中文注释时,直接使用会**抛异常或损毁内容**。

```js
// github-api.js:4-21 —— 唯一正确写法
function base64Decode(base64Str) {
  const binaryStr = atob(base64Str.replace(/\n/g, ''));   // ← 必须去换行
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function base64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binaryStr = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryStr += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryStr);
}
```

**关键点**:
- 解码前必须 `replace(/\n/g, '')` —— GitHub API 返回的 Base64 **带换行**
- 编解码必须对称地经过 `TextEncoder`/`TextDecoder`

> **Warning**: 不要用 `unescape(encodeURIComponent(...))` 之类的旧技巧替代。本项目已确立 `TextEncoder` 方案。

### 必须: 探测型函数只把语义空转为正常值

```js
// github-api.js:49-53
if (response.status === 404) {
  return { content: '', sha: null };   // 语义空 → 正常返回
}
throw new Error(`获取文件失败: ${response.status} ${response.statusText}`);  // 其余 → 抛出
```

### 必须: 写操作携带 `sha`(乐观锁)

```js
// github-api.js:81-84
if (sha) {
  body.sha = sha;
}
```

新建文件时 `sha` 为 `null`(来自 404 路径),此时**不能**带 `sha` 字段。

### 必须: 绕过缓存

```js
// github-api.js:37-46
const timestamp = Date.now();
const url = `${this.baseUrl}/.../contents/${filePath}?ref=${this.branch}&_=${timestamp}`;
const response = await fetch(url, {
  cache: 'no-store',   // ← 与 _=timestamp 双保险
  headers: { ... }
});
```

**为什么**: 读取 `sha` 后立即 PUT,若拿到缓存的旧 `sha` 必然 409。

### 必须: 追加内容前修补行尾

```js
// github-api.js:appendRule —— 插入后确保文件以 \n 结尾
let newContent = lines.join('\n');
if (newContent && !newContent.endsWith('\n')) {
  newContent += '\n';
}
```

若省略,新规则会**拼接到最后一行末尾**,产生 `  - '+.a.com'  - '+.b.com'`。

> 注意:写入 yaml 规则的插入位置**不是**文件 EOF,而是**最后一个规则行之后**(见 `database-guidelines.md` 的规则文件契约)。追加前修补行尾仍然适用。

---

## Forbidden Patterns

### 禁止: 在服务层操作 DOM

**Problem**:
```js
// ❌ 服务层不得触碰 UI
async addDomainToFile(filePath, domain) {
  document.getElementById('status').textContent = '处理中';  // ✗
}
```

**Why it's bad**: `github-api.js` 需在无 DOM 环境(Node 测试)可加载。混淆层职责会让测试与复用失效。

**Instead**: 服务层只返回结果/抛错,由 UI 层渲染。

### 禁止: 吞掉非语义空错误

**Problem**:
```js
// ❌ 静默掩盖真实故障
async checkDomainExists(filePath, domain) {
  try { ... } catch { return false; }
}
```

**Why it's bad**: Token 失效时用户看到"未添加",而非"Token 无效" —— 误导性极强。

**Instead**: 仅 404 转正常返回,其余抛出(见 `error-handling.md`)。

### 禁止: 因"信息不足"就静默跳过

**Problem**: 服务层遇到未预期的响应结构时默默返回 `false`/`undefined`,而非报错。问题被推迟到更难定位的地方。

### 禁止: 记录凭据

```js
// ❌
console.log('token:', this.token);
console.error('request headers:', headers);   // headers 含 Authorization
```

**Instead**: 只记录动作与状态,如 `console.error('删除域名失败:', error)`。

### 禁止: 硬编码仓库坐标

`baseUrl` 固定为 `https://api.github.com` 是正确的(唯一端点),但 `owner`/`repo`/`branch` **必须**来自构造参数,不得内联。

---

## Testing Requirements

**当前状态: 无自动化测试。** 质量靠人工验证。

### 最低人工验证清单(改服务层后必须执行)

| # | 场景 | 期望 |
|---|------|------|
| 1 | 添加域名到存在的文件 | 新规则插入**最后一个规则行之后**(非 EOF),提交产生 |
| 2 | 添加已存在的域名 | 提示"该域名已存在",**无**提交产生 |
| 3 | 添加到不存在的文件 | 视为空文件,产出 `payload:` + 一行规则,成功创建并写入 |
| 4 | 删除存在的域名 | 所有语义匹配行被移除,**逐字节保留**其他行 |
| 5 | 删除不存在的域名 | 提示"该域名不存在" |
| 6 | 错误 Token | 提示"Token 无效"(非"未添加") |
| 7 | 含中文注释的规则文件 | 读写后中文**完好无损** |
| 8 | 连续快速点击同一分组 | 第二次提示"操作进行中"或成功;无重复行 |
| 9 | 文件末尾无换行符 | 新规则**另起一行**,未拼接 |
| 10 | 配置 Clash API 后添加 | 提示含"Clash 规则已更新" |
| 11 | Clash API 不可达 | 仍提示添加成功(仅无 Clash 提示) |
| 12 | 只有注释 / 只有 `payload:` 的文件 | 添加后 `payload:` 恰好出现一次,无重复键 |

> **若将来引入测试**: `github-api.js` 已将 `fetch` 直接调用集中于少数方法,可通过 stub 全局 `fetch` 在 Node 中测试。但 `shared.js` 用的是 `const` 全局,需先补 `module.exports` 才能 `require`。

---

## Code Review Checklist

改动服务层时逐项确认:

- [ ] 新的 `fetch` 调用是否处理了 `!response.ok`?
- [ ] 错误是否挂载了 `error.status`?
- [ ] 是否有 `response.json()` 未加 `.catch()` 的风险?
- [ ] 读-改-写序列是否受 `_locks` 保护?
- [ ] 锁释放是否在 `finally`?
- [ ] 涉及 409 的路径是否重新读取而非复用旧 `sha`?
- [ ] Base64 处理是否经由 `TextEncoder`/`TextDecoder`?
- [ ] 追加内容前是否修补了行尾 `\n`?
- [ ] 是否按**解析后语义**(而非子串/字面量)判重与删除?
- [ ] `wildcard` / `keyword` 是否被正确地排除在判重与删除之外?
- [ ] 是否向日志/UI 泄露了 Token / secret?
- [ ] 是否引入了对 DOM 的依赖?
- [ ] 新的共享常量是否加到了 `shared.js` 而非各自硬编码?

---

## Common Mistakes

### 常见错误: 常量重复定义

**Symptom**: 提示时长、并发数在不同文件取值不一致

**Cause**: `options.js` 的 `showMessage` 硬编码 `3000`,而 `popup.js` 使用 `TOAST_DURATION`(2000)

**Fix**:
```js
// ❌ options.js:showMessage
setTimeout(() => { message.classList.remove('show'); }, 3000);

// ✅ 复用共享常量
setTimeout(() => { message.classList.remove('show'); }, TOAST_DURATION);
```

**Prevention**: 改任何常量前先 `grep -rn "3000\|TOAST_DURATION" .`(见 `guides/index.md` 的 Pre-Modification Rule)

### 常见错误: 忘记 `options.html` 未加载服务类

**Symptom**: 在 `options.js` 中 `new GitHubAPI(...)` 报 `GitHubAPI is not defined`

**Cause**: `options.html:87-88` 只加载了 `shared.js` 与 `options.js`

**Fix**: 补 `<script src="github-api.js"></script>`,或继续使用内联 `fetch`

### 常见错误: 用 `includes` 做删除匹配

**Symptom**: 删除 `a.com` 时误删了含该子串的其他行

**Cause**: 添加用子串匹配是对的(快速判重),删除必须整行比对

**Fix**: 删除走 `lines.filter(line => line.trim() !== rule)`