import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";
import { defineProject } from "vite-plus";

// ストーリーをそのままテストとして動かし、描画できることと play の操作を確かめる
export default defineProject({
  plugins: [
    react(),
    tailwindcss(),
    storybookTest({ configDir: fileURLToPath(new URL("./.storybook", import.meta.url)) }),
  ],
  test: {
    name: "ui/storybook",
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
