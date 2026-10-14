# 插件规则读写切换到 mihomo yaml 格式

## Goal

让插件管理的规则文件与 mihomo `rule-providers` 的 `behavior: domain` + `format: yaml` 契约一致：

1. **写入**改为 yaml `payload` 格式（`  - '+.example.com'`）
2. **读取/判重/删除** 兼容四种既有写法，使历史手工录入的数据无需清理
3. 默认分组路径改为 `direct.yaml` / `proxy.yaml`

改完之后，`daili` 仓库里 `mihomo/direct.yaml`、`mihomo/proxy.yaml` 成为插件的直接编辑对象，配合 Clash provider 名的 `PUT /providers/rules/<name>` 即时生效，不再依赖任何 CI。

## Background

### 现状链路

```
popup.js ──▶ GitHubAPI.addDomainToFile(path, domain)
                 │
                 └─ content.includes(`DOMAIN-SUFFIX,${domain}`)
                    newContent += `DOMAIN-SUFFIX,${domain}\n`
```

写入的是 Surge/clash-classic 文本格式。目标仓库 `2263075977/daili` 中：

- `mihomo/config.yaml` 通过 `rule-providers.private_direct/private_proxy` 拉取的是 **`behavior: domain` + `format: yaml`** 的文件（`yaml-domain` 锚点）
- 这两个 provider 指向 `direct.yaml` / `proxy.yaml`
- `direct.txt` / `proxy.txt` 是 `generate-surge-direct.yml` 从 yaml **单向生成**的派生物

即：**插件今天写的 `.txt` 与 Clash 实际读取的 `.yaml` 已经不是同一份数据。**

### 已验证的事实（本次排查结论）

