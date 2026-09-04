

## Codely Structured Memories

### User
- [2026-09-04 10:40:41] [user] 用户对界面密度很敏感：嫌默认 UI 字体相对行高太小（"只占50%行高"），偏好文字更充分占满行高的紧凑布局；倾向精简 UI（如移除帮助菜单）。做 UI 改动时优先保证文字与行高的填充比例，缩放类需求优先考虑只放大字体、间距不变（ui_font_scale 模式）。

### Feedback
- [2026-09-04 12:20:57] [feedback] 用户在 pnpm dev 模式下观察并报告内存/性能数字（dev 是 Vite node + 浏览器多进程 + Rust dev 后端的总和，且未压缩，不代表打包版）。Why: 2026-09-04 曾把 dev 模式 ~1GB 内存误判为泄漏，实际 1-5 个会话属 dev 正常水位。How to apply: 处理性能/内存类反馈时，先确认运行方式（dev/打包版）、会话规模与增长模式，再决定是排查泄漏还是做代码优化。

### Project
- [2026-09-04 10:23:23] [project] 此机器 PowerShell 执行策略阻止 pnpm.ps1（报 "running scripts is disabled"），shell 命令需用 `pnpm.cmd` 代替 `pnpm`，多条命令不能用 `&&` 连接（老版 PowerShell），需分开执行。
- [2026-09-04 11:23:32] [project] 本机测试环境已知问题（已用 stash 基线对比确认与代码无关）：1) cargo test 测试二进制无法启动（STATUS_ENTRYPOINT_NOT_FOUND / 0xc0000139，DLL 环境问题，编译本身正常）；2) 前端 FileDocumentEditor.test.tsx / FilePreviewContent.test.tsx 因 `React.act is not a function` 既有失败（react-dom 19.2.4 测试环境问题）。测试失败先跑基线对比再排查。
- [2026-09-04 11:23:32] [project] CLAUDE.md 中"根应用没有前端测试运行器"的说法已过时：package.json 配置了 vitest，用 `pnpm exec vitest run <路径>` 运行（约 250+ 用例，lib 与部分组件均有测试）。
- [2026-09-04 13:36:17] [project] 云同步“指针+快照”两段式：latest.redb.enc 指针 + snapshots/<revision>.redb.enc 数据 + current.redb.enc 兼容副本。报 "Remote sync metadata is inconsistent: latest points to ... but the referenced snapshot is missing" 时是远端数据既有问题（多为中断的远端写入），处理路径在 设置→同步与备份 的冲突警告框：优先“使用当前远端快照恢复”（recover_current_remote），或“上传本地版本”强制推送（upload_local，resolve_cloud_sync_conflict action）。

### Reference

