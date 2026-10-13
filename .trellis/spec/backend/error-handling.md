# Error Handling

> 本项目的错误处理契约。

---

## Overview

本项目没有自定义 Error 子类。错误处理依赖两条通道:

| 通道 | 载体 | 用途 |
|------|------|------|
| HTTP 状态码 | `error.status`(number) | 程序化判定:409 重试、401/403/404 分类 |
| 业务消息 | `error.message`(中文) | 直接面向用户展示 |

> **核心原则**: 状态码走 `error.status`,面向用户的原因走中文 `message`。**不要**把状态码塞进 message 再去字符串匹配 —— 这正是当前 `popup.js` 的脆弱之处。

---

## Error Types

无自定义类。但存在两种**必须区分**的错误来源:

### 1. HTTP 错误(带 `status`)

```js
// github-api.js:96-101 —— 权威写法
if (!response.ok) {
  const errorData = await response.json().catch(() => ({}));
  const error = new Error(errorData.message || `更新文件失败: ${response.status} ${response.statusText}`);
  error.status = response.status;   // ← 唯一可靠的程序化判定依据
  throw error;
}
```

> **Warning**: `response.json().catch(() => ({}))` 是必需的 —— GitHub 某些错误响应体非 JSON,不加 catch 会抛出解析错误从而**掩盖**真实状态码。

### 2. 业务错误(无 `status`)

纯逻辑失败,消息直接面向用户:

```js
throw new Error('该域名已存在于规则文件中');   // github-api.js:170
throw new Error('该域名不存在于规则文件中');   // github-api.js:127
throw new Error('操作进行中,请稍后');          // github-api.js:119, 162
```

> **约定**: 业务错误的 message 必须**可直接展示给用户**,且不含技术细节。

---

## Error Handling Patterns

### 404 不是错误

这是本项目最容易踩的坑。读取不存在的文件**返回空内容**,不抛错:

```js
// github-api.js:49-53
if (!response.ok) {
  if (response.status === 404) {
    // 文件不存在,返回空内容
    return { content: '', sha: null };
  }
  throw new Error(`获取文件失败: ${response.status} ${response.statusText}`);
}
```

**为什么**: 首次添加域名时目标文件可能尚不存在,视为"空文件"比报错更符合直觉。

**因此**: `checkDomainExists()` 可以放心调用而不必 try/catch 404(`github-api.js:107-113`)。但这也意味着 **401/403/网络错误会直接向上传播** —— 这是修复过的行为,早期版本曾在此吞掉错误。

### 409 Conflict 自动重试

GitHub Contents API 是乐观锁:若 `sha` 过期,返回 409。本项目对**整个读写流程**重试一次(而非仅重发 PUT):

```js
// github-api.js:139-149(removeDomainFromFile,addDomainToFile 同构)
try {
  await attempt();
} catch (error) {
  if (error.status === 409) {
    await attempt();   // 重新 getFileContent 拿新 sha,再 PUT
  } else {
    throw error;
  }
}
```

> **Warning**: 重试必须**重新读取**(`attempt` 内部先调 `getFileContent`),不能复用旧 sha,否则必然再次 409。
>
> 只重试**一次**。第三次冲突会直接抛出 —— 这是有意的,避免无限循环。

### Per-file 锁

```js
// github-api.js:25
static _locks = new Set();

// github-api.js:117-121(进入)
if (GitHubAPI._locks.has(filePath)) {
  throw new Error('操作进行中,请稍后');
}
GitHubAPI._locks.add(filePath);

// github-api.js:152-155(无论成败都释放)
finally {
  GitHubAPI._locks.delete(filePath);
}
```

> **Warning**: 锁必须放在 `finally` 中释放。若走 `catch` 释放,成功路径会泄漏锁,该文件将永久不可操作。

### 静默失败(Clash 调用)

Clash API 是**可选**增强能力,失败绝不能影响主流程:

```js
// popup.js tryReloadClash()
} catch (error) {
  // 静默失败,不影响主流程
  console.warn('Clash API 调用失败(不影响域名添加):', error);
  return { success: false, message: 'Clash 更新失败' };
}
```

**约定**: 调用 Clash 必须返回 `{ success: boolean, message: string }`,调用方据 `success` 决定是否追加提示。

---

## Validation & Error Matrix

