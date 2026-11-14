import { useState } from "react";
import preview from "#storybook/preview";
import { expect, waitFor, within } from "storybook/test";
import { DateInput } from "./DateInput.tsx";
import { FormField } from "./FormField.tsx";

/**
 * 日付の欄。値を持つ側として、FormField で囲んだ状態で出す。
 */
const ControlledDateInput = ({ initial, max }: { initial: string; max?: string }) => {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ maxWidth: "20rem" }}>
      <FormField label="日付" htmlFor="date-input-story">
        <DateInput id="date-input-story" value={value} onChange={setValue} max={max} />
      </FormField>
    </div>
  );
};

const meta = preview.meta({
  title: "Patterns/DateInput",
  component: DateInput,
});

export default meta;

/** YYYY-MM-DD を文字で打てる */
export const Typing = meta.story({
  render: () => <ControlledDateInput initial="2026-11-12" />,
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "日付" });
    await userEvent.clear(input);
    await userEvent.type(input, "2026-10-01");
    await expect(input).toHaveValue("2026-10-01");
  },
});

/** 欄の右のボタンからカレンダーを開き、選んだ日を欄に入れて閉じる */
export const PickFromCalendar = meta.story({
  render: () => <ControlledDateInput initial="2026-11-12" />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "カレンダーを開く" }));
    const body = within(canvasElement.ownerDocument.body);
    const grid = await body.findByRole("grid");
    await userEvent.click(within(grid).getByText("20", { exact: true }));
    await expect(canvas.getByRole("textbox", { name: "日付" })).toHaveValue("2026-11-20");
    await waitFor(() => expect(body.queryByRole("grid")).not.toBeInTheDocument());
  },
});

/** max より後の日はカレンダーで選べない */
export const WithMax = meta.story({
  render: () => <ControlledDateInput initial="2026-11-12" max="2026-11-14" />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "カレンダーを開く" }));
    const grid = await within(canvasElement.ownerDocument.body).findByRole("grid");
    await expect(within(grid).getByText("14", { exact: true })).toBeEnabled();
    await expect(within(grid).getByText("15", { exact: true })).toBeDisabled();
  },
});
