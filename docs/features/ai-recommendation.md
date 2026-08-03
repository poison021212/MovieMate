# AI 电影推荐

- 状态：已实现（MVP）
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-03

## 1. 目标

根据用户自然语言描述，结合 TMDB 候选池与通义千问，返回 3–5 部推荐及理由。

## 2. 不做什么

- 不读取用户收藏/影评做个性化（当前无用户上下文）；
- TMDB 失败时不应让模型「凭空编片」（代码在候选为空时仍可能走弱约束，后续应加强 grounding）；
- 推荐结果详情当前多跳转 TMDB 外链，非站内 `movieId` 闭环。

## 3. 用户流程

1. 进入 `/ai-recommend`；
2. 输入偏好描述，点击获取推荐；
3. 展示卡片（片名、年份、理由、可选 TMDB 评分）；
4. 「查看详情」打开 TMDB 页面（有 `id` 时）。

## 4. 前后端契约

| 场景 | Method + Path | 请求 | 响应 |
| --- | --- | --- | --- |
| AI 推荐 | `POST /api/recommend` | `{ prompt: string }` | `{ success, movies[], intent }` 或 `{ error }` |

环境变量（[`server/.env.example`](../../server/.env.example)）：

- `TMDB_ACCESS_TOKEN` — TMDB Bearer
- `DASHSCOPE_API_KEY` — 通义千问

### 处理概要

1. `detectIntent(prompt)`：经典 / 近期 / 混合；
2. 拉取 TMDB popular 或 discover 候选；
3. 构造 system prompt，要求 JSON 数组；
4. 调用 DashScope compatible chat API（`qwen-turbo`）；
5. 正则提取 JSON，与候选池按标题或 `tmdb_id`  enrichment。

## 5. 风险与约束

- 依赖外网 TMDB 与 DashScope；
- JSON 解析依赖正则，失败时可能返回空数组；
- 密钥仅配置在服务端，不得提交到 Git；
- 无登录限流，demo 环境需注意 API 成本。

## 6. 验收标准

- [ ] 有效 prompt 返回 `movies` 数组；
- [ ] 缺 `prompt` 返回 400；
- [ ] 缺密钥时明确错误信息；
- [ ] 前端 loading / error 态可用。

## 7. 实现位置

- 后端：[`server/router_handler/ai.js`](../../server/router_handler/ai.js)、[`server/router/ai.js`](../../server/router/ai.js)
- 前端：[`client/src/components/AIRecommend.jsx`](../../client/src/components/AIRecommend.jsx)、[`client/src/store/API/vercelApi.jsx`](../../client/src/store/API/vercelApi.jsx)
- Vite 代理：[`client/vite.config.js`](../../client/vite.config.js) 将 `/api` 转发至 `localhost:1337`
