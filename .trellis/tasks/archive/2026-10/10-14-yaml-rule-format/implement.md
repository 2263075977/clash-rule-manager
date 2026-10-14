# 执行计划

## 交付物

| # | 文件 | 改动 | 依据 |
|---|------|------|------|
| 1 | `github-api.js` | 新增 `normalizeDomain` / `parseRuleLine` / `isDomainCovered` / `appendRule`；改写 `checkDomainExists` / `addDomainToFile` / `removeDomainFromFile` 的核心逻辑 | design.md §2 §3 |
| 2 | `shared.js` | `defaultRuleGroups` 路径 → `direct.yaml` / `proxy.yaml` | PRD R4 |
| 3 | `options.js` | `pathInput.placeholder` → `规则文件路径 (如: office.yaml)` | PRD R4 |
| 4 | `README.md` | 规则格式示例改 yaml、文件结构树、FAQ 对齐、去掉 `.txt` 强绑定 | PRD R6 |
| 5 | `.trellis/spec/backend/database-guidelines.md` | `Group.path` 示例、GitHub 规则文件契约表、判重/删除语义重写 | PRD R6 |
| 6 | `.trellis/spec/backend/quality-guidelines.md` | 验证清单第 9 项示例、追加位置约定 | PRD R6 |
| 7 | `.trellis/spec/frontend/state-management.md` | 涉及规则文件格式/路径的表述 | PRD R6 |
| 8 | `.trellis/spec/frontend/quality-guidelines.md` | 验证清单中的文件示例 | PRD R6 |

**明确不改**：`popup.js`、`clash-api.js`、`manifest.json`、`.github/workflows/*`、`scripts/*`、`mihomo/*`、`sing-box/*`。

## 顺序

1. **先写代码，再写验证脚本跑通，最后改文档** —— 文档口径必须来自已验证的实现，而不是设计意图
2. `github-api.js` 是唯一有风险的改动，一次做完三个函数 + 三个方法，避免半成品状态
3. `shared.js` / `options.js` 各一行，随后
4. 验证脚本在真实 fixture 上跑完并人工复查 diff，再动 `.md`
5. spec 先于 README（README 口径与 spec 一致）

## 实施要点

### `github-api.js`

- 四个新函数放在 `base64Encode` 之后、`class GitHubAPI` 之前（与既有顶层函数同区）
- 保持 `module.exports` 守卫不变；**不要**新增导出（避免动 `spec/backend/directory-structure.md` 的导出契约表）
- `checkDomainExists` 签名不变，仍直接返回 boolean 且让 401/403/网络错误向上传播
- `addDomainToFile` / `removeDomainFromFile` 的**锁 + 409 重试脚手架逐字保留**，只替换 `attempt` 内部的三行核心逻辑
- 不改 `commitMessage` 格式（`Add ${domain} to ${filePath}`），减少无谓 diff
- 不引入 `yaml` 库依赖（插件无依赖、无构建）——手写行级操作

### 验证脚本（临时，不入库）

路径：系统临时目录，例如 `/tmp/verify-rules.js`（Windows 下用 Git Bash 的 `/tmp`）。

```js
const fs = require('fs'), vm = require('vm');
const ctx = { console, TextEncoder, TextDecoder, btoa, atob, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync('E:/clash-rule-manager/github-api.js', 'utf8'), ctx);
// ctx.parseRuleLine / ctx.isDomainCovered / ctx.appendRule 可用
```

断言清单见下方"校验命令"。fixture 用 `git show HEAD:mihomo/direct.yaml` 的副本（届时该仓库不在本项目内，改为内联构造等价内容：含 `# pt` / `# jichang` 分组注释、`+.` 与裸值混排、末尾无换行）。

## 校验命令

```bash
# 1. 硬编码格式已清除
grep -n "DOMAIN-SUFFIX,\${domain}" github-api.js          # 期望 0 行

# 2. 默认路径已切换
grep -n "direct.yaml\|proxy.yaml" shared.js                # 期望 2 行

# 3. 未引入依赖 / 未新增 script 引用
git diff --stat manifest.json popup.html options.html      # 期望 options.html 无改动
ls package.json node_modules 2>&1                          # 期望均不存在

# 4. 验证脚本（纯函数 + 真实 fixture）
node /tmp/verify-rules.js

# 5. 文档口径一致
grep -rn "direct\.txt\|proxy\.txt\|DOMAIN-SUFFIX" \
  --include="*.md" --include="*.js" --include="*.html" . \
  | grep -v "^\./\.trellis/tasks/\|^\./\.git/\|^\./\.pi/\|^\./\.agents/"

# 6. Trellis 托管文件未被改动
git status --short .pi .agents AGENTS.md .trellis/scripts .trellis/workflow.md

# 7. 改动面复核（应只含预期的 3 个代码文件 + 文档）
git status --short
git diff --stat
```

## 验证脚本必须覆盖的断言

### A. `parseRuleLine`

