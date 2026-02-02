# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory contains guidelines for **vanilla JavaScript Chrome Extension** development.

**Project characteristics**:
- No framework (React, Vue, Angular)
- No build system (Webpack, Vite)
- Manifest V3 architecture
- Pure ES5/ES6 JavaScript
- Chrome Extension APIs

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Flat file layout, page-based organization | ✅ Filled |
| [Module Guidelines](./component-guidelines.md) | Event-driven patterns, DOM manipulation | ✅ Filled |
| [Hook Guidelines](./hook-guidelines.md) | Not applicable (vanilla JS) | ✅ N/A |
| [State Management](./state-management.md) | chrome.storage.sync, local variables, DOM state | ✅ Filled |
| [Quality Guidelines](./quality-guidelines.md) | Forbidden patterns, required patterns, testing | ✅ Filled |
| [Type Safety](./type-safety.md) | Runtime validation, defensive programming | ✅ Filled |

---

## Quick Reference

### Core Patterns

**Page Module Structure**:
```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // 1. DOM references
  const element = document.getElementById('id');

  // 2. Event listeners
  element.addEventListener('click', handler);

  // 3. Initial load
  await loadData();
});

// Helper functions (hoisted)
async function loadData() { ... }
```

**Error Handling**:
```javascript
try {
  button.disabled = true;
  await operation();
  showToast('成功', 'success');
} catch (error) {
  console.error('失败:', error);
  showToast('失败', 'error');
} finally {
  button.disabled = false;
}
```

**State Management**:
```javascript
// Persistent config
await chrome.storage.sync.set({ token: 'value' });
const settings = await chrome.storage.sync.get(['token']);

// Local state
let currentDomain = '';

// DOM state
button.disabled = true;
```

---

## Key Principles

1. **Event-Driven Architecture** - Use `addEventListener`, not inline handlers
2. **Defensive Programming** - Validate inputs, handle errors, provide defaults
3. **User Feedback** - Always show loading states and success/error messages
4. **Centralized Configuration** - Define defaults once at top of file
5. **No CSP Violations** - No `eval()`, no inline event handlers

---

## Common Mistakes to Avoid

❌ **Inline event handlers** (violates CSP)
❌ **Silent failures** (no error logging or user feedback)
❌ **Hardcoded values** (duplicated configuration)
❌ **Missing input validation** (assume user input is valid)
❌ **Not restoring UI state** (buttons stay disabled on error)

---

## Code Examples

### Well-Organized Files

- **popup.js** - Event-driven page module with helper functions
- **options.js** - Form handling with validation and feedback
- **github-api.js** - Class-based API client with error handling

### Key Patterns

- **Domain extraction**: popup.js:18-44
- **Settings load/save**: options.js:53-166
- **API error handling**: github-api.js:118-146
- **User feedback**: popup.js:322-329
- **Parallel operations**: popup.js:120-132

---

## Before You Code

1. Read [Directory Structure](./directory-structure.md) - Understand file organization
2. Read [Module Guidelines](./component-guidelines.md) - Learn code patterns
3. Read [Quality Guidelines](./quality-guidelines.md) - Know forbidden patterns
4. Read [State Management](./state-management.md) - Understand data flow

---

**Language**: All documentation is written in **English**.
