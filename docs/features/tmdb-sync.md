# TMDB 数据同步

- 状态：脚本已实现
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-04

## 1. 目标

从 TMDB 增量拉取电影（热门 / 高分 / 上映中 / 即将上映），映射后幂等写入本地 `movies` 表，支撑片库扩容与 hybrid 搜索回写。

## 2. 不做什么

- 不是网页爬虫（使用官方 REST API）；
- 不同步全量全球片库（按任务与页数控制规模）；
- 不在公司受限网络下保证可运行（需能访问 `api.themoviedb.org`）。

## 3. 运行方式

```bash
cd server
npm run sync:tmdb -- 5
# 兼容旧用法：仅 popular，5 页

node scripts/syncTmdbMovies.js --jobs popular,top_rated --pages 3 --language zh-CN --region CN
node scripts/syncTmdbMovies.js --job now_playing --pages 2
```

预设 npm 脚本（便于定时任务手动执行）：

| 脚本 | 说明 |
| --- | --- |
| `npm run sync:tmdb:daily` | `popular` + `now_playing` + `upcoming`，各 3 页 |
| `npm run sync:tmdb:weekly` | `top_rated`，10 页 |

参数：`--job` / `--jobs`（逗号分隔）、`--pages`、`--language`、`--region`、`--delayMs`（默认 250ms）。

环境：`server/.env` 中配置 `TMDB_ACCESS_TOKEN`（v4 Read Access Token）。

## 4. 任务与端点

| job 名 | TMDB 路径 |
| --- | --- |
| `popular` | `/movie/popular` |
| `top_rated` | `/movie/top_rated` |
| `now_playing` | `/movie/now_playing` |
| `upcoming` | `/movie/upcoming` |

## 5. 数据映射与幂等

- 外部主键：`tmdb_id` = TMDB `movie.id`（表无该列时降级为 `title + year` 去重）；
- 写入：按当前表结构动态 insert/update；
- 海报存完整 URL：`https://image.tmdb.org/t/p/w500{poster_path}`。

推荐迁移：为 `movies.tmdb_id` 建唯一索引，与 hybrid 回写、同步脚本一致。

## 6. 验收（MySQL）

```sql
USE movie_db;
SELECT COUNT(*) AS total FROM movies;
SELECT COUNT(*) AS with_tmdb FROM movies WHERE tmdb_id IS NOT NULL;

SELECT tmdb_id, COUNT(*) c FROM movies WHERE tmdb_id IS NOT NULL
GROUP BY tmdb_id HAVING c > 1;
```

预期最后一查询 0 行（有 `tmdb_id` 唯一约束时）。

## 7. 故障排查

| 现象 | 可能原因 |
| --- | --- |
| `fetch failed` | DNS/代理/防火墙，非 token 过期 |
| `401` | Token 无效或过期 |
| upsert 少于 fetched | 表缺少部分列，脚本会跳过不可用字段 |

## 8. 实现位置

- 脚本：[`server/scripts/syncTmdbMovies.js`](../../server/scripts/syncTmdbMovies.js)
- npm：[`server/package.json`](../../server/package.json) 中 `sync:tmdb` / `sync:tmdb:daily` / `sync:tmdb:weekly`
- 说明：根 [README.md](../../README.md) TMDB 章节
