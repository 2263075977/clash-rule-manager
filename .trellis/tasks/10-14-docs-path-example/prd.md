# README 与 spec 的规则文件路径示例补齐子目录前缀

## Goal

把「`Group.path` 是**仓库根**相对路径,文件在子目录时必须带前缀」这件事在 README 与 spec 里显式化,
避免用户照抄示例 `direct.yaml` 后,因 GitHub Contents API 返回 404 而被**静默当成空文件**,
在 popup 里看到「未添加到任何规则」却查不出原因。

本次**纯文档改动**,不动代码。

## Background

### 触发场景(已实测复现)

用户实际仓库 `2263075977/daili` 的目录结构是:

```
daili/
├── mihomo/
│   ├── direct.yaml     ← 插件要编辑的真实位置
│   ├── proxy.yaml
│   ├── direct.txt      ← 由 CI 从 yaml 生成的 Surge 派生物
│   └── proxy.txt
├── scripts/
└── sing-box/
```

仓库根目录**没有** `direct.yaml`。插件设置里按文档示例填 `direct.yaml` 后:

- 请求 `GET /repos/.../contents/direct.yaml` → **404**
- `getFileContent` 对 404 的契约是「视为空文件返回 `{content:'', sha:null}`,不报错」
  (见 `spec/backend/error-handling.md` 的「404 不是错误」)
- 空内容里找不到目标域名 → popup 显示 `📌 未添加到任何规则`

用户实测把路径改成 `mihomo/direct.yaml` 后,显示恢复为 `✅ 已在 直连规则 中`。

### 已验证的对照矩阵

用路径敏感桩(仅 `mihomo/direct.yaml` 存在)测 `checkDomainExists(..., 'pterclub.net')`:

| 配置 path | 旧代码 | 新代码 | 界面文案 |
|-----------|--------|--------|---------|
| `mihomo/direct.yaml` | false | **true** | `✅ 已在 直连规则 中` |
| `mihomo/direct.txt` | true | true | `✅ 已在 直连规则 中` |
| `direct.yaml` | false | false | `📌 未添加到任何规则` |
| `direct.txt` | false | false | `📌 未添加到任何规则` |

结论:**与本次格式切换无关**,缺 `mihomo/` 前缀时新旧代码都判定为「未添加」。
即该缺陷在上一版 `.txt` 时代就已存在,只是没被察觉。

### 文档缺陷定位(本次要修的对象)

| 文件 | 行 | 现状 | 问题 |
|------|----|------|------|
| `README.md` | 82 | `\| 规则文件路径 \| ✅ \| 仓库内相对路径,如 `direct.yaml` \|` | 未说明相对**哪一层**,示例会诱导根目录 |
| `README.md` | 144-152 | 结构树把 `direct.yaml` 画在仓库**根** | 未体现文件可在子目录 |
| `README.md` | 171 | FAQ 只讲 `.txt` vs `.yaml` | 无「路径前缀」相关排错项 |
| `spec/backend/database-guidelines.md` | 41 | `path: string, // 必填,仓库内相对路径(如 'direct.yaml')` | 同上 |
| `spec/backend/database-guidelines.md` | 102 | `\| 路径 \| Group.path 相对路径,如 direct.yaml \|` | 同上 |
| `spec/backend/database-guidelines.md` | 167 | `\| 文件路径 \| 小写 + .yaml \| direct.yaml、office.yaml \|` | 命名规范表未涉前缀 |
| `spec/frontend/state-management.md` | 99,102 | 默认路径/状态键示例 | 示例均为根目录形态 |
| `spec/frontend/quality-guidelines.md` | 180 | 「路径为 `direct.yaml` / `proxy.yaml`」 | 与默认值一致,需注明默认值可被用户覆盖为含前缀路径 |

## Requirements

### R1 — 明确 `Group.path` 的基准与拼接方式

在 README 与 `spec/backend/database-guidelines.md` 说明:

- `Group.path` 是**仓库根**相对路径,直接拼进 GitHub Contents API:
  `contents/${Group.path}`
- 文件位于子目录时**必须带目录前缀**(如 `mihomo/direct.yaml`)
- 该路径**同时**决定:写入位置、判重读取位置,以及 Clash provider（若填写）所指向的文件

### R2 — README 结构树体现「可在子目录」

改 `README.md` 的目标仓库结构树,使其不再暗示文件必在根目录:

- 保留 `direct.yaml` / `proxy.yaml` / `direct.txt` / `proxy.txt` 的说明
- 明确「示例为仓库根;若规则文件位于子目录,填写的路径需带上该前缀」,并给出 `mihomo/` 形态的对照
- 不得把 `mihomo/` 写成**强制**约定(插件支持任意仓库/任意路径)

### R3 — README 路径字段说明补前缀提示

