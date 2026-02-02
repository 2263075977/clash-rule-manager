# Backend Development Guidelines

> Backend guidelines for this project.

---

## Overview

**This project does not have a backend.**

This is a **Chrome Extension** that runs entirely in the browser. It interacts with:
- **GitHub REST API** (external service, not owned by this project)
- **Chrome Extension APIs** (browser-provided)

---

## Architecture

```
Browser Extension (Frontend Only)
├── popup.js / options.js (UI logic)
├── github-api.js (API client)
└── Chrome APIs (storage, tabs)
     ↓
GitHub REST API (External)
```

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Not applicable | ❌ N/A |
| [Database Guidelines](./database-guidelines.md) | Not applicable | ❌ N/A |
| [Error Handling](./error-handling.md) | Not applicable | ❌ N/A |
| [Quality Guidelines](./quality-guidelines.md) | Not applicable | ❌ N/A |
| [Logging Guidelines](./logging-guidelines.md) | Not applicable | ❌ N/A |

---

## If You Add a Backend

If this project is extended with a backend (Node.js, Python, etc.), fill in the backend guidelines at that time.

For now, all development guidelines are in the **frontend/** directory.

---

**Language**: All documentation is written in **English**.
