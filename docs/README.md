# MovieMate 文档

本目录存放**当前有效**的功能说明与协作约束，不记录聊天流水或临时排查过程。

## 功能文档（`features/`）

| 文档 | 说明 |
| --- | --- |
| [movie-list-query.md](features/movie-list-query.md) | 电影列表：分页、搜索、排序、筛选、URL 同步 |
| [movie-detail-favorite.md](features/movie-detail-favorite.md) | 电影详情与收藏 |
| [review-flow.md](features/review-flow.md) | 影评发布、列表、删除 |
| [swipe-mode.md](features/swipe-mode.md) | 速览模式（上下滑 + 分页预加载） |
| [ai-recommendation.md](features/ai-recommendation.md) | AI 电影推荐（Tool-calling Agent） |
| [ai-recommendation-feedback.md](features/ai-recommendation-feedback.md) | AI 推荐赞踩/换一批反馈闭环 |
| [ai-recommendation-gap.md](features/ai-recommendation-gap.md) | AI 推荐诊断：对比主流 LLM 产品的缺陷与改进路线（评审） |
| [analytics-dashboard.md](features/analytics-dashboard.md) | 数据洞察仪表盘（日快照 + AI 预测；`userCount` 仅 staff 可见） |
| [ops-console.md](features/ops-console.md) | 运营控制台（预设角色、角色管理、封禁/审评论/审计） |
| [tmdb-sync.md](features/tmdb-sync.md) | TMDB 数据同步脚本 |
| [douban-seed.md](features/douban-seed.md) | 豆瓣离线种子导入（TMDB 不可达时的本地兜底） |
| [change-summary-2026-08-24.md](features/change-summary-2026-08-24.md) | 2026-08-24 改造汇总：安全修复、评论/收藏契约、集成测试 |
| [runtime-and-config.md](features/runtime-and-config.md) | 环境、启动、数据库与故障排查 |
| [auth-security.md](features/auth-security.md) | 登录注册、会话与密码找回（`user.role` 随登录/me 返回） |
| [preview-change-summary-2026-08-04.md](features/preview-change-summary-2026-08-04.md) | 本轮改动汇总与 Preview 指南 |

## 协作规范

- 根目录 [AGENTS.md](../AGENTS.md)：AI 与开发者协作规则。
- 根目录 [README.md](../README.md)：快速运行与 API 速查。

功能契约变更时，须在同一改动中更新对应 `features/*.md` 与 README 相关段落。

## 秋招准备（`interview/`）

| 文档 | 说明 |
| --- | --- |
| [resume-bullets.md](interview/resume-bullets.md) | 简历 3–4 条 bullet 改稿 |
| [walkthrough-p0.md](interview/walkthrough-p0.md) | P0 必懂实现 + 3 张时序图 |
| [demo-script.md](interview/demo-script.md) | 5 分钟现场演示脚本 |
