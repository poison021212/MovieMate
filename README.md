# 光影笔记 (MovieMate)

前后端分离的电影社区 Demo：React + Vite 前端，Express + MySQL 后端。

## 文档与协作

- 功能规格（按模块）：[docs/README.md](docs/README.md) → [docs/features/](docs/features/)
- AI / 开发者协作规则：[AGENTS.md](AGENTS.md)

| 模块文档 | 说明 |
| --- | --- |
| [movie-list-query.md](docs/features/movie-list-query.md) | 列表分页、搜索、排序、筛选 |
| [movie-detail-favorite.md](docs/features/movie-detail-favorite.md) | 详情与收藏 |
| [review-flow.md](docs/features/review-flow.md) | 影评 |
| [swipe-mode.md](docs/features/swipe-mode.md) | 速览模式 |
| [ai-recommendation.md](docs/features/ai-recommendation.md) | AI 推荐（画像列表 + 多轮会话） |
| [tmdb-sync.md](docs/features/tmdb-sync.md) | TMDB 同步脚本 |
| [runtime-and-config.md](docs/features/runtime-and-config.md) | 环境与启动 |

## 目录结构

```
MovieMate-master/
├── client/          # 前端 (Vite + React + Redux + Ant Design)
├── server/          # 后端 (Express + JWT + MySQL)
│   ├── sql/init.sql # 数据库建表与示例数据
│   └── .env         # 本地环境变量（勿提交仓库）
├── docs/features/   # 功能模块文档
├── AGENTS.md        # 协作规范
└── package.json     # npm workspaces，一键启动脚本
```

## 环境要求

- **Node.js** 20 LTS（推荐；避免使用过新的未验证版本）
- **MySQL** 8.x（或 5.7+）
- （可选）AI 推荐：`TMDB_ACCESS_TOKEN`、`DASHSCOPE_API_KEY`

## 首次运行

### 1. 安装依赖

在项目根目录执行：

```bash
npm install
```

会同时安装 `client`、`server` 两个 workspace 的依赖（含后端缺失的 `dotenv`）。

### 2. 初始化数据库

创建库表并插入示例电影：

```bash
mysql -u root -p < server/sql/init.sql
```

可选：导入演示账号与口味种子（AI 推荐闭环演示）：

```bash
mysql -u root -p movie_db < server/sql/demo_seed.sql
```

账号 `demo_user`，密码 `123456`（详见 [runtime-and-config.md](docs/features/runtime-and-config.md)）。

Windows PowerShell 若重定向不便，可在 MySQL 客户端中执行：

```sql
source D:/MovieMate-master/server/sql/init.sql
```

### 3. 配置环境变量

```bash
copy server\.env.example server\.env
```

编辑 [server/.env](server/.env)，至少填写：

| 变量 | 说明 |
|------|------|
| `DB_HOST` / `DB_USER` / `DB_PASS` / `DB_NAME` | 与 MySQL 一致，`DB_NAME` 默认为 `movie_db` |
| `JWT_SECRET` | 任意足够长的随机字符串 |

AI 推荐功能需额外配置 `TMDB_ACCESS_TOKEN` 与 `DASHSCOPE_API_KEY`，不配置时其余页面仍可正常使用。

### 4. 启动

**同时启动前后端（推荐）：**

```bash
npm run dev
```

- 后端 API：<http://localhost:1337>
- 前端页面：<http://localhost:5173>（Vite 会将 `/api` 代理到 1337）

**分别启动：**

```bash
npm run dev:server
npm run dev:client
```

## 常见问题

| 现象 | 处理 |
|------|------|
| `Cannot find module 'dotenv'` | 在根目录重新 `npm install` |
| `数据库连接失败` | 检查 MySQL 是否启动、`server/.env` 账号密码、是否已执行 `init.sql` |
| 前端白屏 / 模块找不到 | 在根目录 `npm install`，勿只在旧根目录单独装后端依赖 |
| AI 推荐报错 | 检查 `TMDB_ACCESS_TOKEN`、`DASHSCOPE_API_KEY` 是否有效 |

## 生产构建（前端）

```bash
npm run build -w moviemate-client
```

构建产物在 `client/dist`，需自行配置静态托管并将 API 指向后端地址（或设置 `VITE_API_URL`）。

## 电影列表 API（分页 / 筛选）

