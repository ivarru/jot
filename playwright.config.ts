import { defineConfig } from "@playwright/test";

const chromePath = process.env.CHROME_PATH;
const baseURL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173/";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  webServer: process.env.SMOKE_BASE_URL === undefined
    ? {
      command: "npm run preview:test:fake",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe"
    }
    : undefined,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    ...(chromePath === undefined
      ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome" }
      : { launchOptions: { executablePath: chromePath } })
  }
});
