# Lifecycle & Async Guidelines

> 本项目**不使用 React**,因此没有 hook。
> 本文件替代"hook guidelines",约定**生命周期结构**与**异步助手函数**的写法。

---

## Overview

每个界面只有一个生命周期钩子:**`DOMContentLoaded`**。

```js
document.addEventListener('DOMContentLoaded', async () => {
  // 绑定事件 + 首次渲染
});
```

> **命名说明**: 文件名沿用 Trellis 模板的 `hook-guidelines.md`,但内容对应本项目的实际形态。

---

## 生命周期结构

### 两种并存的组织风格

#### A. 全部嵌套在回调内(`popup.js` 当前风格)

```js
document.addEventListener('DOMContentLoaded', async () => {
  const domainDisplay = document.getElementById('domain');
  let currentDomain = '';
  const domainStatusMap = new Map();

  function extractRootDomain(hostname) { ... }
  function renderActionButtons(groups, statusResults = []) { ... }
  async function addDomainToGroup(...) { ... }

  // ...顶层执行流程...
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // ...
});
```

#### B. 函数在顶层,回调内只做绑定(`options.js` 当前风格)

```js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settingsForm');
  const testBtn = document.getElementById('testBtn');
  // ...
  loadSettings();
  form.addEventListener('submit', async (e) => { e.preventDefault(); await saveSettings(); });
  testBtn.addEventListener('click', async () => { await testConnection(); });
});

// 顶层函数
async function loadSettings() { ... }
async function saveSettings() { ... }
async function testConnection() { ... }
```

### 约定: 新增代码采用风格 B

| 维度 | 风格 A | 风格 B |
|------|--------|--------|
| 可测试性 | ❌ 无法从控制台调用 | ✅ 可直接 `await saveSettings()` |
| 状态共享 | ✅ 闭包天然隔离 | ⚠️ 需显式传参或模块级变量 |
| 可读性 | ❌ 200+ 行嵌套 | ✅ 函数独立 |
| 调试 | ❌ 难打断点 | ✅ 容易 |

> **重要**: `popup.js` 风格 A 的直接后果是**无法从 DevTools 控制台调用任何内部函数**。
> 排障时只能靠 `console.log`。这是选择风格 B 的核心理由。

**新增 `popup.js` 功能时的迁移策略**: 新函数放顶层;已有嵌套函数保持不动,逐步迁出(见 `quality-guidelines.md` 的待办)。

---

## 异步模式

### 必须: 等待后再访问 DOM

`DOMContentLoaded` 回调是 `async`,内部所有 `await` 均安全 —— 元素已解析。

```js
// popup.js —— 合法:回调内 await 任意次数
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const settings = await chrome.storage.sync.get([...]);
  const statusResults = await checkDomainStatus(groups, currentDomain, api);
  renderActionButtons(groups, statusResults);
});
```

> **Warning**: `popup.js` 的顶层流程在 `await` 之前先做了 `document.getElementById(...)`,这是安全的。
> 但**不要**把 `getElementById` 提到 `DOMContentLoaded` 之外(脚本位于 `<body>` 末尾,恰好能工作,但这依赖加载位置 —— 脆弱)。

### 必须: 点击处理器 try/catch/finally 三段式

```js
// popup.js addDomainToGroup() —— 权威结构
async function addDomainToGroup(filePath, button, groupName, providerName, group) {
  if (!currentDomain) { showToast('无效的域名', 'error'); return; }
  if (!api) { showToast('请先配置 GitHub 设置', 'error'); return; }

  setButtonLoading(button, true);
  try {
    await api.addDomainToFile(filePath, currentDomain);
    const clashResult = await tryReloadClash(providerName);
    // ...成功提示 + 状态切换...
  } catch (error) {
    console.error('添加失败:', error);
    // ...错误分类提示 + setButtonLoading(button, false)...
  }
}
```

**结构约定**:
1. **前置守卫**(`if (!x) return`)放在 `setButtonLoading` **之前** —— 避免无谓的加载态闪烁
2. `setButtonLoading(true)` 后立即 `try`
3. **成功路径不调用** `setButtonLoading(false)` —— 因为按钮会被整体替换成"删除"态
4. **失败路径必须**调用 `setButtonLoading(false)` 恢复按钮

