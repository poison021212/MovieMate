import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.js'],
    setupFiles: ['./tests/setup.js'],
    testTimeout: 15000,
    hookTimeout: 30000,
    // 集成测试全部指向独立测试库，避免污染开发库 movie_db
    env: { DB_NAME: 'movie_db_test', NODE_ENV: 'test' },
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})