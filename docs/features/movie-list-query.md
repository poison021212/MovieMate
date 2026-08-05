# 电影列表查询（分页 / 搜索 / 排序 / 筛选）

- 状态：已实现
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-04

## 1. 目标

为首页提供可扩展的电影浏览能力：服务端分页、关键词搜索、排序与多条件筛选，并将筛选状态同步到浏览器 URL，便于刷新与分享。

验证链路：

```text
MySQL movies 表 -> GET /api/movies -> RTK Query -> MovieList -> MovieCard
```

## 2. 不做什么

- 不提供电影增删改管理后台；
- 不在前端一次性拉取全库再在浏览器内 filter（已改为服务端条件查询）；
- 不保证 `year` 字段与 TMDB `release_date` 自动一致（取决于入库数据）。

## 3. 用户流程

1. 用户进入首页 `/`；
2. 默认加载第 1 页（`pageSize=12`）；
3. 输入关键词后点击搜索或回车，提交 `q` 并回到第 1 页；
4. 可选最低评分、年份、类型，以及排序字段与方向；
5. 翻页或修改每页条数；修改 `pageSize` 时回到第 1 页；
6. 点击「重置筛选」清空条件与 URL query；
7. 点击卡片进入 `/movie/:id` 详情。

## 4. 前后端契约

| 场景 | Method + Path | 关键请求 | 关键响应 | 限制 |
| --- | --- | --- | --- | --- |
| 分页列表 | `GET /api/movies` | 见下表 query | `{ message, data[], pagination, meta }` | `page/pageSize >= 1` |
| Hybrid 统计 | `GET /api/movies/hybrid-stats` | 无 | `{ message, data: 累计指标 }` | 进程内累计，重启清零 |
| 电影详情 | `GET /api/movies/:id` | 路径 `id` 为本地主键 | `{ message, data: movie }` | `id` 须为数字 |

### Query 参数（列表）

| 参数 | 说明 | 默认 |
| --- | --- | --- |
| `page` | 页码 | 1 |
| `pageSize` | 每页条数 | 12 |
| `q` | 片名 / 导演 / 演员模糊匹配 | 无 |
| `hybrid` | `1` 时启用本地优先 + TMDB fallback（仅第 1 页且本地结果不足时） | 0 |
| `sortBy` | `id` / `rating` / `year` / `title` / `release_date` / `popularity` / `vote_count` | `id` |
| `sortOrder` | `asc` / `desc` | `asc` |
| `minRating` | 评分下限 | 无 |
| `year` | 与 `movies.year` 精确匹配 | 无 |
| `genre` | 与 `movies.genre` 精确匹配 | 无 |

列表项含 `documentId`（等于 `id`），兼容历史 Strapi 形态。前端 `transformResponse` 返回 `{ items, pagination, meta }`。

当 `hybrid=1` 且第一页关键词搜索结果少于阈值（默认 5 条）时，后端会尝试 TMDB 并写回 `movies` 再查本地。`meta` 含 `source`、`fallbackTriggered`、`localCountBeforeFallback`、`tmdbFetched`、`tmdbPersisted`、`aggregate`。

累计比率（`aggregate` / `hybrid-stats`）：

| 字段 | 含义 |
| --- | --- |
| `localHasResultsRatePercent` | 回退前本地至少命中 1 条的关键词请求占比 |
| `localOnlyRatePercent` | 本地结果已够、**未触发** TMDB 回退的占比（旧名 `localHitRatePercent` 同义） |
| `fallbackTriggerRatePercent` | 触发过 TMDB 回退的占比 |
| `persistEfficiencyPercent` | TMDB 抓取条目中被写回本地的比例 |

### 观测接口

`GET /api/movies/hybrid-stats` 返回自进程启动以来的累计计数与比率，用于观察本地命中率与 TMDB fallback 成本（Demo 环境内存统计，生产应改为持久化或日志系统）。

**前端展示**：仅在用户输入关键词（`searchTerm` 非空）时显示「本次来源」提示与 Hybrid 观测折叠面板；点击「重置筛选」清空关键词后隐藏，避免将服务端累计值误读为当前列表状态。累计计数本身不随重置清零（重启后端进程清零）。

**关键词请求数口径**：`hybridKeywordRequests` 统计的是满足 `hybrid=1` 且带 `q` 的 `GET /api/movies` **HTTP 请求次数**，不是「点击搜索按钮」次数。同一关键词下改排序/筛选/分页、刷新页面等会再次请求并各计 1 次；单次请求内部的 TMDB 回写与二次查本地不会额外 +1。

### URL 同步（前端）

首页将 `page`、`pageSize`、`q`、`sortBy`、`sortOrder`、`minRating`、`year`、`genre` 写入 location search（默认值省略），刷新后恢复。

## 5. 数据边界

- 主表：`movie_db.movies`；
- 搜索：`title`、`director`、`actors` 使用 `LIKE`；
- 排序字段白名单，防止 SQL 注入；
- 海报字段经 `normalizePoster` 统一为可展示 URL，失败时使用 `/no-image.png`。

## 6. 性能与安全

- 使用 `LIMIT/OFFSET` + `COUNT(*)`，避免全表返回；
- 大数据量下 OFFSET 深分页可能变慢（后续可演进为 keyset 分页）；
- 列表接口当前无需登录。

## 7. 验收标准

- [ ] 默认第一页返回 `pagination.total` 与 `data` 长度一致；
- [ ] 翻页、改 `pageSize` 行为正确；
- [ ] 搜索 + 筛选 + 排序组合有效；
- [ ] URL 刷新后条件保留；
- [ ] 重置后 URL 与列表恢复默认；
- [ ] 重置后无关键词时不展示 Hybrid 来源提示与观测面板；有关键词时再展示。

## 8. 实现位置

- 后端：[`server/router_handler/movie.js`](../../server/router_handler/movie.js)、[`server/router/movie.js`](../../server/router/movie.js)
- 前端 API：[`client/src/store/API/MovieApi.jsx`](../../client/src/store/API/MovieApi.jsx)
- 前端页面：[`client/src/components/MovieList.jsx`](../../client/src/components/MovieList.jsx)、[`client/src/components/MovieCard.jsx`](../../client/src/components/MovieCard.jsx)
- Hook：[`client/src/hooks/useMovieItems.jsx`](../../client/src/hooks/useMovieItems.jsx)
