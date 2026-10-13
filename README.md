# Clash 规则管理器 - Chrome/Edge 浏览器插件

一个简洁的浏览器插件,用于快速将当前访问的域名添加到 GitHub 仓库的 Clash 规则文件中,并可选地自动重载 Clash 规则。

## 功能特性

- ✅ **一键添加/删除**:自动提取当前标签页的根域名,添加到指定规则分组
- ✅ **状态自动检测**:打开插件即显示该域名已存在于哪些分组(分批并发,避免触发速率限制)
- ✅ **多规则分组**:支持任意数量的自定义分组,每组对应一个规则文件
- ✅ **Clash 自动重载**:配置 Clash 外部控制器后,写入规则时自动 `PUT /providers/rules/<name>` 重载
- ✅ **GitHub Token 认证**:使用 Personal Access Token,支持 `ghp_` 与 `github_pat_` 两种格式
- ✅ **配置备份**:一键导出/导入全部配置为 JSON
- ✅ **并发安全**:同文件操作加锁,409 冲突自动重试
- ✅ **中文友好**:规则文件中的中文注释经 UTF-8 安全的 Base64 编解码,不会损毁
- ✅ **实时反馈**:Toast 提示操作结果,失败时给出明确原因

## 安装步骤

### 1. 获取代码

```bash
git clone https://github.com/2263075977/clash-rule-manager.git
```

或直接下载 ZIP 并解压到任意目录。

> 本项目**无需构建**:无 npm 依赖、无编译步骤。解压后即可加载。

### 2. 加载插件到浏览器

1. 打开 Chrome/Edge 浏览器
2. 访问 `chrome://extensions/`(Chrome)或 `edge://extensions/`(Edge)
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择**本项目根目录**(即含 `manifest.json` 的目录)

## 配置说明

### 1. 创建 GitHub Personal Access Token

