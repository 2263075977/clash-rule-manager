# Quality Guidelines

> UI 层的质量标准。

---

## Overview

无 lint、无测试、无 CI。质量靠**约定 + 人工验证清单**。

UI 层的错误代价是**误导用户**:错误的提示、无反应的按钮、静默丢失的配置。因此本层质量标准聚焦:

1. **反馈必须准确** —— 提示文案要指向真实原因
2. **状态必须一致** —— DOM 与 storage 不得互相矛盾
3. **失败必须可见** —— 不得静默吞掉用户操作

---

## Required Patterns

### 必须: 每个异步操作都有加载态

```js
// popup.js
setButtonLoading(button, true);
try { ... } catch { ...; setButtonLoading(button, false); }

// options.js testConnection()
testBtn.disabled = true;
testBtn.innerHTML = '<span class="loading"></span>测试中...';
try { ... } finally {
  testBtn.disabled = false;
  testBtn.textContent = '测试连接';
}
```

> **注意两种恢复策略**:
> - **按钮会被替换**(popup 添加/删除)→ 成功路径**不**恢复,失败路径恢复
> - **按钮不被替换**(options 测试连接)→ `finally` 中**总是**恢复

### 必须: 守卫在加载态之前

```js
// ✅
if (!currentDomain) { showToast('无效的域名', 'error'); return; }
setButtonLoading(button, true);
```

避免无意义的加载态闪烁。

### 必须: 破坏性操作二次确认

```js
// popup.js removeDomainFromGroup() —— 唯一需要确认的操作
if (!confirm(`确定要从 ${groupName} 中删除 ${currentDomain} 吗?`)) return;
```

**约定**: 删除类操作必须确认;添加类操作**不**确认(可逆且成本低)。

### 必须: 提示文案指向真实原因

```js
let errorMessage = '添加失败';   // ← 兜底
if (error.message.includes('已存在')) errorMessage = '该域名已存在';
else if (error.message.includes('404')) errorMessage = '文件不存在';
else if (error.message.includes('401')) errorMessage = 'Token 无效';
else if (error.message.includes('403')) errorMessage = '权限不足';
else errorMessage = error.message;
showToast(errorMessage, 'error');
```

**约定**: 必须有**兜底分支**(`else errorMessage = error.message`),把未知错误原样透出,而非显示笼统的"操作失败"。

> **改进方向**: 分类应改用 `error.status`(见 `../backend/error-handling.md` 的 Common Mistakes)。

### 必须: 复用共享常量

```js
// ❌ options.js:showMessage —— 硬编码
setTimeout(() => { message.classList.remove('show'); }, 3000);

// ✅ 应复用
setTimeout(() => { message.classList.remove('show'); }, TOAST_DURATION);
```

### 必须: 用户可见文案为中文

代码注释、`placeholder`、按钮文字、提示、错误信息 —— 全部中文。

---

## Forbidden Patterns

### 禁止: 用 `innerHTML` 插入动态数据

**Problem**:
```js
// ❌ XSS 风险 + 破坏 CSP 意图
container.innerHTML = `<div>${group.name}</div>`;
```

**Why it's bad**: 分组名来自用户输入并可经配置导入注入。`manifest.json` 的 CSP 为 `script-src 'self'`,但 `innerHTML` 仍可注入事件处理器属性。

**Instead**:
```js
const div = document.createElement('div');
div.textContent = group.name;
container.appendChild(div);
```

> **唯一例外**: `setButtonLoading` 与连接测试用 `innerHTML` 注入**静态**字符串 `<span class="loading"></span>处理中...`。因为不含动态数据,是安全的。

### 禁止: 静默吞掉 catch

**Problem**:
```js
// ❌ 用户点击后什么都没发生
try { await saveSettings(); } catch (e) {}
```

**Instead**: 至少 `console.error` + `showMessage/showToast`

### 禁止: 假设 DOM 元素存在

