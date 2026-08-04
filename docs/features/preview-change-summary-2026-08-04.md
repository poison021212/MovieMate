# 本轮改动汇总与 Preview 指南

- 状态：汇总文档（面向答辩 / 录屏 / 自测）
- 分支：`clean-structure`
- 最后核对日期：2026-08-04
- 关联 PR：[GitHub PR #1](https://github.com/poison021212/MovieMate/pull/1)（以仓库实际 PR 为准）

## 1. 这轮改了什么（一句话）

在原有电影社区 Demo 上，补齐 **Hybrid 搜索与 TMDB 同步**、**AI 推荐 grounding 与闭环**、**半 Agent 多轮会话**、**评论楼中楼**、**速览语音播报**，并修复若干前端稳定性问题。

## 2. 提交时间线（由早到晚，节选）

| 提交摘要 | 说明 |
| --- | --- |
| hybrid 搜索 + TMDB 回写 | 列表本地优先，不足时 TMDB 搜索并写入本地 |
| TMDB 增量同步多任务 | popular / top_rated / now_playing / upcoming |
| hybrid 累计统计 | `GET /api/movies/hybrid-stats` |
| AI grounding + 口味档案 + demo_seed | 单轮推荐更稳，站内 `local_movie_id` |
| 半 Agent 双栏 + 会话 + 评论回复 + TTS | AI 页重构、MySQL 会话表、回复表、速览播报 |
| UI/稳定性修复 | 海报、删除对齐、二次确认、白屏、缺表提示 |

完整列表可在本地执行：`git log --oneline clean-structure`。

## 3. 前端：你能看到的页面变化

### 3.1 首页 `/`

- 搜索默认开启 **Hybrid**（本地优先，必要时 TMDB 回写）。
- 可查看本次查询来源提示；可展开 **Hybrid 搜索统计**（进程内累计，重启后端清零）。

详见 [movie-list-query.md](movie-list-query.md)。

### 3.2 AI 推荐 `/ai-recommend`

- **左栏「猜你喜欢」**：根据收藏 + 观后笔记生成画像（未登录则用本地高分片单兜底）；卡片含**海报**与「详情」。
- **右栏「AI 对话」**：需登录；支持**新建 / 切换 / 删除会话**；多轮消息持久化在 MySQL。
- 对话成功后，左栏可展示**最近一次对话**的推荐结果。

详见 [ai-recommendation.md](ai-recommendation.md)。

### 3.3 电影详情 `/movie/:id`

- 收藏 / 取消收藏；**取消收藏有二次确认**。
- 影评列表；每条评论可**展开回复**（用户 ↔ 用户，非 AI）。
- **删除评论 / 删除回复**有二次确认；删除按钮与评论行对齐。

详见 [review-flow.md](review-flow.md)、[movie-detail-favorite.md](movie-detail-favorite.md)。

### 3.4 速览 `/swipe`

- 上下滑浏览；新增**简介语音播报**（浏览器 `speechSynthesis`），切换卡片自动停止。

详见 [swipe-mode.md](swipe-mode.md)。

### 3.5 个人收藏 `/profile`

- 「取消收藏」带二次确认。

## 4. 后端：主要 API 一览

### 4.1 列表与 Hybrid

| 接口 | 说明 |
| --- | --- |
| `GET /api/movies?hybrid=1&...` | 分页列表 + Hybrid 回退 |
| `GET /api/movies/hybrid-stats` | Hybrid 累计指标 |

### 4.2 AI 推荐

| 接口 | 鉴权 | 说明 |
| --- | --- | --- |
| `POST /api/recommend` | 可选 | 单轮推荐（兼容旧前端） |
| `GET /api/recommend/profile-feed` | 可选 | 左栏画像推荐 |
| `GET/POST/DELETE /api/recommend/sessions` | Bearer | 会话 CRUD |
| `GET /api/recommend/sessions/:id/messages` | Bearer | 历史消息 |
| `POST /api/recommend/chat` | Bearer | 多轮对话推荐 |

可靠性要点：候选池空 → **503**；模型结果不在候选池 → 过滤；全无 → **422**。

### 4.3 评论与回复

| 接口 | 鉴权 | 说明 |
| --- | --- | --- |
| `GET/POST /api/reviews` | POST 需 JWT | 原有影评 |
| `DELETE /api/reviews/:id` | JWT | 删自己的评论 |
| `GET /api/reviews/:id/replies` | 无 | 回复列表 |
| `POST /api/reviews/:id/replies` | JWT | 发表回复 |
| `DELETE /api/replies/:replyId` | JWT | 删自己的回复 |

## 5. 数据库：新表与脚本

### 5.1 新表

- `ai_recommend_sessions`、`ai_recommend_messages` — AI 会话与消息
- `review_replies` — 评论回复

### 5.2 脚本用法

| 脚本 | 何时执行 |
| --- | --- |
| [server/sql/init.sql](../../server/sql/init.sql) | **全新**建库（已含新表） |
| [server/sql/ai_chat_and_replies.sql](../../server/sql/ai_chat_and_replies.sql) | **已有** `movie_db`，缺新表时 |
| [server/sql/demo_seed.sql](../../server/sql/demo_seed.sql) | 可选：演示账号 + 收藏/评论种子 |

演示账号：`demo_user` / 密码 `123456`（用于 AI 画像与 2 分钟演示）。

### 5.3 常见报错

- 回复或 AI 会话接口 **500/503** 且提示缺表 → 执行 `ai_chat_and_replies.sql`。

## 6. 环境变量（Preview 必看）

在 [server/.env.example](../../server/.env.example) 基础上配置 [server/.env](../../server/.env)（勿提交 Git）：

| 变量 | 必填 | 用途 |
| --- | --- | --- |
| `DB_*`、`JWT_SECRET` | 是 | 登录、业务数据 |
| `TMDB_ACCESS_TOKEN` | 否* | Hybrid 回退、AI 候选池、同步脚本 |
| `DASHSCOPE_API_KEY` | 否* | AI 对话 / 单轮推荐 |

\* 不配置时：除 AI 与 Hybrid 回退外，其余页面仍可用；AI 页会提示候选/密钥问题。

Cloud Agent 可将 Secrets 同步到本地 `.env`（不提交）：

```bash
server/scripts/sync-env-from-secrets.sh
```

## 7. Preview 最短路径（建议 5–10 分钟）

### 7.1 准备

```bash
npm install
mysql -u root -p < server/sql/init.sql
mysql -u root -p movie_db < server/sql/demo_seed.sql
mysql -u root -p movie_db < server/sql/ai_chat_and_replies.sql   # 若 init 已是新版可跳过
# 配置 server/.env 后：
npm run dev
```

浏览器访问 <http://localhost:5173>，建议 **硬刷新**（Ctrl+Shift+R）避免旧缓存。

### 7.2 验收勾选

- [ ] 首页搜索，观察 Hybrid 来源提示
- [ ] 登录 `demo_user` / `123456`
- [ ] `/ai-recommend` 左栏有海报与推荐；右栏能发消息（需 TMDB + DashScope）
- [ ] 进入某电影详情：发评论、回复、删回复（均有确认弹窗）
- [ ] 取消收藏有确认弹窗
- [ ] `/swipe` 点击喇叭播报简介

更完整的 2 分钟话术见根目录 [README.md](../../README.md) 中「2 分钟演示脚本」一节。

## 8. 已修复的问题（自测时可对照）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 详情页空白 | `ReviewsForm` 缺少 `useLocation` 等导入 | 已修复 |
| 详情页空白（早期） | `MovieDetails` 中 hooks 顺序 | 已修复 |
| 回复评论 500 | 未执行 `ai_chat_and_replies.sql` | 执行迁移 + 接口缺表提示 |
| 删除/取消收藏无弹窗 | 未包 antd `<App>` | `App.jsx` 已包 `<AntdApp>` + `confirmDialog` |

## 9. 关键代码入口（便于对照）

| 模块 | 路径 |
| --- | --- |
| Hybrid 列表 | `server/router_handler/movie.js` |
| Hybrid 统计 | `server/utils/hybridSearchMetrics.js` |
| TMDB 同步 | `server/scripts/syncTmdbMovies.js` |
| 推荐核心 | `server/utils/recommendCore.js` |
| 会话存储 | `server/utils/aiSessionStore.js`、`server/router_handler/aiChat.js` |
| AI 页 | `client/src/components/AIRecommend.jsx` |
| 评论回复 | `client/src/components/ReviewsForm.jsx` |
| 速览 TTS | `client/src/utils/speakText.js` |

## 10. 已知边界（演示时如实说明即可）

- Hybrid 统计为**单进程内存**累计，重启后端清零。
- AI 质量依赖 TMDB 候选池与 DashScope；网络或密钥异常时返回 503/422/500，属预期降级。
- 浏览器 TTS 音色因系统而异；后续可换云 TTS（见 swipe-mode 文档后续扩展）。
- `movie.js` 与 `movieUpsert.js` 仍存在部分重复 upsert 逻辑，后续可收敛重构（不影响当前演示）。

## 11. 延伸阅读

- [docs/README.md](../README.md) — 文档索引
- [runtime-and-config.md](runtime-and-config.md) — 分支、启动、故障排查
- [AGENTS.md](../../AGENTS.md) — 协作与提交规范
