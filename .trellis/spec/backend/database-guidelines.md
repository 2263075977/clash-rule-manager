# Storage Guidelines

> 本项目的"数据库"= 两层持久化:`chrome.storage.sync`(配置)+ GitHub 仓库文件(规则数据)。

---

## Overview

本项目**没有数据库**。持久化分两类,职责必须分清:

| 层 | 载体 | 存什么 | 权威性 |
|----|------|--------|--------|
| 配置存储 | `chrome.storage.sync` | Token、仓库坐标、规则分组、Clash API 设置 | 本地唯一真源 |
| 数据存储 | 远端 GitHub 仓库的规则文件 | `  - '+.example.com'`(mihomo `behavior: domain` + `format: yaml`) | 远端唯一真源 |

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
  path: string,      // 必填,仓库内相对路径(如 'direct.yaml')
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

> **Warning**: 迁移回退路径中的 `'direct.txt'` / `'proxy.txt'` 是**有意保留**的。该分支仅当用户设置了 `directFile`/`proxyFile` 中**恰好一个**时进入,而旧用户的另一个文件从来就是 `.txt`;改成 `.yaml` 反而会指向不存在的文件。新装/默认用户走 `defaultRuleGroups`(`direct.yaml`/`proxy.yaml`)。

### 缺陷(已知,勿复制)

`JSON.parse(JSON.stringify(defaultRuleGroups))` 这种"深拷贝"方式说明 `defaultRuleGroups` 是**共享可变对象**。虽然 `renderRuleGroups` 不直接改写它,但这是脆弱的 —— 新增分组编辑功能时极易污染默认值。

**Instead**: 用不可变写法,如 `defaultRuleGroups.map(g => ({ ...g }))`。

---

## Contract: GitHub 规则文件

| 项目 | 约定 |
|------|------|
| 路径 | `Group.path` 相对路径,如 `direct.yaml` |
| 格式 | mihomo `rule-providers` 的 `behavior: domain` + `format: yaml`;规则行为 yaml 数组项 `  - '+.<domain>'` |
| 写入位置 | **最后一个规则行之后**(沿用它推断缩进),而非文件 EOF;理由:分组注释为块前置,EOF 追加会归入错误的注释块 |
| 缩进 | 按文件已存在的规则行缩进推断,无规则行时退化 2 空格 |
| 换行 | 写入后确保文件以 `\n` 结尾 |
| 重复判定 | **按解析后的语义**比对(`isDomainCovered`),仅 `suffix` / `exact` 参与 |
| 删除判定 | **按解析后的语义**比对,删除**所有**归一化后等于目标的 `suffix` / `exact` 行 |
| 编码 | UTF-8,必须经 `base64Encode`/`base64Decode` |
| 版本控制 | 写入需携带 `sha`(GitHub API 乐观锁) |

### 规则归一化契约(`parseRuleLine`)

| 写法 | kind | value |
|------|------|-------|
| `'+.example.com'` / `DOMAIN-SUFFIX,example.com` | `suffix` | `example.com` |
| `'example.com'`(yaml 裸值) / `DOMAIN,example.com` | `exact` | `example.com` |
| `'*.example.com'` / `'.example.com'` | `wildcard` | `example.com` |
| `DOMAIN-KEYWORD,foo` | `keyword` | `foo` |
| 其他(`GEOSITE,` / `IP-CIDR,` / `RULE-SET,` / 注释 / 空行) | `null` | — |

- `value` 一律经 `normalizeDomain()`:小写 + 去除尾随点
- 判重(`isDomainCovered`)只在 `kind === 'suffix'` 或 `kind === 'exact'` 且 `value` 与目标相等时命中;**`wildcard` 与 `keyword` 永不参与判重,也永不被插件写入**
- 手写行与历史数据无需清理:同名的 `+.example.com` 与裸值 `example.com` 都会被视为命中
- `.a.com` 归类为 `wildcard`(mihomo 语义:匹配子域但**不**匹配 `a.com` 本身),因此不会被误报"已存在"或被误删

### 写后文件形态

```
# 分组注释
payload:
  - '+.a.com'
  - '+.b.com'
```

### 删除语义

```js
// github-api.js —— 按解析后语义精确比对,丢弃匹配行,其余逐字节保留
const rule = parseRuleLine(rawLine);
const hit = rule
  && (rule.kind === 'suffix' || rule.kind === 'exact')
  && rule.value === target;
```

注意**添加**与**删除**都走同一套解析语义(非子串、非字面量),两者一致,勿改回字符串匹配。
删除后若 `payload:` 下无规则行,**保留** `payload:` 与注释,不做空结构清理。

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
| 文件路径 | 小写 + `.yaml` | `direct.yaml`、`office.yaml` |
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