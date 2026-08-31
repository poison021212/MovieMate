# 简历条目② 运营台 — RBAC / 审计 / 脱敏 面试速记

> 本笔记覆盖运营后台的**全栈**权限链路:能力矩阵、鉴权三层(JWT 验签→DB status→DB role+permission)、审计留痕、删字段脱敏。与[简历① 前端会话](./auth-frontend-notes.md)、[认证服务端链路](./token-flow.md)一起背,构成完整闭环。
>
> 简历条目出处:[resume-bullets.md:21](../interview/resume-bullets.md#L21)(第 2 条)
> 代码出处:`server/utils/roles.js` · `server/middleware/authMiddleware.js` · `server/middleware/adminMiddleware.js` · `server/router_handler/admin.js` · `server/router_handler/analytics.js` · `server/sql/init.sql` · `client/src/utils/roles.js` · `client/src/store/API/adminApi.js` · `client/src/pages/AdminPage.jsx`

---

## 开场总纲 · 30 秒自述

> "我负责**运营后台的权限与审计**,核心是**能力矩阵而非等级数字**。四档角色(user / moderator / operator / admin)各挂若干**权限点**(如 `reviews.moderate` / `users.manage` / `users.role`),`roles.js` 是唯一来源。鉴权链是 **JWT 验签 → 回查 DB status(封禁即时生效)→ 回查 DB role + `hasPermission` 逐权限闸**——JWT payload 里**刻意不放 role**,因为 JWT 签出去就改不了,角色变更必须每次请求回查才能即时生效。敏感操作(封禁 / 改角色 / 删评论)落 `admin_audit_log`(操作人 / 动作 / 目标 / JSON 详情);仪表盘注册用户数按 staff 身份**服务端删字段**脱敏,前端拿不到就不存在。前端不硬编码角色,依赖 `/admin/me` 下发的 `permissions` 做 UI 显隐——**权限边界永远在后端**。"

**一句立框架**:`能力点矩阵(不做魔法数字)→ 每次请求 DB 二次校验(可吊销、即时生效)→ 审计留痕 → 服务端删字段脱敏`。

---

## 逐条深挖 · 项目级 Q&A

### Q1. 为什么四档角色用"能力矩阵"而不是等级数字? (roles.js)

```js
// server/utils/roles.js —— 单一来源：角色 = 权限点集合
const PERMISSIONS = {
  moderator: { 'reviews.moderate': true, 'audit.read': true, 'analytics.userCount': true },
  operator:  { 'reviews.moderate': true, 'users.manage': true, 'audit.read': true, 'analytics.userCount': true },
  admin:     { 'reviews.moderate': true, 'users.manage': true, 'users.role': true, 'audit.read': true, 'analytics.userCount': true },
}
```
- 判定是 `hasPermission(role, 'users.role')`,**不是 `role >= 2`**。
- **为什么不会用数字等级**:等级隐含"高级自动拥有低级全部",遇到**非单调需求**就会崩——operator 要"能封禁普通用户(users.manage)但不能改角色(无 users.role)、还不能动 staff 目标",三角包。权限点可任意组合、单点回收,新增角色不改比较逻辑。
- **追问预备**:"那不是更繁琐?"→ 简单但脆弱;权限矩阵的维护成本在角色少时几乎为零,换来的是"想加一个 operator+审评的岗位"时只改一行表。
- 客串客户端的 `client/src/utils/roles.js` 只留 `STAFF_ROLES + isStaff`,判定角色真伪从不发生在前端(见 Q9)。

### Q2. ⭐为什么 JWT 里不放 role?DB 二次校验到底在查什么? (authMiddleware)

- **事实**:JWT payload 只 `{ id, username }`([auth.js:42](server/router_handler/auth.js#L42));role 与 status **每次请求回查 DB**。
- **为什么**:JWT 签发后不可变——role 打进 token,改角色就要等旧 token 过期才生效,封禁至少等 30 分钟;运营场景"踢了人该立刻失效"。回查 DB 让 **status 变更在下一次请求就生效**。
- **鉴权三层**(按顺序背):
  1. `jwt.verify` 验签与过期,缺 token / 签名失败 / 过期 → **401**([authMiddleware.js:13](server/middleware/authMiddleware.js#L13));
  2. 回查 `users.status`,不是 active(banned / locked)→ **即使 token 没过期也 403**,落 `auth_banned` 审计([authMiddleware.js:14-22](server/middleware/authMiddleware.js#L14-L22));
  3. admin 接口再回查 role,`isStaff` 判定准入门槛 → handler 内 `hasPermission` 细粒度闸([adminMiddleware.js](server/middleware/adminMiddleware.js))。
- **追问预备**:"JWT 不是为免 DB、无状态设计的吗,你全查 DB?"→ 精确答:"**只有运营/敏感接口回查**;普通业务口仍是验签即过。这是'无状态快'与'可吊销安全'的折中,安全优先于几个微秒"。这句话能直接拉开差距。
- **口径提醒**:面试被问"role 在不在 JWT 里?"——**不在**。role 只随登录响应的 `userInfo` 进前端内存(UI 展示用),鉴权永远以后端回查为准。

### Q3. 封禁是怎么"即时生效"的?和纯 JWT 方案差在哪?

- 纯 JWT:ban 后 token 仍有效,只能等过期或用黑名单兜底。
- 你的方案:敏感请求回查 status → **ban 的下一个请求就是 403**;`refresh` 端点同样回查,**被封禁用户续期也被拒**——被封禁等于全链路断。
- 三态 `users.status`:`active / locked(锁号)/ banned(封禁)`,对应不同审计动作与前端文案。

### Q4. 防越权(IDOR):operator 为什么动不了 admin?(三个护栏)

全部在 handler 层叠加([admin.js](server/router_handler/admin.js)):
1. **权限点闸**:operator 没有 `users.role`,改角色接口直接 403;
2. **目标身份闸**:`role === 'operator' && isStaff(target.role)` → 403——"运营不能管运营/管理员";
3. **自我保护**:不能改**自己**的状态/角色;封禁、改角色前检验**最后一个 active admin**(`COUNT(*)` `<= 1` 拒绝),防止把平台锁死。

**面试通用考点(IDOR)本质**:服务端永远以 **token 里的身份**做判定,`target.id` 只是 URL 参数,必须对目标做归属 + 受限校验,不能信前端。

### Q5. 审计日志怎么设计的?写了哪些字段、哪些操作会写? (admin.js)

- **表结构**([init.sql](server/sql/init.sql) `admin_audit_log`):`admin_username`(谁)/ `action`(`user.status`、`user.role`、`review.delete`…)/ `target_type` / `target_id` / `detail JSON`(旧值+新值,可 diff)/ `created_at`;**无 IP 列**(IP 走认证审计,Q7)。
- **封装**:`writeAudit(admin, action, type, id, detail)` + `ensureAuditTable` 懒建表,detail 走 `JSON.stringify`。
- **三个真实写入点**:`updateUserStatus`(记 target { status, targetUsername })、`updateUserRole`(**记 previousRole**,改前值)、`deleteReview`(**整行 review** 存进 detail)——可回溯、可复核"改了什么、改前是什么"。
- **前端联动**:三个 mutation 都 `invalidatesTags: ['AdminAudit']`,『审计日志』tab 自动刷新([adminApi.js:24-44](client/src/store/API/adminApi.js#L24-L44))——写操作对运营无感、痕迹即时可见。

### Q6. ⭐仪表盘脱敏是"删字段"而不是"打码"——为什么? (analytics.js)

```js
// server/router_handler/analytics.js:23-30
const data = await getPlatformOverview()
const role = await resolveStaffRole(req)   // 回查 DB——防伪造 role
if (!isStaff(role)) delete data.userCount  // 非 staff 直接删字段
```
- 前端不做 mask:注册用户卡以 `overview.userCount != null` 决定整卡显隐([PlatformCharts.jsx:85-96](client/src/components/dashboard/PlatformCharts.jsx#L85-L96))。
- **为什么删字段而非 `'***'`**:掩码值仍泄露"字段存在 + 量级 + 脱敏规则";删字段是最大化信息不外泄。简历措辞"按 staff 服务端脱敏"准确,面试补一句"**具体是删除字段**"更精准。
- 亮点:`resolveStaffRole` 每次都回查 DB,不是信前端传的 role——脱敏判断本身也不信客户端。

### Q7. 认证审计和运营审计为什么分开? (authAuditLog vs admin_audit_log)

- **认证审计**(`authAuditLog.js`):`authLog(event, meta)` 打结构化 JSON 到 console,14 种事件(login_success / rate_limited / auth_banned / logout_all…),**显式剥离 password / token / authorization**——认证流量大且含敏感中间态,不落 DB。
- **运营审计**(`admin_audit_log`):DB 表,量小、要可查询可追溯给复核。
- **判断口径**:高频且敏感 → 日志;低频且要复核 → DB 表。能答出这个"放哪"的判断逻辑比背表结构加分。

### Q8. 登录限流怎么做的?(当 bonus 讲)

- `loginRateLimit.js`:内存 Map,**IP + identifier 双键**,15 分钟窗口失败 5 次锁定 15 分钟,超限 429;
- 关键细节:**不存在的用户同样计入失败**(防用户枚举探测),错误提示统一"用户名或密码错误"。

### Q9. 前端权限怎么控?为什么只信 getAdminMe 下发的 permissions? (AdminPage)

- 路由:`/admin` 只套 `NeedAuth`(登录守卫,**无角色级路由守卫**)([App.jsx:41](client/src/App.jsx#L41));真正的四档控制在页面内:``useGetAdminMeQuery`` 拿 `meData.admin.permissions`,`canManageUsers / canChangeRole / canModerateReviews / canReadAudit` 决定 **Tabs 显隐**;行内按钮 `canModifyStatus(row)` 泛到不可改自己、operator 不可动 [AdminPage.jsx](client/src/pages/AdminPage.jsx):73-119);非 staff 渲染"无权限"卡。
- **为什么可行**:角色表服务端单一来源,前端零硬编码 → 角色改名 / 新增不发版;后端 `adminMiddleware` + handler 二次兜底,前端权限只是 UX。
- **边界声明**:前端显隐不防爬虫/改请求,数据永远由服务端守(见八股 10)。

### Q10. 这批敏感运营数据换账号会串吗? (闭环)

- `adminApi` 在 `USER_SCOPED_APIS`([store/index.jsx:12](client/src/store/index.jsx#L12)),logout / 换号清 `resetApiState()` —— 和[简历① 缓存隔离](./auth-frontend-notes.md)是同一闭环,运营台数据不残留给下一账号。

---

## 前端 / 通用八股 · 借这条延伸

| 考点 | 一句话要点 | 对应本项目 |
|---|---|---|
| **RBAC 模型** | RBAC0(用户-角色-权限)是标准;RBAC1 加角色继承;ABAC 改用属性判权。权限点查询比"查角色"更灵活 | 你的能力矩阵是 RBAC0 实践;可主动说"不用继承,因为要表达 operator 的非单调排除" |
| **前端权限三做法** | ① 动态路由(按 role 生成 Route)② 静态路由 + 守卫 ③ 按钮/指令级细粒度;前端权限永远不是安全边界 | 你是 ②(NeedAuth)+ ③(permissions 控制 Tabs/按钮) |
| **改角色/封禁后旧 token 仍有效** | JWT 无状态 → 不可即吊销;解法:denylist / jti 版本号 / **每次回查 DB** | 你选回查——零额外状态、即时生效,代价是 DB 查询 |
| **IDOR / 越权** | token 身份判定 + 目标二次校验 | operator 动 staff 目标 403 就是实例 |
| **401 vs 403 vs 429** | 401 未认证,403 已认证但无权/账号不可用,429 限流 | 本项目三个边界清晰;被问就按此答 |
| **字段级脱敏方案** | 删字段 > 掩码打码 > 对称加密;脱敏放服务端/BFF,前端零逻辑 | `delete userCount`,前端以 `!= null` 显隐 |
| **审计四要素** | 谁 / 何时 / 对谁 / 做了什么(改前什么);可 append-only + 哈希链防篡改 | 你的 detail JSON 存旧值+新值,可 diff |
| **SoD 职责分离** | 审核人不能审核自己的操作,最小权限 | "operator 不动 staff" 是雏形,"谁审谁" 是延伸题 |
| **前端角色硬编码的坑** | role 写死在前端 → 改角色要发版 | 你靠 getAdminMe 下发 permissions 规避 |
| **视图层鉴权 ≠ 安全** | 前端显隐挡不住改请求/爬虫,数据服务端守 | 统一话术,主动说出口 |

---

## 场景 / 系统设计题

| 场景题 | 思路 |
|---|---|
| 设计内部运营后台权限系统 | 能力矩阵(非数字等级)+ 服务端单一来源 + 权限点下发前端 + 审计留痕 + 三态用户 + 目标二次校验;百万用户时把"每次查 DB"升级为带版本号的缓存 |
| 审计日志怎么防篡改 | 收口写库权限、append-only 表、detail 哈希链(每条含上一条哈希)、审计与业务写分离(独立库/队列) |
| ban 的瞬间用户还在操作怎么办 | 你的答案:中间件回查 DB,下一请求 403;进阶可谈 SSE/WebSocket 主动踢下线 |
| 为什么 role 不放 JWT | Q2 送分题:即时吊销 + 权限变更即时生效 |

---

## 风险自查表(面试前自己认账)

| 隐患 | 被问到怎么说 |
|---|---|
| 敏感接口每次回查 DB,性能损耗 | 只 cover 运营管理层;大流量换 Redis 版本号缓存——这段说明是权衡过的 |
| 前端无角色级路由守卫(`/admin` 只有 NeedAuth) | 前端权限是 UX;非 staff 会渲染"无权限"卡,数据仍被后端挡住,前端不兜安全 |
| 审计表懒建表 `ensureAuditTable` | 防"没跑初始化 SQL 直接崩"的韧性 |
| 限流参数(5 次/15 分钟)是常量 | 可配置;亮点是"不存在用户也计失败,防枚举" |
| 审计与业务同库写、同连接 | demo 可接受;生产建议审计独立库/异步队列,业务故障不阻塞审计 |

---

## 彩排建议

1. **先背三层鉴权链**(验签 → DB status → DB role+permission)和 **"JWT 不放 role"的理由**——这是本题的"为什么",比背端点更重要。
2. 30 秒版:能力矩阵 + DB 二次校验 + 审计留痕 + 删字段脱敏,一句一个。
3. 和[简历①](./auth-frontend-notes.md)串联成一条线:冷启动 bootstrap → `/admin/me` 拿 permissions → 运营台按权限渲染 → 换号清 adminApi 缓存 → 敏感写操作落审计日志并自动刷新审计 tab。

---

## 口径提醒(避免说错)

- **role 不在 JWT 里**——JWT 只有 `{id, username}`,role/status 每次回查 DB;
- 脱敏是**删除字段**,不是返回 `'***'`;
- 前端**没有角色级路由守卫**,权限在页面内由后端下发的 permissions 控制;
- `admin_audit_log` 记运营操作,认证事件走 `authLog` 日志(**不落 DB**)。