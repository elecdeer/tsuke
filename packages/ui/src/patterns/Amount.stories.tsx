import preview from "#storybook/preview";
import { expect } from "storybook/test";
import { AmountInput as AmountInputField } from "./AmountInput.tsx";
import { TotalAmount } from "./TotalAmount.tsx";

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
  render: (args) => (
    <div style={{ maxWidth: "20rem" }}>
      <TotalAmount {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1,650")).toBeVisible();
  },
});

/** 合計の名前を変える（件数を添えるなど） */
export const TotalWithLabel = meta.story({
  args: { amount: 12800, label: "合計（3件）" },
  render: (args) => (
    <div style={{ maxWidth: "20rem" }}>
      <TotalAmount {...args} />
    </div>
  ),
});

/** 読み取った合計と合わないときは、その金額を添えて知らせる */
export const TotalMismatch = meta.story({
  args: { amount: 1650, expected: 1782 },
  render: (args) => (
    <div style={{ maxWidth: "20rem" }}>
      <TotalAmount {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "読み取った合計 1,782円と合いません",
    );
  },
});

/** 読み取った合計と合っていれば何も添えない */
export const TotalMatched = meta.story({
  args: { amount: 1650, expected: 1650 },
  render: (args) => (
    <div style={{ maxWidth: "20rem" }}>
      <TotalAmount {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("status")).toBeNull();
  },
});

/** 金額の入力欄。数字は右揃えにし、「円」を欄の右端に添える */
export const AmountInput = meta.story({
  render: () => (
    <div style={{ width: "7rem" }}>
      <AmountInputField aria-label="金額" inputMode="numeric" defaultValue="1000" />
    </div>
  ),
});
