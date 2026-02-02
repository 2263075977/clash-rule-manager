# Type Safety (Vanilla JS)

> Type safety patterns in this project.

---

## Overview

This project uses **vanilla JavaScript (ES5/ES6)** without TypeScript or Flow.

**Type safety approach**:
- **Runtime validation** - Check types at runtime with `if` statements
- **JSDoc comments** (optional) - Document expected types
- **Defensive programming** - Handle undefined/null cases explicitly
- **Chrome Extension APIs** - Rely on browser API type guarantees

**No static type checking** is performed.

---

## Runtime Validation Patterns

### Input Validation

```javascript
// ✅ Validate user input
const token = document.getElementById('token').value.trim();
if (!token || !owner || !repo) {
  showMessage('请填写所有必填字段', 'error');
  return;
}
```

**Example**: options.js:146-149

---

### Type Checking

```javascript
// ✅ Check array length
if (!groups || groups.length === 0) {
  showMessage('请至少添加一个规则分组', 'error');
  return;
}

// ✅ Check string content
if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
  return hostname; // IP address
}
```

**Examples**:
- options.js:140-143 - Array validation
- popup.js:20-22 - String pattern validation

---

### Null/Undefined Handling

```javascript
// ✅ Provide defaults for missing data
const branch = settings.branch || 'main';
const groups = settings.ruleGroups || defaultRuleGroups;

// ✅ Check existence before use
if (tab && tab.url) {
  const url = new URL(tab.url);
}

// ✅ Optional chaining (modern browsers)
const value = settings?.ruleGroups?.[0]?.name;
```

**Examples**:
- options.js:68 - Default value
- popup.js:50-54 - Existence check

---

## Data Structure Conventions

### Configuration Object

```javascript
// Settings structure (chrome.storage.sync)
{
  token: string,        // GitHub Personal Access Token
  owner: string,        // Repository owner
  repo: string,         // Repository name
  branch: string,       // Branch name (default: 'main')
  ruleGroups: [         // Rule group configuration
    {
      name: string,     // Display name
      path: string,     // File path in repo
      type?: string     // Optional: 'direct' | 'proxy'
    }
  ]
}
```

**Example**: See CLAUDE.md:89-99

---

### API Response Structure

```javascript
// GitHub API file content response
{
  content: string,  // Base64 encoded content
  sha: string       // Git blob SHA (for updates)
}

// Internal representation (after decoding)
{
  content: string,  // Decoded text content
  sha: string | null  // null if file doesn't exist
}
```

**Example**: github-api.js:31-39

---

## JSDoc Comments (Optional)

### When to Use JSDoc

**Use JSDoc for**:
- Public API functions (exported classes/functions)
- Complex function signatures
- Non-obvious parameter types

**Example**:
```javascript
/**
 * Extract root domain from hostname
 * @param {string} hostname - Full hostname (e.g., 'www.example.com')
 * @returns {string} Root domain (e.g., 'example.com')
 */
function extractRootDomain(hostname) {
  // ...
}
```

**Current state**: Project does NOT use JSDoc extensively. This is acceptable for small projects.

---

## Error Handling as Type Safety

### API Error Types

```javascript
// ✅ Handle specific error cases
try {
  await api.addDomainToFile(filePath, domain);
} catch (error) {
  // Classify errors by message content
  if (error.message.includes('已存在')) {
    errorMessage = '该域名已存在';
  } else if (error.message.includes('404')) {
    errorMessage = '文件不存在';
  } else if (error.message.includes('401')) {
    errorMessage = 'Token 无效';
  }
}
```

**Example**: popup.js:295-306

---

### HTTP Status Code Handling

```javascript
// ✅ Check response status explicitly
if (response.ok) {
  showMessage('连接成功', 'success');
} else if (response.status === 404) {
  showMessage('仓库不存在', 'error');
} else if (response.status === 401) {
  showMessage('Token 无效', 'error');
}
```

**Example**: options.js:192-200

---

## Chrome Extension API Types

### Storage API

```javascript
// chrome.storage.sync.get() returns Promise<object>
const settings = await chrome.storage.sync.get(['token', 'owner']);

// Always check if keys exist
if (settings.token) {
  // Use settings.token
}
```

**Pattern**: Always check existence before use.

---

### Tabs API

```javascript
// chrome.tabs.query() returns Promise<Tab[]>
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

// Check if tab exists
if (tab && tab.url) {
  const url = new URL(tab.url);
}
```

**Example**: popup.js:48-54

---

## Common Mistakes

### ❌ Not Validating User Input

```javascript
// ❌ Bad: Assume input is valid
const token = document.getElementById('token').value;
await chrome.storage.sync.set({ token });

// ✅ Good: Validate first
const token = document.getElementById('token').value.trim();
if (!token) {
  showMessage('请填写 Token', 'error');
  return;
}
```

---

### ❌ Not Handling Missing Properties

```javascript
// ❌ Bad: Assume property exists
const branch = settings.branch;

// ✅ Good: Provide default
const branch = settings.branch || 'main';
```

**Example**: options.js:68

---

### ❌ Not Checking Array Length

```javascript
// ❌ Bad: Assume array has items
const firstGroup = groups[0];

// ✅ Good: Check length first
if (groups.length === 0) {
  showMessage('请至少添加一个规则分组', 'error');
  return;
}
```

**Example**: options.js:140-143

---

### ❌ Not Handling API Errors

```javascript
// ❌ Bad: No error handling
const response = await fetch(url);
const data = await response.json();

// ✅ Good: Check response status
const response = await fetch(url);
if (!response.ok) {
  throw new Error(`请求失败: ${response.status}`);
}
const data = await response.json();
```

**Example**: github-api.js:23-29

---

## Validation Checklist

Before calling external APIs or saving data:

- [ ] Trim string inputs (`.trim()`)
- [ ] Check for empty strings (`!value`)
- [ ] Validate array length (`array.length > 0`)
- [ ] Provide default values (`value || default`)
- [ ] Check object property existence (`if (obj.prop)`)
- [ ] Handle null/undefined (`obj?.prop`)

---

## Code References

- **Input validation**: options.js:146-149, options.js:140-143
- **Null handling**: options.js:68, popup.js:77-89
- **Error classification**: popup.js:295-306, options.js:192-200
- **Type checking**: popup.js:20-22, popup.js:109-113
- **API error handling**: github-api.js:23-29, github-api.js:70-73
