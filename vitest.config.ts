import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    env: {
      RELAY_CONN_PER_IP_LIMIT: '2000',
      REST_SESSION_CREATE_LIMIT: '100000',
      REST_GENERAL_LIMIT: '100000',
    },
    coverage: {
      provider: 'v8',
      // json-summary produces coverage/coverage-summary.json, which the
      // CI pipeline reads to enforce per-metric thresholds.
      reporter: ['text', 'json', 'json-summary', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
