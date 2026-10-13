# Storage Guidelines

> 本项目的"数据库"= 两层持久化:`chrome.storage.sync`(配置)+ GitHub 仓库文件(规则数据)。

---

## Overview

本项目**没有数据库**。持久化分两类,职责必须分清:

| 层 | 载体 | 存什么 | 权威性 |
|----|------|--------|--------|
| 配置存储 | `chrome.storage.sync` | Token、仓库坐标、规则分组、Clash API 设置 | 本地唯一真源 |
| 数据存储 | 远端 GitHub 仓库的规则文件 | `DOMAIN-SUFFIX,example.com` 规则行 | 远端唯一真源 |

> **核心原则**: 配置以本地为准,规则以远端为准。**不要**把规则内容缓存到 storage,也不要试图在 storage 里维护规则副本 —— 会与远端漂移。

---

## Contract: `chrome.storage.sync` 键集合

`options.js` 的 `loadSettings()` / `saveSettings()` 是**唯一**的读写入口。

| 键 | 类型 | 必填 | 默认 | 说明 |
|----|------|------|------|------|
| `token` | string | ✅ | — | GitHub PAT,期望前缀 `ghp_` 或 `github_pat_` |
| `owner` | string | ✅ | — | 仓库所有者 |
| `repo` | string | ✅ | — | 仓库名 |
| `branch` | string | ➖ | `'main'` | 空值时回落 `'main'` |
| `ruleGroups` | Array\<Group\> | ✅ | `defaultRuleGroups` | 至少 1 项 |
| `clashApiUrl` | string | ➖ | `''` | 如 `http://127.0.0.1:9090` |
| `clashApiSecret` | string | ➖ | `''` | Clash `secret` 字段 |
| `directFile` | string | ⚠️ 遗留 | — | **已废弃**,见下方迁移 |
| `proxyFile` | string | ⚠️ 遗留 | — | **已废弃**,见下方迁移 |

### Group 对象契约

```js
{
  name: string,      // 必填,显示名(如 '直连规则')
  path: string,      // 必填,仓库内相对路径(如 'direct.txt')
  provider?: string  // 可选,Clash provider 名,用于写后重载
}
```

> **注意**: `provider` 是**可选字段**。`options.js` 仅在非空时才写入该键:
> ```js
> // options.js saveSettings()
> const group = { name, path };
> if (provider) { group.provider = provider; }
> ```
> 因此消费方必须用 `group.provider || ''` 取值,不能假设键存在。

---

## 遗留键迁移(必须保留)

旧版本用 `directFile` / `proxyFile` 两个扁平键。当前版本用 `ruleGroups` 数组。**迁移逻辑在 `popup.js` 与 `options.js` 各写了一份**,改动时必须同步。

### 解析优先级

```
ruleGroups 非空           → 直接使用
ruleGroups 空 且 存在遗留键 → 由 directFile/proxyFile 合成两个分组(缺失项补默认路径)
两者都空                   → 使用 defaultRuleGroups
```

```js
// options.js:57-81 —— 权威实现
let groups = settings.ruleGroups;
if (!groups || groups.length === 0) {
  if (settings.directFile || settings.proxyFile) {
    groups = [];
    if (settings.directFile) groups.push({ name: '直连规则', path: settings.directFile, type: 'direct' });
    else groups.push({ name: '直连规则', path: 'direct.txt', type: 'direct' });

    if (settings.proxyFile) groups.push({ name: '代理规则', path: settings.proxyFile, type: 'proxy' });
    else groups.push({ name: '代理规则', path: 'proxy.txt', type: 'proxy' });
  } else {
    groups = JSON.parse(JSON.stringify(defaultRuleGroups));
  }
}
```

> **Warning**: 迁移产物中带有 `type: 'direct' | 'proxy'` 字段,但**新写入的 `ruleGroups` 不包含 `type`**。
> 也就是说 `type` 只在迁移路径出现。任何依赖 `group.type` 的逻辑都必须提供回退 —— `popup.js` 的 `getButtonClass()` 正是因此同时判断 `name.includes('直连')` 和 `type === 'direct'`。

### 缺陷(已知,勿复制)

`JSON.parse(JSON.stringify(defaultRuleGroups))` 这种"深拷贝"方式说明 `defaultRuleGroups` 是**共享可变对象**。虽然 `renderRuleGroups` 不直接改写它,但这是脆弱的 —— 新增分组编辑功能时极易污染默认值。

**Instead**: 用不可变写法,如 `defaultRuleGroups.map(g => ({ ...g }))`。

---

## Contract: GitHub 规则文件

| 项目 | 约定 |
|------|------|
| 路径 | `Group.path` 相对路径,如 `direct.txt` |
| 格式 | 每行一条 `DOMAIN-SUFFIX,<domain>` |
| 换行 | 追加前确保文件以 `\n` 结尾,再追加新行 |
| 重复判定 | **字符串包含**(`content.includes(rule)`),非按行解析 |
| 编码 | UTF-8,必须经 `base64Encode`/`base64Decode` |
| 版本控制 | 写入需携带 `sha`(GitHub API 乐观锁) |

### 写后文件形态(尾部)

```
DOMAIN-SUFFIX,a.com
DOMAIN-SUFFIX,b.com
```

> **Warning**: 重复判定用的是子串匹配,因此 `DOMAIN-SUFFIX,a.com` 会被 `DOMAIN-SUFFIX,nota.com` 的行**误判为已存在**?
> 不会 —— 因为规则行以 `,` 分隔且匹配串包含逗号,`nota.com` 中不含 `,a.com` 子串。
> 但 `DOMAIN-SUFFIX,a.com` 与 `DOMAIN-SUFFIX,b.a.com` 的匹配仍需注意:后者包含 `a.com` 但**不包含** `,a.com`,故安全。

### 删除语义

```js
// github-api.js:129-134
const lines = content.split('\n');
const newLines = lines.filter(line => line.trim() !== rule);  // 精确整行比对
```

注意**添加**用 `includes`(子串),**删除**用整行 `trim()` 相等 —— 两者语义不同,勿互换。

---

## Migrations

本项目无 schema 迁移工具。变更存储契约时:

1. 在 `saveSettings()` 写入新键
2. 在 `loadSettings()` 增加读取时的降级/合成逻辑
3. **不要删除**遗留键的读取分支(老用户数据仍在)
4. 在本文档的键集合表中标注废弃键

---

## Naming Conventions

| 类型 | 规则 | 示例 |
|------|------|------|
| storage 键 | camelCase | `clashApiUrl`、`ruleGroups` |
| 文件路径 | 小写 + `.txt` | `direct.txt`、`office.txt` |
| 分组显示名 | 中文 + "规则"后缀(约定,非强制) | `直连规则` |

---

## Common Mistakes

### 常见错误: 用 `get(null)` 导出配置

**Symptom**: 导出文件含明文 Token

**Cause**:
```js
// options.js exportSettings()
const settings = await chrome.storage.sync.get(null);  // 拿到全部键,含 token
```

**Fix**: 如需脱敏,应在导出前删除敏感键。

**Prevention**: 见 `error-handling.md` 的安全矩阵 —— 本项目当前**接受**此行为(用户自己的配置备份),但任何"分享配置"类功能必须先剔除 `token`。

### 常见错误: 假设 `ruleGroups` 一定存在

**Symptom**: 首次打开 popup 报错或按钮为空

**Cause**: 新用户尚未保存过配置,`ruleGroups` 为 `undefined`

**Fix**: 始终走三档优先级解析(见上文迁移逻辑)