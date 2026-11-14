import { fileURLToPath } from "node:url";
import { voidReact } from "@void/react/plugin";
import { voidPlugin } from "void";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    // LEDGER_PERSIST_TO を指定すると、ローカルの D1 などをその場所に置く。
    // 本物の記録を取り込んだローカルの DB を使わずに、架空のデータ（scripts/sample-data.sql）で画面を確かめるため
    voidPlugin({ persistTo: process.env.LEDGER_PERSIST_TO }),
    voidReact(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Vite の開発サーバーは既定でプリフライト（OPTIONS）を自前で返してしまい、
  // middleware/01.cors.ts まで届かないため無効にする
  server: { cors: false },
});
