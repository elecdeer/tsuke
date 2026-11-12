import preview from "#storybook/preview";
import { expect } from "storybook/test";
import { ErrorMessage } from "./ErrorMessage.tsx";

/**
 * 入力の誤りや保存の失敗の知らせ。赤は主ボタンと同じ色なので、色だけに頼らずアイコンを添える。
 */
const meta = preview.meta({
  title: "Patterns/ErrorMessage",
  component: ErrorMessage,
  args: { message: "登録に失敗しました（502）" },
});

export default meta;

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("登録に失敗しました（502）");
  },
});
