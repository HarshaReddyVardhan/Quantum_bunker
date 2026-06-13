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
      exclude: [
        // RTCPeerConnection / RTCDataChannel are browser-only APIs; this file
        // cannot execute in Node.js. The two pure utility functions it exports
        // (isOfferer, shouldUseP2P) are covered by webrtc-mesh.test.ts.
        'src/transport/webrtc-mesh.ts',
        // Entry-point wiring: Express + Vite middleware + WS scheduler.
        // Branches here are exercised by smoke and integration tests, not
        // by the unit-test runner that collects coverage.
        'server.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
