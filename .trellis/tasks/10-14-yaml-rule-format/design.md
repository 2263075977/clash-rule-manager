# 技术设计

## 1. 数据契约的变更点

契约变更只发生在一个边界：**`GitHubAPI` 与规则文件内容之间**。

```
popup.js ──▶ GitHubAPI.addDomainToFile(path, domain)
                    │
     ┌──────────────┴───────────────┐
     │  变更前                       │  变更后
     │  content.includes(           │  isDomainCovered(content, domain)
     │    `DOMAIN-SUFFIX,${d}`)     │      ↓
     │  newContent += `DOMAIN-      │  appendRule(content, domain)
     │    SUFFIX,${d}\n`            │      ↓ `  - '+.d'`
     └──────────────────────────────┘
```

对上游零影响：`popup.js` 只透传 `group.path` 与 `currentDomain`，`options.js` 只存路径字符串。二者都不解析文件内容。

## 2. 新增的三个纯函数

全部放在 `github-api.js` 顶层，与 `base64Encode` / `base64Decode` 同级（该文件已有顶层纯函数的先例）。**不引入新文件、不新增 `<script>` 引用。**

### 2.1 `parseRuleLine(rawLine)`

```js
/**
 * 把一行规则归一化为 { kind, value }。
 * @param {string} rawLine
 * @returns {{kind: 'suffix'|'exact'|'wildcard'|'keyword', value: string} | null}
 */
```

解析流水线（顺序不可调换）：

| 步骤 | 操作 | 理由 |
|------|------|------|
| 1 | 非字符串或 trim 后为空 → `null` | 空行 |
| 2 | 首字符为 `-` → 去掉 `-` 后 trim | yaml 数组项；classical 行落在 yaml `payload` 里时同样带 `-` |
| 3 | 从**第一个** `#` 处截断 | 行尾注释；域名不含 `#`，无需引号感知 |
| 4 | 去掉成对的包裹引号（`'` / `"`） | yaml 推荐写法 `- '+.a.com'` |
| 5 | 前缀判定（见下表） | — |
| 6 | 兜底 hostname 字符集校验 `/^[a-z0-9*][a-z0-9\-.*]*$/i`，不通过 → `null` | 挡掉 `payload:`、`geodata-mode:` 等含 `:` 的键行 |

前缀判定表：

| 输入前缀 | kind | value |
|---------|------|-------|
| `DOMAIN-KEYWORD,` | `keyword` | 其后内容 |
| `DOMAIN-SUFFIX,` | `suffix` | 其后内容 |
| `DOMAIN,` | `exact` | 其后内容 |
| `+.` | `suffix` | 去掉 `+.` |
| `*.` | `wildcard` | 去掉 `*.` |
| `.` | `wildcard` | 去掉前导 `.` |
| 无前缀、通过字符集校验 | `exact` | 整串 |

`value` 一律经 `normalizeDomain()`：小写 + 去除尾随点（`example.com.` → `example.com`）。

**为什么 `.a.com` 归为 `wildcard`（不参与判重）而非 `suffix`**

