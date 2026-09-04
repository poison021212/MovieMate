# 5 分钟演示脚本（秋招现场 / 录屏）

> 前置：`npm run dev`，MySQL 已初始化，至少一个 staff 账号（`role=admin`），可选配置 `TMDB_ACCESS_TOKEN`。

## 账号准备

| 用途 | 建议 |
| --- | --- |
| 普通用户 | 自注册或 `demo_user` / `123456`（见 demo_seed） |
| 运营 staff | `UPDATE users SET role='operator' WHERE username='xxx'` |
| 第二个 staff | 用于演示换账号 |

---

## 时间轴（约 5 分钟）

### 0:00–1:00 会话与刷新（简历第 1 条）

1. 用 staff A 登录，进入 **运营台** `/admin`。
2. **F5 刷新**：应短暂 loading，**不**跳登录页，仍停留在运营台。
3. 口述：Access 在内存，Refresh 在 HttpOnly Cookie；NeedAuth 等 bootstrap 完成。

### 1:00–2:00 换账号 + 运营台（简历第 1 + 2 条）

1. 退出登录，用 staff B（或普通用户）登录，再进运营台。
2. 展示：用户列表 / 权限 Tab 与 A 不同；口述 RTK Query 换号 reset。
3. （若有权限）在 **评论审核** 删一条评论 → 打开 **审计日志**，出现 `review.delete` 及详情列。

### 2:00–3:00 Hybrid 搜索（简历第 3 条）

1. 回首页 `/`，搜索一个 **本地肯定没有** 的片名（如近期外语片英文名）。
2. 展示：Hybrid 来源提示；若配置了 TMDB，列表出现回写条目。
3. 若无 token：展示黄色 Alert「TMDB 回退不可用」，口述 meta 可观测性。

### 3:00–4:30 AI 三条固定话术（简历第 4 条，Optional 反馈）

登录后进 `/ai-recommend`，**新会话**：

| 顺序 | 输入 | 期望 |
| --- | --- | --- |
| 1 | `推荐几部悬疑` | 左栏出片单，`mode: recommend` |
| 2 | `《盗梦空间》的导演是谁` | 文字回答，`movies` 可为空 |
| 3 | `聊聊千与千寻的主题` | 闲聊回复，不硬推片单 |

对第 1 条结果的某张卡片：

- 点 **👎** → 提示已记录
- 再发 `换一批推荐` 或点 **换一批** → 新片单应尽量避开刚点踩的片（注入反馈 prompt）

展开 **工具轨迹** Collapse，口述 plan_tasks → search → finish 链路。

### 4:30–5:00 收尾（诚实边界）

口述三句：

1. 推荐是 **LLM 在几十条候选里排序**，不是协同过滤 / 向量检索。
2. 工程上有工具白名单、降级、SSE、赞踩反馈闭环。
3. 秋招后改进方向：规则召回 50–100 → LLM rerank → 跨会话偏好表。

---

## 演示翻车预案

| 现象 | 应对 |
| --- | --- |
| Ollama 503 / 慢 | 改 `.env` 用 DeepSeek/通义 API Key；或只演示工具轨迹 + 降级片单 |
| TMDB 空 | 强调「本地优先 + 可观测失败」，不硬说「一定能搜到」 |
| Agent 跑题 | 承认小模型 + 正则意图的局限；切到 qa 话术展示 grounding |
| 面试官问 AI 写的 | 用 [resume-bullets.md](./resume-bullets.md) 诚实模板 |

---

## 录屏检查清单

- [ ] 浏览器 DevTools → Application：Local Storage **无** token/userInfo
- [ ] Network：`/auth/refresh` 带 Cookie，`Set-Cookie` HttpOnly
- [ ] 运营台审计有一条真实操作记录
- [ ] AI 右栏工具轨迹随本轮刷新，不叠加上一轮
