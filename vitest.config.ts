import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // this is all for github actions being weird
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },

    // normal setup
    setupFiles: ['./test/setup.ts'],
    include: ['test/test.*.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8'
    },
  },
});
