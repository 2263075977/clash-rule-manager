# Directory Structure

> How frontend code is organized in this project.

---

## Overview

This is a Chrome Extension project with a **flat directory structure**. All core files are placed in the root directory, following the standard Chrome Extension layout.

**Key characteristics**:
- No build system or bundler (pure vanilla JS)
- Manifest V3 architecture
- Separation by page type (popup, options, background)
- Shared modules are standalone JS files

---

## Directory Layout

```
clash-rule-manager/
├── manifest.json           # Extension manifest (Manifest V3)
├── popup.html              # Popup window UI
├── popup.js                # Popup logic
├── popup.css               # Popup styles
├── options.html            # Settings page UI
├── options.js              # Settings page logic
├── options.css             # Settings page styles
├── github-api.js           # Shared GitHub API module (class-based)
└── icons/                  # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Module Organization

### Page-Based Modules

Each page has its own HTML/JS/CSS triplet:

- **popup.*** - Main popup window (domain extraction + quick actions)
- **options.*** - Settings page (configuration management)

### Shared Modules

- **github-api.js** - Reusable API client (exported as ES5 class)
  - Used by both popup.js and options.js
  - Loaded via `<script>` tag in HTML

### Assets

- **icons/** - Extension icons (16x16, 48x48, 128x128)

---

## Naming Conventions

### Files

- **Lowercase with hyphens**: `github-api.js`, `popup.html`
- **Match page name**: `popup.html` + `popup.js` + `popup.css`
- **Descriptive names**: `github-api.js` (not `api.js`)

### Functions

- **camelCase**: `extractRootDomain()`, `addDomainToFile()`
- **Verb-first**: `loadSettings()`, `saveSettings()`, `showToast()`

### Classes

- **PascalCase**: `GitHubAPI`

### Constants

- **camelCase for arrays/objects**: `defaultRuleGroups`
- **Defined at top of file**: See popup.js:11-14, options.js:10-13

---

## Anti-Patterns

❌ **Do NOT**:
- Create nested directories (keep flat structure)
- Use build tools or transpilers (pure ES5/ES6)
- Split code into multiple modules unnecessarily
- Use framework-specific patterns (React, Vue, etc.)

✅ **Do**:
- Keep all page files in root directory
- Use `<script>` tags to load shared modules
- Follow Chrome Extension best practices
- Use vanilla DOM APIs

---

## Examples

### Well-Organized Modules

- **github-api.js** - Clean class-based API client with clear method names
- **popup.js** - Event-driven architecture with helper functions
- **options.js** - Form handling with validation and feedback

### Code References

- API module pattern: github-api.js:3-148
- Event listener setup: popup.js:3-50, options.js:3-50
- Storage interaction: options.js:53-92, popup.js:64-103
