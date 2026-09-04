-- 运营角色扩展：user / moderator / operator / admin
-- 用法: mysql -u root -p movie_db < server/sql/rbac_upgrade.sql
-- 前置: 已执行 analytics_ops_upgrade.sql（users.role 列已存在）

USE movie_db;

ALTER TABLE users MODIFY COLUMN role
  ENUM('user', 'moderator', 'operator', 'admin') NOT NULL DEFAULT 'user';
