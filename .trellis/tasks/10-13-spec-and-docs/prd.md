# 补齐 .trellis/spec 规范并同步文档

## Goal

将 `.trellis/spec/` 从通用占位模板填充为本项目**(Chrome/Edge Manifest V3 浏览器扩展)真实的编码约定**,并修正 `README.md` 中与实际代码/环境不符的内容。

## Background

`trellis init` 生成的 spec 全部为 `(To be filled by the team)` 占位。项目的实际技术形态与模板预设(通用前后端分层)差异较大,需要映射:

| 模板层 | 本项目对应物 |
|--------|-------------|
| `frontend/` | **扩展 UI 层**:`popup.*`、`options.*`(原生 DOM,无框架) |
| `backend/` | **服务/API 层**:`github-api.js`、`clash-api.js`、以及扩展宿主上下文(Chrome API) |
| `backend/database` | 本项目无数据库,"存储"= `chrome.storage.sync` + GitHub 文件(远端持久化) |
| `guides/` | 保留通用思考清单,补充本项目特有的触发条件 |

`README.md` 已知问题:安装路径写死为作者的 `D:\download\chajian`;功能列表与文件结构停留在早期版本(缺 `clash-api.js`、`shared.js`、多规则分组、Clash API 重载、配置导入导出);未提及 `provider` 字段。

## Requirements

### R1 — spec 内容必须由真实代码推导

每条约定需可溯源到具体文件/行,禁止臆测。至少覆盖以下已确认的代码事实:

- 无构建步骤、无模块系统,依赖 `<script>` **顺序加载**;跨文件符号(`GitHubAPI`、`ClashAPI`、`defaultRuleGroups`、`STATUS_CHECK_TIMEOUT`、`TOAST_DURATION`、`MAX_CONCURRENT_CHECKS`)为**全局**
- Base64 必须走 `TextEncoder`/`TextDecoder`(`github-api.js:4-21`),否则中文注释损毁
- `getFileContent` 对 404 **不抛异常**,返回 `{ content: '', sha: null }`
- `updateFile` 失败时在 Error 上挂 `status`(`github-api.js:99`)
- Per-file 锁 `GitHubAPI._locks`(`github-api.js:25`)
- 409 Conflict 自动重试完整读写流程
- Clash API 鉴权用 `Bearer`,`GitHub` 用 `token`
- `manifest.json` 的 `host_permissions` 仅含 `api.github.com`;Clash API 依赖 CSP `connect-src` 中的 `http:`
- `chrome.storage.sync` 键集合,含**遗留键** `directFile`/`proxyFile` → `ruleGroups` 迁移

### R2 — 记录已识别的真实风险点(作为 Forbidden/Anti-pattern)

- `popup.js` 全部逻辑嵌套在单个 `DOMContentLoaded` 回调内,状态(如 `domainStatusMap`)无法从外部测试
- 错误分类靠 `error.message.includes('401')` **字符串匹配**,脆弱
- 分组归一化逻辑在 `popup.js` 与 `options.js` **重复实现**
- 按钮渲染逻辑在 `renderActionButtons` / `updateButtonState` 重复
- `extractRootDomain` 仅覆盖硬编码的 7 个特殊 TLD,不覆盖 `github.io` 等公共后缀,且**不处理 IPv6**
- `options.js` 的 `showMessage` 硬编码 3000ms,未复用 `TOAST_DURATION`(2000ms)
- `exportSettings` 用 `chrome.storage.sync.get(null)`,**导出物包含明文 Token**

### R3 — README 同步

修正安装路径、补全功能列表、补全文件结构树、补全配置项(含 `provider`、Clash API、导入导出)、补 FAQ、并在安全说明中警示导出文件含 Token。

### R4 — 不破坏 Trellis 托管文件

`.trellis/spec/**` 不在 `.trellis/.template-hashes.json` 的 84 个托管文件中,可自由编辑;不得修改被托管文件(`.pi/**`、`.agents/**`、`.trellis/workflow.md`、`AGENTS.md` 区块内)。

## Acceptance Criteria

- [ ] `frontend/`(6 文件)+ `backend/`(6 文件)全部替换占位内容,无 `(To be filled by the team)` 残留
- [ ] 两个 `index.md` 的 Guidelines Index 状态列由 `To fill` 改为实际状态
- [ ] `guides/` 增加本项目特有触发条件(不重复已有通用内容)
- [ ] 每条硬性约定都带**可验证来源**(文件路径或行号)
- [ ] spec 全部含"Wrong vs Correct"或"Common Mistakes"类对照,而非纯原则
- [ ] `README.md` 不再出现 `D:\download\chajian`;文件结构与 `ls` 实际输出一致
- [ ] 全仓库(排除 `.trellis/`、`.agents/`、`.pi/`)无 `CLAUDE.md` 引用
- [ ] `git status` 干净,变更已提交并推送

## Out of Scope

- 不修改任何运行时代码(本次仅文档)
- 不新增构建/测试工具链
- 不重构已识别的重复逻辑(仅记录为待办)

## Notes

- spec 语言跟随项目现有语言(中文),项目内代码注释、README、UI 文案均为中文
- 重复逻辑与脆弱错误匹配仅**记录**,修复另立任务