`GET /api/movies` 查询参数：

| 参数 | 说明 | 默认 |
|------|------|------|
| `page` | 页码 | 1 |
| `pageSize` | 每页条数 | 12 |
| `q` | 关键词（片名/导演/演员） | - |
| `sortBy` | `id` / `rating` / `year` / `title` 等 | `id` |
| `sortOrder` | `asc` / `desc` | `asc` |
| `minRating` | 最低评分 | - |
| `year` | 年份（与库中 `year` 字段精确匹配） | - |
| `genre` | 类型 | - |

示例：

```text
http://localhost:1337/api/movies?page=1&pageSize=12&sortBy=rating&sortOrder=desc&minRating=8&genre=科幻
```

首页列表会将上述条件同步到浏览器 URL（`?page=1&genre=科幻`），刷新后筛选状态保留。

## TMDB 同步（扩库）

需在可访问 `api.themoviedb.org` 的网络环境下执行（公司代理/DNS 异常时会出现 `fetch failed` 或超时）。

1. 在 [TMDB API 设置](https://www.themoviedb.org/settings/api) 获取 **API Read Access Token (v4)**，写入 `server/.env` 的 `TMDB_ACCESS_TOKEN`。
2. 推荐为 `movies.tmdb_id` 建唯一索引；若仅有基础建表脚本，同步会按现有列写入（见 [tmdb-sync.md](docs/features/tmdb-sync.md)）。
3. 在 `server` 目录执行（`5` 表示 **每个 job** 同步 5 页，每页约 20 条）：

```bash
cd server
npm run sync:tmdb -- 5
```

多任务增量示例：

```bash
node scripts/syncTmdbMovies.js --jobs popular,top_rated --pages 5
npm run sync:tmdb:daily
npm run sync:tmdb:weekly
```

### 验收（MySQL）

```sql
USE movie_db;
SELECT COUNT(*) AS total FROM movies;
SELECT COUNT(*) AS with_tmdb FROM movies WHERE tmdb_id IS NOT NULL;
SELECT tmdb_id, title FROM movies WHERE tmdb_id IS NOT NULL LIMIT 5;
```

幂等验证：同一命令再跑一遍，`total` 不应因重复 `tmdb_id` 暴涨：

```sql
SELECT tmdb_id, COUNT(*) c FROM movies WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id HAVING c > 1;
```

预期 0 行。

## 2 分钟演示脚本（答辩 / 录屏）

前置：`init.sql` 已执行，可选 `demo_seed.sql`；`server/.env` 含 DB、JWT、**TMDB、DashScope**；`npm run dev` 已启动。

Cloud Agent 上可将 `TMDB_ACCESS_TOKEN`、`DASHSCOPE_API_KEY` 配在 [Cloud Agents Secrets](https://cursor.com/dashboard/cloud-agents)，并在环境中 **Update Existing Env** 后重跑；或本地执行 `server/scripts/sync-env-from-secrets.sh` 写入 `server/.env`（勿提交）。

| 步骤 | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开首页，搜索关键词并观察列表上方 **来源**（本地 / TMDB 回写） | `meta.source` 与 hybrid 统计可展开查看 |
| 2 | 登录 `demo_user` / `123456` | JWT 写入本地存储 |
| 3 | 进入 **AI 推荐**，输入「推荐几部悬疑片」 | 返回卡片；`meta.localMappedRatePercent` 较高；标签「已注入口味档案」 |
| 4 | 点击 **查看详情** | 进入 `/movie/:localId` 站内页 |
| 5 | 点击 **写笔记** 或滚动至观后笔记 | `#movie-review` 锚点定位表单 |
| 6 | 提交一条评分与内容 | 刷新后列表可见；再次 AI 推荐仍带 `profileApplied` |

### 效果指标速查

| 能力 | 观测方式 |
| --- | --- |
| 列表 hybrid 命中率 | 首页来源提示 + `GET /api/movies/hybrid-stats` |
| AI grounding | 推荐页 `meta.groundedCount` = 展示卡片数 |
| 站内闭环 | 推荐卡片绿色「站内 ID」+ 详情/写笔记无外链 |
| 口味档案 | 登录后 `meta.profileApplied: true` |

详细契约见 [movie-list-query.md](docs/features/movie-list-query.md)、[ai-recommendation.md](docs/features/ai-recommendation.md)。
