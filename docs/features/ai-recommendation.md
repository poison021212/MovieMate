# AI 电影推荐

- 状态：已实现（荐片 + 事实问答 + 话题闲聊）
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-23

## 1. 目标

- **左栏**：根据收藏与观后笔记生成画像，展示本地「猜你喜欢」列表（无需先输入 prompt）。
- **右栏**：登录用户多轮对话；**OpenAI 兼容 LLM + Function Calling**（默认本机 Ollama `qwen2.5:7b`）驱动白名单工具循环。
- **三种意图**（服务端 `detectChatMode`）：
  - `recommend`：片单推荐，必须 grounding 出片
  - `qa`：导演/制片人/编剧/主演/简介等事实问答，`movies` 可为空
  - `chat`：电影观点与话题闲聊，通常不出片单
- 推荐结果映射 `local_movie_id`；`meta.agentTrace` / `meta.sources` 可观测。

## 2. 不做什么

- 不是任意 SQL / 任意 URL 的全自治 Agent（工具白名单 + 最大步数 `6`）；
- **不接**开放网页搜索、人物百科全集、通用搜索引擎；
- 事实来源限于站内片库 + TMDB 影片详情 credits；
- 单轮 `POST /api/recommend` 仍为兼容接口（非 Agent 循环）；
- 未登录不可用会话 API（画像推荐仍可匿名访问本地规则列表）。

## 3. 用户流程

1. 进入 `/ai-recommend`，左栏自动加载 `profile-feed`；
2. 登录后右栏选择或新建会话；
3. 按意图：推荐片单 / 问演职员 / 聊电影话题；
4. Agent `plan_tasks` → 工具 → `finish_recommend`；
5. **仅当 `movies.length > 0`** 时左栏覆盖为对话推荐；问答/闲聊保持画像列表。

## 4. 前后端契约

| 场景 | Method + Path | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 单轮推荐（兼容） | `POST /api/recommend` | 可选 Bearer | `{ prompt }` |
| 画像推荐 | `GET /api/recommend/profile-feed` | 可选 Bearer | `{ movies[], tasteProfile? }` |
| 会话列表 | `GET /api/recommend/sessions` | Bearer | |
| 新建会话 | `POST /api/recommend/sessions` | Bearer | `{ title? }` |
| 删除会话 | `DELETE /api/recommend/sessions/:id` | Bearer | 204 |
| 会话消息 | `GET /api/recommend/sessions/:id/messages` | Bearer | 含 `meta.agentTrace` |
| 多轮对话 | `POST /api/recommend/chat` | Bearer | `{ sessionId?, message }` |
| 流式对话 | `POST /api/recommend/chat/stream` | Bearer | SSE：`plan` / `trace` / `token` / `done`。**工具循环非流式**；工具结束后「写回复」走 LLM `stream: true`，`token` 为增量原文（不是整段后再按字切片） |

`meta.mode` 取值：`recommend` | `qa` | `chat`。

问答成功示例（空片单）：

```json
{
  "success": true,
  "assistantMessage": "《盗梦空间》导演为克里斯托弗·诺兰…",
  "movies": [],
  "meta": {
    "mode": "qa",
    "sources": [{ "type": "tmdb_detail", "tmdb_id": 27205 }],
    "agentTrace": []
  }
}
```

错误码：503（外部 API/候选空）、422（推荐模式未完成时尽量兜底）、429（限流）、400（参数）。**qa/chat 失败时不规则片单兜底**。

## 5. Agent 工具白名单

| Tool | 说明 |
| --- | --- |
| `plan_tasks` | **必须先调用**；`chat` 模式允许 `steps: []` |
| `get_taste_profile` | 读收藏/评论画像 |
| `search_local_movies` | 站内 LIKE 检索（片名/导演/演员） |
| `search_tmdb` | TMDB search / popular / top_rated |
| `get_movie_detail` | 详情含 director、producers、writers、cast（TMDB credits） |
| `get_trend_summary` | 平台趋势摘要 |
| `upsert_and_map_local` | TMDB 候选写回本地 |
| `finish_recommend` | 结束回合；`qa`/`chat` 时 `movies` 可为 `[]` |

**编排**：计划外工具跳过；工具失败重试 1 次；TMDB 失败降级本地搜索（推荐模式）；整轮 LLM 失败时 recommend 走规则片单（**不拼接用户原话**），qa/chat 优先用已检索详情拼 grounded 回复。  
**本轮优先**：系统提示要求 Agent 只服务当前用户消息，不因历史会话搜无关片名。  
**记忆**：会话 ≥8 轮写入 `ai_recommend_sessions.summary`。  
**限流**：每用户每分钟 12 次。  
**上下文预算**：按字符截断（默认 system 4k / 历史 6k / 每条工具 2k / 总计 16k，可用 `LLM_PROMPT_BUDGET_*` 覆盖）。超限时优先保留当前用户消息与最近工具结果，从最旧历史开始裁。实现：[`server/utils/promptBudget.js`](../../server/utils/promptBudget.js)。  
**流式**：`plan` / `trace` 在工具阶段发出；最终回复由独立一轮无工具 LLM 流式生成后落库。写回复失败则回退 `finish_recommend` 草稿或 `buildDegradedReply`。

## 6. 数据表

- `ai_recommend_sessions`、`ai_recommend_messages`（`meta_json` 存 trace/sources）

## 7. 验收标准

- [ ] 「推荐几部今年暑期热播」→ `mode: recommend`，片单与暑期/热播相关，**不**因上一轮会话去搜「千与千寻」
- [ ] 「聊聊千与千寻」→ 有讨论回复，不是「暂时无法继续这个话题」
- [ ] 「详细讲述一下千与千寻讲了什么」→ `mode: qa`，有剧情/简介；不出现「已根据你的口味推荐：详细讲述一下…」
- [ ] 「推荐几部悬疑」→ 有片单 + `mode: recommend`
- [ ] 「《盗梦空间》导演/制片人是谁」→ 基于工具事实，`movies` 可空
- [ ] 「聊聊诺兰非线性叙事」→ 有回复、不强推片、左栏仍是猜你喜欢
- [ ] 每轮发送后右栏「执行计划/工具轨迹/模式标签」随本轮刷新，不叠加上一轮
- [ ] 流式：工具轨迹先出，随后 `token` 增量出现（非整段生成后再匀速切片）
- [ ] `npm run build -w moviemate-client` 通过

## 8. 实现位置

- LLM 客户端：[`server/utils/llmClient.js`](../../server/utils/llmClient.js)（默认 Ollama；可改 `.env` 切云端；`chatCompletionsStream` 解析增量 token）
- Agent 运行时：[`server/utils/agentRuntime.js`](../../server/utils/agentRuntime.js)
- Prompt 预算：[`server/utils/promptBudget.js`](../../server/utils/promptBudget.js)
- 意图检测：[`server/utils/recommendCore.js`](../../server/utils/recommendCore.js) `detectChatMode`
- 会话：[`server/router_handler/aiChat.js`](../../server/router_handler/aiChat.js)
- 前端：[`client/src/components/AIRecommend.jsx`](../../client/src/components/AIRecommend.jsx)
