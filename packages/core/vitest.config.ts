import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      // The state machine is the trust boundary for the whole product.
      thresholds: {
        'src/booking/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});
