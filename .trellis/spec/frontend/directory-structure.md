# Directory Structure

> UI 层代码如何组织。

---

## Overview

UI 层是**扁平的**:没有 `components/`、`pages/`、`utils/` 之类的目录,所有文件位于项目根。

原因:只有两个界面、两个 JS 文件。**引入目录层级会增加路径复杂度而无收益。**

---

## Directory Layout

```
clash-rule-manager/
├── popup.html      # 弹出窗口结构(空容器 + 动态注入按钮)
├── popup.css       # 仅弹出窗口的样式
├── popup.js        # 弹出窗口全部逻辑
├── options.html    # 设置页结构(静态表单 + 动态分组列表)
├── options.css     # 仅设置页的样式
├── options.js      # 设置页全部逻辑
├── common.css      # 两界面共享样式(.container / .btn / .form-group / .loading / .message / .toast)
└── shared.js       # 共享常量
```

---

## 脚本加载顺序(硬性约束)

```html
<!-- popup.html:33-36 -->
<script src="shared.js"></script>
<script src="github-api.js"></script>
<script src="clash-api.js"></script>
<script src="popup.js"></script>
```

```html
<!-- options.html:87-88 -->
<script src="shared.js"></script>
<script src="options.js"></script>
```

> **Warning**: 两个 HTML 的脚本集合**不同**。`options.html` **不**加载 `github-api.js` / `clash-api.js`。
> 因此 `options.js` 内的连接测试直接内联 `fetch`(`options.js` 的 `testConnection` / `testClashConnection`),
> 而 `popup.js` 复用 `GitHubAPI` / `ClashAPI` 类。这是既有事实,非疏忽 —— 但新增代码前必须确认类是否可用。

---

## HTML ↔ JS 的 DOM 契约

UI 逻辑大量依赖 `getElementById`,因此 **id 即接口**。改动 id 等同于破坏性变更。

### popup.html 的 id 契约

| id | 元素 | 用途 | 引用处 |
|----|------|------|--------|
| `domain` | `.domain-display` | 展示解析后的根域名 | `popup.js` |
| `domainStatus` | `.domain-status` | 展示"已在 X 中 / 未添加" | `popup.js` |
| `quickActions` | `.button-group-vertical` | **空容器**,按钮全部由 JS 注入 | `popup.js` |
| `toast` | `.toast` | 瞬时提示 | `popup.js` |
| `settingsLink` | `<a>` | 打开设置页 | `popup.js` |

### options.html 的 id 契约

| id | 用途 |
|----|------|
| `settingsForm` | 表单,submit 触发保存 |
| `token` / `owner` / `repo` / `branch` | GitHub 配置输入 |
| `ruleGroupsList` | **空容器**,分组行由 JS 注入 |
| `addRuleGroupBtn` | 追加一个空分组行 |
| `clashApiUrl` / `clashApiSecret` | Clash 控制器配置 |
| `testBtn` / `testClashBtn` | 连接测试按钮 |
| `exportBtn` / `importBtn` / `importFile` | 配置备份 |
| `message` | 持久提示(3s 后消失) |

### 动态生成的 class 契约

`options.js` 生成的每个分组行结构固定,**保存时按 class 取值**:

```js
// options.js saveSettings() —— 依赖以下 class
document.querySelectorAll('.rule-group-item').forEach(item => {
  const name     = item.querySelector('.group-name').value.trim();
  const path     = item.querySelector('.group-path').value.trim();
  const provider = item.querySelector('.group-provider').value.trim();
});
```

| class | 元素 |
|-------|------|
| `.rule-group-item` | 行容器(同时带 `.form-group`) |
| `.group-name` | 显示名 input |
| `.group-path` | 文件路径 input |
| `.group-provider` | Clash provider input(可选) |

> **Warning**: 改名/删除这些 class 会**静默**导致保存时丢掉字段 —— 因为 `.value` 取不到会抛错,但若整行没匹配上则会被 `forEach` 静默跳过。

---

## Module Organization

新增界面元素时的落位规则:

| 类型 | 落位 |
|------|------|
| 两界面都要的样式 | `common.css` |
| 仅某界面的样式 | 对应 `*.css` |
| 两界面都要的常量 | `shared.js` |
| 界面专属逻辑 | 对应 `*.js`,作为 `DOMContentLoaded` 内的函数或顶层函数 |

> **现状偏差**: `popup.js` 把所有函数**嵌套**在 `DOMContentLoaded` 回调内;`options.js` 则把函数放在**顶层**,只把事件绑定放在回调内。
> 两种风格并存。新增代码建议采用 `options.js` 风格(顶层函数 + 回调内绑定),理由见 `quality-guidelines.md`。

---

## Naming Conventions

| 对象 | 规则 | 示例 |
|------|------|------|
| HTML id | lowerCamelCase | `domainStatus`、`ruleGroupsList` |
| 动态 class | kebab-case | `rule-group-item`、`group-provider` |
| CSS 状态 class | `btn-*` / `status-*` | `btn-direct`、`btn-remove`、`status-exists` |
| JS 函数 | lowerCamelCase,动词开头 | `extractRootDomain`、`renderRuleGroups` |
| 异步函数 | 动词开头,调用处 `await` | `saveSettings`、`checkDomainStatus` |
| 布尔局部变量 | `is`/`has` 前缀 | `isAdded` |

---

## Examples

- **静态表单 + 动态列表** 的范本: `options.html` + `options.js`(`renderRuleGroups` / `addRuleGroupItem`)
- **动态按钮 + 即时状态切换** 的范本: `popup.js`(`renderActionButtons` / `updateButtonState`)