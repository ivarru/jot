import { defineConfig } from "@playwright/test";

const chromePath = process.env.CHROME_PATH;

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173/",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    ...(chromePath === undefined
      ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome" }
      : { launchOptions: { executablePath: chromePath } })
  }
});
