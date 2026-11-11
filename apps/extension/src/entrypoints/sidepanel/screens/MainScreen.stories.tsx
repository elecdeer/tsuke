import type { LedgerOutput } from "ledger/client";
import { delay, http, HttpResponse } from "msw";
import { userEvent, within } from "storybook/test";
import preview from "#storybook/preview";
import { Toaster, ToastProvider } from "@/components/ui/toast";
import {
  accountsHandler,
  masterHandlers,
  MOCK_SERVER_URL,
  mockCategories,
  mockUrl,
  noDuplicatesHandler,
  placesHandler,
} from "../../../test-utils/ledgerMocks.ts";
import MainScreen from "./MainScreen.tsx";

const meta = preview.meta({
  title: "Sidebar/Screens/MainScreen",
  component: MainScreen,
  args: {
    serverUrl: MOCK_SERVER_URL,
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="flex min-h-screen flex-col gap-4 bg-gray-50 p-4">
          <h1 className="text-lg font-bold text-gray-900">Tsuke</h1>
          <Story />
          <Toaster />
        </div>
      </ToastProvider>
    ),
  ],
});

export default meta;

const mockExtracted: LedgerOutput<"/api/transactions/extract", "POST"> = {
  model: "test-model",
  date: "2026-06-13",
  accountId: 2,
  placeName: "スーパーA",
  items: [
    { name: "牛乳 1L パック", amount: 250, memo: null, genreId: 1001 },
    { name: "食パン 6枚切り 国産小麦", amount: 198, memo: "朝食用", genreId: 1001 },
    { name: "卵 10個入り 特売", amount: 298, memo: null, genreId: 1001 },
  ],
  confidence: "high",
  reasoning: "レシートの明細から読み取った",
};

const extractPaymentHandler = http.post(mockUrl("/api/transactions/extract"), () =>
  HttpResponse.json(mockExtracted),
);

/**
 * Storybook 上で collectFromActiveTab() が叩く chrome.* API を成功レスポンスでスタブする。
 * preview.ts で globalThis.chrome = fakeBrowser されているため、その上にメソッドを上書きする。
 */
const stubCollectFromActiveTab = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromeAny = globalThis.chrome as any;
  chromeAny.tabs.query = async () => [{ id: 1, url: "https://example.com" }];
  chromeAny.scripting = chromeAny.scripting ?? {};
  chromeAny.scripting.executeScript = async () => [];
  chromeAny.tabs.sendMessage = async () => ({
    ok: true,
    url: "https://example.com",
    title: "サンプル商品ページ",
    ariaSnapshot: "",
    collectedAt: new Date().toISOString(),
  });
};

export const Default = meta.story({
  name: "支払いフォーム",
  parameters: {
    msw: {
      handlers: masterHandlers,
    },
  },
});

export const AllFilled = meta.story({
  name: "全項目入力済み",
  parameters: {
    msw: {
      handlers: [...masterHandlers, extractPaymentHandler],
    },
  },
  decorators: [
    (Story) => {
      stubCollectFromActiveTab();
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", { name: "このページから自動入力" });
    await userEvent.click(button);
    await canvas.findByDisplayValue("250");
  },
});

export const CategoriesLoading = meta.story({
  name: "カテゴリ読み込み中",
  parameters: {
    msw: {
      handlers: [
        http.get(mockUrl("/api/categories"), async () => {
          await delay("infinite");
          return HttpResponse.json(mockCategories);
        }),
        accountsHandler,
        placesHandler,
        noDuplicatesHandler,
      ],
    },
  },
});

export const CategoriesError = meta.story({
  name: "カテゴリ取得エラー",
  parameters: {
    msw: {
      handlers: [
        http.get(mockUrl("/api/categories"), () => new HttpResponse(null, { status: 500 })),
        accountsHandler,
        placesHandler,
        noDuplicatesHandler,
      ],
    },
  },
});
