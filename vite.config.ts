import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      "**/.wrangler/**",
      "**/.output/**",
      "**/.wxt/**",
      "**/mockServiceWorker.js",
      // void db generate が出力する Drizzle のスナップショット
      "apps/ledger/db/migrations/meta/**",
    ],
  },
  lint: {
    plugins: ["typescript"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    ignorePatterns: ["**/.output/**", "**/.wxt/**", "**/mockServiceWorker.js"],
    options: { typeAware: true, typeCheck: true },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "typescript/no-non-null-assertion": "error",
      "func-style": ["error", "expression"],
    },
    overrides: [
      {
        files: ["apps/extension/**"],
        plugins: ["react", "react-perf", "jsx-a11y", "vitest"],
      },
      {
        // test.extend で作ったカスタム test を oxlint が認識しないため誤検知を抑制する
        files: ["apps/extension/**/*.test.browser.{ts,tsx}"],
        plugins: ["react", "react-perf", "jsx-a11y", "vitest"],
        rules: {
          "vitest/no-standalone-expect": "off",
        },
      },
      {
        files: ["apps/ledger/{pages,src}/**/*.tsx"],
        plugins: ["react", "react-perf", "jsx-a11y"],
      },
      {
        files: ["packages/ui/**/*.{ts,tsx}"],
        plugins: ["react", "react-perf", "jsx-a11y", "vitest"],
      },
      {
        // shadcn/ui が自動生成するコンポーネントは関数宣言スタイルなのでルールを緩める
        files: ["packages/ui/src/components/**/*.{ts,tsx}"],
        plugins: ["react", "react-perf", "jsx-a11y", "vitest"],
        rules: {
          "func-style": "off",
          "jsx-a11y/label-has-associated-control": "off",
        },
      },
    ],
  },
  run: {
    cache: true,
  },
});
