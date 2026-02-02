# Module Guidelines (Vanilla JS)

> How JavaScript modules are structured in this project.

---

## Overview

This project uses **vanilla JavaScript** without frameworks. Instead of "components", we have:

- **Page modules** (popup.js, options.js) - Event-driven UI logic
- **Shared modules** (github-api.js) - Reusable classes/functions
- **DOM manipulation** - Direct `document.querySelector()` and event listeners

**Key patterns**:
- ES5/ES6 hybrid (class syntax + function declarations)
- Event-driven architecture with `DOMContentLoaded`
- Imperative DOM updates (no virtual DOM)
- Chrome Extension APIs for state and communication

---

## Module Structure

### Page Module Pattern

All page modules follow this structure:

```javascript
// 1. DOMContentLoaded wrapper
document.addEventListener('DOMContentLoaded', async () => {
  // 2. DOM element references
  const element = document.getElementById('elementId');

  // 3. Constants/defaults
  const defaultConfig = [...];

  // 4. Event listener registration
  element.addEventListener('click', handlerFunction);

  // 5. Initial data loading
  await loadData();
});

// 6. Helper functions (outside DOMContentLoaded)
function helperFunction() {
  // ...
}
```

**Examples**:
- popup.js:3-330 - Full page module structure
- options.js:3-260 - Settings page module

---

## Function Organization

### Function Placement

**Inside `DOMContentLoaded`**:
- Event handler registration
- Initial setup logic
- Functions that need closure over DOM elements

**Outside `DOMContentLoaded`** (hoisted):
- Reusable helper functions
- Functions called by event handlers
- Functions that don't need DOM element closure

**Example** (popup.js):
```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // Event registration
  btn.addEventListener('click', async () => {
    await addDomainToGroup(path, btn, name); // Calls hoisted function
  });
});

// Hoisted helper function
async function addDomainToGroup(filePath, button, groupName) {
  // Implementation
}
```

### Function Naming

- **Verb-first**: `loadSettings()`, `saveSettings()`, `showToast()`
- **Descriptive**: `extractRootDomain()` not `extract()`
- **Async prefix**: `async function loadSettings()` for async operations

---

## DOM Manipulation Patterns

### Element Selection

```javascript
// ✅ Use getElementById for unique elements
const form = document.getElementById('settingsForm');

// ✅ Use querySelector for complex selectors
const btn = div.querySelector('.btn-remove');

// ✅ Use querySelectorAll for collections
const groupItems = document.querySelectorAll('.rule-group-item');
```

### Dynamic Element Creation

```javascript
// ✅ Create element + set properties + append
const div = document.createElement('div');
div.className = 'rule-group-item form-group';
div.innerHTML = `<input type="text" ...>`;
container.appendChild(div);
```

**Example**: options.js:104-119 - Dynamic form field creation

### Element Updates

```javascript
// ✅ Direct property assignment
button.disabled = true;
button.innerHTML = '<span class="loading"></span>添加中...';

// ✅ Class manipulation
toast.className = `toast ${type} show`;
toast.classList.remove('show');
```

---

## Styling Patterns

### CSS Organization

- **Separate CSS files** per page (popup.css, options.css)
- **Class-based styling** (no inline styles except dynamic positioning)
- **BEM-like naming**: `.rule-group-item`, `.btn-remove`, `.domain-status`

### Dynamic Styling

```javascript
// ✅ Use className for state changes
btn.className = 'btn btn-remove';

// ✅ Use classList for toggles
toast.classList.add('show');
toast.classList.remove('show');

// ❌ Avoid inline styles (except for dynamic values)
btn.style.marginTop = '0'; // Only when necessary
```

---

## State Management

### Chrome Storage Pattern

```javascript
// ✅ Load settings on init
const settings = await chrome.storage.sync.get(['token', 'owner', 'repo']);

// ✅ Save settings on user action
await chrome.storage.sync.set({ token, owner, repo });

// ✅ Handle missing/legacy data
let groups = settings.ruleGroups;
if (!groups || groups.length === 0) {
  // Migration or defaults
  groups = defaultRuleGroups;
}
```

**Examples**:
- options.js:53-92 - Load with migration logic
- options.js:122-166 - Save with validation
- popup.js:64-103 - Load and render

### Local State

```javascript
// ✅ Use let for mutable state
let currentDomain = '';

// ✅ Use const for configuration
const defaultRuleGroups = [...];
```

---

## Error Handling

### Try-Catch Pattern

```javascript
// ✅ Wrap async operations
try {
  await api.addDomainToFile(filePath, domain);
  showToast('成功', 'success');
} catch (error) {
  console.error('操作失败:', error);

  // User-friendly error messages
  let errorMessage = '操作失败';
  if (error.message.includes('已存在')) {
    errorMessage = '该域名已存在';
  } else if (error.message.includes('404')) {
    errorMessage = '文件不存在';
  }

  showToast(errorMessage, 'error');
}
```

**Example**: popup.js:272-313 - Full error handling pattern

### User Feedback

```javascript
// ✅ Always provide feedback
showToast('操作成功', 'success');
showToast('操作失败', 'error');

// ✅ Show loading states
button.disabled = true;
button.innerHTML = '<span class="loading"></span>处理中...';
```

---

## Async Patterns

### Parallel Operations

```javascript
// ✅ Use Promise.all for independent operations
const checkPromises = groups.map(async (group) => {
  return await api.checkDomainExists(group.path, domain);
});
const results = await Promise.all(checkPromises);
```

**Example**: popup.js:120-132 - Parallel domain status checks

### Sequential Operations

```javascript
// ✅ Use await for dependent operations
const { content, sha } = await this.getFileContent(filePath);
const newContent = content + rule;
await this.updateFile(filePath, newContent, sha, message);
```

**Example**: github-api.js:118-146 - Sequential file operations

---

## Common Mistakes

### ❌ Forgetting to Restore Button State

```javascript
// ❌ Bad: Button stays disabled on error
button.disabled = true;
await operation();
// Error occurs, button never re-enabled

// ✅ Good: Use try-finally
try {
  button.disabled = true;
  await operation();
} finally {
  button.disabled = false;
}
```

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

### ❌ Hardcoding Default Values

```javascript
// ❌ Bad: Duplicated defaults
const groups = settings.ruleGroups || [{ name: '直连', path: 'direct.txt' }];

// ✅ Good: Define once at top
const defaultRuleGroups = [{ name: '直连', path: 'direct.txt' }];
const groups = settings.ruleGroups || defaultRuleGroups;
```

**Example**: popup.js:11-14, options.js:10-13 - Shared default constants

---

## Code References

- **Page module structure**: popup.js:3-330, options.js:3-260
- **Shared module (class)**: github-api.js:3-148
- **DOM manipulation**: options.js:104-119, popup.js:153-191
- **Error handling**: popup.js:272-313, github-api.js:118-146
- **Async patterns**: popup.js:106-151, github-api.js:13-40
