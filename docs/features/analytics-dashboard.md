# 数据洞察仪表盘

- 状态：已实现
- 最后核对日期：2026-08-23

## 1. 目标

为 MovieMate 提供可演示的数据可视化能力：平台片库趋势、基于日快照的热度预测、登录用户个人洞察；并与 AI Agent 的 `get_trend_summary` 工具打通。

## 2. 路由与页面

- 前端：`/dashboard`（顶栏「数据洞察」）
- 图表库：**ECharts**（`echarts` + `echarts-for-react`）

## 3. API 契约

| 场景 | Method + Path | 鉴权 | 响应 `data` |
| --- | --- | --- | --- |
| 平台概览 | `GET /api/analytics/overview` | 可选 Bearer | 片库/评论计数 + hybrid 快照；**`userCount` 仅 staff 可见**（普通用户响应不含该字段） |
| 类型分布 | `GET /api/analytics/genres` | 无 | `[{ genre, count }]` |
| 年份趋势 | `GET /api/analytics/year-trends` | 无 | `[{ year, count, avgRating, avgPopularity? }]` |
| 热度 Top | `GET /api/analytics/top-popular?limit=10` | 无 | 电影列表 |
| 趋势预测 | `GET /api/analytics/forecast?genre=&horizon=3` | 无 | 见下表 |
| 我的口味 | `GET /api/analytics/me/taste` | Bearer | 雷达/画像 |
| 我的评分 | `GET /api/analytics/me/ratings` | Bearer | 直方图数据 |
| 我的活跃 | `GET /api/analytics/me/activity` | Bearer | 按日评论数 |
| AI 使用 | `GET /api/analytics/me/ai-usage` | Bearer | 按日 assistant 消息数 |

### 预测响应字段

| 字段 | 说明 |
| --- | --- |
| `source` | 固定 `snapshots` |
| `history[]` | 日快照序列 |
| `baseline[]` / `forecast[]` | WMA + 线性外推 |
| `aiForecast[]` | LLM 可用时（本机 Ollama 或云端 Key）且校验通过时的 LLM 外推 |
| `explanation` | 中文说明 |
| `method` | `wma+linear` / `ai-constrained` / `insufficient-data` |
| `insufficient` | 快照不足（<5 点）时为 true，**禁止**用上映年份冒充热度 |

## 4. 数据作业

```bash
# 每日快照（cron 或手动）
npm run snapshot:analytics -w moviemate-server

# Demo 回填 7 天趋势
npm run snapshot:analytics:seed -w moviemate-server
```

- 脚本：[`server/scripts/snapshotAnalytics.js`](../server/scripts/snapshotAnalytics.js)
- Hybrid 事件表：`hybrid_search_events`（[`analytics_ops_upgrade.sql`](../server/sql/analytics_ops_upgrade.sql)）

## 5. 数据库

- 迁移：[`server/sql/analytics_upgrade.sql`](../server/sql/analytics_upgrade.sql) + [`analytics_ops_upgrade.sql`](../server/sql/analytics_ops_upgrade.sql)
- 表：`analytics_snapshots`、`hybrid_search_events`

## 6. 实现位置

- 聚合：[`server/utils/analyticsCore.js`](../server/utils/analyticsCore.js)
- 路由：[`server/router/analytics.js`](../server/router/analytics.js)
- 前端：[`client/src/pages/DashboardPage.jsx`](../../client/src/pages/DashboardPage.jsx)

## 7. 验收

- [ ] `/dashboard` 展示类型饼图、年份折线、热度 Top
- [ ] 普通用户概览无「注册用户」卡片；staff 登录后可见
- [ ] 无足够快照时预测区显示「数据不足」
- [ ] 有 LLM（本机 Ollama 或 `LLM_API_KEY`）时预测图含统计基线 + AI 虚线
- [ ] 登录后「我的洞察」与收藏/评论一致
- [ ] `npm run build -w moviemate-client` 通过
