import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Local config: the monorepo root config only includes apps/** and packages/**.
// Run with `npx vitest run --config actors/vibe-profiler/vitest.config.ts` (or `pnpm test` in this package).
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['src/**/*.test.ts'],
  },
});
