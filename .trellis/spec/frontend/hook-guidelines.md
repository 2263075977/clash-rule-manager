# Hook Guidelines (Not Applicable)

> This project does not use React or similar frameworks.

---

## Overview

This project uses **vanilla JavaScript** without React, Vue, or other frameworks that have "hooks" concepts.

**Instead of hooks, this project uses**:
- Event listeners (`addEventListener`)
- Helper functions (plain JavaScript functions)
- Chrome Extension APIs (chrome.storage, chrome.tabs)

---

## Equivalent Patterns

### Data Fetching

Instead of `useEffect` + `useState`, we use:

```javascript
// Load data on page load
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get(['token', 'owner']);
  renderUI(settings);
});
```

**Example**: popup.js:3-103, options.js:3-50

---

### Reusable Logic

Instead of custom hooks (`useCustomHook`), we use:

```javascript
// Shared helper functions
function extractRootDomain(hostname) {
  // Reusable logic
}

// Shared classes
class GitHubAPI {
  async addDomainToFile(path, domain) {
    // Reusable API logic
  }
}
```

**Examples**:
- popup.js:18-44 - Helper function
- github-api.js:3-148 - Shared class

---

### State Management

Instead of `useState`, we use:

```javascript
// Local variables
let currentDomain = '';

// Chrome storage
await chrome.storage.sync.set({ token: 'value' });
const settings = await chrome.storage.sync.get(['token']);

// DOM state
button.disabled = true;
```

**See**: state-management.md for full details

---

## If You Need Framework Hooks

If this project is migrated to React/Vue in the future, refer to:
- React Hooks documentation
- Vue Composition API documentation

For now, this file serves as a placeholder to indicate hooks are not applicable.

---

## Code References

- **Event-driven pattern**: popup.js:3-330, options.js:3-260
- **Helper functions**: popup.js:18-44, popup.js:106-151
- **Shared modules**: github-api.js:3-148
