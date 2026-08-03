# 运行环境与配置

- 状态：已实现
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-03

## 1. 目标

让新环境在较短时间内完成：依赖安装、数据库初始化、环境变量配置、前后端联调。

## 2. 仓库结构

```text
MovieMate-master/
├── client/          # Vite + React + Redux + Ant Design
├── server/          # Express + MySQL + JWT
├── docs/            # 功能文档与索引
├── AGENTS.md        # AI/协作规则
└── package.json     # npm workspaces
```

## 3. 环境要求

- Node.js 20 LTS（推荐）
- MySQL 8.x 或 5.7+
- 可选：TMDB、DashScope 密钥（AI 与同步）

## 4. 启动步骤

1. 根目录 `npm install`
2. 初始化库：`mysql -u root -p < server/sql/init.sql` 或 `source .../init.sql`
3. `copy server\.env.example server\.env` 并填写 `DB_*`、`JWT_SECRET`
4. 根目录 `npm run dev`（或分别 `npm run dev:server` / `npm run dev:client`）

端口默认：API `1337`，前端 `5173`（Vite 代理 `/api` -> 1337）。

## 5. 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DB_HOST` / `DB_USER` / `DB_PASS` / `DB_NAME` | 是 | MySQL 连接 |
| `JWT_SECRET` / `JWT_EXPIRE` | 是 | 登录令牌 |
| `PORT` | 否 | 默认 1337 |
| `TMDB_ACCESS_TOKEN` | 否 | TMDB + 同步脚本 |
| `DASHSCOPE_API_KEY` | 否 | AI 推荐 |

前端可选：`VITE_API_URL`（默认 `http://localhost:1337/api`）。

## 6. 静态资源

- 占位海报：[`client/public/no-image.png`](../../client/public/no-image.png)（需自行放置，避免兜底 404）

## 7. 常见问题

| 现象 | 处理 |
| --- | --- |
| 数据库连接失败 | 检查 MySQL 服务与 `.env` |
| 前端模块缺失 | 根目录重新 `npm install` |
| TMDB/Postman 超时 | 检查网络/DNS/代理，非仅 token 问题 |
| 速览/收藏异常 | 确认已登录且 JWT 未过期 |

## 8. 生产构建

```bash
npm run build -w moviemate-client
```

产物：`client/dist`，需自行配置静态托管与 API 地址。

## 9. 实现位置

- 入口：[`server/server.js`](../../server/server.js)、[`client/src/main.jsx`](../../client/src/main.jsx)
- 数据库池：[`server/db/index.js`](../../server/db/index.js)
- 初始化 SQL：[`server/sql/init.sql`](../../server/sql/init.sql)
