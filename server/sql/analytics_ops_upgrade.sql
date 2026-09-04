-- 分析快照 / Hybrid 持久化 / 运营角色 / 审计
-- 用法: mysql -u root -p movie_db < server/sql/analytics_ops_upgrade.sql

USE movie_db;

CREATE TABLE IF NOT EXISTS hybrid_search_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  had_keyword TINYINT(1) NOT NULL DEFAULT 1,
  fallback_triggered TINYINT(1) NOT NULL DEFAULT 0,
  fallback_error TINYINT(1) NOT NULL DEFAULT 0,
  source VARCHAR(16) NOT NULL DEFAULT 'local',
  tmdb_fetched INT UNSIGNED NOT NULL DEFAULT 0,
  tmdb_persisted INT UNSIGNED NOT NULL DEFAULT 0,
  local_count_before INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_hybrid_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_username VARCHAR(15) NOT NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NULL,
  target_id VARCHAR(64) NULL,
  detail JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_admin (admin_username, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 可选：将首个用户设为 admin（按需手动执行）
-- UPDATE users SET role = 'admin' WHERE id = 1 LIMIT 1;
