# 影评流程

- 状态：已实现
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-04

## 1. 目标

用户可对电影发表评论（含评分与内容），公开读取全部评论；仅作者可删除自己的评论。登录用户的收藏与影评会被 AI 推荐读取，形成轻量口味档案（见 [ai-recommendation.md](ai-recommendation.md)）。

## 2. 不做什么

- 不提供评论编辑接口（仅增删）；
- 不在前端单独维护评论权威数据源（以 API + MySQL 为准；`reviewSlice` 本地缓存为遗留，新评论以 refetch 为准）；
- 列表接口不做按电影分页（当前返回全部评论，由前端按 `movieId` 过滤）。

## 3. 用户流程

1. 详情页或速览弹窗查看该电影评论列表；
2. 登录用户填写内容并提交；
3. 服务端写入 `reviews`，`date` 由数据库 `NOW()` 生成；
4. 作者可在具备删除入口的流程中删除自己的评论（需 JWT）；
5. 从 AI 推荐页「写笔记」可带 `#movie-review` 锚点进入详情并滚动至表单；
6. 用户可对他人评论展开「回复」，发表楼中楼；仅回复作者可删除自己的回复。

## 4. 前后端契约

| 场景 | Method + Path | 鉴权 | 请求体 |
| --- | --- | --- | --- |
| 全部评论 | `GET /api/reviews` | 无 | - |
| 发表评论 | `POST /api/reviews` | Bearer | `{ data: { movieId, rating, content, date? } }` |
| 删除评论 | `DELETE /api/reviews/:id` | Bearer | - |
| 评论回复列表 | `GET /api/reviews/:id/replies` | 无 | - |
| 发表回复 | `POST /api/reviews/:id/replies` | Bearer | `{ content }` |
| 删除回复 | `DELETE /api/replies/:replyId` | Bearer | - |

- Joi 校验：`movieId`、`rating`（0–10）、`content` 必填；发表时 `username` 取自 JWT，忽略客户端伪造。
- 删除前校验 `reviews.username` 与当前用户一致。

## 5. 数据边界

表 `reviews`：`movieId`、`username`、`rating`、`content`、`date`，外键关联 `movies.id`。

表 `review_replies`：`review_id`、`username`、`content`、`date`，外键关联 `reviews.id`（级联删除）。

## 6. 验收标准

- [ ] 未登录 POST 返回 401；
- [ ] 不存在的 `movieId` 友好错误；
- [ ] 删除他人评论被拒绝；
- [ ] GET 返回项含 `documentId` 与格式化 `date`（中文 locale 字符串）；
- [ ] 回复仅作者可删；未登录不可回复。

## 7. 实现位置

- 后端：[`server/router_handler/review.js`](../../server/router_handler/review.js)、[`server/schema/review.js`](../../server/schema/review.js)
- 前端：[`client/src/components/ReviewsForm.jsx`](../../client/src/components/ReviewsForm.jsx)、[`client/src/components/MovieSwipe.jsx`](../../client/src/components/MovieSwipe.jsx)（弹窗评论）
- API：[`client/src/store/API/reviewApi.jsx`](../../client/src/store/API/reviewApi.jsx)
