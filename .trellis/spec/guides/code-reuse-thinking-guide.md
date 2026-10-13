# Code Reuse Thinking Guide

> **Purpose**: Stop and think before creating new code - does it already exist?

---

## The Problem

**Duplicated code is the #1 source of inconsistency bugs.**

When you copy-paste or rewrite existing logic:
- Bug fixes don't propagate
- Behavior diverges over time
- Codebase becomes harder to understand

---

## Before Writing New Code

### Step 1: Search First

```bash
# Search for similar function names
grep -r "functionName" .

# Search for similar logic
grep -r "keyword" .
```

### Step 2: Ask These Questions

| Question | If Yes... |
|----------|-----------|
| Does a similar function exist? | Use or extend it |
| Is this pattern used elsewhere? | Follow the existing pattern |
| Could this be a shared utility? | Create it in the right place |
| Am I copying code from another file? | **STOP** - extract to shared |

---

## 本项目已存在的重复实例(务必先读)

> 以下是**已经发生的**重复,新增代码前对照检查。修其中一个必须同时修另一个。

### 实例 1: 分组配置归一化 —— 两份

同一段"`ruleGroups` → 遗留键迁移 → 默认值"逻辑,在 `popup.js` 与 `options.js` 各写一份。

```js
// 两份几乎逐行相同
let groups = settings.ruleGroups;
if (!groups || groups.length === 0) {
  if (settings.directFile || settings.proxyFile) { /* 合成两分组 */ }
  else { groups = JSON.parse(JSON.stringify(defaultRuleGroups)); }
}
```

**风险**: 改迁移规则时只改一处 → popup 与 options 显示不同分组。
**注意**: 两处的 `groups` 用途不同(options 渲染表单、popup 渲染按钮),并非完全可提取 —— 但**归一化**部分应当提取。

### 实例 2: 按钮渲染 —— 两份

| 函数 | 时机 |
|------|------|
| `renderActionButtons()` | popup 打开时批量渲染 |
| `updateButtonState()` | 单次添加/删除后更新 |

两者的 class 判定、文案、`addEventListener` 绑定逻辑高度相似。

**风险**: 只改一处 → 初始态与更新后态表现不一致(典型:忘了同步 `dataset.originalText` 处理)。

### 实例 3: 超时时长 —— 常量与硬编码混用

```js
// popup.js —— 正确,用共享常量
setTimeout(() => { toast.classList.remove('show'); }, TOAST_DURATION);   // 2000ms

// options.js —— 硬编码,且取值不同
setTimeout(() => { message.classList.remove('show'); }, 3000);          // 3000ms
```

**风险**: 想统一调整提示时长时漏改一处,两界面不一致。

### 实例 4: HTTP 请求 —— 封装与内联混用

```js
// popup.js —— 复用封装
await api.addDomainToFile(filePath, currentDomain);

// options.js —— 内联 fetch(因 options.html 未加载 github-api.js)
const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { ... });
```

**原因**: `options.html:87-88` 只加载 `shared.js` 与 `options.js`。
**风险**: 内联版本没有 `error.status`、没有 409 重试、没有 `_locks`。添加同类调用时**优先补 `<script>` 并复用类**,而非再内联一份。

### 实例 5: 错误分类 —— 两份相似映射

`popup.js` 的 `addDomainToGroup` / `removeDomainFromGroup` 各自实现了一遍 message → 中文文案映射。

**风险**: 新增错误类型时只加一处。

---

## Common Duplication Patterns

### Pattern 1: Copy-Paste Functions

**Bad**: Copying a validation function to another file

**Good**: Extract to shared utilities, import where needed

### Pattern 2: Similar Components

**Bad**: Creating a new component that's 80% similar to existing

**Good**: Extend existing component with props/variants

### Pattern 3: Repeated Constants

**Bad**: Defining the same constant in multiple files

**Good**: Single source of truth, import everywhere

### Pattern 4: Repeated Payload Field Extraction

**Bad**: Multiple consumers cast the same JSON/event fields locally:

```typescript
const description = (ev as { description?: string }).description;
const context = (ev as { context?: ContextEntry[] }).context;
```

This is duplicated contract logic even when the code is only two lines. Each
consumer now has its own definition of what a valid payload means.

**Good**: Put the decoder, type guard, or projection next to the data owner:

```typescript
if (isThreadEvent(ev)) {
  renderThreadEvent(ev);
}
```

**Rule**: If the same untyped payload field is read in 2+ places, create a
shared type guard / normalizer / projection before adding a third reader.

---

## When to Abstract

**Abstract when**:
- Same code appears 3+ times
- Logic is complex enough to have bugs
- Multiple people might need this

**Don't abstract when**:
- Only used once
- Trivial one-liner
- Abstraction would be more complex than duplication

