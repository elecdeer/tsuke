import { userEvent, within } from "storybook/test";
import preview from "#storybook/preview";
import { Toaster, ToastProvider } from "@tsuke/ui/components/toast";
import { MOCK_SERVER_URL, statementHandlers } from "../../../test-utils/ledgerMocks.ts";
import StatementScreen from "./StatementScreen.tsx";

/**
 * collectFromActiveTab() が叩く chrome.* API を成功レスポンスでスタブする。
 * preview.ts で globalThis.chrome = fakeBrowser されているため、その上にメソッドを上書きする。
 */
const stubCollectFromActiveTab = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromeAny = globalThis.chrome as any;
  chromeAny.tabs.query = async () => [{ id: 1, url: "https://example.com/statement" }];
  chromeAny.scripting = chromeAny.scripting ?? {};
  chromeAny.scripting.executeScript = async () => [];
  chromeAny.tabs.sendMessage = async () => ({
    ok: true,
    url: "https://example.com/statement",
    title: "ご利用明細",
    ariaSnapshot: "",
    collectedAt: new Date().toISOString(),
  });
};

const meta = preview.meta({
  title: "Sidebar/Screens/StatementScreen",
  component: StatementScreen,
  args: {
    serverUrl: MOCK_SERVER_URL,
  },
  decorators: [
    (Story) => {
      stubCollectFromActiveTab();
      return (
        <ToastProvider>
          {/* サイドパネルの本文（App の main）と同じ余白で置く */}
          <div className="min-h-screen bg-background px-4 pt-6">
            <Story />
            <Toaster />
          </div>
        </ToastProvider>
      );
    },
  ],
});

export default meta;

export const Default = meta.story({
  name: "読み取り前",
  parameters: { msw: { handlers: statementHandlers } },
});

export const Extracted = meta.story({
  name: "読み取り後（登録済みあり）",
  parameters: { msw: { handlers: statementHandlers } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", { name: "このページの明細を読み取る" });
    await userEvent.click(button);
    await canvas.findByText("JR東日本");
  },
});
