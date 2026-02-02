# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

This project follows **pragmatic quality standards** for a small Chrome Extension:

- **No linter** (ESLint, Prettier) - Manual code review
- **No automated tests** - Manual testing in browser
- **No build process** - Direct file loading
- **Code review focus** - Readability, error handling, user experience

**Quality is maintained through**:
- Consistent code patterns
- Defensive programming
- User feedback mechanisms
- Manual testing checklist

---

## Forbidden Patterns

### ❌ Never Use These

#### 1. Inline Event Handlers (HTML)

```html
<!-- ❌ Bad: Inline onclick -->
<button onclick="handleClick()">Click</button>

<!-- ✅ Good: addEventListener in JS -->
<button id="myBtn">Click</button>
<script>
  document.getElementById('myBtn').addEventListener('click', handleClick);
</script>
```

**Why**: Violates Content Security Policy (CSP) in Manifest V3.

---

#### 2. eval() or Function() Constructor

```javascript
// ❌ Bad: Dynamic code execution
eval('console.log("hello")');
new Function('return 1 + 1')();

// ✅ Good: Direct function calls
console.log('hello');
const result = 1 + 1;
```

**Why**: Violates CSP and creates security vulnerabilities.

---

#### 3. Synchronous Storage API

```javascript
// ❌ Bad: chrome.storage.sync.get() without await
const settings = chrome.storage.sync.get(['token']);

// ✅ Good: Always await
const settings = await chrome.storage.sync.get(['token']);
```

**Why**: Chrome Extension APIs are async, synchronous calls will fail.

---

#### 4. Hardcoded Configuration

```javascript
// ❌ Bad: Hardcoded values scattered in code
if (group.name === '直连规则') { ... }
if (group.name === '直连规则') { ... } // Duplicated elsewhere

// ✅ Good: Define once at top
const defaultRuleGroups = [
  { name: '直连规则', path: 'direct.txt', type: 'direct' }
];
```

**Example**: popup.js:11-14, options.js:10-13

---

#### 5. Silent Failures

```javascript
// ❌ Bad: Catch and ignore
try {
  await operation();
} catch (error) {
  // Nothing
}

// ✅ Good: Log and inform user
try {
  await operation();
} catch (error) {
  console.error('操作失败:', error);
  showToast('操作失败', 'error');
}
```

**Example**: popup.js:291-308

---

## Required Patterns

### ✅ Always Use These

#### 1. Try-Catch for Async Operations

```javascript
// ✅ Required: Wrap all async operations
try {
  await api.addDomainToFile(filePath, domain);
  showToast('成功', 'success');
} catch (error) {
  console.error('失败:', error);
  showToast('失败', 'error');
}
```

**Example**: popup.js:272-313, options.js:183-207

---

#### 2. User Feedback for All Actions

```javascript
// ✅ Required: Always provide feedback
showToast('操作成功', 'success');
showToast('操作失败', 'error');

// ✅ Required: Show loading states
button.disabled = true;
button.innerHTML = '<span class="loading"></span>处理中...';
```

**Example**: popup.js:274-275, popup.js:288-289

---

#### 3. Input Validation

```javascript
// ✅ Required: Validate before use
const token = document.getElementById('token').value.trim();
if (!token) {
  showMessage('请填写 Token', 'error');
  return;
}
```

**Example**: options.js:146-149

---

#### 4. Restore UI State (Finally Block)

```javascript
// ✅ Required: Restore state even on error
const originalText = button.innerHTML;
try {
  button.disabled = true;
  button.innerHTML = '<span class="loading"></span>处理中...';
  await operation();
} catch (error) {
  showToast('失败', 'error');
} finally {
  button.disabled = false;
  button.innerHTML = originalText;
}
```

**Example**: popup.js:309-313

---

#### 5. Console Logging for Errors

```javascript
// ✅ Required: Always log errors
catch (error) {
  console.error('操作失败:', error);
  showToast('操作失败', 'error');
}
```

**Example**: popup.js:292-293

---

## Code Style Standards

### Naming Conventions

- **Functions**: camelCase, verb-first (`loadSettings`, `showToast`)
- **Classes**: PascalCase (`GitHubAPI`)
- **Constants**: camelCase for objects/arrays (`defaultRuleGroups`)
- **DOM IDs**: camelCase (`settingsForm`, `addRuleGroupBtn`)

---

### Function Organization

