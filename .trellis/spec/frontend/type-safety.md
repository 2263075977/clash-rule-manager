# Type Safety

> 本项目的"类型安全"实践。项目使用**原生 JavaScript,无 TypeScript**。

---

## Overview

无类型系统、无编译期检查、无类型校验库(无 Zod / Yup / io-ts)。

类型安全靠**三重防线**:

| 防线 | 手段 | 覆盖 |
|------|------|------|
| 1. 文档 | 本 spec 中的契约表 | 所有跨层数据 |
| 2. 注释 | JSDoc 类型标注 | 公开函数签名 |
| 3. 运行时 | 显式校验 + 守卫 | 用户输入、storage 读取 |

> **核心原则**: 因为没有编译器兜底,**所有来自 storage 和用户输入的数据都必须视为 `unknown` 并显式校验**。

---

## Type Organization

无集中类型定义文件。类型信息分散在:

| 位置 | 形式 |
|------|------|
| `backend/database-guidelines.md` | `Group` 对象契约 |
| `backend/error-handling.md` | 错误矩阵 |
| 代码内 JSDoc | 函数签名 |
| `manifest.json` | 扩展配置结构 |

### Group 契约(本项目最重要的结构)

```js
/**
 * @typedef {Object} Group
 * @property {string}  name       — 显示名(必填)
 * @property {string}  path       — 仓库根相对路径(必填),子目录需带前缀
 * @property {string} [provider]  — Clash provider 名(可选)
 * @property {'direct'|'proxy'} [type] — 仅迁移遗留,新数据不含
 */
```

> **Warning**: `provider` 与 `type` 都是**可选**。
> `provider` 在非空时才被写入(`options.js`);`type` 只在从遗留键迁移时出现。
> 消费方必须用 `group.provider || ''` 与 `group.type === 'direct'` 这样的防御式取值。

### 其他共享形状

```js
// getFileContent 的返回
{ content: string, sha: string | null }

// tryReloadClash 的返回(永不抛出)
{ success: boolean, message: string }

// checkDomainStatus 的元素
{ groupName: string, path: string, exists: boolean }

// 连接测试的返回(Clash)
{ version?: string, ... }
```

---

## Validation

### 必须: 表单输入显式 trim + 非空校验

```js
// options.js saveSettings() —— 权威写法
const token = document.getElementById('token').value.trim();
const branch = document.getElementById('branch').value.trim() || 'main';  // ← 默认值
// ...
if (!token || !owner || !repo) {
  showMessage('请填写所有必填字段', 'error');
  return;
}
```

**约定**:
- 所有 `.value` 必须 `.trim()`
- 可选字段用 `|| <默认值>` 归一化空字符串
- 必填字段统一在一个守卫里检查,给出汇总提示

### 必须: 分组行逐项校验,而非断言

```js
// options.js saveSettings()
groupItems.forEach(item => {
  const name = item.querySelector('.group-name').value.trim();
  const path = item.querySelector('.group-path').value.trim();
  const provider = item.querySelector('.group-provider').value.trim();
  if (name && path) {                    // ← 跳过不完整的行
    const group = { name, path };
    if (provider) group.provider = provider;   // ← 可选字段按需写入
    ruleGroups.push(group);
  }
});

if (ruleGroups.length === 0) {
  showMessage('请至少添加一个规则分组', 'error');
  return;
}
```

**要点**: 不完整的行被**静默跳过**,最后统一检查"是否至少有一个有效分组"。

### 必须: 格式警告不阻断

```js
// options.js —— Token 前缀检查
const tokenFormatWarning = !token.startsWith('ghp_') && !token.startsWith('github_pat_');
// ...
if (tokenFormatWarning) {
  showMessage('设置已保存,但 Token 格式可能不正确,标准格式以 ghp_ 或 github_pat_ 开头', 'warning');
}
```

**约定**: 启发式检查(如 Token 前缀)只**警告**,绝不阻断保存。
理由:GitHub 可能引入新格式,`github_pat_` 本身已是新一代前缀 —— 硬性拒绝会误伤未来格式。

### 必须: 导入时整体 try/catch

