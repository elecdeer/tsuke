import preview from "#storybook/preview";
import { NativeSelect, NativeSelectOption } from "./native-select.tsx";

/**
 * ブラウザの選択欄。行の数が多い表の中など、軽く済ませたい所で使う。
 */
const meta = preview.meta({
  title: "Components/NativeSelect",
  component: NativeSelect,
  render: () => (
    <NativeSelect size="sm" aria-label="種類" defaultValue="payment">
      <NativeSelectOption value="payment">支出</NativeSelectOption>
      <NativeSelectOption value="income">収入</NativeSelectOption>
      <NativeSelectOption value="transfer">振替</NativeSelectOption>
    </NativeSelect>
  ),
});

export default meta;

export const Default = meta.story({});