```javascript
// ✅ Good: Logical grouping
document.addEventListener('DOMContentLoaded', () => {
  // 1. DOM references
  const form = document.getElementById('form');

  // 2. Event listeners
  form.addEventListener('submit', handleSubmit);

  // 3. Initial load
  loadSettings();
});

// Helper functions (hoisted)
async function loadSettings() { ... }
async function saveSettings() { ... }
function showMessage() { ... }
```

**Example**: options.js:3-260

---

### Error Messages

```javascript
// ✅ Good: User-friendly Chinese messages
showToast('添加成功', 'success');
showToast('Token 无效', 'error');

// ✅ Good: Classify errors by type
if (error.message.includes('已存在')) {
  errorMessage = '该域名已存在';
} else if (error.message.includes('404')) {
  errorMessage = '文件不存在';
}
```

**Example**: popup.js:295-306

---

## Testing Requirements

### Manual Testing Checklist

Before committing changes, test:

#### Popup Window
- [ ] Domain extraction works for various URLs
- [ ] Buttons render correctly
- [ ] Domain status detection works
- [ ] Add domain succeeds
- [ ] Remove domain succeeds (with confirmation)
- [ ] Error messages display correctly
- [ ] Loading states show properly
- [ ] Settings link opens options page

#### Options Page
- [ ] Settings load correctly
- [ ] Settings save successfully
- [ ] Test connection works
- [ ] Add/remove rule groups works
- [ ] Export settings works
- [ ] Import settings works
- [ ] Validation messages display
- [ ] Legacy config migration works

#### Edge Cases
- [ ] Empty configuration (first install)
- [ ] Invalid GitHub token
- [ ] Non-existent repository
- [ ] Non-existent file in repo
- [ ] Duplicate domain addition
- [ ] Network errors
- [ ] Special TLDs (co.uk, com.cn)
- [ ] IP addresses
- [ ] localhost

---

## Code Review Checklist

### Before Committing

- [ ] **Error handling**: All async operations wrapped in try-catch
- [ ] **User feedback**: Success/error messages for all actions
- [ ] **Loading states**: Buttons disabled during operations
- [ ] **Input validation**: User input validated before use
- [ ] **Console logging**: Errors logged to console
- [ ] **UI restoration**: Button states restored in finally blocks
- [ ] **No hardcoded values**: Configuration defined at top
- [ ] **No CSP violations**: No inline event handlers or eval()
- [ ] **Consistent naming**: camelCase for functions, PascalCase for classes
- [ ] **Code comments**: Complex logic explained (if needed)

---

### Review Questions

1. **Does this change affect existing functionality?**
   - Test all related features

2. **Are error cases handled?**
   - What happens if API fails?
   - What happens if user input is invalid?

3. **Is user feedback clear?**
   - Are error messages helpful?
   - Are success messages shown?

4. **Is the code readable?**
   - Can another developer understand it?
   - Are variable names descriptive?

5. **Is configuration centralized?**
   - Are default values defined once?
   - Are magic strings avoided?

---

## Performance Considerations

### Avoid Unnecessary Operations

```javascript
// ✅ Good: Parallel API calls
const checkPromises = groups.map(async (group) => {
  return await api.checkDomainExists(group.path, domain);
});
const results = await Promise.all(checkPromises);
```

**Example**: popup.js:120-132

---

### Timeout Long Operations

```javascript
// ✅ Good: Add timeout for slow operations
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('检测超时')), 8000)
);

const results = await Promise.race([
  Promise.all(checkPromises),
  timeoutPromise
]);
```

**Example**: popup.js:125-132

---

## Security Considerations

### Token Storage

- ✅ Store in `chrome.storage.sync` (encrypted by browser)
- ✅ Never log tokens to console
- ✅ Only send to GitHub API (HTTPS)

---

### Input Sanitization

```javascript
// ✅ Good: Trim user input
const token = document.getElementById('token').value.trim();

// ✅ Good: Validate format
if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
  return hostname;
}
```

**Example**: options.js:123, popup.js:20-22

---

## Code References

- **Error handling pattern**: popup.js:272-313, github-api.js:118-146
- **User feedback**: popup.js:322-329, options.js:252-259
- **Input validation**: options.js:146-149, options.js:140-143
- **Loading states**: popup.js:274-275, options.js:180-206
- **Configuration centralization**: popup.js:11-14, options.js:10-13