```js
// options.js importSettings()
try {
  const settings = JSON.parse(e.target.result);
  await chrome.storage.sync.set(settings);
  await loadSettings();
  showMessage('配置已导入并生效', 'success');
} catch (error) {
  console.error('导入失败:', error);
  showMessage('导入失败: 文件格式错误', 'error');
}
document.getElementById('importFile').value = '';   // ← 必须重置,否则同一文件无法再选
```

> **Warning**: 导入**不做字段白名单校验** —— 任意键都会写入 storage。
> 若担心被篡改的配置文件,应加白名单过滤(当前未做,属已知宽松点)。

---

## Common Patterns

### 守卫模式(提前返回)

```js
if (!currentDomain) { showToast('无效的域名', 'error'); return; }
if (!api) { showToast('请先配置 GitHub 设置', 'error'); return; }
```

### 阶段状态模式(替代联合类型)

没有 TS 的判别联合,改用"共享变量 + 早期赋值":

```js
// popup.js —— 状态在 try 中设置,后续逻辑据其分支
domainStatusMap.set(filePath, { name: groupName, exists: true });
updateButtonState(button, group, currentDomain, true);
updateDomainStatusText();
```

### 归一化默认值

```js
settings.branch || 'main'
group.provider || ''
clashSettings.clashApiSecret || ''
Number(value) || 0
```

### 深拷贝(约定但不推荐现状写法)

```js
// 当前写法(见 database-guidelines.md 的缺陷说明)
groups = JSON.parse(JSON.stringify(defaultRuleGroups));

// 更安全
groups = defaultRuleGroups.map(g => ({ ...g }));
```

---

## Forbidden Patterns

### 禁止: 直接信任 `.value`

```js
// ❌ 未 trim、未校验、未给默认值
const branch = document.getElementById('branch').value;
await chrome.storage.sync.set({ branch });
```

**Instead**: `const branch = document.getElementById('branch').value.trim() || 'main';`

### 禁止: 对可选字段无保护地取属性

```js
// ❌ group.provider 可能不存在
const name = group.provider.toUpperCase();

// ✅
const name = (group.provider || '').toUpperCase();
```

### 禁止: 对 storage 读取结果直接解构

```js
// ❌ settings 可能为空对象
const { token, owner } = await chrome.storage.sync.get(['token', 'owner']);
// ...假设它们存在...

// ✅
const settings = await chrome.storage.sync.get([...]);
if (!settings.token || !settings.owner || !settings.repo) {
  showToast('请先配置 GitHub 设置', 'error');
  // ...
}
```

### 禁止: 用 `any` 式思维绕过检查

```js
// ❌ 不加校验直接当数组用
settings.ruleGroups.forEach(...);   // ruleGroups 可能是 undefined

// ✅
let groups = settings.ruleGroups;
if (!groups || groups.length === 0) { /* 迁移或默认 */ }
```

### 禁止: 隐式类型转换的隐式依赖

```js
// ⚠️ 依赖 "非空字符串为真值"
if (settings.directFile) { ... }
```

这在字符串场景下没问题,但**必须**明确:空字符串与 `undefined` 都被视为"未配置"。
不要对数字或对象使用同样的判断。

---

## Common Mistakes

### 常见错误: `importFile.value` 未重置

**Symptom**: 导入一次后,再次选择**同一个文件**不触发 `change` 事件

**Cause**: `<input type="file">` 的 `value` 未清空时,重复选择同一文件不产生变化

**Fix**: 导入流程末尾 `document.getElementById('importFile').value = '';`(`options.js` 已有正确处理)

### 常见错误: Token 校验过严

**Symptom**: 使用新版 `github_pat_` Token 的用户被拒绝

**Fix**: 前缀检查仅警告,不阻断

### 常见错误: 假设 `provider` 键存在

**Symptom**: 读取时报 `undefined`

**Fix**: `group.provider || ''`

### 常见错误: 导入未做键白名单

**Symptom**: 手工编辑过的配置 JSON 写入意外键

**Fix**: 导入时按 storage 键集合过滤(待实现)

### 常见错误: 类型断言式"我知道它是数组"

**Symptom**: `undefined.forEach` 报错

**Fix**: 任何来自 storage 的集合都必须先做存在性与长度检查