import preview from "#storybook/preview";
import { expect, waitFor, within } from "storybook/test";
import { Button } from "./button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog.tsx";
import { Input } from "./input.tsx";
import { FormField } from "../patterns/FormField.tsx";

/**
 * モーダル。角丸を持たず、浮く面なので影を付ける。下の帯で閉じる操作を並べる。
 */
const meta = preview.meta({
  title: "Components/Dialog",
  component: Dialog,
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline">品目を編集</Button>} />
      <DialogContent className="gap-4">
        <DialogHeader>
          <DialogTitle>品目を編集</DialogTitle>
        </DialogHeader>
        <FormField label="品目名" htmlFor="dialog-story-name">
          <Input id="dialog-story-name" defaultValue="牛乳 1L パック" />
        </FormField>
        <DialogFooter>
          <DialogClose render={<Button />}>完了</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
});

export default meta;

export const Default = meta.story({
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "品目を編集" }));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog");
    await expect(within(dialog).getByRole("textbox", { name: "品目名" })).toHaveValue(
      "牛乳 1L パック",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "完了" }));
    // 閉じるときのアニメーションが終わるまで要素が残る
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
  },
});
