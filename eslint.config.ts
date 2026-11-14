// JS/TS の lint は oxlint（vite.config.ts の lint）が担うので、ESLint は CSS だけを対象にする
import css from "@eslint/css";
import cssCev from "eslint-plugin-css-cev";
import cssPropertiesOrder from "eslint-plugin-css-properties-order";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "**/.output/**",
    "**/.wxt/**",
    "**/dist/**",
    "**/storybook-static/**",
    // ESLint は既定で JS も拾うので、`eslint .` やエディタ連携でも CSS 以外を見ないよう外す
    "**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
  ]),
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: [css.configs.recommended],
    rules: {
      // 色などのトークンは @tsuke/ui/theme.css で定義し、各アプリの CSS は @import で読むだけなので、ファイル単位では変数を解決できない
      "css/no-invalid-properties": ["error", { allowUnknownVariables: true }],
      "css/use-baseline": [
        "error",
        {
          // 月送りの View Transitions は、未対応のブラウザでは画面がそのまま切り替わるだけの上乗せの演出として使っている
          // user-select・backdrop-filter は Safari の一部が接頭辞付き（-webkit-）しか読まないので、必ず両方を並べて書く。
          // field-sizing は入力に合わせて欄を伸ばすだけで、未対応のブラウザでは決まった高さのままになる。
          // overscroll-behavior(-x)・scrollbar-width・accent-color は、未対応のブラウザでは既定の見た目・動きになるだけ
          allowProperties: [
            "view-transition-name",
            "user-select",
            "backdrop-filter",
            "field-sizing",
            "overscroll-behavior",
            "overscroll-behavior-x",
            "scrollbar-width",
            "accent-color",
          ],
          allowSelectors: ["view-transition-group", "view-transition-old", "view-transition-new"],
        },
      ],
    },
  },
  {
    files: ["**/*.css"],
    extends: [cssPropertiesOrder.configs.recommended],
  },
  {
    // CEV は CSS Modules を前提にした命名規則なので、:root や .dark を置くグローバル CSS には当てない
    files: ["**/*.module.css"],
    extends: [cssCev.configs.recommended],
  },
]);
