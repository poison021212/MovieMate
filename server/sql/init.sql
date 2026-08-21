-- MovieMate 数据库初始化
-- 用法（MySQL 命令行）:
--   mysql -u root -p < server/sql/init.sql
-- 或在 MySQL 客户端中: source D:/path/to/MovieMate-master/server/sql/init.sql

CREATE DATABASE IF NOT EXISTS movie_db
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE movie_db;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(15) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active', 'locked', 'banned') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS movies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  rating DECIMAL(3,1) DEFAULT 0,
  poster VARCHAR(1024) DEFAULT NULL COMMENT '海报 URL 或 /uploads/ 相对路径',
  director VARCHAR(255) DEFAULT NULL,
  actors TEXT DEFAULT NULL,
  genre VARCHAR(255) DEFAULT NULL,
  duration VARCHAR(64) DEFAULT NULL,
  year VARCHAR(16) DEFAULT NULL,
  summary TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reviews (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  movieId INT UNSIGNED NOT NULL,
  username VARCHAR(15) NOT NULL,
  rating DECIMAL(3,1) NOT NULL,
  content TEXT NOT NULL,
  date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reviews_movie FOREIGN KEY (movieId) REFERENCES movies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS favorites (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(15) NOT NULL,
  movieId INT UNSIGNED NOT NULL,
  UNIQUE KEY uk_user_movie (username, movieId),
  CONSTRAINT fk_favorites_movie FOREIGN KEY (movieId) REFERENCES movies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

-- 示例电影（可按需删除或替换 poster 为本地 /uploads/ 路径）
INSERT INTO movies (title, rating, poster, director, actors, genre, duration, year, summary) VALUES
('肖申克的救赎', 9.7, 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg', '弗兰克·德拉邦特', '蒂姆·罗宾斯, 摩根·弗里曼', '剧情', '142 分钟', '1994', '银行家安迪被冤入狱，在肖申克监狱中用希望与友谊改变命运。'),
('盗梦空间', 9.0, 'https://image.tmdb.org/t/p/w500/oYuLEt3zIm2PBL0XeBFM9Tg1Rwe.jpg', '克里斯托弗·诺兰', '莱昂纳多·迪卡普里奥', '科幻', '148 分钟', '2010', '盗梦团队潜入多层梦境，完成几乎不可能的任务。'),
('千与千寻', 9.4, 'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyWYHGkPjAny336.jpg', '宫崎骏', '柊瑠美, 入野自由', '动画', '125 分钟', '2001', '少女千寻误入神灵世界，在汤屋中寻找自我与勇气。');