---

## After Batch Modifications

When you've made similar changes to multiple files:

1. **Review**: Did you catch all instances?
2. **Search**: Run grep to find any missed
3. **Consider**: Should this be abstracted?

### Reducers Should Use Exhaustive Structure

When state is derived from action-like values (`action`, `kind`, `status`,
`phase`), prefer a reducer with one `switch` over scattered `if/else` updates.

```typescript
// BAD - action-specific state transitions are hard to audit
if (action === "opened") { ... }
else if (action === "comment") { ... }
else if (action === "status") { ... }

// GOOD - one reducer owns the transition table
switch (event.action) {
  case "opened":
    ...
    return;
  case "comment":
    ...
    return;
}
```

This matters when the event log is the source of truth. A reducer is the
documented replay model; display code and commands should not duplicate pieces
of that replay model.

---

## Checklist Before Commit

- [ ] Searched for existing similar code
- [ ] No copy-pasted logic that should be shared
- [ ] No repeated untyped payload field extraction outside a shared decoder
- [ ] Constants defined in one place
- [ ] Similar patterns follow same structure
- [ ] Reducer/action transitions live in one reducer or command dispatcher

---

## Gotcha: Python if/elif/else Exhaustive Check

**Problem**: Python's if/elif/else chains have no compile-time exhaustive check. When you add a new value to a `Literal` type (e.g., `Platform`), existing if/elif/else chains silently fall through to `else` with wrong defaults.

**Symptom**: New platform works partially — some methods return Claude defaults instead of platform-specific values. No error is raised.

**Example** (`cli_adapter.py`):
```python
# BAD: "gemini" falls through to else, returns "claude"
@property
def cli_name(self) -> str:
    if self.platform == "opencode":
        return "opencode"
    else:
        return "claude"  # gemini silently gets "claude"!

# GOOD: explicit branch for every platform
@property
def cli_name(self) -> str:
    if self.platform == "opencode":
        return "opencode"
    elif self.platform == "gemini":
        return "gemini"
    else:
        return "claude"
```

**Prevention**: When adding a new value to a Python `Literal` type, search for ALL if/elif/else chains that switch on that type and add explicit branches. Don't rely on `else` being correct for new values.

---

## Gotcha: Asymmetric Mechanisms Producing Same Output

**Problem**: When two different mechanisms must produce the same file set (e.g., recursive directory copy for init vs. manual `files.set()` for update), structural changes (renaming, moving, adding subdirectories) only propagate through the automatic mechanism. The manual one silently drifts.

**Symptom**: Init works perfectly, but update creates files at wrong paths or misses files entirely.

**Prevention**:
- **Best**: Eliminate the asymmetry — have the manual path call the automatic one (e.g., `collectTemplateFiles()` calls `getAllScripts()` instead of maintaining its own list)
- **If asymmetry is unavoidable**: Add a regression test that compares outputs from both mechanisms
- When migrating directory structures, search for ALL code paths that reference the old structure

**Real example**: `trellis update` had a manual `files.set()` list for 11 scripts that `getAllScripts()` already tracked. Fix: replaced the manual list with a `for..of getAllScripts()` loop. See `update.ts` refactor in v0.4.0-beta.3.

---

## Template File Registration (Trellis-specific)

When adding new files to `src/templates/trellis/scripts/`:

**Single registration point**: `src/templates/trellis/index.ts`

1. Add `export const xxxScript = readTemplate("scripts/path/file.py");`
2. Add to `getAllScripts()` Map

That's it. `commands/update.ts` uses `getAllScripts()` directly — no manual sync needed.

**Why this matters**: Without registration in `getAllScripts()`, `trellis update` won't sync the file to user projects. Bug fixes and features won't propagate.

**History**: Before v0.4.0-beta.3, `update.ts` had its own hand-maintained file list that frequently fell out of sync with `getAllScripts()`. This caused 11 Python files to be silently skipped during `trellis update`. The fix was to eliminate the duplicate list and use `getAllScripts()` as the single source of truth.

### Quick Checklist for New Scripts

```bash
# After adding a new .py file, verify it's in getAllScripts():
grep -l "newFileName" src/templates/trellis/index.ts  # Should match
```

### Template Sync Convention

`.trellis/scripts/` (dogfooded) and `packages/cli/src/templates/trellis/scripts/` (template) must stay identical. After editing `.trellis/scripts/`, always sync:

```bash
rsync -av --delete --exclude='__pycache__' .trellis/scripts/ packages/cli/src/templates/trellis/scripts/
```

**Gotcha**: Running rsync with wrong source/destination paths can create nested garbage directories (e.g., `.trellis/scripts/packages/cli/...`). Always double-check paths before running.
