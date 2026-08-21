# 电影详情与收藏

- 状态：已实现
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-03

## 1. 目标

展示单部电影信息，支持登录用户收藏/取消收藏；个人中心展示当前用户收藏列表。

## 2. 不做什么

- 收藏接口不允许替他人写入 `username`（服务端校验 JWT 用户与 body 一致）；
- 不提供批量导入收藏；
- 详情页不编辑电影主数据。

## 3. 角色与权限

| 操作 | 是否需要登录 |
| --- | --- |
| 查看详情 | 否 |
| 查看收藏列表 / 添加 / 删除收藏 | 是（Bearer JWT） |

## 4. 用户流程

1. 从列表或速览进入 `/movie/:id`；
2. 查看海报、导演、演员、类型、简介等；
3. 未登录点击收藏 -> 跳转 `/auth`；
4. 已登录切换收藏状态；
5. 「我的」页 `/profile` 展示收藏电影卡片，可取消收藏。

## 5. 前后端契约

| 场景 | Method + Path | 请求 | 响应 |
| --- | --- | --- | --- |
| 电影详情 | `GET /api/movies/:id` | 路径 id | `{ data: movie }` |
| 我的收藏 | `GET /api/favorites` | Header: `Authorization: Bearer <jwt>` | `{ data: favorite[] }` |
| 添加收藏 | `POST /api/favorites` | `{ data: { movieId, username } }` | 成功消息 + 新记录 |
| 取消收藏 | `DELETE /api/favorites/:id` | 路径为收藏记录 id | 204 |

注册/登录（详见 [auth-security.md](auth-security.md)）：

- `POST /api/auth/local/register` — 强密码 + 邮箱；注册后需验证邮箱
- `POST /api/auth/local` — `{ identifier, password }`（用户名或邮箱）；返回 access + refresh token
- `POST /api/auth/verify-email`、`/auth/forgot-password`、`/auth/reset-password`、`/auth/refresh`

## 6. 数据边界

- `favorites` 表：`username` + `movieId`，同一用户对同一电影不可重复收藏；
- 外键：`movieId` 引用 `movies.id`；
- 个人页通过 `useMovieItems({ page: 1, pageSize: 200 })` 拉取电影后与收藏记录匹配（demo 规模适用）。

## 7. 验收标准

- [ ] 详情 id 非法时返回错误提示；
- [ ] 未登录访问收藏 API 返回 401；
- [ ] 重复收藏被拒绝；
- [ ] 只能删除自己的收藏记录；
- [ ] 海报兜底图在链接失效时不裂图。

## 8. 实现位置

- 后端：[`server/router_handler/movie.js`](../../server/router_handler/movie.js)、[`server/router_handler/favorite.js`](../../server/router_handler/favorite.js)、[`server/router_handler/user.js`](../../server/router_handler/user.js)
- 中间件：[`server/middleware/authMiddleware.js`](../../server/middleware/authMiddleware.js)
- 前端：[`client/src/components/MovieDetails.jsx`](../../client/src/components/MovieDetails.jsx)、[`client/src/components/Profile.jsx`](../../client/src/components/Profile.jsx)
- API：[`client/src/store/API/favoriteApi.jsx`](../../client/src/store/API/favoriteApi.jsx)、[`client/src/store/API/authApi.jsx`](../../client/src/store/API/authApi.jsx)
