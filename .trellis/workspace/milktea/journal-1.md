# Journal - milktea (Part 1)

> AI development session journal
> Started: 2026-10-13

---



## Session 1: 补齐 Trellis spec 规范并同步 README
<!-- trellis-session: v=2 fp=9170852bd8fbe95e -->

**Date**: 2026-10-13
**Task**: 补齐 Trellis spec 规范并同步 README
**Branch**: `main`

### Summary

将 spec 三个层从模板占位填充为项目真实约定(约2800行),README 修正安装路径并补全功能/结构/FAQ/安全警示

### Main Changes

- spec(frontend/backend/guides) 填充真实约定;README 重写

### Git Commits

| Hash | Message |
|------|---------|
| `1551413` | docs: 补齐 Trellis spec 规范并同步 README |

### Testing

- [OK] grep 占位残留=0, 相对链接全部有效, 托管文件零改动, 变更全为 .md

### Status

[OK] **Completed**

### Next Steps

- 14 项技术债待专项任务: popup.js 拆解嵌套回调、错误分类改用 error.status、迁移逻辑去重


## Session 2: 规则文件读写切换为 mihomo yaml 格式
<!-- trellis-session: v=2 fp=953f81555d4a8788 -->

**Date**: 2026-10-14
**Task**: 规则文件读写切换为 mihomo yaml 格式
**Branch**: `main`

### Summary

插件管理的规则文件从 classic 文本(DOMAIN-SUFFIX,x)切换为 mihomo behavior: domain + format: yaml;读取层兼容 +. / 裸值 / DOMAIN, / DOMAIN-SUFFIX, 四种写法;默认分组路径改 direct.yaml / proxy.yaml

### Main Changes

- github-api.js: 新增 normalizeDomain/parseRuleLine/isDomainCovered/appendRule;判重与删除改按解析后语义,写入行固定 "  - '+.<domain>'" 且插入最后一个规则行之后(非 EOF)
- shared.js: defaultRuleGroups → direct.yaml / proxy.yaml;options.js: placeholder → office.yaml
- docs: README + 4 份 spec 同步 yaml 规则文件契约(归一化矩阵、判重/删除语义、验证清单)

### Git Commits

| Hash | Message |
|------|---------|
| `24d66fe` | feat: 规则文件读写切换为 mihomo yaml 格式 |
| `bb4b270` | docs: 同步 yaml 规则文件契约 |
| `af14f71` | chore(task): archive 10-14-yaml-rule-format |

### Testing

- [OK] [OK] 独立验证 3 套:纯函数断言 54/55(1 项为 design 允许的二选一)、stub fetch 端到端 17/0、PyYAML 解析 7/7 合法
- [OK] [OK] 锁 + 409 重试脚手架逐字未动(diff 仅 11 行核心逻辑);popup.js/clash-api.js/manifest.json/html 零改动;无新增依赖
- [OK] [OK] 托管文件零改动;交付物恰为 8 文件,无表外改动

### Status

[OK] **Completed**

### Next Steps

- 人工:插件设置里把分组路径改为 direct.yaml / proxy.yaml,并填写 Provider 名 private_direct / private_proxy
- 后续手动:config.yaml 的 proxy-providers.zj.url 空值、provider 的 proxy: DIRECT、custom_port_direct 命名
- 技术债另立任务:addDomainToFile/removeDomainFromFile 的锁+409 脚手架去重
