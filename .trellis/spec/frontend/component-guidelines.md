# Component Guidelines

> 本项目无组件框架。"组件"指**由 JS 动态构建的 DOM 片段**。

---

## Overview

只有两处动态 DOM 构建:

| 组件 | 构建函数 | 位置 |
|------|---------|------|
| 规则分组表单行 | `addRuleGroupItem()` | `options.js` |
| 分组操作按钮 | `renderActionButtons()` | `popup.js` |

以及两个反馈组件(静态元素 + JS 控制显隐):

| 组件 | 控制函数 | 时长 |
|------|---------|------|
| Toast(弹出层) | `showToast()` | `TOAST_DURATION` = 2000ms |
| Message(页内提示) | `showMessage()` | 硬编码 3000ms ⚠️ |

---

## Component Structure

### 规则: 用 `createElement` + `append`,禁止 `innerHTML` 拼接

```js
// options.js addRuleGroupItem() —— 权威写法
const div = document.createElement('div');
div.className = 'rule-group-item form-group';

const nameInput = document.createElement('input');
nameInput.type = 'text';
nameInput.placeholder = '显示名称 (如: 办公网络)';
nameInput.className = 'group-name';
nameInput.value = name;
nameInput.required = true;

const removeBtn = document.createElement('button');
removeBtn.type = 'button';
removeBtn.className = 'btn btn-remove';
removeBtn.textContent = '删除';
removeBtn.addEventListener('click', () => div.remove());

div.append(nameInput, pathInput, providerInput, removeBtn);
container.appendChild(div);
```

**要点**:
- `type = 'button'` 必须显式设置 —— 否则在 `<form>` 内会触发 submit
- 用户可见文本用 `textContent`,**不要**用 `innerHTML`
- 多个子节点用 `append(...)` 一次性挂载(而非多次 `appendChild`)

### 规则: 事件用 `addEventListener`,不用内联属性

```js
// ✅
removeBtn.addEventListener('click', () => div.remove());

// ❌ 避免 —— CSP 与可测试性都更差
removeBtn.setAttribute('onclick', 'removeRow(this)');
```

---

## Props Conventions

替代"props"的是**函数参数默认值**:

```js
// options.js addRuleGroupItem(name = '', path = '', provider = '')
function addRuleGroupItem(name = '', path = '', provider = '') { ... }
```

三参数刻意与 `Group` 对象的三个字段**同序同名**:

```js
{ name: string, path: string, provider?: string }
```

**约定**: 默认值必须是"空态"(`''`),使 `addRuleGroupItem()` 无参调用生成一个空行。

> **注意**: `renderRuleGroups` 调用时用 `group.provider || ''` 补齐可选的 `provider`:
> ```js
> groups.forEach(group => {
>   addRuleGroupItem(group.name, group.path, group.provider || '');
> });
> ```

---

## Styling Patterns

**纯 CSS 类,无 CSS-in-JS、无预处理器。** 通过切换 `className` 改变外观。

### 按钮的视觉语义(由类名承载)

| class | 含义 | 出现场景 |
|-------|------|---------|
| `btn btn-direct` | 添加到直连 | 未添加 + 直连类分组 |
| `btn btn-proxy` | 添加到代理 | 未添加 + 代理类分组 / 兜底 |
| `btn btn-remove` | **删除** | 已添加 |
| `btn btn-primary` | 主操作(保存) | options |
| `btn btn-secondary` | 次要操作 | options |

### 状态文本类

| class | 含义 |
|-------|------|
| `domain-status status-exists` | ✅ 已在某些分组中 |
| `domain-status status-none` | 📌 未添加到任何规则 |

### 加载态

```js
// popup.js setButtonLoading(true)
btn.dataset.originalText = btn.textContent;   // ← 必须先备份原文
btn.disabled = true;
btn.innerHTML = '<span class="loading"></span>处理中...';

// setButtonLoading(false)
btn.disabled = false;
btn.textContent = btn.dataset.originalText;
```

> **Warning**: `dataset.originalText` 是**恢复文案的唯一来源**。若在 `setButtonLoading(true)` 之前未保存,恢复后会变成 `undefined`。
> 同时注意:加载态用 `innerHTML` 注入 `<span class="loading">`,而恢复用 `textContent` —— 这是有意的(清除 span),但意味着**加载态会丢失按钮原有的图标**。

---

## 按钮状态机(popup 的核心抽象)

每个分组按钮只有两个状态,由"域名是否已在该分组文件中"决定。