**Problem**:
```js
// ❌ 若 HTML 改了 id,这里静默变成 null 并在下一步抛错
document.getElementById('newField').value;
```

**Instead**: 引用前确认,或至少在 `DOMContentLoaded` 内集中查询一次并复用

### 禁止: 把状态同时存在 DOM 和变量里却不规定主从

**Problem**: 按钮类名表示"已添加",同时 `domainStatusMap` 也有 `exists`。两者不一致时就产生矛盾界面。

**约定**: **`domainStatusMap` 为主**,DOM 是它的渲染结果。
→ 先更新 `domainStatusMap`,再调用 `updateButtonState` / `updateDomainStatusText`。

```js
// popup.js —— 正确顺序
domainStatusMap.set(filePath, { name: groupName, exists: true });
updateButtonState(button, group, currentDomain, true);
updateDomainStatusText();
```

### 禁止: 为小收益引入架构复杂度

如状态库、组件框架、构建步骤。本项目 8 个文件、无依赖,引入任何工具链的成本都远超收益。

---

## Testing Requirements

**无自动化测试。** 人工验证清单:

### popup 验证清单

| # | 场景 | 期望 |
|---|------|------|
| 1 | 在 `example.com/sub` 打开 popup | 域名显示 `example.com` |
| 2 | 在 `a.b.example.co.uk` 打开 | 显示 `example.co.uk` |
| 3 | 在 `192.168.1.1` 打开 | 显示 `192.168.1.1`(不截断) |
| 4 | 在 `localhost:8080` 打开 | 显示 `localhost` |
| 5 | 在 `chrome://extensions` 打开 | 显示"无法获取域名"或"获取失败",不崩溃 |
| 6 | 未配置时打开 | 提示"请先配置 GitHub 设置" + 禁用按钮 |
| 7 | 域名已在某分组(文件为 yaml `+.` 或裸值写法) | 该分组按钮显示"🗑️ 从 X 删除",状态栏显示"✅ 已在 X 中" |
| 7b | 分组 `path` 漏写子目录前缀(如实际在 `mihomo/direct.yaml`) | 显示"📌 未添加到任何规则"——**不报错**。这是已知的误导性表现,见 `../backend/database-guidelines.md` 的同名 Common Mistakes |
| 8 | 点击添加 | 按钮短暂加载 → 变"删除" → Toast 成功 |
| 9 | 点击删除 | 弹确认 → 确认后变"添加" → Toast 成功 |
| 10 | 删除时点取消 | 无任何变化 |
| 11 | Token 失效 | Toast 显示"Token 无效" |
| 12 | 快速连点同一按钮 | 第二次被禁用或无重复添加 |
| 13 | 配了 Clash API | Toast 追加"Clash 规则已更新" |
| 14 | Clash 不通 | Toast 仍显示添加成功 |

### options 验证清单

| # | 场景 | 期望 |
|---|------|------|
| 1 | 首次打开 | 显示默认两个分组(直连/代理),路径为默认值 `direct.yaml` / `proxy.yaml`;**已保存过的用户**按 `ruleGroups` 原值回显(可能含子目录前缀,如 `mihomo/direct.yaml`) |
| 2 | 点"+" | 新增空分组行,聚焦可用 |
| 3 | 点分组行"删除" | **不触发表单提交**,仅该行移除 |
| 4 | 删光所有分组后保存 | 提示"请至少添加一个规则分组" |
| 5 | 缺必填字段保存 | 提示"请填写所有必填字段" |
| 6 | 非标准 Token 前缀 | 保存成功但提示格式警告 |
| 7 | 分支留空 | 保存为 `main` |
| 8 | provider 留空 | 保存后该字段**不存在**(非空字符串) |
| 9 | 测试 GitHub 连接(正常) | "连接成功!仓库访问正常" |
| 10 | 测试 Clash 连接(正常) | 显示 Clash 版本 |
| 11 | 导出配置 | JSON 下载,文件名含日期 |
| 12 | 导入同一文件两次 | 两次都生效(文件输入已重置) |
| 13 | 导入非法 JSON | "导入失败: 文件格式错误" |
| 14 | 保存后重新打开 | 所有字段与分组还原 |

