# 认证与安全

- 状态：已实现（Phase 1 + Phase 2 基础；Phase 3 评估）
- 最后核对日期：2026-08-21

## 1. 目标

将登录注册从 Demo 级升级为具备基础安全能力：邮箱验证、防爆破、统一错误提示、Access/Refresh 会话、密码找回与账号状态。

## 2. 用户流程

1. **注册**：提交用户名/邮箱/强密码 → 收到验证链接（Demo 见后端控制台）→ 验证邮箱 → 登录。
2. **登录**：用户名或邮箱 + 密码；失败统一提示「用户名或密码错误」；过多失败锁定 15 分钟。
3. **会话**：返回 `accessToken`（短效）+ `refreshToken`（长效，可撤销）；前端临近过期自动 refresh。
4. **退出**：撤销当前 refresh session；本地清除 token。
5. **忘记密码**：申请重置 → 邮件链接 → 设置新密码 → 撤销全部 refresh session。

## 3. API 契约

| 场景 | Method + Path | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 注册 | `POST /api/auth/local/register` | 无 | 注册后需验证邮箱 |
| 登录 | `POST /api/auth/local` | 无 | 返回 jwt/accessToken/refreshToken/user |
| 验证邮箱 | `POST /api/auth/verify-email` | 无 | `{ token }` |
| 重发验证 | `POST /api/auth/resend-verification` | 无 | `{ email }` |
| 刷新令牌 | `POST /api/auth/refresh` | 无 | `{ refreshToken }`，轮换 refresh |
| 退出 | `POST /api/auth/logout` | Bearer | `{ refreshToken?, allDevices? }` |
| 忘记密码 | `POST /api/auth/forgot-password` | 无 | 统一成功文案，防枚举 |
| 重置密码 | `POST /api/auth/reset-password` | 无 | `{ token, password }` |

## 4. 数据表

- `users.email_verified`、`users.status`（active/locked/banned）
- `email_verification_tokens`、`password_reset_tokens`、`refresh_sessions`

增量脚本：[server/sql/auth_upgrade.sql](../../server/sql/auth_upgrade.sql)；新库见 [init.sql](../../server/sql/init.sql)。

## 5. 环境变量

| 变量 | 说明 |
| --- | --- |
| `JWT_ACCESS_EXPIRE` | Access Token 时效，默认 `30m` |
| `JWT_REFRESH_EXPIRE` | Refresh 天数，默认 `7d` |
| `APP_PUBLIC_URL` | 验证/重置链接前缀，默认 `http://localhost:5173` |
| `EMAIL_VERIFY_EXPIRE_HOURS` | 验证链接有效期，默认 24 |
| `PASSWORD_RESET_EXPIRE_HOURS` | 重置链接有效期，默认 1 |

## 6. Phase 3 评估（未实现，按需扩展）

| 能力 | 建议 | 说明 |
| --- | --- | --- |
| MFA | 可选 | 邮箱 OTP 成本低；TOTP 适合高安全场景 |
| OAuth | 可选 | GitHub/Google 降低注册摩擦；需独立绑定与合并账号策略 |
| 风控 | 可选 | 新设备提醒、异地 IP、风险分；需持久化登录日志 |

当前 Demo 不默认开启 Phase 3，避免过度工程化。

## 7. 验收标准

- [ ] 未验证邮箱无法登录（403）
- [ ] 连续登录失败触发限流（429）
- [ ] 登录错误不区分「用户不存在/密码错误」
- [ ] Refresh 轮换后旧 refresh 失效
- [ ] 重置密码后旧 refresh 全部失效
- [ ] 鉴权中间件不打印 Authorization 明文

## 8. 实现位置

- 后端：[`server/router_handler/auth.js`](../../server/router_handler/auth.js)、[`server/router/user.js`](../../server/router/user.js)
- 工具：[`server/utils/loginRateLimit.js`](../../server/utils/loginRateLimit.js)、[`server/utils/refreshTokenStore.js`](../../server/utils/refreshTokenStore.js)
- 前端：[`client/src/components/AuthForm.jsx`](../../client/src/components/AuthForm.jsx)、[`client/src/store/API/authApi.jsx`](../../client/src/store/API/authApi.jsx)
