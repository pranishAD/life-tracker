import { defineConfig, devices } from "@playwright/test";

// Run against the docker compose stack (frontend :5173, backend :8000).
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "./test-results",
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
