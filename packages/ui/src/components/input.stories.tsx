import preview from "#storybook/preview";
import { expect } from "storybook/test";
import { Input } from "./input.tsx";

/**
 * 入力欄。枠の代わりに下線だけを引き、入力中は下線を太くする。
 */
const meta = preview.meta({
  title: "Components/Input",
  component: Input,
  args: { "aria-label": "品目名", placeholder: "品目名" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "20rem" }}>
        <Story />
      </div>
    ),
  ],
});

export default meta;

export const Default = meta.story({
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "品目名" });
    await userEvent.type(input, "牛乳");
    await expect(input).toHaveValue("牛乳");
  },
});

/** 入力の誤り。下線を赤く太くする */
export const Invalid = meta.story({
  args: { "aria-invalid": true, defaultValue: "abc" },
});

export const Disabled = meta.story({
  args: { disabled: true, defaultValue: "変えられない値" },
});

/** 日付の欄。iOS の Safari でも左に揃うよう見た目を外している */
export const Date = meta.story({
  args: { "aria-label": "日付", type: "date", defaultValue: "2026-11-12" },
});
