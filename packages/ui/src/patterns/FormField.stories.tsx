import preview from "#storybook/preview";
import { expect } from "storybook/test";
import { Input } from "../components/input.tsx";
import { visuallyHiddenClassName } from "../lib/a11y.ts";
import { FormField } from "./FormField.tsx";

const meta = preview.meta({
  title: "Patterns/FormField",
  component: FormField,
  args: { label: "店舗", htmlFor: "form-field-story", children: null },
  render: (args) => (
    <div style={{ maxWidth: "20rem" }}>
      <FormField {...args}>
        <Input id="form-field-story" placeholder="なし" />
      </FormField>
    </div>
  ),
});

export default meta;

/** ラベルを欄の上に小さく薄く出す */
export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "店舗" })).toBeVisible();
  },
});

/** 行の中に並べるときは、ラベルを見た目から隠して読み上げ用にだけ残す */
export const HiddenLabel = meta.story({
  args: { hideLabel: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "店舗" })).toBeVisible();
    await expect(canvas.getByText("店舗")).toHaveClass(visuallyHiddenClassName);
  },
});

/** 欄を並べるときは、上に黒の線を引いて、まとまりの始まりを示す */
export const Group = meta.story({
  render: () => (
    <div
      style={{
        display: "grid",
        maxWidth: "20rem",
        rowGap: "1rem",
        paddingTop: "0.75rem",
        borderTop: "1px solid var(--foreground)",
      }}
    >
      <FormField label="日付" htmlFor="form-field-date">
        <Input id="form-field-date" defaultValue="2026-11-12" />
      </FormField>
      <FormField label="口座" htmlFor="form-field-account">
        <Input id="form-field-account" placeholder="なし" />
      </FormField>
      <FormField label="店舗" htmlFor="form-field-place">
        <Input id="form-field-place" placeholder="なし" />
      </FormField>
    </div>
  ),
});
