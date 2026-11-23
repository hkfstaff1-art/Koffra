import { defineConfig } from 'vitest/config'

// Test de bout en bout contre une API réelle (voir e2e/live.e2e.ts et infra/scripts/e2e.sh).
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
