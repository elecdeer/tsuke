// JS/TS の lint は oxlint（vite.config.ts の lint）が担うので、ESLint は CSS だけを対象にする
import css from "@eslint/css";
import cssCev from "eslint-plugin-css-cev";
import cssPropertiesOrder from "eslint-plugin-css-properties-order";
import { defineConfig, globalIgnores } from "eslint/config";
import { tailwind4 } from "tailwind-csstree";

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
    // @theme・@apply・@custom-variant など Tailwind v4 の構文を解釈させる
    languageOptions: { customSyntax: tailwind4 },
    extends: [css.configs.recommended],
    rules: {
      // 色などのトークンは @tsuke/ui/theme.css で定義し、各アプリの CSS は @import で読むだけなので、ファイル単位では変数を解決できない
      "css/no-invalid-properties": ["error", { allowUnknownVariables: true }],
      "css/use-baseline": [
        "error",
        {
          // 月送りの View Transitions は、未対応のブラウザでは画面がそのまま切り替わるだけの上乗せの演出として使っている
          allowProperties: ["view-transition-name"],
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
