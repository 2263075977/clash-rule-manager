# Logging Guidelines

> 本项目如何记录日志。

---

## Overview

本项目**没有日志库**。全部使用原生 `console`,输出到扩展的 DevTools 控制台。

| 面 | 查看位置 |
|----|---------|
| popup | 右键扩展图标 → 检查弹出内容 → Console |
| options | 在设置页右键 → 检查 → Console |
| background | `chrome://extensions` → Service Worker |

> **设计取向**: 本项目面向个人用户,日志主要用于**开发期排障**,不追求结构化。但**凭据脱敏是硬性要求**。

---

## Log Levels

| 级别 | 使用场景 | 本项目实例 |
|------|---------|-----------|
| `console.log` | 正常的成功路径节点 | `规则提供者 ${providerName} 已更新` |
| `console.warn` | **可降级失败** —— 不影响主流程 | `Clash API 调用失败(不影响域名添加):` |
| `console.error` | 操作失败,需开发者关注 | `添加域名失败:`、`获取域名失败:` |

### 关键区分:`warn` vs `error`

这是本项目最值得遵守的一条:

```js
// popup.js tryReloadClash() —— Clash 是可选增强,失败不算错误
} catch (error) {
  // 静默失败,不影响主流程
  console.warn('Clash API 调用失败(不影响域名添加):', error);
  return { success: false, message: 'Clash 更新失败' };
}

// popup.js addDomainToGroup() —— 核心操作失败,是真错误
} catch (error) {
  console.error('添加失败:', error);
```

**规则**:
- **核心操作**失败(GitHub 读写、取域名)→ `console.error`
- **可选增强**失败(Clash 重载)→ `console.warn`,并在 message 中说明"不影响主流程"

> **Warning**: 不要把可选增强的失败升级成 `error` —— 会让控制台噪音掩盖真实故障。

---

## Structured Logging

**无结构化日志。** 约定格式:

```
<中文动作描述> : <Error 对象或数据>
```

```js
console.error('删除域名失败:', error);            // ✅ 传 Error 对象本身
console.error('加载设置失败:', error);            // ✅

console.error('删除失败: ' + error.message);      // ⚠️ 仅字符串,丢失堆栈
console.error('failed to delete: ' + error);      // ❌ 英文 + 字符串拼接
```

**要点**:
- 用**逗号**传 `error` 对象,不要字符串拼接 —— 保留可展开的堆栈
- 描述用中文,与项目其余文案一致
- 冒号统一用中文全角 `:`

---

## What to Log

| 事件 | 级别 | 位置 |
|------|------|------|
| Clash provider 更新成功 | `log` | `clash-api.js:26`、`popup.js` |
| Clash 调用失败(可降级) | `warn` | `popup.js tryReloadClash` |
| 规则添加失败 | `error` | `popup.js addDomainToGroup` |
| 规则删除失败 | `error` | `popup.js removeDomainFromGroup`、`github-api.js` |
| 域名状态检测失败 | `error` | `popup.js checkDomainStatus` |
| 获取当前域名失败 | `error` | `popup.js` 顶层 |
| 设置加载/保存/导入/导出失败 | `error` | `options.js` |
| 连接测试失败 | `error` | `options.js` |

---

## What NOT to Log

### 绝对禁止

| 数据 | 原因 |
|------|------|
| `this.token` / GitHub PAT | 凭据泄露,控制台可被他人查看 |
| `clashApiSecret` | 同上 |
| 完整请求 headers | 含 `Authorization` 头 |
| `chrome.storage.sync.get(null)` 的结果 | 含全部配置,包括 Token |

```js
// ❌ 严禁
console.log('settings:', settings);            // 可能含 token
console.log('token:', this.token);
console.error('headers:', headers);            // 含 Authorization

// ✅ 允许 —— 只记动作与状态
console.error('添加失败:', error);
console.log(`规则提供者 ${providerName} 已更新`);
```

> **Warning**: `console.error('添加失败:', error)` 是安全的 —— `fetch` 抛出的网络错误不含请求头。
> 但**不要**把构造请求的 `headers` 对象作为第二个参数传入。

### 谨慎

| 数据 | 说明 |
|------|------|
| 完整文件内容 | 规则文件通常不含敏感信息,但体积可能很大,仅调试时临时打印 |
| 域名 | 属用户浏览行为,泄漏到控制台影响有限;但**不要**批量打印 |

---

## Common Mistakes

### 常见错误: 用 `String(error)` 丢堆栈

**Symptom**: 控制台只显示 `Error: xxx`,无调用栈,难以定位

**Cause**: `console.error('失败: ' + error)` —— 字符串拼接触发 `toString()`

**Fix**: `console.error('失败:', error)` —— 逗号分隔,保留对象

### 常见错误: 把可降级失败记为 error

**Symptom**: 未配置 Clash API 的用户每次操作都看到红色错误

**Cause**: 在 `tryReloadClash` 的 catch 里用了 `console.error`

**Fix**: 改为 `console.warn`,并加"不影响主流程"说明

### 常见错误: 中文冒号与英文冒号混用

**Symptom**: 日志风格不一致

**Fix**: 全项目统一中文全角 `:`

### 常见错误: 遗留英文日志

**Symptom**: 日志中混有 `Clash config loaded` 一类英文

**Cause**: 早期版本或复制外部代码

**Fix**: 统一为中文,与 UI 文案语言一致