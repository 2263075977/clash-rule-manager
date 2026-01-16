# Clash 规则管理器 - Chrome/Edge 浏览器插件

一个简洁的浏览器插件，用于快速将当前访问的域名添加到 GitHub 仓库的 Clash 规则文件中。

## 功能特性

- ✅ 一键添加当前域名到直连规则或代理规则
- ✅ 使用 GitHub Personal Access Token 安全认证
- ✅ 支持自定义仓库和文件路径
- ✅ 实时反馈操作结果
- ✅ 简洁美观的用户界面

## 安装步骤

### 1. 准备图标文件

在 `icons/` 目录下放置以下三个图标文件：
- `icon16.png` (16x16 像素)
- `icon48.png` (48x48 像素)
- `icon128.png` (128x128 像素)

你可以使用任何图标，建议使用蓝色主题以匹配插件风格。

### 2. 加载插件到浏览器

1. 打开 Chrome/Edge 浏览器
2. 访问 `chrome://extensions/` (Chrome) 或 `edge://extensions/` (Edge)
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择本项目的根目录 (`D:\download\chajian`)

## 配置说明

### 1. 创建 GitHub Personal Access Token

1. 访问 [GitHub Token 设置页面](https://github.com/settings/tokens/new)
2. 设置 Token 名称（如：Clash Rule Manager）
3. 选择权限：勾选 `repo` (完整仓库访问权限)
4. 点击"Generate token"并复制生成的 Token

### 2. 配置插件

1. 点击浏览器工具栏的插件图标
2. 点击底部的"⚙️ 设置"链接
3. 填写以下信息：
   - **GitHub Personal Access Token**: 刚才创建的 Token
   - **仓库所有者**: 你的 GitHub 用户名或组织名
   - **仓库名称**: 存放规则文件的仓库名
   - **分支名称**: 默认 `main`
   - **直连规则文件路径**: 默认 `direct.txt`
   - **代理规则文件路径**: 默认 `proxy.txt`
4. 点击"测试连接"验证配置是否正确
5. 点击"保存设置"

## 使用方法

1. 访问任意网站
2. 点击浏览器工具栏的插件图标
3. 插件会自动显示当前网站的域名
4. 点击"➕ 添加到直连规则"或"🌐 添加到代理规则"
5. 等待操作完成，会显示成功或失败提示

## 规则格式

插件会以 Clash 标准格式添加规则：

```
DOMAIN-SUFFIX,example.com
```

规则会自动追加到对应文件的末尾。

## 文件结构

```
clash-rule-manager/
├── manifest.json           # Manifest V3 配置文件
├── popup.html             # 弹出窗口界面
├── popup.css              # 弹出窗口样式
├── popup.js               # 弹出窗口逻辑
├── options.html           # 设置页面
├── options.css            # 设置页面样式
├── options.js             # 设置页面逻辑
├── github-api.js          # GitHub API 交互模块
├── icons/                 # 插件图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # 本文件
```

## 常见问题

### Q: 提示"请先配置 GitHub 设置"
A: 请先点击"⚙️ 设置"配置 GitHub Token 和仓库信息。

### Q: 提示"Token 无效"
A: 请检查 Token 是否正确，是否有 `repo` 权限，是否已过期。

### Q: 提示"文件不存在"
A: 请确保 GitHub 仓库中已存在对应的规则文件（direct.txt 和 proxy.txt）。如果不存在，请先在仓库中创建这两个空文件。

### Q: 提示"该域名已存在"
A: 该域名已经在规则文件中，无需重复添加。

### Q: 提示"权限不足"
A: 请检查 Token 是否有 `repo` 权限，以及是否有该仓库的写入权限。

## 安全说明

- GitHub Token 存储在浏览器的 `chrome.storage.sync` 中，已加密
- 所有 API 调用均使用 HTTPS
- Token 不会被发送到除 GitHub API 之外的任何服务器
- 建议定期更换 Token

## 技术栈

- Manifest V3
- 原生 JavaScript (无框架依赖)
- GitHub REST API
- Chrome Extension APIs

## 开发说明

本插件使用原生 JavaScript 开发，无需构建步骤。修改代码后：

1. 在 `chrome://extensions/` 页面点击"重新加载"按钮
2. 重新打开插件即可看到更改

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
