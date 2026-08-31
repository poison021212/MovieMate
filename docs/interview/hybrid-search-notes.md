# 简历条目③ 首页搜索 — Hybrid 本地 / TMDB / 幂等回写 / 可观测 面试速记

> 本笔记覆盖混合搜索的**全链路**:本地 LIKE → 第一页不足 fallback TMDB → 幂等 upsert → 按持久化 id 合并 → `meta.fallbackError` 可观测回传。**偏工程 / 偏后端**,前端侧聚焦 meta 透传与竞态收口。
>
> 简历条目出处:[resume-bullets.md:27](../interview/resume-bullets.md#L27)(第 3 条)
> 代码出处:`server/router_handler/movie.js` · `server/utils/tmdbClient.js` · `server/utils/movieUpsert.js` · `server/utils/hybridSearchMetrics.js` · `server/sql/analytics_upgrade.sql` · `client/src/store/API/MovieApi.jsx` · `client/src/components/MovieList.jsx`

---

## 开场总纲 · 30 秒自述

> "首页搜索是**本地优先 + 外部兜底**的 Hybrid 方案:先查本地 MySQL(`title/director/actors LIKE`),当第 1 页结果不足 5 条时,fallback 到 TMDB `/search/movie`。TMDB 结果**幂等 upsert** 回写本地(唯一键 `tmdb_id`),再**按本地持久化 id 回查合并**返回——这一手的关键是:用户输"*Inception*"命中的是一部存成中文的《盗梦空间》,回写后直接按 id 返回,全程不再对本地做第二次 LIKE,中文 title 与英文关键词不会失配。TMDB 客户端在运行时读 `HTTPS_PROXY` 用 undici `ProxyAgent` 走代理;外部失败**不改变 HTTP 状态码**,恒 200 + `meta.fallbackError` 标记回传,前端用三条 Alert 分支把"本地命中/外部抓取/TMDB 失败"透明展示给用户。"

**一句立框架**:`本地快查 → 第一页不足才打扰外部 → 幂等回写落库(沉淀为本地资产)→ 按 id 合并 → 失败不降级 HTTP、走可观测 meta`。

---

## 逐条深挖 · 项目级 Q&A

### Q1. 为什么"本地优先 + 外部兜底"?直接全查 TMDB 不行吗?

- 本地库有**中文片源**(豆瓣种子 + 运营录入),体验稳、零外部依赖;但用户可能输**英文原名**,本地 LIKE 必然 0 命中。
- 全量走 TMDB 的代价:外部网络不稳(尤其境内)、配额限流、延迟高、结果字段还得二次适配——本地是体验基线,TMDB 是增量。
- **Hybrid 的价值词**:用外部搜索引擎补本地覆盖缺口,靠落库把一次性外呼沉淀成长期本地资产。

### Q2. fallback 触发条件为什么设计成"第 1 页 + 不足 5 条"?

触发条件的四个约束([movie.js:220-225](server/router_handler/movie.js#L220-L225)):
```
useHybrid('1') && page === 1 && q 非空 && 本地第一页条数 < min(pageSize, 5)
```
- **只在第 1 页**:第 1 页是"这个关键词本地到底匹配不匹配"的相关性窗口;翻页后用户已接受本地结果,不反复打扰外部,分页语义也一致。
- **阈值 5 = `HYBRID_MIN_LOCAL_RESULTS` 常量**:不是"0 条才兜底",而是"不足一屏才补"——0 命中或冷门词都覆盖。
- 可谈点:阈值做成常量、可调,是"策略参数化"的简单实践。

### Q3. 本地 LIKE 有什么硬伤?为什么英文关键词会"失配"?(送分题)

```js
// movie.js:152-155
conditions.push('(title LIKE ? OR director LIKE ? OR actors LIKE ?)')
whereParams.push(`%${q}%`, `%${q}%`, `%${q}%`)
```
- `%q%` 前置通配 → 天然走**全表扫描**(你也可顺手讲:"前置 `%` 使前缀索引无从利用,`movies` 表 title/actors 也没有加索引")。
- 失配的本质不是 LIKE 写错,而是**语言/语义错位**:用户搜 "*Inception*",本地 title 是《盗梦空间》,LIKE 0 命中 → 触发 fallback → 交给 TMDB 的全库多语言全文检索。这正是"失配问题"的来源,也解释了为什么叫 hybrid 而不是本地优化。

### Q4. ⭐"幂等 upsert"怎么保证同一部电影不重复入库?

- **实现**(`movieUpsert.js upsertMovieRecord`):先 `SELECT id FROM movies WHERE tmdb_id = ?`,存在则 `UPDATE`,不存在则 `INSERT`;**不是 `INSERT ... ON DUPLICATE KEY`**。
- **唯一键**:`tmdb_id`(迁移 SQL 建的 `UNIQUE INDEX idx_movies_tmdb_id`,[analytics_upgrade.sql:16](server/sql/analytics_upgrade.sql#L16));无 tmdb_id 的数据(豆瓣种子)退化用 `title = ? AND year <=> ?`(`<=>` 空安全等值)做幂等键——**两套种子共用同一去重语义**。
- **并发缺口(必讲,这就是 tradeoff)**:SELECT+UPDATE 无锁,两个并发请求同时 SELECT 不到 → 同时 INSERT → 触发 `ER_DUP_ENTRY` → 被 `getMovies` 外层 catch 吞掉,**代价是这次请求记一个 `fallbackError`**([movie.js:254-258](server/router_handler/movie.js#L254-L258))。面试答法:"唯一索引兜底防重复行,并发冲突以一次可观测标记为代价,而不是死锁或脏数据;如果要根治,换 `ON DUPLICATE KEY UPDATE` 或加事务"。

### Q5. ⭐"按持久化 id 合并"到底解决了什么?

流程([movie.js:236-251](server/router_handler/movie.js#L236-L251)):
```
TMDB 命中(id 27205)→ 以 tmdb_id upsert 到本地 → 拿到本地行 id → SELECT * WHERE id IN (...) → mergeMovieResults 按本地 id 合并去重 → slice(pageSize)
```
- **关键**:从此**不再用 `%q%` 对本地做第二次 LIKE**——避免的就是"已确认存在的外片,因为 title 语言不一致又没匹配到"。
- 落库而非现身返回的三重收益:**schema 统一**(外片与本地同一套表/详情页复用)、**详情可达**(详情接口 `getMovieById` 纯本地 `WHERE id=?`,不碰 TMDB,外片不落库根本查不到)、**自愈缓存**(`tmdbPersisted` 统计:拉取即落库,同词再搜直接命中本地,逐步降低外部依赖)。
- **面试金句**:"外部是一次性的查询,落库是把查询变成资产"。

### Q6. ⭐meta.fallbackError 为什么不走 HTTP 错误码?(可观测设计)

- 语义区分:**"外部补充失败" ≠ "请求失败"**。本地结果(哪怕 0 条)对用户仍是有效响应,抛 4xx/5xx 反而误导前端和监控。
- 所以**恒 200**,失败信息全部放进响应 `body.meta`([movie.js:285-295](server/router_handler/movie.js#L285-L295)):
```js
meta: {
  source: 'local' | 'tmdb' | 'mixed',
  hybrid, fallbackTriggered,
  fallbackError, fallbackErrorReason, // 'missing_token' | tmdbErr.code | 'network_error'
  localCountBeforeFallback, tmdbFetched, tmdbPersisted, aggregate?,
}
```
- 前端 `transformResponse` **原样透出**(baseQuery 不加工 meta)——"可观测元数据走业务 payload、不进 RTK Query 的 error" 是这个设计的要点。
- **不止传错误,还传上下文**:`localCountBeforeFallback / tmdbFetched / tmdbPersisted` 让前端能把整条链路展示给用户(见 Q9)。这是"结构化可观测"的实践,比布尔 flag 高一个层次。

### Q7. HTTPS_PROXY 运行时代理怎么实现?为什么选 undici ProxyAgent?

```js
// tmdbClient.js
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''
if (PROXY_URL) {
  const { ProxyAgent, fetch: undiciFetch } = require('undici')
  tmdbHttpFetch = (url, init) => undiciFetch(url, { ...init, dispatcher: new ProxyAgent(PROXY_URL) })
}
```
- **运行时读环境变量**(不是编译期),有代理替换全局 `fetch` 的 dispatcher,无代理退化为原生 fetch——**部署方改环境变量即生效,不需要动代码/重启生效从 env 读**。
- 选 undici `ProxyAgent` 而非 `https-proxy-agent`:Node 18+ 原生 fetch 走 undici,`dispatcher` 注入是官方扩展点,复用同一套 fetch 语义(请求/响应/中止)。
- **可讲的差异点**:项目里 `recommendCore.js`(AI 推荐)是**另一套 TMDB 客户端,没走代理**——境内网络下 hybrid 可用而 AI 候选不稳定,这是一个"两个外部客户端职责不统一"的工程教训,主动说出来等于展示复盘能力。

### Q8. 并发 / 竞态怎么处理?(前端 + 后端两个维度)

- **后端**:并发 upsert 由唯一索引 + catch 兜底(见 Q4),搜索本身无锁。
- **前端:没有一行竞态代码**——收口在 RTK Query 机制:搜索参数变化 → 切到新的 cache entry → `fetchBaseQuery` 内部对旧 in-flight 请求 `AbortController.abort()` → 组件只订阅当前参数。**必须讲清"为什么不用手写序号锁"**([MovieList.jsx](client/src/components/MovieList.jsx)):
  - cache key = endpoint + serialize args,参数一变就不是同一个缓存条目,旧响应自然落进废弃条目;
  - 老请求被 abort,不会"晚到的旧响应覆盖新结果"。
- **反向点**:`isLoading` 是整页替换(没用 `keepPreviousData`)——搜索切换瞬间闪"加载中",这是体验优化空间(可改为保留旧数据直到新数据到达)。

### Q9. 前端三处 meta 展示怎么设计的?(透明降级)

[MovieList.jsx:239-267、326-332](client/src/components/MovieList.jsx#L239)
1. `meta.hybrid && searchTerm` → **info Alert**:「本地命中 N / TMDB 回退抓取 M、写回 K」——链路透明;
2. `meta.fallbackError && searchTerm` → **warning Alert**,按 `fallbackErrorReason` 区分文案:`missing_token` 提示配 `TMDB_ACCESS_TOKEN`,否则提示检查网络并配置 `HTTPS_PROXY / HTTP_PROXY`;
3. **空态双分支**:本地未命中 + TMDB 也失败 →「本地未命中,且 TMDB 回退未能补充」;否则「未找到相关电影」。

**设计要点**:降级不是静默的,用户可感知"为什么我搜到了/没搜到",且文案直接指向运维动作(配 token/代理)——可观测闭环到"能指引人怎么修"。

### Q10. 为什么搜索接口没有(服务端)缓存与限流?

- **缓存**:`/api/movies` 无服务端缓存,靠**前端 RTK Query 按 key 客户端缓存**——诚实答"单机 demo 维度够用,没到需要 Redis/边缘缓存的量级";可无缝接"真要做:LRU/Redis TTL + `tmdbFetched` 统计驱动外部调用降频"。
- **限流**:movies 路由无限流(只有登录与 AI agent 有)——同理,外部 TMDB 调用是"每搜索一次就打一次外部",是真正的放大点,**值得被追问后补一句"这个接口最该加的是对 TMDB 外呼的限流/熔断"**。

---

## 前端 / 通用八股 · 借这条延伸

| 考点 | 一句话要点 | 对应本项目 |
|---|---|---|
| **防抖 vs 即时搜索** | 随打防抖(debounce setTimeout/lodash)省请求 vs 回车/按钮触发(零噪声、交互明确) | 你选回车触发,无防抖代码;被问"怎么防抖"讲原理即可 |
| **`LIKE '%kw%'` 索引失效** | 前置通配符使前缀索引失效 → 全表扫;大规模换 MySQL FULLTEXT / ngram 中文分词 / ES | 项目表无 title 索引,正好成为 fallback 的"推力" |
| **幂等写入三招** | `INSERT IGNORE` / `ON DUPLICATE KEY UPDATE` / `SELECT+UPDATE`(你的)+ 唯一约束兜底;并发重复键错误处理 | SELECT+UPDATE + `UNIQUE idx_movies_tmdb_id`,`ER_DUP_ENTRY` 被 catch |
| **外部 API 调用** | 超时(AbortSignal/AbortController)、重试、降级(fallback)、代理(undici ProxyAgent / https-proxy-agent)、熔断 | TMDB 客户端无超时(风险自查);hybrid 是"部分降级"(本地照常) |
| **可观测性:错误 ≠ 异常** | "能力降级"是业务状态不是请求失败;布尔 flag → 错误码 → 结构化 meta 逐级进阶 | `meta.fallbackError + fallbackErrorReason + tmdbPersisted…` |
| **RTK Query 竞态收口** | cache key 隔离 + fetchBaseQuery 内部 AbortController → 无需手写序号锁;keepPreviousData 控制 UI 体验 | 前端零竞态代码,依赖隐式机制 |
| **响应规范化** | `transformResponse` 统一图片 URL、补 meta 默认值,组件零散逻辑收口 | `normalizePoster`(相对路径→uploads/API_ORIGIN,TMDB→w500) |
| **降级要可视化** | 用户可感知的降级(Info/Warning Alert)而不是默默失败 | 三处 Alert + 空态双分支,文案指向运维动作 |
| **URL 状态同步** | 筛选/分页与 URLSearchParams 双向同步 → 可收藏、可回退、可分享 | 搜索与筛选状态全在 URL |
| **数据来源与去重** | 多来源合并要有**稳定业务键**(tmdb_id)而非 title(会重名/翻译变体) | 合并按 `row.id`,去重键用 tmdb_id |

---

## 场景 / 系统设计题

| 场景题 | 思路 |
|---|---|
| 设计"多来源聚合搜索"(本地 + TMDB + 第三方) | 分层:本地快查(索引/缓存)→ 不足才聚合外部 → 幂等落库统一 schema → 稳定业务键去重 → 失败降级不进错误通道 → 可观测 meta |
| 外部依赖不可用怎么办 | 超时 + 重试(指数退避)+ 优先级降级链(本地 > 缓存 > 外部)+ 熔断(连续失败断开);你的项目已做"部分降级" |
| 幂等回写在并发下怎么不重复 | 唯一约束是最终防线;可谈 `ON DUPLICATE KEY UPDATE`、事务 `SELECT ... FOR UPDATE`、或幂等键 from 请求头 |
| 给搜索接口加缓存 | 本地结果客户端缓存(RTK Query 已做)+ 外部结果短 TTL 缓存 + `tmdbPersisted` 统计驱动外呼降频;防放大优先给 TMDB 外呼限流 |
| 中文搜索为什么难 | 分词(ngram 中文分词)、拼音/缩写、同义(盗梦空间 ↔ Inception)、模糊匹配——可顺势讲你的"语言错位"正是这个问题的实例 |

---

## 风险自查表(面试前自己认账)

| 隐患 | 被问到怎么说 |
|---|---|
| TMDB 请求**无超时**(只有状态校验) | 诚实:用了 `AbortSignal.timeout()` 加超时是明确改进项,避免外部慢请求拖住搜索 |
| AI 推荐与 hybrid 是**两套 TMDB 客户端**(AI 无代理) | 主动讲一致性课题:"理应收口到一个带代理+超时的共享客户端" |
| 并发 upsert 以**一次 fallbackError 为代价** | 唯一索引兜底、不脏数据;根治方案已备(ON DUPLICATE / 事务) |
| **无服务端缓存 + 无外部限流** | 单机 demo 够用;放大点是 TMDB 外呼,最该加熔断/限流 |
| fallback 链路**无自动化测试**(只有 pageSize 钳制) | 测试覆盖缺口,可补 mock TMDB 的超时/失败用例 |
| **恒 200** 的取舍 | 监控/告警看不到外部failure(被 meta 吞掉);弥补:hybrid-stats 聚合 + 落库事件可查 |
| 前端 `isLoading` 整页替换 | 未用 keepPreviousData,切换闪"加载中";体验优化点 |

---

## 彩排建议

1. **三个必须背透**:Q4(幂等 upsert 的实现与并发缺口)、Q5(按持久化 id 合并 = 避免二次 LIKE 失配)、Q6(恒 200 + meta 的结构化可观测)。
2. 30 秒版:本地 LIKE → 第一页不足 fallback → tmdb_id 幂等落库 → 按 id 合并 → 失败走 meta 不降级 HTTP。
3. 和简历④(Tool-calling Agent)串成一条线:**AI 推荐与本条共用同一套 `movieUpsert` 幂等回写管道**(`resolveLocalMovieIdsForCandidates`),但 AI 客户端没走代理——你能说出"我在项目里复用了同一条写库管道",证明不是各写各的。
4. 被问"改进方向":超时(AbortSignal)+ 共享 TMDB 客户端 + 外呼限流/熔断 + keepPreviousData,一条条列得出来。

---

## 口径提醒(避免说错)

- 实现是 **SELECT+UPDATE/INSERT**,不是 `INSERT ON DUPLICATE KEY`;并发重复行由唯一索引 + catch 兜底并记为 `fallbackError`;
- fallback 触发是"**第 1 页不足 5 条**"(`HYBRID_MIN_LOCAL_RESULTS`),不是"本地为 0 才兜底";
- **没有 502**:外部失败恒 `200 + meta.fallbackError`(`missing_token` / `tmdbErr.code` / `network_error`);
- TMDB 失败**不影响本地结果返回**——catch 只置标记,本地结果照常 200;
- 前端竞态**没有手写代码**,收口在 RTK Query 的"参数变 → 切 key + 内部 abort"。