/**
 * Playwright e2e config (F6): drives the real UI against a live frontend dev
 * server (:3000) and the mock-provider backend (:3001). Existing servers are
 * reused (the local dev pair is kept running by the agent workflow).
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: "npm run start:dev",
      url: "http://localhost:3001/api/health",
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: "../backend-server",
      env: { MOCK_PROVIDER: "1", PORT: "3001", THROTTLE_LIMIT: "1000" },
    },
  ],
});
