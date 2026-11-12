import { PlusIcon, RotateCwIcon } from "lucide-react";
import preview from "#storybook/preview";
import { expect, fn } from "storybook/test";
import { Button } from "./button.tsx";

const meta = preview.meta({
  title: "Components/Button",
  component: Button,
  args: { children: "登録", onClick: fn() },
});

export default meta;

/** 主ボタン。ベタ塗りの赤は画面に 1 つだけ使う */
export const Primary = meta.story({
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "登録" }));
    await expect(args.onClick).toHaveBeenCalled();
  },
});

/** 主ボタン以外の操作（読み取り、閉じる、ログアウトなど） */
export const Outline = meta.story({
  args: {
    variant: "outline",
    children: (
      <>
        <RotateCwIcon />
        もう一度読み取る
      </>
    ),
  },
});

/** 行の中の小さな操作や、足す操作。背景を持たない */
export const Ghost = meta.story({
  args: {
    variant: "ghost",
    className: "text-muted-foreground",
    children: (
      <>
        <PlusIcon />
        品目を足す
      </>
    ),
  },
});

/** 押せないとき */
export const Disabled = meta.story({
  args: { disabled: true },
});

/** 大きさの違い */
export const Sizes = meta.story({
  render: () => (
    <div className="flex items-end gap-2">
      <Button size="sm" variant="outline">
        sm
      </Button>
      <Button variant="outline">default</Button>
      <Button size="lg">lg</Button>
    </div>
  ),
});