| 输入行 | 期望 |
|--------|------|
| `  - '+.example.com'` | `{suffix, example.com}` |
| `  - "+.example.com"` | `{suffix, example.com}` |
| `  - '+.example.com'  # 注释` | `{suffix, example.com}` |
| `  - example.com` | `{exact, example.com}` |
| `  - 'example.com'` | `{exact, example.com}` |
| `- DOMAIN-SUFFIX,example.com` | `{suffix, example.com}` |
| `DOMAIN,example.com` | `{exact, example.com}` |
| `DOMAIN-KEYWORD,foo` | `{keyword, foo}` |
| `  - '*.example.com'` | `{wildcard, example.com}` |
| `  - '.example.com'` | `{wildcard, example.com}` |
| `  - 'Example.COM.'` | `{exact, example.com}`（小写 + 去尾点）|
| `# pt` | `null` |
| ``（空行）/ `   ` | `null` |
| `payload:` | `null` |
| `  - 'IP-CIDR,10.0.0.0/8'` | `null`（含 `:` 不过字符集校验；含 `/` 同理）|
| `geodata-mode: true` | `null` |
| `  - '+.a.com '+` 带尾随空格 | `{suffix, a.com}` |

### B. `isDomainCovered`

| content 关键行 | 查询 | 期望 |
|---------------|------|------|
| `'+.mcii.cc'` | `mcii.cc` | true |
| `'+.mcii.cc'` | `sub.mcii.cc` | false |
| `'sub.xn--9swa.com'`（裸值） | `sub.xn--9swa.com` | true |
| `'www.ruanyifeng.com'`（裸值） | `www.ruanyifeng.com` | true |
| `'www.ruanyifeng.com'`（裸值） | `ruanyifeng.com` | false |
| `'www.ruanyifeng.com'`（裸值） | `a.www.ruanyifeng.com` | false |
| `DOMAIN,milktea.fun` + `DOMAIN-SUFFIX,milktea.fun` 混排 | `milktea.fun` | true |
| `'*.a.com'` | `a.com` | false（wildcard 不判重）|
| `'*.a.com'` | `b.a.com` | false |
| `DOMAIN-KEYWORD,google` | `google` | false |
| `'+.a.com'` | `A.COM` | true（大小写不敏感）|
| `'+.a.com'` | `a.com.` | true（尾点归一化）|
| `'# a.com'`（纯注释） | `a.com` | false |
| `` 空内容 | `a.com` | false |

### C. `appendRule`

| 场景 | 期望 |
|------|------|
| 空字符串 | `payload:\n  - '+.a.com'\n` |
| `payload:\n`（有键无项） | 恰好 1 个 `payload:`；规则紧随其后 |
| `payload:\n# 暂无\n` | 恰好 1 个 `payload:`；**不**产生重复键 |
| 真实 fixture（含多个分组注释） | 新行位于最后一个规则行之后；所有 `#` 注释与空行**逐字节**不变；末尾有且仅有一个 `\n` |
| fixture 末尾无 `\n` | 新规则另起一行，未拼接 |
| 4 空格缩进的文件 | 新行沿用 4 空格 |
| `- '+.a.com'`（无缩进，classical 风格） | 新行不因缩进推断而错位（沿用 0 缩进或退化 2 空格，二选一并断言）|

### D. 读-改-写往返

用真实 fixture 副本：

1. `appendRule` 加 `test-domain.com` → 断言注释/空行逐字节不变、行数 +1
2. 再 `isDomainCovered(content, 'test-domain.com')` → true
3. 再模拟删除逻辑 → 内容与原 fixture **逐字节相等**（注释数、空行数、引号风格全部还原）

### E. 删除谓词

| 输入 | 删除 `milktea.fun` 后期望 |
|------|------------------------|
| 同时含 `- '+.milktea.fun'` 与 `DOMAIN,milktea.fun` | 两行都被删，其余不变 |
| 只含 `- 'milktea.fun'` | 该行被删 |
| 只含 `- '+.milktea.fun'` | 该行被删 |
| 含 `- 'sub.milktea.fun'` | **不**删（非相等）|
| 无匹配 | 抛 `该域名不存在于规则文件中` |
| 含中文注释行 | 保留且内容未变 |
| 含 `- '*.milktea.fun'` | **不**删（wildcard 不参与）|

## 风险

| 风险 | 缓解 |
|------|------|
| 改 `github-api.js` 时误碰锁/409 脚手架，引入并发回归 | `git diff` 逐行 review，确认 `attempt` 外层差异为 0；只改 `attempt` 内部 |
| yaml 写入破坏结构，CI/Clash 静默失败 | 验证脚本断言 `payload:` 唯一性 + 往返逐字节相等；真实 fixture 人工 diff |
| 文档与实现口径漂移 | 文档写在验证通过之后，用校验命令 5 双向核对 |
| 越界修改（`popup.js`、Action、`mihomo/*`） | 提交前 `git status --short` 对照交付物表，出现表外文件即回退 |
| 误以为需要清理 `.txt` | design.md §5 已论证：PAT 推送会触发 Action 重新生成，`.txt` 保持同步 |