> **Warning**: 成功路径不恢复按钮是**有意设计**,不是遗漏。若擅自加上恢复,按钮会先变回"添加"再被替换成"删除",产生视觉闪烁。

### 必须: 有返回值的异步助手返回结构化结果

```js
// popup.js tryReloadClash() —— 永不抛出,返回 { success, message }
async function tryReloadClash(providerName) {
  try {
    if (!providerName) return { success: false, message: '' };
    const clashSettings = await chrome.storage.sync.get(['clashApiUrl', 'clashApiSecret']);
    if (!clashSettings.clashApiUrl) return { success: false, message: '' };

    const clashApi = new ClashAPI(clashSettings.clashApiUrl, clashSettings.clashApiSecret || '');
    await clashApi.updateRuleProvider(providerName);
    return { success: true, message: 'Clash 规则已更新' };
  } catch (error) {
    console.warn('Clash API 调用失败(不影响域名添加):', error);
    return { success: false, message: 'Clash 更新失败' };
  }
}
```

**约定**: "可选增强"类助手**绝不抛出**,一律返回 `{ success, message }`。
调用方据 `success` 决定是否追加提示 —— 从而让主流程无需感知其失败。

---

## 并发控制模式

### 批量检测: 分批 + 超时竞速

```js
// popup.js checkDomainStatus() —— 权威写法
const results = [];
for (let i = 0; i < groups.length; i += MAX_CONCURRENT_CHECKS) {
  const batch = groups.slice(i, i + MAX_CONCURRENT_CHECKS);
  const batchPromises = batch.map(async (group) => {
    const exists = await apiInstance.checkDomainExists(group.path, domain);
    return { groupName: group.name, path: group.path, exists };
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('检测超时')), STATUS_CHECK_TIMEOUT)
  );

  const batchResults = await Promise.race([Promise.all(batchPromises), timeoutPromise]);
  results.push(...batchResults);
}
```

**要点**:
- `MAX_CONCURRENT_CHECKS = 4` —— 避免一次性打满 GitHub 速率限制
- `Promise.race` 而非 `Promise.all` —— 保证界面不会无限"检测中"
- 批次内用 `Promise.all`,批次间**串行**

> **Warning**: 超时后 `timeoutPromise` 的 `setTimeout` **不会被清理**,且已发出的请求继续在后台运行。
> 分批循环会在下一批再创建一个计时器。分组很多时会产生游离计时器。修复方式是为每批保存 timer id 并在 `finally` 中 `clearTimeout`。

---

## Naming Conventions

| 类型 | 规则 | 示例 |
|------|------|------|
| 生命周期入口 | 匿名 async 箭头函数 | `addEventListener('DOMContentLoaded', async () => {})` |
| 异步助手(会抛) | 动词 + 名词 | `loadSettings`、`saveSettings`、`testConnection` |
| 异步助手(不抛) | `try` 前缀 | `tryReloadClash` |
| 守卫函数 | `check` / `is` 前缀 | `checkDomainStatus` |

> **约定**: `try` 前缀是**语义信号**,表示"调用它不会抛错,检查返回值即可"。新增可选增强功能时沿用。

---

## Common Mistakes

### 常见错误: 在 `DOMContentLoaded` 外查询动态元素

**Symptom**: `Cannot read properties of null (reading 'addEventListener')`

**Cause**: 在脚本顶层立即 `getElementById` 一个稍后才创建的节点

**Fix**: 所有查询放进回调,或确认节点在 HTML 中是静态存在的

### 常见错误: 把可选增强的失败当致命错误处理

**Symptom**: 未配置 Clash 的用户每添加一个域名都看到红色错误

**Cause**: `tryReloadClash` 抛出而非返回 `{success:false}`

**Fix**: 保持"不抛"契约(见上文)

### 常见错误: 成功路径也恢复按钮状态

**Symptom**: 按钮先短暂显示"添加"再变为"删除",有闪烁

**Fix**: 成功路径不调用 `setButtonLoading(false)`

### 常见错误: 超时计时器未清理

**Symptom**: 页面关闭后仍有计时器;分组很多时内存缓慢增长

**Fix**: 保存 timer id,在 `finally` 中 `clearTimeout`