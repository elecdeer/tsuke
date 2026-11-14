import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  browser: "chrome",
  imports: false,
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Tsuke",
    description: "Zaimへの支出を素早く記録するChrome拡張機能",
    permissions: ["storage", "sidePanel", "tabs", "identity", "scripting"],
    host_permissions: ["<all_urls>"],
    action: {},
    side_panel: {
      default_path: "sidepanel/index.html",
    },
  },
  vite: () => ({
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  }),
  webExt: {
    chromiumArgs: ["--user-data-dir=./.wxt/chrome-data"],
  },
});
