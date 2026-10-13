# 执行计划

## 交付物

| # | 文件 | 内容要点 | 来源依据 |
|---|------|---------|---------|
| 1 | `spec/frontend/index.md` | 更新索引状态 + 本层定位 | — |
| 2 | `spec/frontend/directory-structure.md` | 扁平结构、脚本加载顺序 | `popup.html:33-36`、`options.html:87-88` |
| 3 | `spec/frontend/component-guidelines.md` | 原生 DOM 构建约定、按钮状态机、Toast/Message | `popup.js`、`options.js` |
| 4 | `spec/frontend/hook-guidelines.md` | 无 React:改述为生命周期与异步助手约定 | 文件名保留 |
| 5 | `spec/frontend/state-management.md` | storage.sync 为唯一真源、内存态、遗留迁移 | `options.js:57-81` |
| 6 | `spec/frontend/quality-guidelines.md` | 禁止项(嵌套巨回调、字符串匹配错误) | `popup.js` |
| 7 | `spec/frontend/type-safety.md` | 无 TS:JSDoc + 运行时校验 | 全局 |
| 8 | `spec/backend/index.md` | 更新索引 + 本层定位 | — |
| 9 | `spec/backend/directory-structure.md` | 模块职责与导出约定 | `module.exports` 守卫 |
| 10 | `spec/backend/database-guidelines.md` | 改述为存储契约:storage.sync 键 + GitHub 文件 | `github-api.js` |
| 11 | `spec/backend/error-handling.md` | `error.status` 契约、404 语义、409 重试、错误矩阵 | `github-api.js:49-53,96-101` |
| 12 | `spec/backend/logging-guidelines.md` | console 约定 + 禁止记录 Token | 全局 |
| 13 | `spec/backend/quality-guidelines.md` | 并发/锁/UTF-8/缓存绕过 | `github-api.js` |
| 14 | `spec/guides/index.md` | 追加本项目触发条件 | — |
| 15 | `spec/guides/code-reuse-thinking-guide.md` | 追加本项目重复实例 | `popup.js` vs `options.js` |
| 16 | `README.md` | 路径/功能/结构/配置/FAQ/安全 | — |

## 顺序

1. **先 spec,后 README** —— README 的口径应与 spec 一致,避免二次返工
2. backend 层先行(错误契约是其他描述的基础),frontend 随后
3. guides 最后(引用前面已确立的约定)
4. README 收尾,对照 `ls` 与 `manifest.json` 校验

## 校验命令

```bash
# 1. 占位残留必须为 0
grep -rn "To be filled by the team" .trellis/spec/ | wc -l

# 2. 索引状态列不应再有 To fill(模板说明段除外)
grep -rn "| To fill |" .trellis/spec/

# 3. 禁止项必须仍存在(说明未被误删)
grep -c "D:\\\\download\\\\chajian" README.md   # 期望 0

# 4. 文件结构树与实际一致
ls -1 *.js *.css *.html *.json *.md

# 5. 无 CLAUDE.md 引用
grep -rn -i "claude" --include="*.md" --include="*.js" --include="*.json" . \
  | grep -v "^./.trellis/\|^./.agents/\|^./.pi/\|^./.git/"

# 6. Trellis 托管文件未被改动
git status --short .pi .agents AGENTS.md .trellis/scripts .trellis/workflow.md
```

## 风险

| 风险 | 缓解 |
|------|------|
| spec 写成泛泛而谈的教条 | 每条挂文件路径/行号,附 Wrong vs Correct |
| 与 Trellis 模板冲突导致 `trellis update` 覆盖 | 已确认 spec 不在 `.template-hashes.json` 托管清单(84 条中 0 条命中 spec) |
| README 与代码不一致 | 逐项对照 `manifest.json` 与 `ls` 输出 |
| 误改运行时代码 | 本任务只写 `.md`,提交前用 `git diff --stat` 复核非 md 文件为 0 |