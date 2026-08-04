-- MovieMate 演示数据（可重复执行）
-- 用法：mysql -u root -p movie_db < server/sql/demo_seed.sql

USE movie_db;

INSERT INTO users (username, email, password, created_at)
VALUES (
  'demo_user',
  'demo_user@moviemate.local',
  '$2b$10$Gx4qovKYVfTmJmdzDbt2GuEY9PHbGwDrD6nKjyP95ywYNJ/vzVas.',
  NOW()
)
ON DUPLICATE KEY UPDATE
  email = VALUES(email),
  password = VALUES(password);

INSERT INTO favorites (username, movieId)
SELECT 'demo_user', m.id
FROM (SELECT id FROM movies ORDER BY rating DESC, id ASC LIMIT 12) AS m
LEFT JOIN favorites f ON f.username = 'demo_user' AND f.movieId = m.id
WHERE f.id IS NULL;

INSERT INTO reviews (movieId, username, rating, content, date)
SELECT
  m.id,
  'demo_user',
  CASE WHEN MOD(m.id, 3) = 0 THEN 9.0 WHEN MOD(m.id, 2) = 0 THEN 8.5 ELSE 8.0 END,
  CASE
    WHEN MOD(m.id, 2) = 0 THEN '节奏紧凑，适合二刷；已加入个人片单。'
    ELSE '角色动机清晰，作为观后笔记记录：整体完成度很高。'
  END,
  NOW()
FROM (SELECT id FROM movies ORDER BY rating DESC, id ASC LIMIT 12) AS m
WHERE NOT EXISTS (
  SELECT 1 FROM reviews r WHERE r.username = 'demo_user' AND r.movieId = m.id
);
