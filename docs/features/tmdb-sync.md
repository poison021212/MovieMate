# TMDB 数据同步

- 状态：脚本已实现
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-03

## 1. 目标

从 TMDB 分页拉取热门电影，映射字段后 upsert 到本地 `movies` 表，支撑片库扩容与后续 `tmdb_id` 统一身份。

## 2. 不做什么

- 不是网页爬虫（使用官方 REST API）；
- 不同步全量全球片库（默认按页数参数控制规模）；
- 不在公司受限网络下保证可运行（需能访问 `api.themoviedb.org`）。

## 3. 运行方式

```bash
cd server
npm run sync:tmdb -- 5
# 等价于 node scripts/syncTmdbMovies.js 5
```

参数：第一个 CLI 参数为最大页数，默认 5；每页约 20 条。页间 `delayMs=250` 节流。

环境：`server/.env` 中配置 `TMDB_ACCESS_TOKEN`（v4 Read Access Token）。

## 4. 数据映射与幂等

- 外部主键：`tmdb_id` = TMDB `movie.id`；
- 需存在唯一索引 `uk_movies_tmdb_id`（或等价唯一约束）；
- SQL：`INSERT ... ON DUPLICATE KEY UPDATE ...`；
- 海报存完整 URL：`https://image.tmdb.org/t/p/w500{poster_path}`。

## 5. 验收（MySQL）

```sql
USE movie_db;
SELECT COUNT(*) AS total FROM movies;
SELECT COUNT(*) AS with_tmdb FROM movies WHERE tmdb_id IS NOT NULL;

-- 幂等：重复执行脚本后不应重复 tmdb_id
SELECT tmdb_id, COUNT(*) c FROM movies WHERE tmdb_id IS NOT NULL
GROUP BY tmdb_id HAVING c > 1;
```

预期最后一查询 0 行。

## 6. 故障排查

| 现象 | 可能原因 |
| --- | --- |
| `fetch failed` | DNS/代理/防火墙，非 token 过期 |
| `401` | Token 无效或过期 |
| 插入失败 | 缺 `tmdb_id` 列或唯一索引未建 |

## 7. 实现位置

- 脚本：[`server/scripts/syncTmdbMovies.js`](../../server/scripts/syncTmdbMovies.js)
- npm script：[`server/package.json`](../../server/package.json) 中 `sync:tmdb`
- 说明：根 [README.md](../../README.md) TMDB 章节
