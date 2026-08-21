# 运营控制台

- 状态：已实现
- 最后核对日期：2026-08-21

## 1. 目标

MovieMate C 端社区的 **B 面**：管理员封禁用户、审核/删除评论、查看操作审计。与数据仪表盘、AI Agent 解耦。

## 2. 路由

- 前端：`/admin`（登录后顶栏「运营台」与「我的」下拉均可见；**非 admin 进页显示无权限**）
- API 前缀：`/api/admin/*`（Bearer + 管理员校验）

## 3. 权限

- 数据库：`users.role ENUM('user','admin')`，迁移见 [`server/sql/analytics_ops_upgrade.sql`](../server/sql/analytics_ops_upgrade.sql)
- 中间件：[`server/middleware/adminMiddleware.js`](../server/middleware/adminMiddleware.js) 查库校验 `role === 'admin'`
- 首个管理员需手动：`UPDATE users SET role = 'admin' WHERE id = 1 LIMIT 1;`

## 4. API 契约

| 场景 | Method + Path | 说明 |
| --- | --- | --- |
| 当前管理员 | `GET /api/admin/me` | `{ admin: { username, role } }` |
| 用户列表 | `GET /api/admin/users` | 最近 200 用户 |
| 更新状态 | `PATCH /api/admin/users/:id/status` | body: `{ status: active\|locked\|banned }` |
| 评论列表 | `GET /api/admin/reviews` | 最近 100 条 |
| 删除评论 | `DELETE /api/admin/reviews/:id` | 204 |
| 审计日志 | `GET /api/admin/audit` | 最近 100 条 |

封禁/删除操作写入 `admin_audit_log`。

## 5. 实现位置

- 路由：[`server/router/admin.js`](../server/router/admin.js)
- Handler：[`server/router_handler/admin.js`](../server/router_handler/admin.js)
- 前端：[`client/src/pages/AdminPage.jsx`](../../client/src/pages/AdminPage.jsx)

## 6. 验收

- [ ] 登录后顶栏可见「运营台」；非 admin 打开 `/admin` 显示无权限（不 404）
- [ ] 封禁用户后该用户无法登录（403）
- [ ] 删除评论后前台不再展示
- [ ] 审计表记录操作者与目标
