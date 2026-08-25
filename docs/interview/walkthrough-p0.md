# P0 必懂实现 Walkthrough

> 目标：每条简历 bullet 都能从入口追到数据。对照源码自讲一遍，建议录音 5 分钟 × 3 段。

## 文件索引

| 主题 | 必读文件 |
| --- | --- |
| 双 Token | [`server/utils/authCookies.js`](../../server/utils/authCookies.js)、[`docs/features/auth-security.md`](../features/auth-security.md) |
| 401 重试 | [`client/src/store/API/baseQueryWithReauth.js`](../../client/src/store/API/baseQueryWithReauth.js) |
| F5 不跳登录 | [`client/src/store/Slice/authSlice.jsx`](../../client/src/store/Slice/authSlice.jsx)、[`client/src/hooks/useSessionBootstrap.jsx`](../../client/src/hooks/useSessionBootstrap.jsx)、[`client/src/components/NeedAuth.jsx`](../../client/src/components/NeedAuth.jsx) |
| 换号清缓存 | [`client/src/store/index.jsx`](../../client/src/store/index.jsx) |
| RBAC | [`server/utils/roles.js`](../../server/utils/roles.js)、[`server/middleware/adminMiddleware.js`](../../server/middleware/adminMiddleware.js)、[`server/router_handler/admin.js`](../../server/router_handler/admin.js) |
| Hybrid | [`server/router_handler/movie.js`](../../server/router_handler/movie.js)、[`server/utils/tmdbClient.js`](../../server/utils/tmdbClient.js) |
| Agent | [`server/utils/agentRuntime.js`](../../server/utils/agentRuntime.js)（约 630–890 行）、[`server/utils/recommendCore.js`](../../server/utils/recommendCore.js) `detectChatMode` |
| 反馈闭环 | [`server/utils/aiRecommendFeedback.js`](../../server/utils/aiRecommendFeedback.js)、[`docs/features/ai-recommendation-feedback.md`](../features/ai-recommendation-feedback.md) |

---

## 图 1：登录与 F5 刷新时序

```mermaid
sequenceDiagram
  participant Browser
  participant NeedAuth
  participant Bootstrap as useSessionBootstrap
  participant RTK as baseQueryWithReauth
  participant API as Express_auth

  Note over Browser: 用户 F5 刷新 /admin
  Browser->>NeedAuth: 首屏 render
  NeedAuth->>NeedAuth: sessionStatus=bootstrapping
  NeedAuth-->>Browser: 显示 Spin，不跳转

  Bootstrap->>API: POST /api/auth/refresh Cookie
  alt Cookie 有效
    API-->>Bootstrap: accessToken + user
    Bootstrap->>Browser: dispatch loginSuccess
    Bootstrap->>Browser: sessionStatus=ready
    NeedAuth->>NeedAuth: isLogin=true
    NeedAuth-->>Browser: 渲染受保护页面
  else Cookie 无效
    API-->>Bootstrap: 401
    Bootstrap->>Browser: sessionBootstrapFailed
    NeedAuth-->>Browser: Navigate /auth
  end

  Note over Browser: 业务请求 access 过期
  Browser->>RTK: GET /api/admin/me Bearer
  RTK->>API: 401
  RTK->>API: POST refresh Cookie
  API-->>RTK: 新 access
  RTK->>API: 重放原请求
```

**面试要点：**

- Refresh 为什么在 HttpOnly Cookie：JS 读不到，降低 XSS 偷 refresh 风险；path=`/api/auth` 缩小暴露面。
- `skipReauth`：refresh 请求本身不能再触发 refresh，防死循环。
- 换账号：`logout` 或 `loginSuccess` 且 user id 变化 → `resetApiState()` 清 adminApi 等。

---

## 图 2：Hybrid 搜索 + TMDB 回写

```mermaid
sequenceDiagram
  participant UI as MovieList
  participant API as GET_movies
  participant DB as MySQL
  participant TMDB as tmdbClient

  UI->>API: hybrid=1 q=关键词 page=1
  API->>DB: LIKE title/director/actors
  DB-->>API: localRows

  alt localRows 少于阈值且 page=1
    API->>TMDB: search/movie
    alt 有 token 且网络可达
      TMDB-->>API: results
      API->>DB: upsert by tmdb_id
      DB-->>API: persistedIds
      API->>DB: SELECT BY ids
      API->>API: merge localRows + tmdbRows
    else 无 token 或网络失败
      API-->>UI: meta.fallbackError=true
    end
  end

  API-->>UI: items + meta.source
```

**面试要点：**

- 为何按 id 合并：TMDB 写回中文 title，用户搜英文时二次 LIKE 仍为空。
- 与离线 `sync:tmdb` 脚本分工：脚本 bulk 同步；Hybrid 是搜索时按需回写。
- 失败可观测：`missing_token` / `network_error` 前端 Alert。

---

## 图 3：Agent 一轮工具循环

```mermaid
sequenceDiagram
  participant User
  participant Chat as aiChat_handler
  participant Agent as agentRuntime
  participant LLM as llmClient
  participant Tools as DB_TMDB

  User->>Chat: POST chat/stream message
  Chat->>Chat: detectChatMode 正则
  Chat->>Chat: buildTasteProfile + getRecentFeedback
  Chat->>Agent: runAgentChatTurnCore

  loop 最多 6 轮
    Agent->>LLM: messages + tool definitions
    LLM-->>Agent: tool_calls 或 纯文本

    alt 首轮无 plan_tasks
      Agent->>Agent: 注入必须先 plan
    else tool_calls
      Agent->>Tools: search_local / search_tmdb / get_movie_detail
      Tools-->>Agent: 结果写入 ctx
      Agent-->>User: SSE trace 事件
    end

    alt finish_recommend
      Agent->>Agent: enrichAgentMovies
      Agent-->>User: SSE done
    end
  end

  Note over Agent: 失败则 buildDegradedReply 规则片单
```

**面试要点：**

- 意图分流是 **正则** `detectChatMode`，不是 LLM 分类；默认 recommend。
- 防幻觉：白名单工具 + 必须 grounding；reason 仍可能由 LLM 自由发挥。
- SSE：工具阶段非流式；最终回复单独 `stream: true` 出 token。
- 反馈：最近 👎 注入 system prompt，下轮避开不喜欢的片。

---

## 自测清单（讲完即过关）

- [ ] 能白板画出 Cookie refresh 与 NeedAuth 的关系
- [ ] 能解释 operator 为何不能封 moderator（权限矩阵）
- [ ] 能说出 Hybrid 触发条件（page=1、local < min(5, pageSize)）
- [ ] 能区分 recommend / qa / chat 三种 mode 的用户话术
- [ ] 能诚实说明「和 ChatGPT 推荐差在哪」（无向量、无长期记忆、候选池小）
