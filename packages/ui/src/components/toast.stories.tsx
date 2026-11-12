import preview from "#storybook/preview";
import { expect, within } from "storybook/test";
import { Button } from "./button.tsx";
import { Toaster, ToastProvider, useToastManager } from "./toast.tsx";

/**
 * 登録などが済んだことの知らせ。画面の下に短く出す。
 */
const meta = preview.meta({
  title: "Components/Toast",
  component: Toaster,
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
        <Toaster />
      </ToastProvider>
    ),
  ],
});

export default meta;

const AddToastButton = () => {
  const toastManager = useToastManager();
  return (
    <Button variant="outline" onClick={() => toastManager.add({ description: "登録しました" })}>
      知らせを出す
    </Button>
  );
};

export const Default = meta.story({
  render: () => <AddToastButton />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "知らせを出す" }));
    const body = within(canvasElement.ownerDocument.body);
    const toast = await body.findByRole("status");
    await expect(toast).toHaveTextContent("登録しました");
    // ビューポートが内容に合わせて縮むと、absolute 配置のトーストが幅 0 に潰れて文言が読めなくなる
    await expect(toast.getBoundingClientRect().width).toBeGreaterThan(200);
  },
});
