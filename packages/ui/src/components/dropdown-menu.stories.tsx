import { ArrowDown, ArrowUp, Ellipsis, Trash2 } from "lucide-react";
import preview from "#storybook/preview";
import { expect, waitFor, within } from "storybook/test";
import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";

/**
 * 毎回は使わない操作（並べ替え・削除など）をまとめるメニュー。行ごとにボタンを並べずに済む。
 */
const meta = preview.meta({
  title: "Components/DropdownMenu",
  component: DropdownMenu,
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="品目の操作" />}
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto">
        <DropdownMenuItem disabled>
          <ArrowUp />
          上へ
        </DropdownMenuItem>
        <DropdownMenuItem>
          <ArrowDown />
          下へ
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Trash2 />
          品目を消す
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
});

export default meta;

export const Default = meta.story({
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "品目の操作" }));
    const body = within(canvasElement.ownerDocument.body);
    const item = await body.findByRole("menuitem", { name: "品目を消す" });
    // 開くときのアニメーション（フェードイン）が終わるまでは見えない扱いになる
    await waitFor(() => expect(item).toBeVisible());
  },
});
