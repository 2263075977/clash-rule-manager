# State Management

> How state is managed in this project.

---

## Overview

This project uses **Chrome Extension APIs** for state management:

- **chrome.storage.sync** - Persistent configuration (synced across devices)
- **Local variables** - Transient UI state (page-scoped)
- **DOM state** - UI state reflected in element properties

**No state management library** (Redux, Zustand, etc.) is used.

---

## State Categories

### 1. Persistent Configuration (chrome.storage.sync)

**What**: User settings that persist across sessions and sync across devices.

**Storage**:
```javascript
await chrome.storage.sync.set({
  token: 'ghp_xxx',
  owner: 'username',
  repo: 'repo-name',
  branch: 'main',
  ruleGroups: [{ name: '直连', path: 'direct.txt' }]
});
```

**Retrieval**:
```javascript
const settings = await chrome.storage.sync.get(['token', 'owner', 'repo']);
```

**Examples**:
- options.js:122-166 - Save settings
- options.js:53-92 - Load settings with migration
- popup.js:64-103 - Load settings for rendering

**When to use**:
- User configuration (tokens, repo info)
- User preferences (rule groups)
- Data that needs to persist across browser restarts

---

### 2. Local Page State (Variables)

**What**: Temporary state scoped to a single page load.

**Pattern**:
```javascript
document.addEventListener('DOMContentLoaded', async () => {
  let currentDomain = ''; // Mutable state
  const defaultGroups = [...]; // Immutable config

  // State updates
  currentDomain = extractRootDomain(hostname);
});
```

**Examples**:
- popup.js:9 - `let currentDomain = ''`
- popup.js:11-14 - `const defaultRuleGroups = [...]`

**When to use**:
- Current page context (current domain, current tab)
- Temporary UI state (loading, error messages)
- Derived data that doesn't need persistence

---

### 3. DOM State (Element Properties)

**What**: UI state stored directly in DOM element properties.

**Pattern**:
```javascript
// Button state
button.disabled = true;
button.innerHTML = '<span class="loading"></span>处理中...';

// Element visibility
toast.className = 'toast success show';

// Form values
const token = document.getElementById('token').value;
```

**Examples**:
- popup.js:274-275 - Button loading state
- popup.js:323-324 - Toast visibility
- options.js:65-68 - Form field values

**When to use**:
- Loading states (button disabled, spinner visible)
- Form input values
- UI feedback (toast messages, status indicators)

---

## State Flow Patterns

### Configuration Load → Render

```javascript
// 1. Load from chrome.storage
const settings = await chrome.storage.sync.get(['ruleGroups']);

// 2. Apply defaults/migration
let groups = settings.ruleGroups || defaultRuleGroups;

// 3. Render UI
renderActionButtons(groups);
```

**Example**: popup.js:64-103

---

### User Action → Save → Feedback

```javascript
// 1. Collect form data
const token = document.getElementById('token').value.trim();

// 2. Validate
if (!token) {
  showMessage('请填写必填字段', 'error');
  return;
}

// 3. Save to chrome.storage
await chrome.storage.sync.set({ token });

// 4. User feedback
showMessage('设置已保存', 'success');
```

**Example**: options.js:122-166

---

### API Call → Update DOM

```javascript
// 1. Show loading state
button.disabled = true;
button.innerHTML = '<span class="loading"></span>添加中...';

try {
  // 2. API call
  await api.addDomainToFile(filePath, domain);

  // 3. Success feedback
  showToast('已添加', 'success');
} catch (error) {
  // 4. Error feedback
  showToast('添加失败', 'error');
} finally {
  // 5. Restore button state
  button.disabled = false;
  button.innerHTML = originalText;
}
```

**Example**: popup.js:272-313

---

## Data Migration Pattern

### Handling Legacy Configuration

```javascript
// Load both new and legacy keys
const settings = await chrome.storage.sync.get([
  'ruleGroups',  // New standard
  'directFile',  // Legacy
  'proxyFile'    // Legacy
]);

// Migrate if needed
let groups = settings.ruleGroups;
if (!groups || groups.length === 0) {
  if (settings.directFile || settings.proxyFile) {
    // Migrate from legacy format
    groups = [];
    if (settings.directFile) {
      groups.push({ name: '直连规则', path: settings.directFile });
    }
  } else {
    // Use defaults
    groups = defaultRuleGroups;
  }
}
```

**Example**: options.js:70-85, popup.js:77-89

**Why**: Ensures backward compatibility when configuration schema changes.

---

## State Synchronization

### Cross-Page Communication

**Problem**: Settings page updates config, popup needs to reflect changes.

**Solution**: Reload on focus or use `chrome.storage.onChanged`.

**Current approach**: Popup reloads settings on each open (popup.js:64).

**Example**:
```javascript
// Popup always loads fresh settings
const settings = await chrome.storage.sync.get(['token', 'owner', 'repo']);
```

---

## Common Mistakes

### ❌ Not Handling Missing Configuration

```javascript
// ❌ Bad: Assumes settings exist
const api = new GitHubAPI(settings.token, settings.owner, settings.repo);

// ✅ Good: Check first
if (!settings.token || !settings.owner || !settings.repo) {
  showToast('请先配置', 'error');
  return;
}
```

**Example**: popup.js:66-75

---

### ❌ Forgetting to Apply Defaults

```javascript
// ❌ Bad: Empty array if no settings
const groups = settings.ruleGroups || [];

// ✅ Good: Use default configuration
const groups = settings.ruleGroups || defaultRuleGroups;
```

**Example**: popup.js:77-89

---

### ❌ Not Restoring UI State on Error

```javascript
// ❌ Bad: Button stays disabled
button.disabled = true;
await operation(); // Throws error
button.disabled = false; // Never reached

// ✅ Good: Use try-finally
try {
  button.disabled = true;
  await operation();
} finally {
  button.disabled = false;
}
```

**Example**: popup.js:309-313

---

### ❌ Duplicating Default Values

```javascript
// ❌ Bad: Defaults defined in multiple places
// popup.js
const groups = settings.ruleGroups || [{ name: '直连', path: 'direct.txt' }];

// options.js
const groups = settings.ruleGroups || [{ name: '直连', path: 'direct.txt' }];

// ✅ Good: Define once, reference everywhere
const defaultRuleGroups = [
  { name: '直连规则', path: 'direct.txt', type: 'direct' },
  { name: '代理规则', path: 'proxy.txt', type: 'proxy' }
];
```

**Example**: popup.js:11-14, options.js:10-13

---

## Code References

- **chrome.storage.sync usage**: options.js:53-92, popup.js:64-103
- **Local state**: popup.js:9, options.js:123-138
- **DOM state**: popup.js:274-275, options.js:180-206
- **Migration pattern**: options.js:70-85, popup.js:77-89
- **State flow**: popup.js:257-313, options.js:122-166
