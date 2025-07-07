import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    include: ['test/test.*.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8'
    },
  },
});
