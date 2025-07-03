import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/test.*.ts'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8'
    },
    pool: 'forks', // or 'threads'
    poolOptions: {
      forks: {
        singleFork: true
      },
      threads: {
        singleThread: true
      }
    }
  } 
});
