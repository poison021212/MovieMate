# 运行环境与配置

- 状态：已实现
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-23

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

## 3. Git 分支

| 分支 | 用途 |
| --- | --- |
| `clean-structure` | **推荐**：当前 monorepo（`client/` + `server/` + `docs/`），无旧版根目录代码 |
| `master` | 保留远端历史合并结果，根目录仍含旧结构（如 `api/`、`app.js`） |

克隆或换机拉代码：

```bash
git clone https://github.com/poison021212/MovieMate.git
cd MovieMate
git checkout clean-structure
```

已在本地仓库时：`git fetch origin && git checkout clean-structure && git pull`。

可选：在 GitHub 仓库 Settings → Branches 将默认分支改为 `clean-structure`，避免误拉 `master`。

## 4. 环境要求

- Node.js 20 LTS（推荐）
- MySQL 8.x 或 5.7+
- 可选：TMDB 密钥；AI 默认本机 Ollama（见 §6），或云端 `LLM_API_KEY`

## 5. 启动步骤

1. 根目录 `npm install`
2. 初始化库：`mysql -u root -p < server/sql/init.sql` 或 `source .../init.sql`
3. （可选）演示账号与口味数据：`mysql -u root -p movie_db < server/sql/demo_seed.sql`（用户 `demo_user` / 密码 `123456`）
4. 若库已存在且缺少新表：`mysql -u root -p movie_db < server/sql/ai_chat_and_replies.sql`
5. 认证升级（邮箱验证 / refresh / 找回密码）：`mysql -u root -p movie_db < server/sql/auth_upgrade.sql`
6. 分析与趋势字段（仪表盘）：`mysql -u root -p movie_db < server/sql/analytics_upgrade.sql`（列已存在时可忽略报错）
7. 运营与 Hybrid 事件表：`mysql -u root -p movie_db < server/sql/analytics_ops_upgrade.sql`（含 `users.role` 初版与 `admin_audit_log`）
8. 运营角色扩展（四档 role）：`mysql -u root -p movie_db < server/sql/rbac_upgrade.sql`（**需先执行步骤 7**；新库 `init.sql` 已含四档 `role`，可跳过本步）
9. `copy server\.env.example server\.env` 并填写 `DB_*`、`JWT_SECRET`、`APP_PUBLIC_URL`
10. 根目录 `npm run dev`（或分别 `npm run dev:server` / `npm run dev:client`）

端口默认：API `1337`，前端 `5173`（Vite 代理 `/api` -> 1337）。

**前端路由滚动**：切换一级路由（`pathname` 变化）时窗口回顶；若 URL 带 `hash`（如详情页 `#movie-review`）则不强制回顶，由页面内锚点逻辑处理。实现：[`client/src/components/ScrollToTopOnRouteChange.jsx`](../../client/src/components/ScrollToTopOnRouteChange.jsx)。

## 6. 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DB_HOST` / `DB_USER` / `DB_PASS` / `DB_NAME` | 是 | MySQL 连接 |
| `JWT_SECRET` / `JWT_EXPIRE` | 是 | 登录令牌 |
| `PORT` | 否 | 默认 1337 |
| `TMDB_ACCESS_TOKEN` | 否 | TMDB + 同步脚本 |
| `LLM_BASE_URL` | 否 | 默认 `http://127.0.0.1:11434/v1/chat/completions`（本机 Ollama） |
| `LLM_MODEL` | 否 | 默认 `qwen2.5:7b`；**必须与 `ollama list` 输出的 NAME 完全一致**（如 `qwen3.5:cloud`） |
| `LLM_API_KEY` | 否 | 云端 OpenAI 兼容 API Key；本机 Ollama 可留空 |
| `DEEPSEEK_API_KEY` | 否 | 等同 `LLM_API_KEY` 的回退 |
| `DASHSCOPE_API_KEY` | 否 | 千问 Key（配合千问 `LLM_BASE_URL` / `LLM_MODEL`） |

**本机 Ollama（默认，免费）**

1. 安装 [Ollama](https://ollama.com/download)
2. 执行 `ollama list`，确认已有可用模型；若无默认 `qwen2.5:7b` 可 `ollama pull qwen2.5:7b`，或在 `.env` 里把 `LLM_MODEL` 改成列表中的 NAME（如 `qwen3.5:cloud`）
3. 保持 Ollama 运行；`server/.env` 配置 `LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY`（本机 Ollama 可留空 Key）
4. 使用 `:cloud` 后缀模型（如 `qwen3.5:cloud`）前需 **`ollama signin`** 登录 Ollama 账号；PowerShell 探测服务可用性请用 `curl.exe http://127.0.0.1:11434/api/tags`（不要用 `curl` 别名）

**换云端模型（只改 `.env`，不改代码）**

| 提供商 | `LLM_BASE_URL` | `LLM_MODEL` | Key |
| --- | --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-chat` | `LLM_API_KEY` 或 `DEEPSEEK_API_KEY` |
| 千问 DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `qwen-turbo` | `DASHSCOPE_API_KEY` |

实现：[`server/utils/llmClient.js`](../../server/utils/llmClient.js)

前端可选：`VITE_API_URL`（默认 `http://localhost:1337/api`）。

## 7. 静态资源

- 占位海报：[`client/public/no-image.png`](../../client/public/no-image.png)（需自行放置，避免兜底 404）

## 8. 常见问题

| 现象 | 处理 |
| --- | --- |
| 数据库连接失败 | 检查 MySQL 服务与 `.env` |
| 前端模块缺失 | 根目录重新 `npm install` |
| TMDB/Postman 超时 | 检查网络/DNS/代理，非仅 token 问题 |
| AI 推荐无回复 / 降级 | `ollama list` 是否含 `LLM_MODEL` 同名模型；`:cloud` 模型是否已 `ollama signin`；改 `.env` 后是否重启后端；查看助手正文或 toast 中的 LLM 错误详情 |
| 速览/收藏异常 | 确认已登录且 JWT 未过期 |

## 9. 生产构建

```bash
npm run build -w moviemate-client
```

产物：`client/dist`，需自行配置静态托管与 API 地址。

## 10. 实现位置

- 入口：[`server/server.js`](../../server/server.js)、[`client/src/main.jsx`](../../client/src/main.jsx)
- 数据库池：[`server/db/index.js`](../../server/db/index.js)
- 初始化 SQL：[`server/sql/init.sql`](../../server/sql/init.sql)、演示种子 [`server/sql/demo_seed.sql`](../../server/sql/demo_seed.sql)
