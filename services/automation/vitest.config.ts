import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@platform/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
      '@platform/events': path.resolve(__dirname, '../../packages/events/src/index.ts'),
      '@platform/cache': path.resolve(__dirname, '../../packages/cache/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
