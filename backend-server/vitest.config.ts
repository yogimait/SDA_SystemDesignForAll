import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    testTimeout: 20_000,
    // PGlite boots a WASM Postgres per worker; under a full parallel run the
    // beforeAll hook can exceed 20s on slower machines.
    hookTimeout: 60_000,
  },
});
