import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Playwright specs live in e2e/ and run via `npm run test:e2e`.
    exclude: ["node_modules/**", "e2e/**"],
  },
});