mihomo 语义里 `.a.com` 匹配子域但**不**匹配 `a.com` 本身，与 `+.` 不同（[语法手册](https://wiki.metacubex.one/handbook/syntax/#_10)）。两种归类都有代价：

- 归 `suffix`：文件里有 `.a.com` 时添加 `a.com` 会报"已存在" → 用户无法添加
- 归 `wildcard`：添加后文件同时有 `.a.com` 与 `+.a.com`，删除 `a.com` 不会移除 `.a.com`

选后者，因为它是**非破坏性**的：插件既不谎报"已存在"，也绝不删除其他工具写入的行。仓库中不存在 `.` 前缀规则，此处仅为防御。

### 2.2 `isDomainCovered(content, domain)`

```js
function isDomainCovered(content, domain) {
  const target = normalizeDomain(domain);
  if (!target) return false;
  for (const line of content.split('\n')) {
    const rule = parseRuleLine(line);
    if (!rule) continue;
    if (rule.kind !== 'suffix' && rule.kind !== 'exact') continue;
    if (rule.value === target) return true;
  }
  return false;
}
```

- 只认 `suffix` / `exact`。`wildcard`、`keyword` 不判重（keyword 是子串语义，无法与具体域名等价比较；且插件不写这两种）
- 语义等价性：`+.example.com` 覆盖 `example.com`（mihomo 通配符定义），`DOMAIN,example.com` 精确匹配 `example.com` → 两者对"根域名"结果相同，故均可判为命中

**相较旧实现的净收益**：旧实现是 `content.includes('DOMAIN-SUFFIX,' + domain)` 子串匹配，缺陷是同一语义的 `DOMAIN,` / 裸值写法被判为"不存在"，导致重复添加与无法删除。新实现按语义比对，**顺带消除了子串误匹配类问题**。

### 2.3 `appendRule(content, domain) → string`

```js
function appendRule(content, domain)   // 返回新的完整文件内容
```

写入行固定为 `- '+.${normalizeDomain(domain)}'`。

**插入锚点优先级**：

1. **最后一个符合 `parseRuleLine` 的行**之后（缩进沿用该行）— 正常路径
2. 否则若存在 `^\s*payload\s*:\s*$` 行 → 紧随其后插入，缩进 2 空格 — 文件有 `payload:` 但还没有任何规则（如新建后只填了注释）
3. 否则 → 重建：剥掉尾部空行，追加 `payload:` + 一行规则 + 空行 — 空文件（含 404 路径的 `content === ''`）

**为什么用锚点 1 而不是简单追加到 EOF**：现有 yaml 的注释是**块前置**的（`# pt` 在 `- '+.u2.dmhy.org'` 之前）。追加到 EOF 会让新域名落在最后一个注释块名下（例如新加一个直连域名后，它看起来属于 `# 各种机场` 分组）——语义性注释错误，比格式错误更难发现。

**为什么必须处理锚点 3 的 `payload:` 去重**：`content` 若为 `payload:\n# 暂无\n`（有键无项），直接追加 `payload:` 会产生**重复键**，go-yaml v3 对重复键报错，Clash 会加载失败。

**为什么必须保留缩进推断**：`direct.yaml` 用 2 空格，但 `Group.path` 是用户可配的任意文件，硬编码缩进在 4 空格缩进的文件里会产生结构错误（把新行变成前一元素的子键）。

**行尾修补**：插入后若结果不以 `\n` 结尾则补一个（沿用 `spec/backend/quality-guidelines.md` 的既有约定）。

## 3. `removeDomainFromFile` 的删除谓词

```js
for (const rawLine of lines) {
  const rule = parseRuleLine(rawLine);
  const hit = rule
    && (rule.kind === 'suffix' || rule.kind === 'exact')
    && rule.value === target;
  if (hit) { removed++; continue; }   // 丢弃该行
  kept.push(rawLine);                  // 其余逐字节保留
}
if (removed === 0) throw new Error('该域名不存在于规则文件中');
```

- **所有**匹配行都被删除（不只是第一条）。这就是"同一域名的 `DOMAIN,` 与 `DOMAIN-SUFFIX,` 两种写法并存"能被一次性清掉的原因
- 非匹配行原样入 `kept`，因此引号风格（`'x'` vs `x`）、缩进、注释、空行**逐字节不变**
- `removed === 0` 时抛既有业务错误，UI 文案映射不受影响
- 副作用：原文件末尾无换行时，删除后会被补上 `\n`。这是收敛到规范形态，可接受

**不做空结构清理**：若删完 `payload:` 下无规则行，保留 `payload:` 与注释。理由：自动删除用户手写的注释是越权行为；且 `payload:` 空数组对 mihomo 合法。

## 4. 明确不改动的部分

| 位置 | 决策 | 理由 |
|------|------|------|
| 锁 + 409 重试的脚手架 | **保留**，不提取公共 helper | `addDomainToFile` / `removeDomainFromFile` 的脚手架重复确实存在（见 `spec/guides/code-reuse-thinking-guide.md`），但本任务已在两处改核心逻辑，同时重构会让 diff 无法逐行 review 并发语义；另立任务 |
| 遗留键迁移的回落路径 `'direct.txt'`（`popup.js` / `options.js` 各一处） | **保留 `.txt`** | 该分支仅当用户设了 `directFile`/`proxyFile` 中**恰好一个**时才走到。旧用户的另一个文件从来就是 `.txt`，改成 `.yaml` 反而会指向不存在的文件 |
| `popup.js` | 预期 **0 改动** | 只透传 `group.path`，不解析内容 |
| `options.js` | 仅 1 处 placeholder 文案 | 同上 |
| `clash-api.js` / `manifest.json` | **0 改动** | 与文件格式无关 |
| Action 与 converter 脚本 | **0 改动** | 见下节 |
| `mihomo/ai.txt` / `sing-box/*` / `config.yaml` 其他问题 | **0 改动** | 用户明确排除 |

## 5. 与 CI 的相互作用（为什么不需要改 Action）

`scripts/convert_clash_direct_to_surge.py` 用 `mode = "suffix"` 作为默认状态，且 `if value.startswith("+.") → DOMAIN-SUFFIX`。插件写入的 `+.domain` 恰好落在这条分支上 → 转换结果正确。

触发链：

```
插件用 PAT 提交 mihomo/direct.yaml
  → push 事件（PAT 推送会触发 workflow；GITHUB_TOKEN 推送不会）
  → generate-surge-direct.yml
  → python3 convert_clash_direct_to_surge.py
  → 重新生成 mihomo/direct.txt / proxy.txt
```

因此切到 yaml 后 `.txt` 仍是**派生产物**，无需人工维护，也不会 stale。用户在插件设置里只需改用 `.yaml` 路径即可放弃 `.txt`。

## 6. 设置侧的必要人工动作（非代码）

| 分组 | path | Clash Provider 名称 |
|------|------|-------------------|
| 直连规则 | `direct.yaml` | `private_direct` |
| 代理规则 | `proxy.yaml` | `private_proxy` |

Provider 名必须与 `mihomo/config.yaml` 的 `rule-providers` 键名一致，插件才能 `PUT /providers/rules/<name>` 立即刷新（`provider` 默认值为空，故需显式填写）。不填的后果只是退化为按 `interval: 86400` 一天一拉——功能正确但体验差。

## 7. 验证策略

无测试框架（`spec/backend/quality-guidelines.md` 已确认）。`github-api.js` 的顶层 `function` 声明在 `vm` 上下文中可直接取用，故用一次性脚本 `vm.runInNewContext` 加载该文件并直接调用三个纯函数，覆盖 PRD 的 R1/R2/R3 全部断言。该脚本**不入库**（放临时目录），避免为一次验证引入测试基建。

同时用 `git show HEAD:mihomo/direct.yaml` 的真实内容作为 fixture，验证"读-改-写"后注释与空行逐字节不变。

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| yaml 结构被写坏 → mihomo 加载失败 | 验证脚本对每种输入断言输出可被解析（用 `js-yaml` 若不可用则断言结构行数/`payload:` 唯一性）；并在真实 fixture 上人工 diff |
| 缩进推断错误 | 仅从**已存在规则行**的前导空白推断；无规则行时固定 2 空格（与仓库现状一致）|
| 重复 `payload:` 键 | 锚点 3 的分支显式查找已存在的 `payload:` 键 |
| 判重过宽导致无法添加 | 只有 `suffix`/`exact` 参与判重；`wildcard`/`keyword` 明确排除 |
| 误删他工具写入的行 | 删除严格按 `{kind, value}` 精确相等；`wildcard`/`keyword` 永不匹配 |
| 中文注释损坏 | 未触碰 `base64Encode`/`base64Decode`；验证脚本含中文注释 fixture |