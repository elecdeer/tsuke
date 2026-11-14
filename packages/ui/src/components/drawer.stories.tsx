import preview from "#storybook/preview";
import { expect, waitFor, within } from "storybook/test";
import { Button } from "./button.tsx";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "./drawer.tsx";
import { Input } from "./input.tsx";
import { FormField } from "../patterns/FormField.tsx";

/**
 * 画面の下から出るシート。狭い画面で、一覧を離れずに 1 件を編集するときに使う。下へスワイプして閉じられる。
 */
const meta = preview.meta({
  title: "Components/Drawer",
  component: Drawer,
  render: () => (
    <Drawer>
      <DrawerTrigger render={<Button variant="outline">取引を開く</Button>} />
      <DrawerContent>
        <DrawerTitle>支出</DrawerTitle>
        <FormField label="品目名" htmlFor="drawer-story-name">
          <Input id="drawer-story-name" defaultValue="牛乳 1L パック" />
        </FormField>
        <DrawerClose render={<Button />}>閉じる</DrawerClose>
      </DrawerContent>
    </Drawer>
  ),
});

export default meta;

export const Default = meta.story({
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "取引を開く" }));
    const body = within(canvasElement.ownerDocument.body);
    const drawer = await body.findByRole("dialog", { name: "支出" });
    await expect(within(drawer).getByRole("textbox", { name: "品目名" })).toHaveValue(
      "牛乳 1L パック",
    );
    await userEvent.click(within(drawer).getByRole("button", { name: "閉じる" }));
    // 閉じるときのアニメーションが終わるまで要素が残る
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
  },
});
