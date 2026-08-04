-- AI 推荐会话 + 评论回复（已有库增量执行）
-- mysql -u root -p movie_db < server/sql/ai_chat_and_replies.sql

USE movie_db;

CREATE TABLE IF NOT EXISTS ai_recommend_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(15) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '新会话',
  summary TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ai_sessions_user (username, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_recommend_messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content TEXT NOT NULL,
  movies_json JSON DEFAULT NULL,
  meta_json JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_msg_session FOREIGN KEY (session_id) REFERENCES ai_recommend_sessions(id) ON DELETE CASCADE,
  KEY idx_ai_msg_session (session_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS review_replies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  review_id INT UNSIGNED NOT NULL,
  username VARCHAR(15) NOT NULL,
  content TEXT NOT NULL,
  date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reply_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  KEY idx_reply_review (review_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
