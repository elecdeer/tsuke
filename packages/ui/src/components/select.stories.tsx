import preview from "#storybook/preview";
import { expect, within } from "storybook/test";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.tsx";

const ACCOUNTS = { "": "なし", "1": "財布", "2": "クレジットカード" };

/**
 * 選択欄。入力欄と同じく下線だけを引く。
 */
const meta = preview.meta({
  title: "Components/Select",
  component: Select,
  render: () => (
    <div className="max-w-xs">
      <Select items={ACCOUNTS} defaultValue="">
        <SelectTrigger aria-label="支払元" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ACCOUNTS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
});

export default meta;

export const Default = meta.story({
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "支払元" }));
    const body = canvasElement.ownerDocument.body;
    const option = await within(body).findByRole("option", { name: "財布" });
    await userEvent.click(option);
    await expect(canvas.getByRole("combobox", { name: "支払元" })).toHaveTextContent("財布");
  },
});
