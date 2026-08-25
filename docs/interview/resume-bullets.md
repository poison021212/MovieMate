# MovieMate 简历条目（秋招 · 前端 / 全栈）

> 只写 3–4 条，每条对应你能讲 3 分钟的技术点。不要写功能清单。

## 项目标题

**光影笔记 MovieMate** — 电影社区全栈 Demo（React / Express / MySQL），含 HttpOnly 双 Token 会话、运营 RBAC 与审计、Hybrid 片库搜索、受控 Tool-calling 荐片 Agent

**技术栈：** React 18 · Vite · Redux Toolkit Query · Ant Design · Express · MySQL · JWT · SSE · Ollama / OpenAI 兼容 LLM

---

## 推荐三条（必写）

### 1. 会话与前端状态（偏前端）

设计并实现 **Access Token 内存 + Refresh HttpOnly Cookie** 双 Token 方案：401 时 RTK Query 自动静默续期并重放请求；受保护路由在 `sessionStatus` 完成 Cookie bootstrap 后再鉴权，修复 F5 刷新误跳登录；换账号时按 user id 清空用户域 RTK Query 缓存，避免运营台展示上一用户数据。

**关键词：** HttpOnly Cookie、RTK Query reauth、session bootstrap、缓存隔离

### 2. 运营台 RBAC + 审计（偏全栈）

实现四档角色（user / moderator / operator / admin）权限矩阵，敏感操作 **服务端 JWT + DB 二次校验**；封禁、改角色、删评论写入 `admin_audit_log`；仪表盘注册用户等字段按 staff 角色服务端脱敏。

**关键词：** RBAC、审计日志、服务端鉴权、字段级脱敏

### 3. Hybrid 搜索与外部数据回写（偏工程）

首页搜索 **本地 MySQL LIKE 优先**，第一页结果不足时 fallback TMDB `/search/movie`，幂等 upsert 后 **按持久化 id 合并** 返回（避免中文 title 与英文关键词二次 LIKE 失配）；运行时 TMDB 客户端支持 `HTTPS_PROXY`，失败原因通过 `meta.fallbackError` 回传前端。

**关键词：** 混合搜索、幂等 upsert、代理、可观测 meta

---

## 可选第四条（写得上限，别吹过）

### 4. 受控 Tool-calling 荐片 Agent（LLM 应用工程）

多轮对话采用 **白名单工具循环**（强制先 `plan_tasks`、最多 6 步、计划外工具 skip）；正则分流 recommend / qa / chat；SSE 工具轨迹 + 最终回复真流式；prompt 字符预算截断；工具 / LLM 失败时降级本地片单。**非**向量检索或协同过滤推荐系统。

**关键词：** Function Calling、SSE、降级链、grounding

**禁止出现在简历里的词：** RAG、向量检索、个性化推荐算法、微调、多智能体

---

## 一笔带过（口述「还有这些模块」即可）

- 速览模式：分页预加载 + DOM 窗口化
- 数据洞察：ECharts + 日快照趋势预测
- 集成测试：Vitest + supertest，19 用例覆盖认证与契约

---

## 被问「是不是 AI 写的」时

> 实现大量借助 AI 辅助；**需求边界、权限矩阵、会话存储策略、Hybrid 回写合并、Agent 工具白名单** 是我定的。我能 walkthrough 关键链路的数据流和失败降级，也清楚当前推荐质量的上限与后续改进方向（反馈闭环、Retrieval→Rerank，而非再堆 Agent 层）。

---

## 投递岗位微调

| 岗位 | 强调 | 弱化 |
| --- | --- | --- |
| 前端 | 第 1 条 + URL 同步列表 + RTK Query | Agent 工具细节 |
| 全栈 | 第 1–3 条 + 集成测试 | ECharts 细节 |
| 偏 AI 应用 | 第 4 条 + 反馈闭环（见 [ai-recommendation-feedback.md](../features/ai-recommendation-feedback.md)） | 不说「训练模型」 |
