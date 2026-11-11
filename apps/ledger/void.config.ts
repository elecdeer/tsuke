import { defineConfig } from "void/config";

export default defineConfig({
  head: {
    title: "台帳",
    titleTemplate: "%s | 台帳",
    htmlAttrs: { lang: "ja" },
    meta: [
      { charset: "utf-8" },
      // viewport-fit=cover で画面の端まで描き、下のナビを env(safe-area-inset-bottom) でホームバーから避ける。
      // 入力欄の文字は 14px にしていて、iOS の Safari は 16px より小さい欄に触れると画面を拡大してしまうので、
      // maximum-scale=1 で止める（iOS はこの指定があっても指での拡大はできる）
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
      },
      { name: "theme-color", content: "#ffffff" },
      { name: "apple-mobile-web-app-title", content: "台帳" },
    ],
    // スマートフォンのホーム画面から開けるようにする（PWA）。Service Worker はオフラインで使わないので置かない。
    // manifest も Access の後ろにあるので、use-credentials で Cookie を送らせる（付けないと Access のログイン画面が返る）
    link: [
      { rel: "manifest", href: "/manifest.webmanifest", crossorigin: "use-credentials" },
      { rel: "icon", href: "/icons/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  },
  worker: {
    compatibility_date: "2026-04-13",
    compatibility_flags: ["nodejs_compat"],
  },
  cloudflare: {
    name: "tsuke",
    // Void は Worker の公開設定がダッシュボード側の状態とずれているとデプロイを止めるので、今の値を明示する
    workers_dev: true,
    preview_urls: true,
    routes: [],
    observability: {
      logs: { enabled: true, invocation_logs: true },
    },
  },
});