| # | 事实 | 依据 |
|---|------|------|
| 1 | 仓库中 `direct.yaml`/`proxy.yaml` 与对应 `.txt` 当前**逐条一致**（各 35 / 26 条，无差异） | 归一化后 `comm` 对比为空 |
| 2 | 10 条规则以 yaml **裸值**存在，语义上等价于 `DOMAIN,` 而非 `DOMAIN-SUFFIX,`：`sub.xn--9swa.com`、`www.ahhhhfs.com`、`www.ruanyifeng.com`、`idai.ly`、`i.pximg.org`、`i.pixiv.re`、`tracker.cinefiles.info`、`subscribe.insight.synology.com`、`new.sharedchat.cc`（direct）+ `jiuuij.de5.net`（proxy） | 解析 `direct.yaml` / `proxy.yaml` |
| 3 | 插件三处硬编码 `DOMAIN-SUFFIX,${domain}`：`checkDomainExists` / `addDomainToFile` / `removeDomainFromFile` | `github-api.js` |
| 4 | `.txt` 存在时 Action 会整体重写它；`.yaml` 是源头，Action **不**触碰 | `.github/workflows/generate-surge-direct.yml`、`scripts/convert_clash_direct_to_surge.py` |
| 5 | mihomo 通配符语义：`+.a.com` = 含 `a.com` 的多级后缀；`.a.com` = 多级但不含 `a.com` 本身；裸 `a.com` = 精确；`*.a.com` = 仅一级子域 | [mihomo 语法手册 · 域名通配符](https://wiki.metacubex.one/handbook/syntax/#domain-wildcards) |
| 6 | mihomo 单行 `#` 注释解析为 YAML null 元素，**不报错** | [mihomo 语法手册 · 注释](https://wiki.metacubex.one/handbook/syntax/) |
| 7 | `behavior: domain` 的文件里混入 classic 格式行会被静默忽略（不匹配任何域名），非报错 | [规则集合内容](https://wiki.metacubex.one/config/rule-providers/content/) |
| 8 | PAT 推送会触发 workflow，`GITHUB_TOKEN` 推送不会 | GitHub Actions 既有行为 |

### 本次明确不做（已与用户确认）

- `mihomo/ai.txt` 相关：忽略（用户表示用不到）
- `sing-box/config.json` / `private_*.json` 同步：忽略（后续手动）
- `mihomo/config.yaml` 的 `proxy-providers.zj.url` 空值、provider 的 `proxy: DIRECT`、`custom_port_direct` 命名：后续手动
- 删除 `.txt` 或改造 Action：暂不动（见 R5）
- 那 10 条裸值规则的语义修正（是否该升级为后缀匹配）：不动，靠读取层兼容
- `popup.js` 的 `extractRootDomain`、CSP、`options.js` 内联 fetch 等既有技术债：不在本任务范围

## Requirements

### R1 — 写入格式切换为 yaml

写入的规则行统一为 `  - '+.${domain}'`（两空格缩进 + 单引号 + `+.` 前缀），与 `direct.yaml` 现有风格一致。

- 追加位置：**最后一个 `- ` 规则行之后**，而非文件末尾。理由：现有 yaml 的分组注释位于各组块**之前**，末尾追加会把新域名丢到最后一个注释块名下，形成语义错误的注释归属
- 文件为空（含 404 新建）或**不含任何规则行**（如只有注释）时：生成 `payload:\n  - '+.${domain}'\n`
- 追加前修补行尾 `\n`（沿用既有约定，见 `spec/backend/quality-guidelines.md`）
- 缩进按该文件**已存在的规则行缩进**推断，退化默认 2 空格

### R2 — 读取层兼容四种写法

新增纯函数把规则行归一化为 `{ kind: 'suffix' | 'exact' | 'wildcard' | 'keyword', value: string } | null`：

| 写法 | kind | value |
|------|------|-------|
| `'+.example.com'` / `DOMAIN-SUFFIX,example.com` | `suffix` | `example.com` |
| `'example.com'`（yaml 裸值） / `DOMAIN,example.com` | `exact` | `example.com` |
| `'*.example.com'` / `'.example.com'` | `wildcard` | `example.com` |
| `DOMAIN-KEYWORD,foo` | `keyword` | `foo` |
| 其他（`GEOSITE,` / `IP-CIDR,` / `RULE-SET,` / 注释 / 空行） | `null` | — |

**判重规则**（`isDomainCovered`）：

- `checkDomainExists(path, domain)` 返回 true 当且仅当存在一条规则满足：
  - `kind === 'suffix'` 且 `value === domain`，或
  - `kind === 'exact'` 且 `value === domain`
- `wildcard` 与 `keyword` **不参与**判重（避免误判），也永不被插件写入
- 大小写不敏感（域名统一小写比较）
- 尾随点（`example.com.`）归一化时去除

> 语义说明：`suffix` 与 `exact` 对"输入就是根域名"的场景结果相同（`+.example.com` 覆盖 `example.com`），因此二者都算命中。这正是让 10 条裸值规则无需清理就能被正确识别的关键。

### R3 — 删除语义

`removeDomainFromFile` 删除**所有**归一化后等于目标 `{kind: suffix|exact, value: domain}` 的行，其余行**逐字节保留**（含注释、空行、引号风格、缩进）。

- 删除必须按**解析后的语义**比对，而非子串或字面量——否则删 `+.'a.com'` 会漏掉裸 `a.com`
- 文件中无匹配时抛业务错误 `该域名不存在于规则文件中`（沿用既有文案）
- 删除后若 `payload:` 下已无规则行，**保留** `payload:` 与注释（不清理空结构，交由用户决定）

### R4 — 默认分组路径与文案

- `shared.js` 的 `defaultRuleGroups` 改为 `direct.yaml` / `proxy.yaml`
- 保留 `type: 'direct' | 'proxy'` 字段（`popup.js` 的 `getButtonClass` 依赖）
- `options.js` 的路径输入 `placeholder` 由 `规则文件路径 (如: office.txt)` 改为 `(如: office.yaml)`
- 不修改迁移逻辑（遗留键 `directFile`/`proxyFile` 分支照旧，只是其产出路径来自用户旧配置）

### R5 — `.txt` 与 Action 的处理（只加不改）

- **不修改** `.github/workflows/generate-surge-direct.yml` 与 `scripts/convert_clash_direct_to_surge.py`
- 原因：PAT 推送触发 workflow 后，脚本会重新生成 `.txt`，使其与 yaml 保持同步。`.txt` 从"会被覆盖的隐患"变为"无害的派生产物"，无需人工维护
- 因此切到 yaml 后**不要**同时保留 `.txt` 作为分组路径

### R6 — 文档同步

- `README.md`：规则文件格式示例改为 yaml、文件结构树补 `direct.yaml/proxy.yaml`、FAQ 中"文件不存在/格式"相关表述对齐、删除对 `.txt` 的强绑定描述
- `spec/backend/database-guidelines.md`：`Group.path` 示例、GitHub 规则文件契约表（格式/判重/删除语义）更新
- `spec/backend/quality-guidelines.md`：人工验证清单的规则文件示例更新
- `spec/frontend/*.md`：涉及 `direct.txt` / `DOMAIN-SUFFIX` 字样的契约表与验证清单更新
- 新增约定须写回 spec（写入位置、缩进推断、判重矩阵）

## Acceptance Criteria

### 代码行为

- [ ] `github-api.js` 中不再存在字面量 `DOMAIN-SUFFIX,${domain}` 的拼接
- [ ] 归一化函数对 R2 表格中 5 类输入 + 3 类忽略输入（注释 / 空行 / 非域名规则）返回预期值
- [ ] `checkDomainExists('direct.yaml', 'mcii.cc')` → true（`+.` 后缀命中）
- [ ] `checkDomainExists('direct.yaml', 'www.ruanyifeng.com')` → true（裸值精确命中）
- [ ] `checkDomainExists('direct.yaml', 'sub.www.ruanyifeng.com')` → false（裸值不是后缀）
- [ ] 对含 `DOMAIN,milktea.fun` 与 `DOMAIN-SUFFIX,milktea.fun` 混排的旧 txt，`checkDomainExists` 与 `removeDomainFromFile` 都判定为命中并全部删除
- [ ] 向 `direct.yaml` 添加新域名后：`payload:` 结构完好、新行位于最后一个规则行之后、所有既有注释与空行逐字节保留
- [ ] 向空文件 / 只有注释的文件添加：产出合法 yaml（`payload:` + 一行）
- [ ] 删除后文件仍可被 `yaml.safe_load`（或等价解析）成功解析

### 人工验证（沿用 spec 清单，补齐本任务项）

- [ ] 中文注释读-改-写后完好无损
- [ ] 文件末尾无换行符时新规则另起一行
- [ ] 同名 `path` 的分组并发点击：第二次提示"操作进行中"，无重复行
- [ ] 409 冲突路径仍会重读 `sha` 后重试一次

### 文档

- [ ] `README.md` 无 `DOMAIN-SUFFIX,` 作为推荐格式的残留
- [ ] 更新后的 spec 三份文件中，GitHub 规则文件契约表与实现一致
- [ ] `grep -rn "direct\.txt\|proxy\.txt" --include="*.md" --include="*.js" --include="*.html" .`（排除 `.trellis/tasks/`）结果与实现口径一致

### 不破坏

- [ ] `git status --short .pi .agents AGENTS.md .trellis/scripts .trellis/workflow.md` 输出为空
- [ ] 未新增依赖、未引入构建步骤、未新增 `<script>` 引用
- [ ] `clash-api.js` / `manifest.json` / `popup.js` 的业务逻辑未被改动（`popup.js` 仅透传 `group.path`，预期 0 改动）
