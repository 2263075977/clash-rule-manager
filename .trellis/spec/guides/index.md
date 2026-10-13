# Thinking Guides

> **Purpose**: Expand your thinking to catch things you might not have considered.

---

## Why Thinking Guides?

**Most bugs and tech debt come from "didn't think of that"**, not from lack of skill:

- Didn't think about what happens at layer boundaries → cross-layer bugs
- Didn't think about code patterns repeating → duplicated code everywhere
- Didn't think about edge cases → runtime errors
- Didn't think about future maintainers → unreadable code

These guides help you **ask the right questions before coding**.

---

## Available Guides

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | Identify patterns and reduce duplication | When you notice repeated patterns |
| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Think through data flow across layers | Features spanning multiple layers |

---

## Quick Reference: Thinking Triggers

### When to Think About Cross-Layer Issues

- [ ] Feature touches 3+ layers (API, Service, Component, Database)
- [ ] Data format changes between layers
- [ ] Multiple consumers need the same data
- [ ] You're not sure where to put some logic
- [ ] You are adding an event kind, JSONL record, RPC payload, or config field
- [ ] UI / command code starts casting raw payload fields directly

→ Read [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md)

### When to Think About Code Reuse

- [ ] You're writing similar code to something that exists
- [ ] You see the same pattern repeated 3+ times
- [ ] You're adding a new field to multiple places
- [ ] **You're modifying any constant or config**
- [ ] **You're creating a new utility/helper function** ← Search first!
- [ ] Two files read the same untyped payload field with local casts
- [ ] Multiple branches update the same derived state from `kind` / `action`

→ Read [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md)

### When to Think About Cross-Layer Issues (本项目专属)

- [ ] 改动 `chrome.storage.sync` 的**任意键** → 必须同步更新 `options.js` 的 load/save **和** `popup.js` 的读取
- [ ] 改动 `Group` 对象结构 → 必须检查三处消费点: `options.js`(读表单)、`popup.js`(渲染按钮)、迁移逻辑(两处重复)
- [ ] 改动 `manifest.json` 的 `host_permissions` 或 `content_security_policy` → Clash API 依赖 CSP 的 `connect-src http:`
- [ ] 新增 `<script>` 引用 → 确认该 HTML **是否**加载了所需模块(`options.html` 不加载服务类!)
- [ ] 改动 HTML 的 `id` 或动态元素的 `class` → 会静默破坏 `getElementById` / `querySelector`
- [ ] 服务层新增抛错路径 → 必须挂 `error.status`,否则 UI 层只能字符串匹配
- [ ] 新增共享常量 → 加到 `shared.js`,不要在各自文件硬编码

→ Read [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md)

### When to Think About Code Reuse (本项目专属)

- [ ] 要写"解析分组配置"逻辑 → **已存在两份**(`popup.js` / `options.js`),不要写第三份
- [ ] 要写"渲染分组按钮"逻辑 → **已存在两份**(`renderActionButtons` / `updateButtonState`)
- [ ] 要用 `setTimeout` 做提示 → 用 `TOAST_DURATION`,不要写 `2000` / `3000`
- [ ] 要限制并发数 → 用 `MAX_CONCURRENT_CHECKS`,不要写 `4`
- [ ] 要发 HTTP 请求 → 先看 `GitHubAPI` / `ClashAPI` 是否已封装该调用
- [ ] 要写 Base64 编解码 → **必须**用 `github-api.js` 的 `base64Encode`/`base64Decode`(UTF-8 安全)
- [ ] 要区分直连/代理样式 → 见 `getButtonClass`,注意其依赖中文名匹配的局限

→ Read [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md)

### When Verifying AI Cross-Review Results

- [ ] Reviewer claims "user input can be malicious" → Check the actual data source (internal manifest? user config? external API?)
- [ ] Reviewer flags "missing validation" → Is the data from a trusted internal source?
- [ ] Reviewer says "behavior change" → Read the code comments — is it intentional design?
- [ ] Reviewer identifies a "bug" in test → Mentally delete the feature being tested — does the test still pass? If yes → tautological test

**Common AI reviewer false-positive patterns**:
1. **Trust boundary confusion**: Treating internal data (bundled JSON manifests) as untrusted external input
2. **Ignoring design comments**: Flagging intentional behavior documented in code comments as bugs
3. **Variable misreading**: Not tracing a variable to its actual definition (e.g., Map keyed by path vs name)

**Verification rule**: Every CRITICAL/WARNING finding must be verified against the actual code before prioritizing. Budget ~35% false-positive rate for AI reviews.

---

## Pre-Modification Rule (CRITICAL)

> **Before changing ANY value, ALWAYS search first!**

```bash
# Search for the value you're about to change
grep -r "value_to_change" .
```

This single habit prevents most "forgot to update X" bugs.

---

## How to Use This Directory

1. **Before coding**: Skim the relevant thinking guide
2. **During coding**: If something feels repetitive or complex, check the guides
3. **After bugs**: Add new insights to the relevant guide (learn from mistakes)

---

## Contributing

Found a new "didn't think of that" moment? Add it to the relevant guide.

---

**Core Principle**: 30 minutes of thinking saves 3 hours of debugging.
