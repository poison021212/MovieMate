# 豆瓣离线种子导入（TMDB 兜底）

- 状态：脚本已实现
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-24

## 1. 目标

在 TMDB 不可达（境内网络常见）时，为本地片库补充中文电影数据，使 hybrid 搜索与 AI 推荐降级后仍有足量可用的中文片。做法是将一份豆瓣抓取快照清洗并幂等写入本地 `movies` 表。

**不改变任何运行时代码**——`GET /api/movies` 的 hybrid 回退与 AI 单轮推荐的本地画像降级自动吃到新增本地数据。

## 2. 不做什么

- **不做常驻在线豆瓣爬虫**：豆瓣无官方开放 API、网页反爬严（重定向 `sec.douban.com` 验证、封 IP/限频），不适合作为在线兜底；
- 不重抓数据（当前固定 246 部，后续需要时再扩展）；
- 不替代 TMDB 同步（两数据源并存，`tmdb_id` 为 null 的行即豆瓣来源）。

## 3. 数据与输入文件

- 输入：仓库根 `douban_movie_item.json`（**非标准 JSON**：246 个独立对象按行拼接，需逐行解析）；已确认该文件在 TMDB 不可达时独立可用。
- 输出：清洗后的标准数组 `server/data/douban_seed.json`，可长期作为离线种子，后续重抓时替换该文件再跑导入即可。

## 4. 运行方式

```bash
cd server

# 只清洗 + 写种子 + 落库（零网络，主线功能）
npm run import:douban

# 未命中海报的行按豆瓣 movie_id 抓 og:image，失败回退 TMDB 图片搜索
npm run import:douban:posters

# 高级参数
node scripts/importDoubanSeed.js --input ../douban_movie_item.json --max 10 --delay-ms 800
```

参数：`--with-posters`（补海报）、`--input`（默认根目录 JSON）、`--out`（默认 `server/data/douban_seed.json`）、`--max`（只处理前 N 条，调试用）、`--delay-ms`（海报请求间隔，默认 600ms）、`--proxy`（等价于 `HTTPS_PROXY`/`HTTP_PROXY`）。

环境：`server/.env` 中的数据库配置；`--with-posters` 时 TMDB 回退需要 `TMDB_ACCESS_TOKEN`（可选）。

## 5. 数据映射与幂等

| 豆瓣字段 | movies 列 | 说明 |
| --- | --- | --- |
| `movie_title[0]` | `title` | 折叠多余空白，保留中英完整标题 |
| `rating_num[0]` | `rating` | 10 分制与 TMDB 兼容，直接映射 |
| `release_date` → 4 位数字 | `year` | `"(1939)"` → `1939` |
| `runtime` | `duration` | 统一为 `"238 分钟"` |
| `genre` 数组 | `genre` | 逗号 + 空格连接 |
| `directedBy` 数组 | `director` | 逗号连接 |
| `starring` 数组 | `actors` | 取前 8 人，避免卡片超长 |
| `intro` 段落数组 | `summary` | 逐段清洗后 `\n` 连接 |
| —（网络补） | `poster` | 豆瓣 og:image 优先，TMDB 图片搜索回退；抓不到留空，前端 `/no-image.png` 占位 |

幂等键：**`title + year`**（无 `tmdb_id` 时的本地去重方式，与 `movie.js` 的 hybrid 回写一致），使用 `<=>` 空安全等值；已存在则只补非空缺失字段，重复执行不会产生重复行、不会把已有海报置空。全程参数化 SQL。

## 6. 验收

```bash
# 幂等：连续运行两次，第二次"新增 0"
node scripts/importDoubanSeed.js

# 数据质量抽查
mysql -u root -p movie_db -e "SELECT title,rating,year,duration,genre,director FROM movies WHERE title LIKE '%乱世佳人%'"
mysql -u root -p movie_db -e "SELECT COUNT(*) FROM movies WHERE tmdb_id IS NULL"   # 豆瓣来源行
```

端到端：启动 `npm run dev` 后搜索"无间道"，应命中本地豆瓣数据（`tmdb_id` 为 null）。

## 7. 故障排查

| 现象 | 可能原因 |
| --- | --- |
| 海报大量未命中 | 豆瓣反爬（`sec.douban.com` 跳转）或当前网络无法访问 TMDB；报告会输出失败原因（`both-unreachable`/`tmdb-empty`），不影响主流程 |
| 进程不退出 / 超时 | 旧版本连接池未关闭，已修复（`db.end()` + 退出码）；确认使用当前脚本 |
| 种子文件条数少于 246 | 曾用 `--max` 调试会覆盖输出文件；重新运行不带 `--max` 的导入可恢复全量 |

## 8. 实现位置

- 脚本：[`server/scripts/importDoubanSeed.js`](../../server/scripts/importDoubanSeed.js)
- 种子：[`server/data/douban_seed.json`](../../server/data/douban_seed.json)
- npm：[`server/package.json`](../../server/package.json) 中 `import:douban` / `import:douban:posters`
- 来源数据：根目录 `douban_movie_item.json`（未入库，可随时替换）