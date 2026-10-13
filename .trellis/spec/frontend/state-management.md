# State Management

> 本项目如何管理状态。

---

## Overview

无状态库。状态分三层,层级清晰且**不可混淆**:

| 层 | 载体 | 生命周期 | 权威性 |
|----|------|---------|--------|
| **持久配置** | `chrome.storage.sync` | 跨会话、跨设备 | ⭐ **唯一真源** |
| **远端数据** | GitHub 仓库规则文件 | 永久 | ⭐ 规则内容唯一真源 |
| **内存态** | JS 变量 / `Map` / DOM 本身 | 界面关闭即销毁 | 仅渲染缓存 |

> **核心原则**: popup 每次打开都**重新读取**全部状态并重新检测。**不缓存**上次结果,不假设上次的 DOM 还在。

---

## State Categories

### 1. 持久配置(`chrome.storage.sync`)

键集合与契约见 `../backend/database-guidelines.md`。要点:

- 读写入口: `options.js` 的 `loadSettings()` / `saveSettings()`
- popup **只读不写**
- 遗留键 `directFile` / `proxyFile` 仍需读取(迁移逻辑)

### 2. 内存态(popup)

| 变量 | 类型 | 用途 | 位置 |
|------|------|------|------|
| `currentDomain` | string | 解析后的根域名 | `popup.js` 闭包 |
| `api` | `GitHubAPI \| null` | 复用的 API 实例 | `popup.js` 闭包 |
| `domainStatusMap` | `Map<path, {name, exists}>` | 各分组的存在状态 | `popup.js` 闭包 |
| `toastTimeoutId` | number | Toast 计时器句柄 | `popup.js` 闭包 |

> **`domainStatusMap` 的键是 `path` 而非 `name`**。
> 这是刻意的:同一文件路径可被多个分组引用,而状态按文件判定。
> 但 `checkDomainStatus` 写入时会用**后写覆盖**同名 `path`,若两个分组指向**同一文件**,第二个状态会覆盖第一个 —— 由于结果相同,实际无害。

### 3. DOM 自身承载的状态

本项目**大量依赖 DOM 表达状态**,而非 JS 变量:

| 状态 | DOM 表达 |
|------|---------|
| 某域名已在分组 X 中 | 按钮的 `className === 'btn btn-remove'` |
| 按钮正在处理 | 按钮有 `disabled` + 内含 `.loading` span |
| 按钮原始文案 | `btn.dataset.originalText` |
| 提示是否可见 | 元素有 `show` 类 |

> **Warning**: 这意味着**重新渲染会丢失状态**。`renderActionButtons()` 会 `innerHTML = ''` 清空容器,
> 因此它必须**同时接收 `statusResults`** 才能重建出正确的"已添加"态:
> ```js
> renderActionButtons(groups, statusResults);   // statusResults 不可省略
> ```
> 若省略,所有按钮都会渲染成"添加"态。

---

## When to Use Global State

本项目没有全局状态管理。**跨界面通信只能通过 `chrome.storage.sync`**:

```
options.js ──写入──▶ chrome.storage.sync ──读取──▶ popup.js
```

> **重要限制**: `popup.js` 与 `options.js` 运行在**不同文档**,全局变量不共享。
> 共享 `shared.js` 的常量是**只读**的;`GitHubAPI` 类定义共享但实例不共享。
> 因此"在设置页改了配置,popup 立即生效"是靠 popup 每次打开重新读取实现的,**不是**靠事件通知。

### 可选增强: 监听 storage 变化

本界面内可监听其他上下文对 storage 的写入:

```js
// 当前未使用,但若需"popup 打开时设置页改了配置立即刷新"可加
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') { /* 重新渲染 */ }
});
```

> **注意**: popup 打开期间设置页通常无法打开(焦点冲突),实际收益有限。**不建议**为了"完整性"引入。

---

## Server State

"服务端状态"= GitHub 仓库中的规则文件内容。

### 不缓存原则

```js
// github-api.js:37-46 —— 每次读取都绕过缓存
const timestamp = Date.now();
const url = `${this.baseUrl}/.../${filePath}?ref=${this.branch}&_=${timestamp}`;
fetch(url, { cache: 'no-store', ... });
```

**理由**: 缓存策略与写操作的乐观锁(`sha`)**直接冲突**。缓存命中会导致 409。

### 同步时机

| 时机 | 行为 |
|------|------|
| popup 打开 | 并发检测所有分组(分批,每批 ≤ 4) |
| 添加/删除后 | **不重新检测**,直接用已知结果更新 `domainStatusMap` 与按钮 |
| 检测失败 | 显示错误状态,**不使用**过期结果 |

```js
// popup.js 添加成功后 —— 乐观更新,不发起额外请求
domainStatusMap.set(filePath, { name: groupName, exists: true });
updateButtonState(button, group, currentDomain, true);
updateDomainStatusText();
```

> **为什么乐观更新是安全的**: 写操作本身是"读-改-写"且带锁,失败会抛错。**只有确认写入成功才更新内存态**,因此无需复检。

---

## 遗留状态迁移

**这是本项目唯一的状态迁移逻辑**,且在两处重复。详见 `../backend/database-guidelines.md` 的"遗留键迁移"。

摘要:

```
ruleGroups 非空                → 使用
ruleGroups 空 + 有 directFile/proxyFile → 合成
两者都空                        → defaultRuleGroups
```

> **Warning**: 迁移**只发生在读取时**,不写回 storage。
> 也就是说老用户每次打开界面都会重新执行迁移。这是有意的(避免读操作产生写副作用),
> 但意味着用户若从不点"保存设置",遗留键会永久存在。

---

## Common Mistakes

### 常见错误: 用 `name` 作为状态映射的键

**Symptom**: 重命名分组后状态丢失

**Cause**: 状态应按文件路径(`path`)索引,而非显示名

**Fix**: `domainStatusMap` 用 `path` 作键(当前实现正确)

### 常见错误: 省略 `renderActionButtons` 的第二个参数

**Symptom**: 打开 popup 时明明域名已在规则中,按钮却显示"添加"

**Cause**: `statusResults` 默认值 `[]`,省略后所有按钮都判定为"未添加"

**Fix**: 始终传入检测结果

### 常见错误: 假设 `ruleGroups` 存在

**Symptom**: 新用户首次打开报错

**Fix**: 走三档优先级解析

### 常见错误: 在 popup 中写 storage

**Symptom**: 配置被意外覆盖;设置页与 popup 状态不一致

**Cause**: 职责越界 —— popup 应只读配置

**Fix**: 配置写入只允许在 `options.js` 的 `saveSettings()`

### 常见错误: 为"实时同步"引入过重机制

**Symptom**: 引入 storage 监听、消息传递等复杂度,而实际收益极低

**Fix**: 保持"每次打开重新读取"的简单模型。本项目状态量极小(几个键),重新读取的成本远低于维护同步机制的复杂度。