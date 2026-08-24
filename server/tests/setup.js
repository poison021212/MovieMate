// 确保测试进程使用独立测试库：必须在任何 require('../db') 之前生效
process.env.DB_NAME = process.env.TEST_DB_NAME || 'movie_db_test'
process.env.NODE_ENV = 'test'