### 跨界面

| # | 场景 | 期望 |
|---|------|------|
| 1 | options 改分组 → 打开 popup | popup 显示新分组 |
| 2 | popup 添加域名 → 打开 options | 无影响(配置未被 popup 改动) |

---

## Code Review Checklist

- [ ] 新增动态 DOM 是否用 `createElement` + `textContent`?
- [ ] `<form>` 内的按钮是否显式 `type="button"`?
- [ ] 异步操作是否有加载态,且失败路径恢复?
- [ ] 成功路径是否**意外**恢复了会被替换的按钮?
- [ ] 每个 catch 是否至少有 `console.error` 或用户提示?
- [ ] 提示文案是否指向真实原因,且有兜底分支?
- [ ] 超时是否使用共享常量(`TOAST_DURATION`)而非硬编码?
- [ ] storage 读取结果是否做了存在性校验?
- [ ] 可选字段是否用 `|| ''` 保护?
- [ ] 新增 id/class 是否更新到 `directory-structure.md` 的契约表?
- [ ] 用户可见文案是否中文?
- [ ] 是否引入新依赖或构建步骤?(应当没有)

---

## 已识别的技术债(待办)

> 以下为**已知问题**,本任务仅记录,修复另立任务。

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | 全部逻辑嵌套在 `DOMContentLoaded` 内 | `popup.js` | 无法从控制台调试/测试 |
| 2 | 错误分类靠 message 字符串匹配 | `popup.js` | GitHub 改文案即失效 |
| 3 | 分组迁移逻辑重复两份 | `popup.js` / `options.js` | 改一处漏一处 |
| 4 | 按钮渲染逻辑重复 | `renderActionButtons` / `updateButtonState` | 表现可能不一致 |
| 5 | `extractRootDomain` TLD 白名单硬编码 | `popup.js` | `github.io` 等公共后缀解析错误 |
| 6 | 不处理 IPv6 地址 | `extractRootDomain` | `[::1]` 解析异常 |
| 7 | `showMessage` 硬编码 3000ms | `options.js` | 与 `TOAST_DURATION` 不一致 |
| 8 | `showMessage` 未清理上一个计时器 | `options.js` | 快速操作时提示提前消失 |
| 9 | 导出配置含明文 Token | `options.js` | 备份文件泄露凭据 |
| 10 | 导入不做键白名单 | `options.js` | 可写入意外键 |
| 11 | `Promise.race` 超时计时器未清理 | `popup.js` | 游离计时器 |
| 12 | `domainStatus` 无 `aria-live` | `popup.html` | 屏幕阅读器不播报 |
| 13 | 深拷贝用 `JSON.parse(JSON.stringify())` | `options.js` | 脆弱 |
| 14 | 分组样式类别靠中文名匹配 | `popup.js` | 自定义分组无法指定类别 |

---

## Common Mistakes

### 常见错误: 忘记 `type="button"`

**Symptom**: 点"删除分组"导致表单提交

**Fix**: `removeBtn.type = 'button'`

### 常见错误: 加载态备份被覆盖

**Symptom**: 按钮文案变成 `undefined`

**Cause**: 连续两次 `setButtonLoading(true)`,第二次把"处理中..."备份为原文案

**Fix**: 进入前检查 `btn.disabled`

### 常见错误: 提示提前消失

**Symptom**: 连续操作时提示闪烁或立即消失

**Fix**: 保存并在下次显示前 `clearTimeout`(popup 已做,options 未做)

### 常见错误: 状态栏与按钮不一致

**Symptom**: 状态栏说"已添加"但按钮显示"添加"

**Cause**: 忘记调用 `updateDomainStatusText()`,或更新顺序颠倒

**Fix**: 按 `domainStatusMap` → 按钮 → 状态栏的顺序更新