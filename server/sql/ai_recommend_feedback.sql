-- AI 推荐反馈（赞/踩/换一批）
-- 用法: mysql -u root -p movie_db < server/sql/ai_recommend_feedback.sql

USE movie_db;

CREATE TABLE IF NOT EXISTS ai_recommend_feedback (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(15) NOT NULL,
  session_id INT UNSIGNED NULL,
  movie_title VARCHAR(255) NOT NULL,
  local_movie_id INT UNSIGNED NULL,
  tmdb_id INT UNSIGNED NULL,
  action ENUM('like', 'dislike', 'refresh_batch') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_feedback_user_time (username, created_at),
  KEY idx_feedback_session (session_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
