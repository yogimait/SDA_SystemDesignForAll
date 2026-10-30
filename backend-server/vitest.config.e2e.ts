import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Each e2e worker boots a WASM Postgres (plus extra apps in some files);
    // running files in parallel exhausts memory on typical dev machines.
    fileParallelism: false,
  },
});
