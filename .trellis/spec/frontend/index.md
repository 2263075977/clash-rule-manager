# Frontend Development Guidelines

> 扩展 UI 层(popup / options)的开发规范。

---

## Overview

UI 层是**原生 DOM + 原生 JS,无框架、无构建、无状态库**。

| 界面 | 文件 | 入口 | 特征 |
|------|------|------|------|
| 弹出窗口 | `popup.html` / `popup.js` / `popup.css` | 工具栏图标点击 | 自动读取当前标签页域名,渲染分组按钮 |
| 设置页 | `options.html` / `options.js` / `options.css` | `chrome.runtime.openOptionsPage()` | 表单配置、连接测试、导入导出 |

两者共享 `common.css` 与 `shared.js`。

> **重要心理模型**: 这不是 SPA。每个界面是**独立文档**,`popup.js` 与 `options.js` **互不共享代码**,只共享 `shared.js` 的常量与(对 popup 而言)服务类。任何跨界面的行为,只能通过 `chrome.storage.sync` 传递。

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | 扁平结构、脚本加载顺序、DOM 契约 | Filled |
| [Component Guidelines](./component-guidelines.md) | 动态 DOM 构建、按钮状态机、Toast/Message | Filled |
| [Lifecycle & Async](./hook-guidelines.md) | 无 React:生命周期结构与异步助手约定 | Filled |
| [State Management](./state-management.md) | storage 为真源、内存态、遗留迁移 | Filled |
| [Quality Guidelines](./quality-guidelines.md) | 禁止项与必需项 | Filled |
| [Type Safety](./type-safety.md) | 无 TS:JSDoc + 运行时校验 | Filled |

---

## 本层核心约束速查

1. **所有逻辑必须等 `DOMContentLoaded`** —— 脚本在 `<head>` 后于 `<body>` 末尾加载,但惯例仍是等待
2. **动态元素必须用 `document.createElement`** —— 禁止 `innerHTML` 拼接用户数据
3. **状态唯一真源是 `chrome.storage.sync`** —— 内存态仅为渲染缓存,每次打开重新读取
4. **按钮的行为由"是否已添加"决定** —— 已添加 → 删除按钮;未添加 → 添加按钮
5. **Toast(2000ms)/Message(3000ms)超时必须复用共享常量** —— 当前存在不一致,见 Common Mistakes
6. **用户可见文案一律中文**

---

**Language**: 中文(跟随现有 UI 文案)