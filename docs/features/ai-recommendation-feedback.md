# AI 推荐反馈闭环

- 状态：已实现
- 最后核对日期：2026-08-26

## 1. 目标

让荐片从「一次性生成」变为 **可反馈**：用户对对话推荐卡片点 👍/👎，或点击「换一批」，反馈写入数据库并在下一轮 Agent system prompt 中注入，引导模型避开点踩影片、倾向点赞类型。

不做向量检索 / 协同过滤；这是秋招前最小可演示的 **反馈闭环**。

## 2. 用户流程

1. 登录用户在 `/ai-recommend` 通过对话获得左栏片单（`chatMovies.length > 0`）。
2. 每张推荐卡片可点 👍 / 👎。
3. 点 **换一批**：记录 `refresh_batch` 并自动发送「换一批…」消息。
4. 下轮对话 Agent 读取最近反馈，写入 `【用户近期反馈】` system 段。

## 3. API

| 场景 | Method + Path | 鉴权 | Body |
| --- | --- | --- | --- |
| 提交反馈 | `POST /api/recommend/feedback` | Bearer | `{ movieTitle, action, sessionId?, localMovieId?, tmdbId? }` |

`action`：`like` | `dislike` | `refresh_batch`

## 4. 数据表

`ai_recommend_feedback`（新库见 [`server/sql/init.sql`](../../server/sql/init.sql)；增量见 [`server/sql/ai_recommend_feedback.sql`](../../server/sql/ai_recommend_feedback.sql)）

运行时 handler 也会 `CREATE TABLE IF NOT EXISTS`（[`server/utils/aiRecommendFeedback.js`](../../server/utils/aiRecommendFeedback.js)）。

## 5. 实现位置

- 反馈存储与 prompt 拼接：[`server/utils/aiRecommendFeedback.js`](../../server/utils/aiRecommendFeedback.js)
- 注入 Agent：[`server/utils/agentRuntime.js`](../../server/utils/agentRuntime.js) `buildSystemPrompt(..., feedbackHint)`
- 路由：[`server/router/ai.js`](../../server/router/ai.js)、[`server/router_handler/aiChat.js`](../../server/router_handler/aiChat.js)
- 前端：[`client/src/components/AIRecommend.jsx`](../../client/src/components/AIRecommend.jsx)、[`client/src/store/API/vercelApi.jsx`](../../client/src/store/API/vercelApi.jsx)

## 6. 验收

- [ ] 对话出片后卡片显示 👍/👎
- [ ] 点 **换一批** 后左栏刷新为新片单（有海报/站内 id 或回退猜你喜欢），不出现「暂无」占位
- [ ] 未登录不显示反馈按钮
- [ ] `npm run build -w moviemate-client` 通过

## 7. 面试怎么说

> 推荐链路仍是 Tool-calling + 小候选池 rerank；反馈闭环把用户 👎 写库并注入下轮 system prompt，是从「聊天玩具」迈向「可迭代推荐」的第一步。未做硬规则过滤和离线 hit-rate，秋招后可用 Retrieval→Rerank + 评估指标继续演进。
