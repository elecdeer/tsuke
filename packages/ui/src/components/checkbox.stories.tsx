import preview from "#storybook/preview";
import { expect } from "storybook/test";
import { Checkbox } from "./checkbox.tsx";

/**
 * チェックボックス。印の色は文字の色にそろえる。
 */
const meta = preview.meta({
  title: "Components/Checkbox",
  component: Checkbox,
  args: { "aria-label": "登録する" },
});

export default meta;

export const Default = meta.story({
  play: async ({ canvas, userEvent }) => {
    const checkbox = canvas.getByRole("checkbox", { name: "登録する" });
    await expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
  },
});

/** ラベルで包むと、文言を押しても切り替わる */
export const WithLabel = meta.story({
  args: { "aria-label": undefined },
  render: (args) => (
    <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.875rem" }}>
      <Checkbox {...args} />
      まだ入金がある
    </label>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("まだ入金がある"));
    await expect(canvas.getByRole("checkbox", { name: "まだ入金がある" })).toBeChecked();
  },
});

/** 小さな文字の行に並べる小さい印 */
export const Small = meta.story({
  args: { size: "sm", defaultChecked: true },
  play: async ({ canvas }) => {
    const checkbox = canvas.getByRole("checkbox", { name: "登録する" });
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toHaveAttribute("data-size", "sm");
  },
});

export const Disabled = meta.story({
  args: { disabled: true, defaultChecked: true },
  play: async ({ canvas, userEvent }) => {
    const checkbox = canvas.getByRole("checkbox", { name: "登録する" });
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeDisabled();
  },
});
