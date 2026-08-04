# AI 电影推荐

- 状态：已实现（grounding + 站内闭环 v1）
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-04

## 1. 目标

根据用户自然语言描述，从 TMDB 拉取**固定候选池**，由通义千问在池内选出 3–5 部并给出理由；结果必须落在候选列表内（grounding），并尽量映射到本地 `movies.id` 以便跳转站内详情与写观后笔记。登录用户可注入轻量「口味档案」（收藏类型/年代 + 高分影评统计）。

## 2. 不做什么

- 不推荐候选池外的片名（模型输出会被过滤；全无匹配时返回 422）；
- 候选池为空时不调用模型（503）；
- 口味档案不替代候选池约束，仅影响排序倾向说明；
- 无登录时仍可推荐，但不读取收藏/影评。

## 3. 用户流程（闭环）

1. 进入 `/ai-recommend`，输入偏好描述；
2. 可选：先登录 `demo_user`（见 [runtime-and-config.md](runtime-and-config.md) 演示账号），以便注入口味档案；
3. 展示推荐卡片与 `meta`（候选数、grounding 数、站内映射率）；
4. **查看详情**：有 `local_movie_id` 时进入 `/movie/:id`，否则打开 TMDB 外链；
5. **写笔记**：跳转 `/movie/:id#movie-review`，详情页滚动至观后笔记表单。

## 4. 前后端契约

| 场景 | Method + Path | 鉴权 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| AI 推荐 | `POST /api/recommend` | 可选 Bearer | `{ prompt: string }` | 见下 |

成功响应：

```json
{
  "success": true,
  "movies": [
    {
      "title": "…",
      "reason": "…",
      "year": 2024,
      "tmdb_id": 123,
      "local_movie_id": 45,
      "poster_path": "/…",
      "vote_average": 7.8
    }
  ],
  "intent": "mixed",
  "meta": {
    "candidateCount": 30,
    "groundedCount": 4,
    "localMappedCount": 4,
    "localMappedRatePercent": 100,
    "profileApplied": true,
    "tasteProfile": { "topGenres": ["科幻"], "yearRange": "2018-2024" }
  }
}
```

错误：

| HTTP | 含义 |
| --- | --- |
| 400 | 缺少或无效 `prompt` |
| 422 | 模型结果未通过候选池校验 |
| 503 | TMDB 候选为空或拉取失败 |
| 500 | DashScope 或其它服务端错误 |

环境变量（[`server/.env.example`](../../server/.env.example)）：

- `TMDB_ACCESS_TOKEN` — TMDB Bearer
- `DASHSCOPE_API_KEY` — 通义千问
- `JWT_SECRET` — 解析可选 Authorization，构建口味档案

### 处理概要

1. `detectIntent(prompt)`：经典 / 近期 / 混合；
2. 拉取 TMDB 候选（popular 或 discover）；
3. `resolveLocalMovieIdsForCandidates`：按 `tmdb_id` upsert/查询本地 id（[`server/utils/movieUpsert.js`](../../server/utils/movieUpsert.js)）；
4. 若已登录，从 `favorites` + `reviews` 构建口味档案并写入 system prompt；
5. 调用 DashScope（`qwen-turbo`），正则提取 JSON 数组；
6. 按标题或 `tmdb_id` 与候选池匹配，过滤池外项；
7. 返回 `movies` + `meta`。

## 5. 效果指标（演示 / 观测）

| 指标 | 来源 | 说明 |
| --- | --- | --- |
| `meta.candidateCount` | 单次推荐响应 | TMDB 候选规模 |
| `meta.groundedCount` | 单次推荐响应 | 通过池内校验的条数 |
| `meta.localMappedRatePercent` | 单次推荐响应 | 可站内打开的占比 |
| `meta.profileApplied` | 单次推荐响应 | 是否使用了口味档案 |
| Hybrid 本地命中率 | `GET /api/movies/hybrid-stats` | 列表搜索链路，见 [movie-list-query.md](movie-list-query.md) |

## 6. 风险与约束

- 依赖外网 TMDB 与 DashScope；
- JSON 解析依赖正则，失败时可能触发 422；
- 密钥仅配置在服务端；
- demo 环境需注意 API 成本，无登录限流。

## 7. 验收标准

- [ ] 有效 prompt 返回 grounded `movies` 与 `meta`；
- [ ] 缺 `prompt` 返回 400；
- [ ] 候选为空返回 503；
- [ ] 登录且存在收藏/影评时 `profileApplied: true`；
- [ ] 前端「查看详情 / 写笔记」优先站内路径；
- [ ] loading / error 态可用。

## 8. 实现位置

- 后端：[`server/router_handler/ai.js`](../../server/router_handler/ai.js)、[`server/router/ai.js`](../../server/router/ai.js)、[`server/utils/movieUpsert.js`](../../server/utils/movieUpsert.js)
- 前端：[`client/src/components/AIRecommend.jsx`](../../client/src/components/AIRecommend.jsx)、[`client/src/store/API/vercelApi.jsx`](../../client/src/store/API/vercelApi.jsx)、[`client/src/components/MovieDetails.jsx`](../../client/src/components/MovieDetails.jsx)
- Vite 代理：[`client/vite.config.js`](../../client/vite.config.js) 将 `/api` 转发至 `localhost:1337`