1. 访问 [GitHub Token 设置页面](https://github.com/settings/tokens/new)
2. 设置 Token 名称(如 `Clash Rule Manager`)
3. 勾选权限:`repo`(完整仓库访问权限)
4. 点击"Generate token"并复制生成的 Token

### 2. 准备规则文件

在目标 GitHub 仓库中创建规则文件。**文件不存在也不会报错** —— 首次添加域名时会自动创建。

规则文件格式为每行一条:

```
DOMAIN-SUFFIX,example.com
```

> 文件可以为空,也可以包含中文注释。

### 3. 配置插件

1. 点击浏览器工具栏的插件图标
2. 点击底部的"⚙️ 设置"链接
3. 填写以下信息:

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| GitHub Personal Access Token | 上一步创建的 Token | — |
| 仓库所有者 | GitHub 用户名或组织名 | — |
| 仓库名称 | 存放规则文件的仓库 | — |
| 分支名称 | 目标分支 | `main` |
| 规则分组配置 | 见下表 | 直连规则 / 代理规则 |
| Clash API 地址 | 外部控制器地址(可选) | 空 |
| Clash API 密钥 | Clash 配置中的 `secret`(可选) | 空 |

**规则分组**每项包含三个字段:

| 字段 | 必填 | 说明 |
|------|------|------|
| 显示名称 | ✅ | 如"直连规则"、"办公网络" |
| 规则文件路径 | ✅ | 仓库内相对路径,如 `direct.txt` |
| Clash Provider 名称 | ➖ | 留空则不触发自动重载 |

> **提示**: 显示名中包含"直连"会使用蓝色按钮样式,包含"代理"使用另一种样式;其他名称按代理样式显示。

4. 点击"测试 GitHub 连接"与"测试 Clash 连接"验证配置(Clash 为可选项)
5. 点击"保存设置"

## 使用方法

1. 访问任意网站
2. 点击浏览器工具栏的插件图标
3. 插件自动显示当前网站的**根域名**与状态
4. 点击"➕ 添加到 <分组名>",或对已添加的域名点击"🗑️ 从 <分组名> 删除"
5. 等待提示操作结果

### 域名提取规则

| 输入 | 提取结果 |
|------|---------|
| `www.example.com/path` | `example.com` |
| `a.b.example.co.uk` | `example.co.uk` |
| `example.com.cn` | `example.com.cn` |
| `192.168.1.1` | `192.168.1.1` |
| `localhost:8080` | `localhost` |

支持的特殊多级 TLD:`co.uk`、`com.cn`、`com.au`、`co.jp`、`co.kr`、`com.br`、`com.tw`。

> ⚠️ **已知限制**: 不支持所有公共后缀(如 `github.io` 会被提取为 `github.io` 而非预期的完整域名),也不处理 IPv6 地址。

## 配置备份

在设置页底部:

- **导出配置**: 下载 `clash-config-backup-<日期>.json`
- **导入配置**: 选择之前导出的 JSON 文件,导入后立即生效

> ⚠️ **安全提醒**: 导出的 JSON **包含明文 GitHub Token**,请勿分享或上传到公开位置。

## 文件结构

```
clash-rule-manager/
├── manifest.json      # Manifest V3 配置(权限、CSP、入口)
├── shared.js          # 共享常量(默认分组、超时、并发上限)
├── github-api.js      # GitHub REST API 封装(类 GitHubAPI)
├── clash-api.js       # Clash 控制器 API 封装(类 ClashAPI)
├── popup.html         # 弹出窗口结构
├── popup.css          # 弹出窗口样式
├── popup.js           # 弹出窗口逻辑
├── options.html       # 设置页结构
├── options.css        # 设置页样式
├── options.js         # 设置页逻辑
├── common.css         # 两界面共享样式
├── icons/             # 插件图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # 本文件
```

开发相关文档位于 `.trellis/`(由 [Trellis](https://github.com/mindfoldhq/trellis) 管理),包含编码规范与任务记录。

## 常见问题

### Q: 提示"请先配置 GitHub 设置"

A: 点击"⚙️ 设置"配置 Token、仓库所有者与仓库名称。

### Q: 提示"Token 无效"

A: 检查 Token 是否正确、是否有 `repo` 权限、是否已过期。

### Q: 提示"文件不存在"

A: 规则文件路径有误,或 Token 对该仓库无访问权限。注意**读取**不存在的文件不会报错,此提示通常出现在**写入**阶段。

### Q: 提示"该域名已存在"

A: 该域名已在目标规则文件中,无需重复添加。

### Q: 提示"权限不足"

A: Token 缺少 `repo` 权限,或对该仓库无写入权限。

### Q: 提示"操作进行中,请稍后"

A: 同一规则文件正在被另一个操作占用(并发保护)。稍等片刻重试。

### Q: 添加成功但 Clash 没生效

A: 检查"Clash Provider 名称"是否填写,且与 Clash 配置中 `rule-providers` 的键名**完全一致**。也可在设置页用"测试 Clash 连接"验证可达性。Clash 调用失败**不会**影响规则写入,只是缺少自动重载。

### Q: 提示"网络错误"

A: 无法访问 `api.github.com`。检查网络、代理设置,或 GitHub 是否可达。

### Q: 保存时提示"Token 格式可能不正确"

A: 这是**警告而非错误**,配置已保存。标准前缀为 `ghp_` 或 `github_pat_`。

## 安全说明

- GitHub Token 存储在 `chrome.storage.sync` 中,由浏览器加密同步
- 所有 API 调用均使用 HTTPS
- Token 仅发送至 `api.github.com`,不会发往任何其他服务器
- Token 不会写入日志或界面提示
- 建议定期更换 Token

> ⚠️ **注意**: 导出的配置文件包含明文 Token,请妥善保管。

### 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 获取当前标签页 URL 以提取域名 |
| `storage` | 存储配置信息 |
| `tabs` | 查询标签页信息 |
| `https://api.github.com/*` | 调用 GitHub API |

> Clash API 的访问依赖 `manifest.json` 中 CSP 的 `connect-src` 允许 `http:`,因此支持 `http://127.0.0.1:9090` 这类本地地址。

## 技术栈

- Manifest V3
- 原生 JavaScript(**无框架、无依赖、无构建步骤**)
- GitHub REST API
- Clash 外部控制器 API
- Chrome Extension APIs

## 开发说明

### 本地调试

1. 修改代码后,在 `chrome://extensions/` 点击"重新加载"按钮
2. 重新打开插件查看更改
3. 查看日志:
   - popup:右键插件图标 → 检查弹出内容 → Console
   - options:在设置页右键 → 检查 → Console

### 代码约定

本项目由 Trellis 管理,编码规范见 `.trellis/spec/`:

- `.trellis/spec/frontend/` — UI 层规范(原生 DOM、状态管理、类型安全)
- `.trellis/spec/backend/` — 服务层规范(GitHub/Clash API、错误处理、存储契约)
- `.trellis/spec/guides/` — 跨层与代码复用思考清单

**改动前请先阅读对应层的 `index.md`。**

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request!