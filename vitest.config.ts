import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/test.*.ts'],
    testTimeout: 40_000,
    coverage: {
      provider: 'v8'
    },
  },
});
