# 运营控制台

- 状态：已实现
- 最后核对日期：2026-08-23

## 1. 目标

MovieMate C 端社区的 **B 面**：后台角色按固定权限矩阵进入运营台，封禁用户、审核/删除评论、查看操作审计。与数据仪表盘、AI Agent 解耦。

## 2. 路由

- 前端：`/admin`（**仅 staff 角色**可见顶栏「运营台」；普通用户无入口）
- API 前缀：`/api/admin/*`（Bearer + staff 校验）

## 3. 用户流程

1. **初始化**：在 MySQL 将首个账号升为 `admin`（见 §4 迁移说明）。
2. **登录**：admin / operator / moderator 登录后，顶栏与「我的」下拉出现「运营台」。
3. **进入运营台**：打开 `/admin`，`GET /api/admin/me` 返回当前 `role` 与 `permissions`，页面按权限显示 Tab。
4. **角色管理**（仅 `admin`）：在用户表下拉将普通用户升为 `operator` 或 `moderator`。
5. **日常运营**：`operator` 封禁普通用户；`moderator` 审核评论；`admin` 可管理其他后台账号并查看审计。

## 4. 角色与权限

预设四档角色（无自定义角色 CRUD / 权限勾选 UI）：

| 角色 | 含义 | 进运营台 | 改角色 | 封禁/锁定 | 审评论 | 看审计 | 看注册用户数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `user` | 普通用户 | 否 | 否 | 否 | 否 | 否 | 否 |
| `moderator` | 内容审核 | 是 | 否 | 否 | 是 | 否 | 是 |
| `operator` | 运营 | 是 | 否 | 仅 `user` | 是 | 是 | 是 |
| `admin` | 系统管理员 | 是 | 是 | 除自己外均可 | 是 | 是 | 是 |

**staff** = `moderator` | `operator` | `admin`（见 [`client/src/utils/roles.js`](../../client/src/utils/roles.js)）。

约束：

- 不能改自己的角色；不能把最后一个 `admin` 降级或封禁。
- `operator` 不能修改后台角色（`moderator` / `operator` / `admin`）的 status。

### 权限键对照

代码内权限键（[`server/utils/roles.js`](../../server/utils/roles.js)）与能力映射：

| 权限键 | 含义 | 拥有角色 |
| --- | --- | --- |
| `users.manage` | 用户列表、封禁/锁定/解封 | `operator`、`admin` |
| `users.role` | 修改他人角色 | 仅 `admin` |
| `reviews.moderate` | 评论列表、删除评论 | `moderator`、`operator`、`admin` |
| `audit.read` | 审计日志 | `operator`、`admin` |
| `analytics.userCount` | 数据洞察「注册用户」计数 | 全部 staff |

数据库：`users.role ENUM('user','moderator','operator','admin')`。

- 新库：[`server/sql/init.sql`](../../server/sql/init.sql)（已含四档 `role`）
- 增量：[`server/sql/analytics_ops_upgrade.sql`](../../server/sql/analytics_ops_upgrade.sql) + [`server/sql/rbac_upgrade.sql`](../../server/sql/rbac_upgrade.sql)

中间件：[`server/middleware/adminMiddleware.js`](../../server/middleware/adminMiddleware.js) 校验 `isStaff(role)`，并将 `role` + `permissions` 挂到 `req.adminUser`。

首个管理员需手动：

```sql
UPDATE users SET role = 'admin' WHERE id = 1 LIMIT 1;
```

## 5. API 契约

| 场景 | Method + Path | 权限 | 说明 |
| --- | --- | --- | --- |
| 当前运营身份 | `GET /api/admin/me` | staff | `{ admin: { username, role, permissions } }` |
| 用户列表 | `GET /api/admin/users` | `users.manage` | 最近 200 用户 |
| 更新状态 | `PATCH /api/admin/users/:id/status` | `users.manage` | body: `{ status: active\|locked\|banned }` |
| 更新角色 | `PATCH /api/admin/users/:id/role` | `users.role`（仅 admin） | body: `{ role: user\|moderator\|operator\|admin }` |
| 评论列表 | `GET /api/admin/reviews` | `reviews.moderate` | 最近 100 条 |
| 删除评论 | `DELETE /api/admin/reviews/:id` | `reviews.moderate` | 204 |
| 审计日志 | `GET /api/admin/audit` | `audit.read` | 最近 100 条 |

封禁/改角色/删除操作写入 `admin_audit_log`（动作如 `user.status`、`user.role`、`review.delete`）。

## 6. 实现位置

- 路由：[`server/router/admin.js`](../../server/router/admin.js)
- Handler：[`server/router_handler/admin.js`](../../server/router_handler/admin.js)
- 权限矩阵：[`server/utils/roles.js`](../../server/utils/roles.js)
- 前端页面：[`client/src/pages/AdminPage.jsx`](../../client/src/pages/AdminPage.jsx)
- RTK Query：[`client/src/store/API/adminApi.js`](../../client/src/store/API/adminApi.js)
- 入口显隐：[`client/src/components/Layout.jsx`](../../client/src/components/Layout.jsx)（`isStaff(userInfo.role)`）
- 前端角色工具：[`client/src/utils/roles.js`](../../client/src/utils/roles.js)

## 7. 验收

- [ ] 普通用户：无运营台入口；打开 `/admin` 显示无权限
- [ ] `moderator`：仅评论审核 Tab
- [ ] `operator`：可封禁普通用户，不能改角色、不能封后台账号
- [ ] `admin`：可改他人角色，可管理其他管理员
- [ ] 封禁用户后该用户无法登录（403）
- [ ] 删除评论后前台不再展示
- [ ] 审计表记录操作者与目标
