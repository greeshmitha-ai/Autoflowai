import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@platform/db': resolve(__dirname, '../../packages/db/src/index.ts'),
      '@platform/events': resolve(__dirname, '../../packages/events/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
