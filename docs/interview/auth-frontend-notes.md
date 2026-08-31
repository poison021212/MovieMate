# 简历条目① 前端侧 — 双 Token / 重放 / bootstrap / 缓存隔离 面试速记

> 本笔记只讲**前端**这一侧:401 静默续期与重放、`sessionStatus` 让 F5 刷新不误跳登录、按 userId 清 RTK Query 缓存。配套[认证服务端链路(发证/验证/换证/销证)](./token-flow.md)一起背,两条合起来才是完整闭环。
>
> 简历条目出处:[resume-bullets.md:17](../interview/resume-bullets.md#L17)(简历第 1 条)
> 代码出处:`client/src/store/API/baseQueryWithReauth.js` · `client/src/hooks/useSessionBootstrap.jsx` · `client/src/components/NeedAuth.jsx` · `client/src/store/index.jsx` · `client/src/store/Slice/authSlice.jsx` · `client/src/hooks/useAutoLogout.jsx`

---

## 开场总纲 · 30 秒自述

> "我负责的是**前端会话与状态边界**。**Access Token(JWT)只存 Redux 内存**,JS 任何持久化存储都碰不到——防 XSS;Refresh Token 由服务端写进 **HttpOnly Cookie、Path 限定 `/api/auth`**,浏览器自动携带,JS 摸不到——防 CSRF 又缩小暴露面。401 时我在 RTK Query 的 baseQuery 里拦截,静默换新 Access 并**重放原请求**;F5 刷新后内存令牌丢失,靠 `sessionStatus` 完成一次 **Cookie bootstrap** 再鉴权;换账号时按 **userId 清掉用户域 RTK Query 缓存**,防止串号。"

**一句话立框架**:`短期内存凭据(防 XSS) + 长期 HttpOnly 凭据(可吊销可轮换)+ 失灵即自动重放 + 刷新再引导 + 缓存按用户隔离`。第一句就给出设计维度,别从登录流程背起。

---

## 逐条深挖 · 项目级 Q&A

### Q1. 为什么 Access 放内存、Refresh 放 HttpOnly Cookie?为什么不用 localStorage?

| 选择 | 原因 |
|---|---|
| Access 放**内存**(Redux state) | localStorage / sessionStorage / Cookie 全是 JS 可读。页面一旦有任意 XSS(富文本、第三方脚本、jsonp),`localStorage.getItem('token')` 即可偷走长期凭证。内存令牌刷新即失、XSS 也读不到 |
| Refresh 放 **HttpOnly Cookie** | HttpOnly 让 `document.cookie` 读不到,`Secure` 保证 HTTPS 传输,`SameSite=Lax` 防 CSRF——把最值钱的长期凭证交给浏览器管理,前端全程不触碰 |
| 代价 | 内存 Access 刷新就没 → 需要 bootstrap 回灌(就是 Q4 的 F5 bug);Refresh 在 Cookie 里前端不能主动"读"来做逻辑 → 只能靠「打到认证接口时自动带上」 |

产出可背的一句话:**"持久化存储都是 XSS 可读的;低危数据才放 localStorage,高危凭证默认进内存或 HttpOnly cookie。"** ([authSlice.jsx](client/src/store/Slice/authSlice.jsx) 的 `clearLegacyAuthStorage` 就是在清旧版 localStorage 遗留——可顺口讲"我们是把旧实现主动迁移掉的"。)

### Q2. 401 静默续期怎么写?怎么避免 refresh 死循环? (baseQueryWithReauth.js)

流程:**发请求 → 401 且非 `skipReauth` → 用独立 fetchBaseQuery(自带 `credentials:'include'`)调 `POST /api/auth/refresh` → 成功 `loginSuccess` 存新 token → 原样重放原请求 → 失败 `dispatch(logout())`**。

防递归三保险:
1. refresh 用的是**独立 `fetchBaseQuery`**,不走 `baseQueryWithReauth` 本身,天然不会在 refresh 里再触发 refresh;
2. 显式传 `extraOptions: { skipReauth: true }` 双保险;
3. 服务端 refresh 成功就 `loginSuccess`,重放时 `prepareHeaders` 会带上**新** token。

```js
// baseQueryWithReauth.js 核心(无需背全,记住 401→refresh→重放 三步)
let result = await rawBaseQuery(args, api, extraOptions)
if (result.error?.status === 401 && !extraOptions?.skipReauth) {
  const refreshResult = await refreshBaseQuery({ url: 'auth/refresh', method: 'POST', body: {} }, api, { skipReauth: true })
  refreshResult.data
    ? (api.dispatch(loginSuccess({ token: refreshResult.data.accessToken })), result = await rawBaseQuery(args, api, extraOptions))
    : api.dispatch(logout())
}
return result
```

### Q3. ⭐ 并发 401 会怎样?你现在没有单飞锁——这是主动讲的加分点

**现状(诚实说)**:没有 `isRefreshing` / 请求队列,页面 N 个请求同时 401,会并发发 N 次 refresh。而服务端做**轮换(Rotation)**——refresh 之后立即把旧 refresh 标记 `revoked_at`。于是后到的刷新请求拿着已被吊销的旧 Cookie → `findValidRefreshSession` 返回 null → 401 → 前端 `dispatch(logout())`。**结论:高并发 401 时可能把正常用户误登出。**

**改进方案(标准答案,背到能默写)**:**单飞 + 等待队列**。第一个 401 发起 refresh 并加锁;其余 401 不请求,把 resolve 压进 `waiters`;refresh 完成后统一 resolve 队列,逐个重放。

```js
let isRefreshing = false
let waiters = []                    // Array<(ok: boolean) => void>
export async function baseQueryWithReauth(args, api, extraOptions) {
  let result = await rawBaseQuery(args, api, extraOptions)
  if (result.error?.status !== 401 || extraOptions?.skipReauth) return result

  if (!isRefreshing) {              // 单飞:只有第一个请求真正去 refresh
    isRefreshing = true
    try {
      const refreshResult = await refreshBaseQuery({ url: 'auth/refresh', method: 'POST', body: {} }, api, { skipReauth: true })
      refreshResult.data
        ? api.dispatch(loginSuccess({ token: refreshResult.data.accessToken }))
        : api.dispatch(logout())
    } finally {
      isRefreshing = false
    }
  }
  const ok = await new Promise((resolve) => waiters.push(resolve)) // 挂起等 refresh 结果
  waiters = []
  return ok ? rawBaseQuery(args, api, extraOptions) : result
}
```

追问预备:「refresh 回来之前,队列里的请求等多久?」→ 有超时兜底,refresh 超时/失败直接 `logout` 并且所有 waiter resolve(false),避免请求吊死。也就是"失败也只放行一次,然后全往下走登出"。

### Q4. F5 刷新误跳登录的根因?`sessionStatus` 怎么修? (useSessionBootstrap + NeedAuth)

**根因**:Access 在内存 → 刷新即丢 → 路由守卫在"身份还没回来"时看到 `isLogin === false` → 误跳登录。

**修法(三段式)**:
1. 顶层 `useSessionBootstrap`(App.jsx)启动时调一次 `refreshTokenFn({})`——浏览器自动带 HttpOnly Cookie,把 Cookie 里的身份**回灌**成内存 Access Token,bootstrap 成功走 `loginSuccess`,失败走 `sessionBootstrapFailed`。[useSessionBootstrap.jsx](client/src/hooks/useSessionBootstrap.jsx)
2. `sessionStatus` 维护 **`'bootstrapping'`(初始) / `'ready'`** 两态;`loginSuccess`/`logout`/`sessionBootstrapFailed` 最终都收敛到 `'ready'`。[authSlice.jsx](client/src/store/Slice/authSlice.jsx)
3. **`NeedAuth` 守卫在 `bootstrapping` 阶段只渲染 Spin、不做鉴权**,等 `'ready'` 才依据 `isLogin` 放行或 `<Navigate to="/auth" state={{ from: location }}>`。[NeedAuth.jsx](client/src/components/NeedAuth.jsx)

```
F5 → sessionStatus='bootstrapping' → NeedAuth 渲染 Spin(绝不跳登录)
   → refresh 带 cookie 回来 → loginSuccess → 'ready' → 进目标页
   → refresh 失败(无登录 cookie) → sessionBootstrapFailed → 'ready' → isLogin=false → 跳登录,state.from 登录后回跳
```

追问预备:「那不是每个受保护页都要等一次接口?」→ 只等一次,bootstrap 结果进 Redux;且**未登录时 token 为空就不发 bootstrap**(`useSessionBootstrap` 里 `auth.isLogin || triedRef.current` 直接 return),**启动开销为零**。

### Q5. 换账号为什么要按 userId 清 RTK Query 缓存? (store/index.jsx)

**根因**：RTK Query 缓存 key = `endpoint 名 + serializeQueryArgs(args)`,**不含 userId**。不清的话,账号 B 打开页面会直接读到账号 A 缓存的列表 → **串号 / 数据泄漏(运营台把上一用户数据透给下一用户)**。

**做法**：`createListenerMiddleware`(RTK 2.x 官方推荐,替代组件里手动 subscribe)两个监听:
- `logout` → `resetUserScopedApis` 清 5 个**用户域** API(`reviewApi / favoriteApi / analyticsApi / vercelApi / adminApi`)的 `resetApiState()`;**公开的 `MovieApi`、`authApi` 刻意不保留在列表**——公开数据无需清,还省一次重拉;
- `loginSuccess` → 用 `listenerApi.getOriginalState()` 取**变更前**的 `auth.userInfo?.id`,与新的 id 比对,**变了才清**,避免"同账号重复登录也全清"的不必要重拉。[client/src/store/index.jsx](client/src/store/index.jsx)

**`getOriginalState()` 是让这段有含金量的细节**:action 派发后 normal accessor 读到的已是新 state,而它拿到的是**处理前**的旧 state,正好做"前后对比",比在组件里手动存 `lastUserId` 干净得多。追问「为什么不用 `invalidatesTags`?」→ tags 管**同用户**下的细粒度数据失效(删了一条评论失效 `['Review']`),`resetApiState` 管**账号边界**,两者的职责不同(详见八股 8)。

### Q6. 衍生追问弹药

| 追问 | 一句话要点 |
|---|---|
| Refresh Token 轮换是什么?为什么? | 每次 refresh 换发新串并吊销旧的,防**重放**;检测旧串复用可升级为全端下线。详见 [token-flow.md Why 2](./token-flow.md) |
| Refresh 也失败了 / 过期了怎么办? | `dispatch(logout())` → 清缓存 + 跳登录(`state.from` 回跳) |
| 为什么刷新失败不能静默挂起? | 不清则后续请求全部 401 死循环;display 层必须回到未登录态 |
| 用户被 ban 但 token 没过期? | 服务端 `authMiddleware` 验签后**回查 DB 用户状态**,banned → 403,`JWT 无状态不代表无法吊销` |
| Cookie Path 为什么限定 `/api/auth`? | 业务接口不携带这个最值钱的凭证,暴露面最小化(纵深防御) |
| refresh 为什么不把 token 放 body? | body 通道要求前端 JS 能读到它,HttpOnly 就形同虚设,防 XSS 的意义全没 |
| access 为什么不放 cookie? | cookie 会被自动携带、被跨站请求利用;走 `Authorization` 头浏览器不会自动带,CSRF 面更小 |
| 多标签页会话同步怎么办? | 当前没做(诚实答)。共用同一 Cookie,任一标签页 refresh 都会全局轮换→其他标签页旧 cookie 401;标准解法 `BroadcastChannel` 广播登出/登录、`navigator.locks` 跨页单飞 |
| SSR 适合这套吗? | 不适合:内存 token 依赖 window + Redux 运行时;SSR/移动端常见变体是 Access 也走 Cookie(牺牲部分 XSS 防御),或 BFF(Backend-for-Frontend)代持 token |
| `triedRef` 为什么存在? | 开发模式 StrictMode 下 effect 会执行两次,防止重复发 bootstrap;背得出这个说明源码是真读的 |
| `useAutoLogout`(兜底定时器)? | 按 `tokenExpireTime` 倒计时,临近 1 分钟提前 refresh 续期,已过期直接 `logout`,和租约续期一个思路 |

---

## 前端八股 · 借题延伸

### 1. Cookie 属性全家桶(必考)
- **HttpOnly**:JS 读不到 → 防 XSS 窃取。
- **Secure**:仅 HTTPS 传 → 防中间人明文拦截。
- **SameSite**:`Strict`(同站才带)/ `Lax`(跨站导航的 GET 带)/ `None`(须配 Secure,依赖第三方 Cookie,正被浏览器逐步收紧)。
- **Path** / **Domain**:前者限定携带范围(本项目 `/api/auth`),后者管子域共享。
- 本项目一整套:**HttpOnly + Secure(生产) + SameSite=Lax + Path=/api/auth**——让面试官逐条说出每项防什么。

### 2. XSS vs CSRF(极易混)
| | XSS | CSRF |
|---|---|---|
| 本质 | 注入脚本在用户浏览器里执行 | 借用户已登录身份发伪造请求 |
| 危害 | 窃 token/数据、篡改页面 | 状态变更/转账等 |
| 本项目防御 | HttpOnly + Access 内存 = **XSS 拿不到 token** | SameSite=Lax + 业务走 header + refresh 只认 /api/auth cookie = **CSRF 打不到状态接口** |
| 前端通用防御 | 输入过滤 / 输出编码 / CSP / HttpOnly | CSRF Token / SameSite / 校验 Origin & Referer |

### 3. 存储四件套对比
`localStorage`(约 5M、永久、不随请求)→ `sessionStorage`(约 5M、关标签页销毁)→ `Cookie`(约 4KB、随请求、可设 Max-Age / HttpOnly / Secure)→ `IndexedDB`(大、异步、事务)。**楼梯总结**:"凭证不进 localStorage,非敏感偏好(主题、语言)可以"。

### 4. Cookie-Session vs Token vs JWT
- **Session**:服务端存储,可即时吊销;扩展要共享 session(Redis),有存储成本。
- **JWT**:无状态、验签即可,天然适配分布式;**但签出去就改不了**(吊销靠 denylist / 版本号 / DB 回查)。JWT = `Header . Payload . Signature`,三段 base64url,服务端验签名、**永不信任 payload**;算法混淆攻击(RS256 降级 HS256 用公钥当密钥)是经典考点。
- **你的项目是混合体**:JWT 短 Access + DB 会话表可吊销 Refresh + 鉴权中间件**回查 DB**(弥补 JWT 不可吊销的短板)。能解释"为什么不能只用 JWT"就是高分。

### 5. Refresh 的三种策略
固定 Refresh(长期有效、泄露风险大)/ **拦截式刷新**(401 才刷,配合 RTR,你的做法)/ 定时刷新(按租约周期定期续,配合 useAutoLogout 思路)。各自权衡:安全 vs 体验 vs 复杂度。

### 6. 并发竞态:单飞 + 队列
Q3 的核心,前端高阶考点。锁 + pendingQueue + 统一 resolve;注意**登出也加锁**,防 refresh 回来覆盖 logout 的状态。

### 7. RTK Query 缓存机制(简历点名它,必问)
- 缓存 key = `endpoint + serializeQueryArgs(args)`,同 key 复用;
- `providesTags / invalidatesTags` 做数据失效(`['Favorite']`、`['Review','Reply']`、`['AdminUsers']`…);
- `refetchOnMountOrArgChange / refetchOnReconnect / refetchOnFocus`;
- `resetApiState()` 清所有 entries + subscriptions;**你把它升维成"按用户域批量 reset"**;
- **`resetApiState` vs `invalidatesTags`**:**一个管账号边界、一个管同账号的数据脏了**,视角不同、各司其职。

### 8. 幂等性(重放请求的隐患)
401 重放 = 一个请求可能执行两次。GET 天然幂等;写操作要在服务端做**幂等键**或让业务幂等,否则可能重复下单/扣款。答出"只在幂等请求自动重放 + 服务端幂等键兜底"即过关。

### 9. 前端路由守卫 ≠ 安全边界
`NeedAuth` 只防手滑、防不了恶意——数据都在接口上,真正的边界是后端中间件(`authMiddleware` + `adminMiddleware` + DB 回查)。主动说出这句非常加分。

### 10. SSO / OAuth 同构
OAuth 授权码模式:资源所有者 / 客户端 / 授权服务器 / 资源服务器;`Access(短期) + Refresh(长期可离线换新)` 和你的**双 Token 思想同构**——能说出这层,说明有系统设计思维。

---

## 场景 / 系统设计题

| 场景题 | 思路 |
|---|---|
| 给支付类应用设计鉴权? | 内存 Access + HttpOnly Refresh 依旧成立,但必须加:设备指纹/风控、轮换 + 复用检测、幂等键防重放;可谈 WebAuthn |
| Access 泄露怎么办? | 30 分钟有效期把损失窗口压到最小 + 立即 revoke refresh + denylist 兜底 |
| 怎么让已签发的 JWT 立即失效? | 纯 JWT 做不到;`jti/版本号` + DB 比对(项目 `banned` 回查就是这个思路)、黑名单,或直接换无状态会话 |
| 移动端用这套合适吗? | 原生 App 没 Cookie 仓储,把两个 token 放 Keychain/安全存储更常见;Cookie 方案是 Web 特化 |

---

## 风险自查表(面试前自己认账)

| 隐患 | 被问到怎么说 |
|---|---|
| **无单飞锁,并发 401 可能误登出** | 主动讲(Q3)+ 给单飞/队列解法,转成展示点 |
| **多标签页会话不同步** | 坦诚没做,给 BroadcastChannel / navigator.locks 方案 |
| **生产 `Secure` 只走 HTTPS** | 讲清 Vite dev 代理 + 生产同源,避免"Secure cookie 上不了 http 开发环境"翻车 |
| **前端判断"已登录"只是体验层** | 强调安全边界在后端中间件 |
| **`triedRef` 与 StrictMode** | 防 effect 双执行重复 bootstrap,证明读过多实源码 |

---

## 彩排建议

1. 把 **Q3 单飞锁 + Q5 getOriginalState + Q4 bootstrap** 三个讲成肌肉记忆——这是最可能被追问、也最能体现深度的三个点。
2. 完整闭环讲法:登录发证 → 业务走 Access → 401 拦截换证重放 → F5 bootstrap 回灌 → 换号清缓存 → 登出销证散。和 [token-flow.md](./token-flow.md) 的四个阶段接起来是一条线。
3. 面试只给 1 分钟,压成:30 秒总纲 + "内存 Access 防 XSS、HttpOnly Refresh 可吊销、失灵自动重放、缓存按用户隔离"一句收尾。