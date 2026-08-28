# Token 双轨制 — 认证流程面试速记

> MovieMate 双令牌认证:双令牌、双通道。登录发证、验证明证、过期换证、登出销证——一条链路讲清认证方案,从"怎么跑"到"为什么这么设计"。
>
> 代码出处:auth.js / authCookies.js / refreshTokenStore.js / authMiddleware.js / cryptoToken.js / user.js

---

## 开场总纲 · 15 秒话术

> "我的方案是**双令牌 + 双通道**:短期 access token 用 JWT、走请求头,是**通行证**;长期 refresh token 用随机串、走 HttpOnly cookie,是**换证凭证**。这样选,是因为两个令牌的需求是相反的——access 要**快、无状态**,refresh 要**能吊销、能轮换**。"

第一句就立"为什么分两层"的框架——多数人一上来背流程,你先把框架立住。

| 令牌 | 内容 | 有效期 | 存放 | 传输通道 |
|---|---|---|---|---|
| **accessToken** | JWT,`{id, username}`,签名 | 30 分钟 | 前端内存/变量 | `Authorization: Bearer xxx` |
| **refreshToken** | 48 字节随机串 | 7 天 | DB(哈希)+ HttpOnly cookie | 浏览器自动携带 cookie |

---

## 完整闭环 · 四个阶段

**图例**:**蓝** = access 通道(header);**琥珀** = refresh 通道(HttpOnly cookie);**灰** = 服务端内部。

### 01 登录发证 — auth.js:205 / issueTokenPair :64

双令牌在这一刻一起签发:access 从 body 出去,refresh 从 cookie 出去——前端 JS 从始至终摸不到 refresh 的值。

1. `CLIENT→SERVER` `POST /api/auth/local` · `{ identifier, password }` — bcrypt 比对 · 登录限流
2. `SERVER` 签发 `access = jwt.sign({ id, username }, 30min)`,无状态,验签即可 — auth.js:41
3. `SERVER→DB` refresh = 48 字节随机串,`SHA256` 哈希后存入 `refresh_sessions` — cryptoToken / store
4. `SERVER→CLIENT` `Set-Cookie: refreshToken`(HttpOnly · SameSite=Lax · Path=/api/auth)+ body 只回 `accessToken / user` — sendAuthJson

### 02 验证明证 — authMiddleware.js:13

JWT 有效 ≠ 账号可用。验签之后再做一次 DB 回查,封禁即时生效——这是别人没有的一步。

1. `CLIENT→SERVER` 业务请求带头 `Authorization: Bearer <access>`(浏览器不会自动携带)
2. `SERVER` `jwt.verify` 验签名与过期;失败 → 401 — authMiddleware:13
3. `SERVER→DB` 回查 `users.status`:banned / locked → 403,即使 token 没过期 — authMiddleware:15

### 03 过期换证 — auth.js:261 / store:36

30 分钟后 access 过期,前端调换证接口。核心动作是**旋转**:旧 refresh 立即作废、换发新串——防重放的关键。

1. `CLIENT→SERVER` `POST /api/auth/refresh` — 浏览器按 Path=/api/auth 自动带 cookie,前端不用碰令牌 — user.js:10
2. `SERVER→DB` `findValidRefreshSession`:哈希匹配 · 未 revoked · 未过期,任一不过 → 清 cookie + 401 — store:11
3. `SERVER→DB` 旋转:旧 refresh `revoked_at = NOW()`,生成新 refresh 重新入库 — rotate :36
4. `SERVER→CLIENT` 新 access 进 body,新 refresh 通过 `Set-Cookie` 覆盖旧值 — sendAuthJson

### 04 登出销证 — auth.js:318

销的是数据库里的"状态",而不只是删浏览器 cookie——服务端永不保留可复用的死令牌。

1. `CLIENT→SERVER` `POST /api/auth/logout` · `{ allDevices? }` — auth 保护
2. `SERVER→DB` 单设备 `revokeRefreshSession` · 全设备 `revokeAllUserSessions` — store:22/29
3. `SERVER→CLIENT` 清 cookie → 204。重置密码时同样 `revokeAllUserSessions`,旧会话全线失效 — resetPassword

---

## 三个为什么 · 分水岭

只讲时序是"会用",答得出这三个为什么才是"明白"。

### Why 1:为什么 refresh 不也用 JWT?

因为必须能**吊销**。JWT 签发后就改不了,而账号被禁用、密码被重置时,旧凭据必须立刻失效。

- 随机串配数据库:一条 UPDATE 即可作废
- 库内只存 SHA256 哈希,DB 泄露也不等于令牌泄露

### Why 2:为什么要轮换?

防**重放**。每次刷新都让旧 refresh 作废、换发新串——攻击者截获的旧 token 用过一次就变废纸。

- 受害者一刷新,攻击者手里的旧串即失效
- 可升级:检测到旧串复用 → 吊销整个会话

### Why 3:为什么 refresh 放 HttpOnly cookie?

防线最厚。refresh 是 30 分钟重生源,丢了等于长期失守。

- HttpOnly:JS 读不到 → 防 XSS 窃取
- SameSite=Lax + Path=/api/auth:防 CSRF、缩小暴露面
- 生产加 Secure,只走 HTTPS

---

## 加分点 · 别人没有的

- **验签之后,回查数据库用户状态** — JWT 无状态是优点也是缺点,封禁后已签发的 token 依然有效;中间件 verify 完再查一次 status,违规用户立刻 403。authMiddleware.js:14-21
- **登录限流 + 审计日志** — 登录接口做 IP + 账号维度限流(密码爆破防护),认证事件全部落审计日志。loginRateLimit.js / authAuditLog.js
- **统一 sendAuthJson 出口** — refresh 只进 cookie、不进 body,前端 JS 自始至终接触不到 refresh token 的值。authCookies.js:39-43

---

## 追问弹药库

| 追问 | 一句话要点 |
|---|---|
| access 和 refresh 为什么要分开? | 安全纵深:短期凭据 + 长期凭证,攻破一个不等于全盘失守。 |
| JWT 泄露了怎么办? | 有效期只有 30 分钟;要立即作废可加 token denylist。 |
| 多设备怎么处理? | refresh 按用户存多行;`allDevices` 一键全设备下线(`revokeAllUserSessions`)。 |
| 怎么防 CSRF? | 业务接口走 Authorization 头,浏览器不会自动携带;refresh 换证靠 SameSite=Lax;可再加 CSRF token。 |
| access 为什么不用 cookie? | 避免 cookie 被自动携带、被跨站请求利用——header 更稳。 |
| 移动端没有 cookie 怎么办? | 坦诚短板:改为 refresh 存 secure storage / Keychain。主动给方向,比被问住强。 |

---

## 彩排建议

1. 对着时序图完整讲 5 遍,控制在 90 秒内脱稿——从登录到登出,四阶段串成闭环。
2. 把"三个为什么"练到张口就来,这是拉开距离的分水岭。
3. 面试只给 1 分钟就压缩为:30 秒总纲 + 一句串四个阶段 + "核心是两层令牌、轮换加吊销"。