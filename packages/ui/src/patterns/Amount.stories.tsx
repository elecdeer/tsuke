import preview from "#storybook/preview";
import { expect } from "storybook/test";
import { Input } from "../components/input.tsx";
import { TotalAmount } from "./TotalAmount.tsx";
import { YenUnit } from "./YenUnit.tsx";

/**
 * 金額の見せ方。数字は等幅にし、単位の「円」は小さく細く数字の後ろに添える。
 */
const meta = preview.meta({
  title: "Patterns/Amount",
  component: TotalAmount,
  args: { amount: 1650 },
});

export default meta;

/** 合計。その画面で一番大事な数字なので大きく出す */
export const Total = meta.story({
  render: (args) => <TotalAmount {...args} className="max-w-xs" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1,650")).toBeVisible();
  },
});

/** 合計の名前を変える（件数を添えるなど） */
export const TotalWithLabel = meta.story({
  args: { amount: 12800, label: "合計（3件）" },
  render: (args) => <TotalAmount {...args} className="max-w-xs" />,
});

/** 金額の入力欄。数字は右揃えにし、「円」を欄の右端に添える */
export const AmountInput = meta.story({
  render: () => (
    <div className="relative w-28">
      <Input
        aria-label="金額"
        inputMode="numeric"
        className="pr-4 text-right tabular-nums"
        defaultValue="1000"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 py-1 text-sm"
      >
        <YenUnit />
      </span>
    </div>
  ),
});