```
                  ┌──────────────────────┐
                  │  未添加              │
                  │  class: btn-direct   │
                  │  text: ➕ 添加到 X   │
                  └──────────┬───────────┘
                             │ 点击 → addDomainToFile 成功
                             ▼
                  ┌──────────────────────┐
                  │  已添加              │
                  │  class: btn-remove   │
                  │  text: 🗑️ 从 X 删除  │
                  └──────────┬───────────┘
                             │ 点击 → confirm → removeDomainFromFile 成功
                             ▼
                        (回到未添加)
```

### 类别判定(直连 vs 代理)

```js
// popup.js getButtonClass()
function getButtonClass(group) {
  if (group.name.includes('直连') || group.type === 'direct') return 'btn btn-direct';
  if (group.name.includes('代理') || group.type === 'proxy') return 'btn btn-proxy';
  return 'btn btn-proxy';   // ← 兜底:未知分组按代理样式
}
```

> **Warning**: 判定依赖**分组显示名包含"直连"/"代理"**或迁移遗留的 `type` 字段。
> 用户自定义名为"办公网络"的分组会落到兜底的代理样式。这是既有限制 —— 新增分组**无法**在 UI 上指定样式类别。
> 若要改进,应在 `Group` 契约里加显式字段,而非继续扩展中文名匹配。

### 状态更新的实现方式: 节点替换

```js
// popup.js updateButtonState() —— 通过克隆节点移除所有旧监听器
const newBtn = btn.cloneNode(false);   // ← false:不克隆子节点
newBtn.style.marginTop = '0';
// ...重新设置 class / text / 监听器...
btn.parentNode.replaceChild(newBtn, btn);
return newBtn;   // ← 必须返回新节点,调用方需用返回值替换自己的引用
```

**为什么用克隆**: 没有 `removeEventListener` 的句柄,克隆节点是移除旧监听器最简单的方式。

> **Warning**: `cloneNode(false)` 会**丢失 `dataset.originalText`**。因此替换后若再次进入加载态,备份会重建 —— 逻辑上安全,但若在加载中替换则会丢失原文案。
>
> **Warning**: 返回值**必须**被调用方接收。若忽略返回值继续操作旧 `btn`,事件会绑定到已脱离文档的节点上,表现为"点击无反应"。

---

## Accessibility

**当前无系统化的无障碍支持。** 最低要求:

| 要求 | 说明 |
|------|------|
| 语义标签 | 用 `<button>` 而非 `<div onclick>`;用 `<label for>` 关联输入 |
| `alt` | 图标为 CSS `background`,无 `<img>`,暂无需要 |
| 键盘可达 | `<button>` / `<input>` 原生可达,勿覆盖 `tabindex` |
| 颜色对比 | 勿仅靠颜色传达状态(当前用 ✅/📌 图标辅助,合规) |

> **待改进**: `domainStatus` 无 `aria-live`,状态变化不会被屏幕阅读器播报。

---

## Common Mistakes

### 常见错误: 在 `<form>` 内忘记 `type="button"`

**Symptom**: 点击"删除"分组行时整个表单被提交

**Cause**: `<button>` 默认 `type="submit"`

**Fix**:
```js
removeBtn.type = 'button';   // 必须显式设置
```

**Prevention**: `options.js` 中所有非提交按钮(`addRuleGroupBtn`、`testBtn`、`testClashBtn`、`exportBtn`、`importBtn`)的 HTML 均已标注 `type="button"`,新增按钮照做。

### 常见错误: 忽略 `updateButtonState` 的返回值

**Symptom**: 添加域名后按钮变为"删除",但再点击无反应

**Cause**: 未用返回的新节点替换调用方的 `button` 引用

**Fix**: `button = updateButtonState(button, ...)` 或确保后续只用返回值

### 常见错误: Toast 超时不清理

**Symptom**: 快速连续操作时,前一个计时器提前隐藏了后一条提示

**Cause**: 未清理上一个 timeout

**Fix**:
```js
// popup.js showToast() —— 已有正确处理
clearTimeout(toastTimeoutId);
toastTimeoutId = setTimeout(() => { ... }, TOAST_DURATION);
```

`options.js` 的 `showMessage()` **没有**做这件事 —— 是已知缺陷。

### 常见错误: 两处渲染逻辑不同步

**Symptom**: 修改按钮逻辑后,初始渲染与更新后渲染表现不一致

**Cause**: `renderActionButtons()`(初始)与 `updateButtonState()`(更新后)存在重复代码

**Fix**: 抽取单一渲染函数,两处共用

**Prevention**: 见 `guides/code-reuse-thinking-guide.md` 的"本项目实例"