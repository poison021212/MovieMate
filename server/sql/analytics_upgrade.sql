-- MovieMate 分析与趋势字段升级
-- 用法: mysql -u root -p movie_db < server/sql/analytics_upgrade.sql

USE movie_db;

-- TMDB 趋势字段（与 syncTmdbMovies.js 对齐；列已存在时会报错，可忽略）
ALTER TABLE movies ADD COLUMN tmdb_id INT UNSIGNED NULL;
ALTER TABLE movies ADD COLUMN original_title VARCHAR(255) NULL;
ALTER TABLE movies ADD COLUMN original_language VARCHAR(16) NULL;
ALTER TABLE movies ADD COLUMN release_date DATE NULL;
ALTER TABLE movies ADD COLUMN popularity DECIMAL(12,4) NULL;
ALTER TABLE movies ADD COLUMN vote_count INT UNSIGNED NULL;
ALTER TABLE movies ADD COLUMN backdrop_path VARCHAR(512) NULL;
ALTER TABLE movies ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX idx_movies_tmdb_id ON movies (tmdb_id);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  genre VARCHAR(64) NULL,
  avg_popularity DECIMAL(12,4) NULL,
  avg_rating DECIMAL(4,2) NULL,
  movie_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_snapshot_date_genre (snapshot_date, genre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
