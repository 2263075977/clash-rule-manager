# Directory Structure

> 服务层代码如何组织。

---

## Overview

本项目**没有构建步骤,也没有模块系统**。所有 `.js` 文件通过 HTML 中的 `<script>` 标签按顺序加载,共享同一个全局作用域。

这意味着"目录结构"在此项目中主要回答两个问题:

1. 服务层有哪些模块,各自负责什么
2. **加载顺序**如何约束依赖

---

## Directory Layout

```
clash-rule-manager/
├── manifest.json       # Manifest V3 清单(权限、CSP、入口声明)
├── shared.js           # 共享常量(必须最先加载)
├── github-api.js       # GitHub REST API 封装 → 类 GitHubAPI
├── clash-api.js        # Clash 控制器 API 封装 → 类 ClashAPI
├── popup.html/js/css   # 弹出窗口(UI 层)
├── options.html/js/css # 设置页面(UI 层)
├── common.css          # UI 层共享样式
└── icons/              # 扩展图标
```

对应关系:**服务层 = `shared.js` + `github-api.js` + `clash-api.js`**;**UI 层 = `popup.*` + `options.*`**。

---

## 模块职责

| 模块 | 导出符号 | 职责 | 禁止 |
|------|---------|------|------|
| `shared.js` | `defaultRuleGroups`、`STATUS_CHECK_TIMEOUT`、`TOAST_DURATION`、`MAX_CONCURRENT_CHECKS` | 全应用共享常量 | 不得包含任何逻辑或副作用 |
| `github-api.js` | `GitHubAPI`(类)、内部 `base64Encode`/`base64Decode` | 读写 GitHub 仓库中的规则文件 | 不得操作 DOM |
| `clash-api.js` | `ClashAPI`(类) | 调用 Clash 外部控制器(获取版本、重载 provider) | 不得操作 DOM、不得抛给用户看不懂的错误 |

---

## 加载顺序(硬性约束)

依赖是**单向**的,顺序不可颠倒:

```html
<!-- popup.html:33-36 -->
<script src="shared.js"></script>      <!-- 1. 常量,无依赖 -->
<script src="github-api.js"></script>  <!-- 2. 类定义 -->
<script src="clash-api.js"></script>   <!-- 3. 类定义 -->
<script src="popup.js"></script>       <!-- 4. 使用前述全部 -->
```

```html
<!-- options.html:87-88 -->
<script src="shared.js"></script>
<script src="options.js"></script>
```

> **Warning**: `options.html` 只加载 `shared.js`,不加载 `github-api.js` / `clash-api.js`。
> `options.js` 因此**直接内联**了 `fetch` 调用(`options.js:169` 附近)而不是复用 `GitHubAPI` 类。
> 新增服务层调用时,要么补上 `<script>`,要么明确接受内联 —— 不要假设类已存在。

---

## 导出约定

服务层模块同时要支持浏览器全局与 Node 环境(便于测试),统一使用双模式导出守卫:

```js
// github-api.js:201-204 —— 标准写法
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GitHubAPI;
}
```

`shared.js` 则**只有**浏览器全局,没有 `module.exports` —— 因为它声明的是 `const`,在 Node 中 `require` 会取不到值。若需在 Node 中测试共享常量,需先补导出。

---

## Naming Conventions

| 对象 | 规则 | 示例 |
|------|------|------|
| 文件名 | 小写 + 连字符,按职责命名 | `github-api.js`、`clash-api.js` |
| UI 三件套 | 同名前缀 + 扩展名 | `popup.html` / `popup.js` / `popup.css` |
| 服务类 | PascalCase,以 `API` 结尾 | `GitHubAPI`、`ClashAPI` |
| 共享常量 | SCREAMING_SNAKE_CASE;集合用 camelCase | `TOAST_DURATION`、`defaultRuleGroups` |
| 私有静态成员 | 前导下划线 | `GitHubAPI._locks` |

---

## Examples

- 纯服务层、无 DOM、带锁与重试的**范本**: `github-api.js`
- 静默失败、绝不影响主流程的**范本**: `clash-api.js` + `popup.js` 的 `tryReloadClash`