`README.md` 的「规则文件路径」字段行,除现有「仓库内相对路径」外,补上子目录示例(如 `mihomo/direct.yaml`)。

### R4 — 新增 FAQ 排错项

在 `README.md` FAQ 增加一条,针对本场景:

> **Q: 文件里明明有这个域名,却显示「未添加到任何规则」?**
>
> A: 多为**路径前缀**问题。`Group.path` 是仓库根相对路径;若文件在子目录(如 `mihomo/`),
> 必须写成 `mihomo/direct.yaml`。拼错或漏写前缀时,读取不存在的文件**不会报错**
> (404 被视为空文件),因此表现为「未添加」而非错误提示。

位置:放在「Q: 提示"文件不存在"」与「Q: 应该把路径填成 `.txt` 还是 `.yaml`?」二者之间或其后,保持 FAQ 现有编号/层级风格。

### R5 — spec 契约同步

- `spec/backend/database-guidelines.md`
  - `Group` 对象契约的 `path` 注释:补「仓库根相对路径,子目录需带前缀」及示例
  - 「GitHub 规则文件」契约表的「路径」行:同样补充
  - 「Naming Conventions」表:文件路径一条补子目录说明
- `spec/frontend/state-management.md`
  - 「规则文件路径与格式」表:补一行或一句,说明 `path` 为仓库根相对路径、可含子目录前缀
  - 保留「默认路径 `direct.yaml` / `proxy.yaml`」原样(默认值不变)
- `spec/frontend/quality-guidelines.md`
  - 第 1 项验证期望:注明这是**默认值**;用户可改为含前缀的路径

### R6 — 明确不改动的部分

| 位置 | 决定 | 理由 |
|------|------|------|
| `shared.js` 的 `defaultRuleGroups` | **保持** `direct.yaml` / `proxy.yaml` | 默认值必须是**仓库无关**的通用值;写死 `mihomo/` 等于硬编码特定仓库结构,违反 `spec/backend/quality-guidelines.md` 的「禁止硬编码仓库坐标」精神 |
| `github-api.js` | **不改** | 404 → 空文件的契约是既有设计,本次问题源于文档而非代码 |
| `popup.js` / `options.js` / `clash-api.js` / `manifest.json` / `*.html` | **不改** | 与本问题无关 |
| `options.js` 的 placeholder | **不改**(仍 `office.yaml`) | 通用示例,不宜写死目录 |

### 非目标(本次不做)

- 不给「读取到 404 但用户可能期望文件存在」增加告警或二次确认 —— 属产品行为变更,另有取舍,不在本次范围
- 不引入「自动探测 `mihomo/` 前缀」之类的隐式兜底 —— 隐式魔法会让路径语义更模糊
- 不修改目标仓库 `daili` 的任何文件

## Acceptance Criteria

### 文档

- [ ] `README.md` 中「规则文件路径」字段说明含子目录示例(`mihomo/direct.yaml` 形态)
- [ ] `README.md` 的目标仓库结构树明确「示例为仓库根,子目录需带前缀」,且未把 `mihomo/` 写成强制约定
- [ ] `README.md` FAQ 新增「文件里有该域名却显示未添加」的排错项,并点明 404 被静默视为空文件
- [ ] `spec/backend/database-guidelines.md` 的 `Group.path` 注释与「GitHub 规则文件」契约表均说明「仓库根相对路径,子目录需带前缀」
- [ ] `spec/frontend/state-management.md` 与 `spec/frontend/quality-guidelines.md` 的路径表述与上述口径一致
- [ ] `grep -n "仓库根\|子目录\|前缀" README.md .trellis/spec/backend/database-guidelines.md .trellis/spec/frontend/state-management.md` 能命中新增说明

### 不破坏

- [ ] `git status --short` 仅含 README 与 spec 文档,无 `.js` / `.html` / `manifest.json` 改动
- [ ] `shared.js` 的默认路径仍为 `direct.yaml` / `proxy.yaml`
- [ ] `git status --short .pi .agents AGENTS.md .trellis/scripts .trellis/workflow.md` 输出为空
- [ ] 无新增依赖、无构建步骤、无新增 `<script>` 引用

### 与实现一致性

- [ ] 文档所述「路径直接拼进 `contents/${path}`」与 `github-api.js` 的 `getFileContent` 实际实现一致
- [ ] 文档所述「404 不报错、视为空文件」与 `spec/backend/error-handling.md` 及代码一致

## Notes

- 事实依据均为本次会话实测(真实仓库 clone + 路径敏感桩 + 新旧代码对照矩阵),非推断
- 用户已实测确认:路径改为 `mihomo/direct.yaml` 后显示 `✅ 已在 直连规则 中`
- 顺带记录给用户的设置口径:`mihomo/direct.yaml` + Provider `private_direct`;`mihomo/proxy.yaml` + Provider `private_proxy`