| 条件 | `error.status` | message | 用户可见文案 |
|------|---------------|---------|-------------|
| 文件不存在(GET) | — | — | **不报错**,返回 `{content:'', sha:null}` |
| Token 无效 | 401 | `获取文件失败: 401 Unauthorized` | `Token 无效` |
| 权限不足 | 403 | 同上格式 | `权限不足` |
| 文件不存在(PUT) | 404 | 同上格式 | `文件不存在` |
| sha 冲突 | 409 | GitHub 返回的 message | **自动重试一次**,仍失败则透传 |
| 域名已存在 | 无 | `该域名已存在于规则文件中` | `该域名已存在` |
| 域名不存在(删) | 无 | `该域名不存在于规则文件中` | `该域名不存在` |
| 并发操作同文件 | 无 | `操作进行中,请稍后` | 原样展示 |
| 网络不可达 | 无 | `Failed to fetch` / `NetworkError` | `网络错误` |
| 检测超时 | 无 | `检测超时` | `⚠️ 检测失败` |

---

## API Error Responses

### GitHub(user-facing 消息映射)

```js
// popup.js addDomainToGroup() 的错误分类
let errorMessage = '添加失败';
if (error.message.includes('已存在')) errorMessage = '该域名已存在';
else if (error.message.includes('404')) errorMessage = '文件不存在';
else if (error.message.includes('401')) errorMessage = 'Token 无效';
else if (error.message.includes('403')) errorMessage = '权限不足';
else errorMessage = error.message;
```

### Clash 控制器

| 状态 | 含义 | 处理 |
|------|------|------|
| 200 | 成功 | 返回 `true` / JSON |
| 401 | 密钥无效 | `clash-api.js` 抛 `更新规则提供者失败: 401` |
| 其他 | 失败 | 抛 `更新规则提供者失败: <status>` |

### 配置测试连接(`options.js`)

| 状态 | GitHub 文案 | Clash 文案 |
|------|------------|-----------|
| ok | `连接成功!仓库访问正常` | `连接成功!Clash 版本: <v>` |
| 401 | `Token 无效或已过期` | `密钥无效或未授权` |
| 404 | `仓库不存在或无访问权限` | — |
| 其他 | `连接失败: <s> <t>` | `连接失败: <s> <t>` |
| 异常 | `网络错误: <msg>` | `网络错误: 无法连接到 Clash API` |

---

## 安全矩阵(凭据)

| 位置 | 允许含 Token | 说明 |
|------|-------------|------|
| `chrome.storage.sync` | ✅ | 设计如此 |
| `Authorization` 请求头 | ✅ | GitHub 用 `token <PAT>`,Clash 用 `Bearer <secret>` |
| `console.log` | ❌ | 禁止打印 Token 或 secret |
| Toast / Message UI | ❌ | 禁止回显 |
| 配置导出文件 | ⚠️ | 当前**包含**明文 Token,见 `database-guidelines.md` |

---

## Common Mistakes

### 常见错误: 用字符串匹配判定状态码

**Symptom**: 错误分类偶发失效;message 格式一改就全线失灵

**Cause**:
```js
// popup.js —— 脆弱写法
if (error.message.includes('401')) { /* ... */ }
```

这依赖 GitHub 返回的 message 恰好含 `401`。一旦 GitHub 改文案、或错误来自其他层,分类即失效。

**Fix / Instead**: 用已挂载的状态码判定:
```js
const status = error.status;
if (status === 401) { /* Token 无效 */ }
else if (status === 403) { /* 权限不足 */ }
else if (status === 404) { /* 文件不存在 */ }
```

**Prevention**: 服务层**必须**继续挂 `error.status`(见 `github-api.js:99`);UI 层优先用 `status`,仅在无 `status` 时才回落 message 匹配。

### 常见错误: 在 `checkDomainExists` 里吞掉错误

**Symptom**: Token 失效时界面显示"未添加到任何规则",误导用户

**Cause**: 早期实现对任何异常都返回 `false`

**Fix**: 让 401/403/网络错误向上传播,由 UI 层统一分类提示

**Prevention**: 该类"探测型"函数只应把**语义上的空**(404)转为正常返回值,其余一律抛出

### 常见错误: `catch` 中释放锁

**Symptom**: 一次失败后该文件永久报"操作进行中"

**Fix**: 锁释放放 `finally`