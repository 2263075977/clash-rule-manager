# Backend Development Guidelines

> 本项目的"后端层"定位与服务层编码规范。

---

## Overview

本项目是 **Chrome/Edge Manifest V3 扩展**,没有传统意义上的服务端。本目录中的"backend"指:

| 归属 | 内容 | 文件 |
|------|------|------|
| 远端 I/O 层 | GitHub REST API 封装 | `github-api.js` |
| 本地 I/O 层 | Clash 外部控制器 API 封装 | `clash-api.js` |
| 持久化 | `chrome.storage.sync` 读写约定 | `options.js` 等 |
| 宿主上下文 | Chrome Extension APIs(`tabs`/`storage`/`runtime`) | `popup.js` |

> **为什么这样映射**: 这些代码的共性是"与外部世界打交道并返回结果/抛错",与 UI 渲染无关。UI 层见 `../frontend/`。

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | 模块职责、全局导出约定 | Filled |
| [Storage Guidelines](./database-guidelines.md) | `chrome.storage.sync` 键契约 + GitHub 文件持久化 | Filled |
| [Error Handling](./error-handling.md) | `error.status` 契约、404 语义、409 重试、错误矩阵 | Filled |
| [Quality Guidelines](./quality-guidelines.md) | 并发锁、UTF-8、缓存绕过 | Filled |
| [Logging Guidelines](./logging-guidelines.md) | console 约定与密钥脱敏 | Filled |

---

## 核心约束速查

1. **所有远端调用失败必须携带可判定的标识** —— HTTP 状态码走 `error.status`,业务失败走中文 message(见 `error-handling.md`)
2. **404 不等于失败** —— `getFileContent` 对不存在的文件返回空内容而非抛错
3. **并发写同一文件必须取锁** —— `GitHubAPI._locks`
4. **写入远端文件前必须 UTF-8 安全编解码** —— `base64Encode` / `base64Decode`
5. **绝不把 Token 写入日志、Toast 或导出提示以外的位置**

---

**Language**: 中文(跟随项目现有代码注释与文档语言)