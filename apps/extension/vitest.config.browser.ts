import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";
import { defineProject } from "vite-plus";

export default defineProject({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // MSWサービスワーカー（mockServiceWorker.js）を /mockServiceWorker.js として配信する
  publicDir: "./storybook-public",
  optimizeDeps: {
    include: ["react", "react-dom/client", "react/jsx-dev-runtime", "vitest-browser-react"],
  },
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    name: "extension/browser",
    include: ["src/**/*.test.browser.{ts,tsx}"],
    testTimeout: 30000,
    browser: {
      locators: {
        // Vitest v4 compatibility: keep partial, case-insensitive locator matching.
        // Remove after updating locators for full, case-sensitive matches.
        // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
        // https://vitest.dev/guide/migration/#locators-are-strict-by-default
        exact: false,
      },
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            // Dockerでのメモリ不足によるクラッシュを防ぐ
            "--disable-dev-shm-usage",
          ],
        },
      }),
      instances: [{ browser: "chromium" }],
      expect: {
        toMatchScreenshot: {
          comparatorName: "pixelmatch",
          comparatorOptions: {
            threshold: 0.3,
            allowedMismatchedPixelRatio: 0.05,
          },
          // カーソルとアニメーションを無効化してスクリーンショットを安定させる
          screenshotOptions: {
            animations: "disabled",
            caret: "hide",
          },
        },
      },
    },
    setupFiles: ["./vitest.setup.browser.ts"],
  },
});
