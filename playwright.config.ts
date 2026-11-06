import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  use: {
    baseURL: "http://127.0.0.1:1421",
    viewport: { width: 1600, height: 1000 },
    channel: "msedge",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://127.0.0.1:1421",
    reuseExistingServer: false,
    timeout: 120000,
  },
  reporter: "list",
});
