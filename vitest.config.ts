import { defineConfig } from 'vitest/config';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';

export default defineConfig({
  plugins: [spacetimedbModuleTestPlugin()],
  test: {
    include: ['apps/**/src/**/*.test.ts', 'packages/**/src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
