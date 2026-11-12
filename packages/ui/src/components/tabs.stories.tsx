import preview from "#storybook/preview";
import { expect } from "storybook/test";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.tsx";

/**
 * 画面の切り替え。箱や背景で囲まず、今いるタブだけに赤の下線を引く。
 */
const meta = preview.meta({
  title: "Components/Tabs",
  component: Tabs,
  render: () => (
    <Tabs defaultValue="payment">
      <div className="border-b">
        <TabsList aria-label="画面">
          <TabsTrigger value="payment">支払い</TabsTrigger>
          <TabsTrigger value="statement">明細から一括</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="payment" className="pt-4">
        支払いを 1 件ずつ登録する
      </TabsContent>
      <TabsContent value="statement" className="pt-4">
        明細からまとめて登録する
      </TabsContent>
    </Tabs>
  ),
});

export default meta;

export const Default = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "明細から一括" }));
    await expect(canvas.getByText("明細からまとめて登録する")).toBeVisible();
  },
});
