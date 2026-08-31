# 简历条目④ 荐片 Agent — Tool-calling / 白名单循环 / SSE / 降级 面试速记

> 本笔记覆盖 LLM 应用工程:白名单工具循环、正则分流、SSE 工具轨迹 + 最终回复流式、prompt 预算截断、降级链、反馈闭环。与[③ Hybrid 搜索](./hybrid-search-notes.md)(共享幂等写库管道)对照读。
>
> 简历条目出处:[resume-bullets.md:37](../interview/resume-bullets.md#L37)(第 4 条)
> 代码出处:`server/utils/agentRuntime.js` · `server/utils/llmClient.js` · `server/utils/promptBudget.js` · `server/utils/recommendCore.js` · `server/router_handler/aiChat.js` · `server/utils/aiRecommendFeedback.js` · `server/utils/movieUpsert.js` · `client/src/components/AIRecommend.jsx` · `client/src/utils/streamRecommendChat.js`

---

## 开场总纲 · 30 秒自述

> "我做的是**受控 Tool-calling 荐片 Agent**,核心是**让模型在约束里干活,而不是放飞它**。工具是白名单(plan_tasks / search_tmdb / search_local_movies / get_movie_detail / upsert_and_map_local / finish_recommend 等),**双守卫强制先 plan_tasks**——没 plan 就调业务工具会被 skip 并提示,最多 6 轮,每步结果回灌上下文直到出示片单。输入先**正则分流**(recommend / qa / chat),不同模式换不同的 system prompt(推荐强制出片单、问答禁编造)。回答分两段:工具执行阶段**非流式**,SSE 把每条 `trace` 实时推给前端(工具轨迹 Timeline);最终回复才**逐 token 真流式**(`token` 事件)。prompt 用**字符预算**截断(SYSTEM/HISTORY/TOOL/TOTAL,超预算丢最老、保最近上下文);LLM 超时、工具出错、6 轮不收敛、schema 校验失败**四级降级**,最终落到本地片库并打 `meta.degraded`——LLM 是不可靠组件,降级是默认路径的一部分。"

**一句立框架**:`白名单 + 强制 plan + 步数上限 = 可控;正则分流 = 低延迟确定性;工具轨迹 SSE + 回复流式 = 可观测;预算裁剪 = 在小模型上下文里精打细算;降级链 = 把不可靠组件兜住`。

---

## 逐条深挖 · 项目级 Q&A

### Q.1 ⭐"白名单工具循环"是什么?为什么强制先 plan_tasks?

- **白名单**(`agentRuntime.js:12-19`):`PLAN_ALLOWED_TOOLS` = get_taste_profile / search_local_movies / search_tmdb / get_movie_detail / get_trend_summary / upsert_and_map_local;完整注册 6 个业务工具 + `plan_tasks` + `finish_recommend`。线外工具(如模型自己编名字)直接被拒,不存在"新工具即插即用"的窗口。
- **强制先 plan 的双守卫**([agentRuntime.js:845-857](server/utils/agentRuntime.js#L845)):
  1. `needsPlan && toolName !== 'plan_tasks' && !ctx.plan` → 返回 `{ error: '不在计划中:尚未 plan_tasks', skipped: true }`;
  2. `isToolInPlan`(509-514):已 plan 但是计划外工具 → 同样 skip;
  3. `plan_tasks` / `finish_recommend` **恒放行**(收尾工具不卡)。
  - 模型不按提示走(无 tool_calls 也无 plan)时,注入系统消息「你必须先调用 plan_tasks 输出执行计划」再 continue(812-817)。
- **为什么**:不设防的 Agent = 不可预测;plan-first 把"先想清楚再动手"的步骤显式化,**心智模型**(819-821):每次模型回复要么是 plan、要么是计划内的工具调用、要么是 finish_recommend,三者必居其一——这就把无限的自由空间收敛成了可审计的三态。

### Q.2 最多 6 步怎么设计?步数上限的动机?

- `MAX_TOOL_ROUNDS = 6`([agentRuntime.js:11](server/utils/agentRuntime.js#L11)),主循环 `for (round < 6)`,每轮可以含多个 tool_calls;plan 内的 steps 也 `.slice(0, 6)`(415)。
- **动机**:LLM 工具调用有**回路风险**(反复查、反复失败重试),上限=成本与延迟的保险丝;6 轮不收敛走降级(见 Q6)。
- **追问预备**:"6 步不够怎么办?"→ 收敛度不够就进 fallbackFromCandidates(候选兜底),不回无界循环——"宁可降级,不可失控"。

### Q.3 正则分流 recommend / qa / chat?为什么不用 LLM 来分类?

```js
// recommendCore.js:78-91 detectChatMode
const recommendSignals = /推荐|几部|类似|再来|换一批|片单|清单|还有什么|想看|来点/
const qaSignals      = /导演|制片人|编剧|主演|演员|简介|剧情|是谁|哪年|评分|介绍|讲讲|讲述|…
const chatSignals    = /怎么看|聊聊|讨论|主题|叙事|观感|觉得|认为|风格|意义|生义|象征|想法|观点/
```
- 优先级:命中 recommend → `recommend`;命中 qa → `qa`;命中 chat → `chat`;**兜底 recommend**。
- **为什么不用 LLM 分类**:三次调用 LLM 的成本 + ~秒级延迟换来的分类,与正则的确定性收益不对等;正则**零延迟、零成本、可测试、可解释**。局限(诚实):长尾表达覆盖有限,但兜底 recommend 保证"用户永远能得到片单"。
- **分流的意义不只是路由,而是换行为**:`buildSystemPrompt`(189-217)三种 system 分支——recommend 强制出片单、qa 禁编造(有 grounded 检索就答、没有就明说不知道)、chat 不硬推。

### Q.4 ⭐prompt 字符预算截断怎么做?为什么"预算"化? (promptBudget.js)

- **四档预算**(可 env 覆盖):`SYSTEM=4000 / HISTORY=6000 / TOOL=2000 / TOTAL=16000`。
- **策略**(`promptBudget.js:38-106`):
  1. system 超预算 → `slice(0, 4000)`;
  2. tool 结果超预算 → `slice(0, 2000)`;
  3. history 超预算 → **从最老的条目开始清空**直到 ≤6000;
  4. 总长超 16000 → 先丢最老的 history 条目,还不够再削 tool content 尾部。
  - **保留优先级**:当前 user 消息 + **最近的 tool 结果**——回答质量靠近期上下文,老历史最可牺牲。
- **为什么预算化而不是单点截断**:本地小模型(qwen2.5:7b)上下文窗口小、token 成本与延迟敏感;预算常量集中管理,`applyPromptBudget` 在 agent 主循环和流式回复两处都调用,一处策略多处复用。
- 配合**窗口裁剪**:多轮输入只取**最近 8 条**(`slice(-8)`,757-761),再叠加预算。又是第二层(见 Q9 会话摘要)。

### Q.5 SSE 怎么写?事件协议怎么设计?(前端如何消费)

- **服务端**([aiChat.js:193-200](server/router_handler/aiChat.js#L193)):`text/event-stream; charset=utf-8` + `no-cache` + `keep-alive` + `flushHeaders`;发送格式 `event: X\ndata: JSON\n\n`。
- **事件顺序**(有约定):`session` → `plan` → 若干 `trace`(每个工具一步)→ `error`(可选)→ `token*`(逐 token)→ `done`(`{ sessionId, assistantMessage, movies, meta }` 由路由 finalize 后发;agentRuntime 内部 `done` 不映射,**防双发**)。
- **前端**([streamRecommendChat.js](client/src/utils/streamRecommendChat.js)):不用 EventSource、**不走 RTK Query**——直接 `fetch` POST + `res.body.getReader()` + `TextDecoder`,按 `\n\n` 分帧解析 `event:`/`data:` 两行,回调 `onEvent`。`token` 事件 `setStreamingText(prev => prev + data.text)` 逐 token 追加。**流结束后**再用 `dispatch(vercelApi.util.invalidateTags([...]))` 让 RTK Query 重新拉持久化消息——话题:流式绕过了 RTK Query,事后用 tag 失效把权威结果回写 cache,兼顾实时与持久化(这是很能讲的前端点)。
- **选 SSE 而非 WebSocket 的理由**:单向推送足够、HTTP 语义(状态码/超时/代理)简单、`fetch` 流兼容、infra 友好。

### Q.6 ⭐四级降级链——为什么"降级"是设计重点?

全部集中在 `buildDegradedReply` 与各分支([agentRuntime.js:640-709、516-560、881-955](server/utils/agentRuntime.js#L640)):

| 触发 | 处理 |
|---|---|
| **LLM 不可用/超时**(无 key、Ollama 未启、90s 超时) | recommend → `getProfileFeedMovies` 取**本地片库 3 部** + 文案「AI 服务暂不可用(model:…),以下根据你的口味从本地片库挑选」;qa/chat → 有 grounded 结果拼事实,否则道歉 |
| **工具抛错** | `runToolWithRetry` 每工具**重试 1 次**;`search_tmdb` 第二次失败 → 降级 `search_local_movies` + `degraded_local`;其余 `{error}` 写回上下文继续 |
| **6 轮不收敛** | recommend → `fallbackFromCandidates`(候选前 3);候选空 → 本地片库;qa/chat → 通用兜底 |
| **schema 校验失败 / 空片单** | reply 必填、movies≤8 校验失败/recommend 空 → 同样候选/本地兜底,`agentTrace` 记 `fallback_validate` |

- **设计哲学**:LLM 是不可靠组件,**降级不是异常路径而是默认路径的一部分**——失败时用户永远拿到一个**可用的响应**(本地片单),而不是 error 页面。
- **可观测**:所有降级都 `meta.degraded=true` 且 `agentTrace` 明细(fallback 原因、模式)。降级要"看得见为什么"。

### Q.7 反馈闭环怎么影响后续推荐?(不重训模型)

- **持久化**:`ai_recommend_feedback` 表(username / session_id / movie_title / local_movie_id / tmdb_id / action `like | dislike | refresh_batch`),`ensureFeedbackTable` 幂等建表([aiRecommendFeedback.js](server/utils/aiRecommendFeedback.js));前端👍/👎 +「换一批」按钮([AIRecommend.jsx:82-99、224-262](client/src/components/AIRecommend.jsx#L82))。
- **影响后轮的机制**:`getRecentFeedback` 取**最近 12 条** → `buildFeedbackHint` 拼成「用户最近点踩(请避开)/ 点赞(可优先同类)/ 多次换一批(请换候选)」→ **注入下一轮 system prompt 的【用户近期反馈】段**([agentRuntime.js:213-215](server/utils/agentRuntime.js#L213))。
- **为什么 prompt 注入而非微调/向量**:demo 规模下轻量、即时生效、可解释;面试主动补一句"局限:只引导下一轮、无跨会话长期记忆、没进数据集训练"——**能讲清楚 scale 边界是加分项**。

### Q.8 会话与多轮上下文怎么管理?(三层)

1. **持久化**:会话存 **MySQL**(`ai_recommend_sessions` / `ai_recommend_messages`,`aiSessionStore.js`),不是内存——重启不丢、支持 CRUD。
2. **窗口裁剪**:多轮输入只取最近 8 条(757-761)+ 字符预算(Q4)。
3. **长会话摘要**(`sessionSummary.js`):user+assistant **≥8 轮时**,用 LLM 把最近 12 条压成 **≤120 字摘要**(10s abort),存 `sessions.summary`,下轮注入 **【会话记忆摘要】**([agentRuntime.js:210-212](server/utils/agentRuntime.js#L210))。
- **面试点**:三层 = 窗口(截断)→ 预算(压缩)→ 摘要(跨轮记忆),从便宜到昂贵逐级兜住长对话。

### Q.9 与 Hybrid 搜索的复用与不一致?(主动复盘)

- **复用**:`movieUpsert.js` 是共享中枢——`resolveLocalMovieIdsForCandidates`(84-103)逐条幂等 upsert;AI 的 `upsert_and_map_local` 工具把 TMDB 候选写回本地并把 `local_movie_id` 映射给前端(**卡片有站内 id 就跳站内,没有才挑 TMDB 网页**,AIRecommend.jsx:182-193)。与③的 `persistTmdbMovies` 同为「tmdb_id 落库 + 本地 id 映射」,**写库逻辑同源**。
- **不一致(工程教训)**:AI 侧 TMDB 客户端是**两处内联 `tmdbFetch`**(agentRuntime.js:286-296、recommendCore.js:8-25),用全局 `fetch`,`HTTPS_PROXY` 只在 hybrid 的 `tmdbClient.js` 生效——境内网络下 AI 候选与 Hybrid 可用性不一致。主动说:"这是一致性债,应收口到一个带代理+超时的共享客户端。"

### Q.10 LLM 客户端与限流

- **客户端**([llmClient.js](server/utils/llmClient.js)):OpenAI 兼容协议,默认 `http://127.0.0.1:11434/v1/chat/completions`(Ollama)+ model `qwen2.5:7b`;有 `LLM_API_KEY`/DEEPSEEK/DASHSCOPE/GEMINI 时走对应云端(`hasLlm()` 判定)。`tools` 时 `tool_choice:'auto'`,**90s `AbortSignal.timeout`**,错误分类:404 模型未找到、400 tools 不被模型支持。
- **温度分场景**:Agent 0.6(出片单要稳定)/ 单轮 0.7 / 会话摘要 0.3(压缩要准)。
- **限流**:Agent 聊天**独立限流**(`agentChatRateLimit.js` 内存桶,每用户 **12 次/60s**,超限 429);单轮 `/recommend` 无线流。

---

## 八股 · 借这条延伸(偏 AI 应用工程)

| 考点 | 一句话要点 | 对应本项目 |
|---|---|---|
| **Tool/Function Calling 原理** | LLM 并不"执行"工具,它只是**结构化输出一个调用意图**(tool_calls),由你的代码执行后把结果回灌 | 每轮 `chatCompletions` → 解析 tool_calls → runToolWithRetry → `role:'tool'` 写回 |
| **Agent 循环 vs ReAct** | ReAct = thought→action→observation 三件套;你的简化版是 plan→工具→结果→再生成,plan 显式化 | 白名单 + plan 三态(plan / 计划内工具 / finish) |
| **可控性设计** | 白名单、步数上限、schema 校验、skip 提示——把模型自由空间收敛成可审计路径 | MAX_TOOL_ROUNDS=6 + 双守卫 + chatResponse_schema |
| **Prompt 预算/上下文管理** | 有界上下文里按优先级取舍:保留最近 + 关键,丢最老;预算常量集中管理 | SYSTEM/HISTORY/TOOL/TOTAL + slice(-8) + 会话摘要 |
| **正则 vs LLM 分类** | 确定、零成本 vs 灵活、贵;NLP 里常先用规则兜底 | detectChatMode 三级正则 + 兜底 recommend |
| **SSE vs WebSocket vs polling** | SSE 单向、HTTP 语义简单;WebSocket 双向、低延迟;polling 简单浪费 | 单向生成流场景选 SSE 合理 |
| **RTK Query 与流式** | Query 无 SSE 原生支持;绕过 = fetch + ReadableStream 手写,事后 invalidateTags 回写 | `streamRecommendChat.js`(很能讲的前端点) |
| **降级/熔断/超时** | 外部依赖必带超时、重试、fallback;能力降级是业务状态的合法分支 | 90s 超时 + 1 次重试 + 四级降级 + `meta.degraded` |
| **Prompt 注入防护观念** | **工具返回的内容是数据不是指令**;模型要"看"用户数据,执行权在代码 | 工具结果只作上下文回灌、不驱动控制流(recommend 前有 grounded 校验) |
| **在线反馈 vs 离线训练** | 反馈闭环无需重训:最近 N 条注入 prompt 即可实现"下一轮调节" | getRecentFeedback(12 条)→ buildFeedbackHint → system prompt |
| **确定性与可观测** | 每一步留痕(工具名/参数/耗时/ok/降级)才能调试与 eval | `trace` 事件 + agentTrace + Timeline UI |

---

## 场景 / 系统设计题

| 场景题 | 思路 |
|---|---|
| 设计一个客服/购物助手工具循环 | 白名单 + 强制 plan-first + 步数上限 + plan 内工具校验 + schema 校验 + 完整降级链;工具执行权在代码、模型只有调用意图 |
| 怎么防 LLM 乱调工具/死循环/幻觉 | 白名单、计划约束、6 轮上限、`tool_choice` 受控、工具结果截断回灌、finish_recommend 收尾透 |
| LLM 服务挂了怎么办 | 超时 + 重试 → 无法服务时降本地兜底(内容照给、标注降级)→ 限流保护上游——"宁可降级不可失控" |
| 怎么评估 Agent 质量 | 诚实:项目无自动化 eval;可观测指标靠 `agentTrace`(每步 ok/失败/降级)与反馈闭环;正式做:脚本用例集 + 人工评分 interleaving |
| 反馈数据怎么用 | 项目:prompt 注入最近 12 条(轻量、即时);大规模可升级:在线学习/intent 学习、微调、冷启动热榜——讲清当前边界 |

---

## 风险自查表(面试前自己认账)

| 隐患 | 被问到怎么说 |
|---|---|
| **工具循环非流式**,每轮 LLM 完整调用,6 轮延迟累计 | 诚实:"真流式"只覆盖最终回复;[注意] 表述为「工具轨迹 SSE 推送 + 最终回复逐 token 流式」最准确;优化:首 token 快速 + 边算边推 |
| 正则分流覆盖有限(长尾误判) | 兜底 recommend 保底;可升级 LLM 分类器(代价权衡) |
| AI TMDB 客户端无代理(Hybrid 有) | 主动讲一致性债,方案是收口共享客户端 |
| Agent 限流内存桶,重启清零 | demo 可接受;生产换 Redis 计数 |
| 反馈只 prompt 层、无长期学习 | 讲清边界:即时调节 vs 持久模型;大规模升级路径已备 |
| 90s LLM 超时偏长 | 与真实交互可用性权衡;可做分级超时(工具 5s / 生成 30s) |
| 长会话摘要受限于 120 字 | 覆盖有限;替代:结构化记忆(用户口味画像独立存) |

---

## 彩排建议

1. **三个必须背透**:Q1(白名单 + plan 双守卫 = 可控性)、Q4(prompt 预算 = 小模型上下文管理)、Q6(四级降级 = LLM 不可靠组件下的默认路径)。
2. 30 秒版:白名单约束 + plan-first + 最多 6 步 → 正则分流换行为 → SSE 推工具轨迹、token 流式 → 预算裁剪 → 四级降级兜底本地片单。
3. 与③ Hybrid 串讲:**同一条 `movieUpsert` 幂等写库管道被 Hybrid 与 Agent 共用**(`resolveLocalMovieIdsForCandidates` / `upsert_and_map_local`),但 Agent 的 TMDB 客户端没走代理——"复用管道 + 识别一致性债"是高级工程感。
4. 被问"是不是 RAG"→ 明确:非检索增强的推荐器(简历已标注),是**受控工具调用 + 计划约束 + 降级链**,推荐来自工具(本地库/TMDB)而非向量相似度。
5. 被问"为什么不用向量检索"→ 谈权衡:语义检索对"荐片"收益有限(推荐质量瓶颈在候选召回与口味建模),RTR 可作后续演进方向——但别吹,简历明确不写 RAG/微调。

---

## 口径提醒(避免说错)

- **「真流式」只指最终回复**,工具执行阶段每轮是非流式调用——面试说「工具轨迹 SSE 推送 + 最终回复逐 token 流式」;
- DONE 事件由**路由**在 finalize 后发送,agentRuntime 内部 `done` 不映射,**防双发**;
- 降级是**200/正常响应里打 `meta.degraded=true`**,不是错误页;文案明确告知用户"AI 暂不可用,已换本地片库";
- AI 的 TMDB 客户端是**内联全局 fetch、无代理**(对比 hybrid 的 undici ProxyAgent)——不是同一份;
- 会话存 **MySQL**(不是内存),多轮输入取**最近 8 条**;反馈影响下轮靠 **prompt 注入**,不是微调。