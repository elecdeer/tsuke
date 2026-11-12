import { describe, expect } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import { test } from "../../test-utils/browser-test.ts";
import { setupBrowserMock } from "../../test-utils/browser-mock.ts";
import {
  masterHandlers,
  meHandler,
  MOCK_SERVER_URL,
  unauthenticatedHandler,
} from "../../test-utils/ledgerMocks.ts";
import App from "./App.tsx";

describe("App: 設定オーバーレイの自動オープン", () => {
  test("ログイン済みのとき設定ダイアログは開かない", async ({ worker }) => {
    await setupBrowserMock({ serverUrl: MOCK_SERVER_URL });
    worker.use(...masterHandlers, meHandler);

    await render(<App />);

    await expect.element(page.getByRole("heading", { name: "tsuke" })).toBeVisible();
    await expect.element(page.getByRole("dialog", { name: "設定" })).not.toBeInTheDocument();
  });

  test("未認証のとき設定ダイアログが自動で開く", async ({ worker }) => {
    await setupBrowserMock({ serverUrl: MOCK_SERVER_URL });
    worker.use(...masterHandlers, unauthenticatedHandler);

    await render(<App />);

    await expect.element(page.getByRole("dialog", { name: "設定" })).toBeVisible();
  });
});
