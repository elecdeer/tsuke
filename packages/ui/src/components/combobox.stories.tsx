import { PlusIcon } from "lucide-react";
import { useState } from "react";
import preview from "#storybook/preview";
import { expect, waitFor, within } from "storybook/test";
import { Input } from "./input.tsx";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxField,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "./combobox.tsx";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { SelectTriggerText, selectTriggerStyleProps } from "./select.tsx";

const meta = preview.meta({
  title: "Components/Combobox",
  component: Combobox,
});

export default meta;

const CATEGORIES = ["食費 / 食料品", "食費 / 外食", "交通費 / 電車・バス", "日用品 / 消耗品"];

/**
 * 候補が多い選択欄。押すと候補を開き、上の検索欄で絞り込む。欄の見た目は選択欄（Select）と同じ。
 */
export const WithSearch = meta.story({
  render: () => (
    <div style={{ maxWidth: "20rem" }}>
      <Combobox items={CATEGORIES}>
        <ComboboxTrigger
          render={
            <button
              type="button"
              aria-label="カテゴリ"
              {...selectTriggerStyleProps({ width: "full" })}
            />
          }
        >
          <ComboboxValue>
            {(value: string | null) => (
              <SelectTriggerText placeholder={value === null}>
                {value ?? "カテゴリを選択"}
              </SelectTriggerText>
            )}
          </ComboboxValue>
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="カテゴリを検索" />
          <ComboboxEmpty>カテゴリが見つかりません</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "カテゴリ" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(await body.findByPlaceholderText("カテゴリを検索"), "電車");
    await userEvent.click(await body.findByRole("option", { name: "交通費 / 電車・バス" }));
    await expect(canvas.getByRole("combobox", { name: "カテゴリ" })).toHaveTextContent(
      "交通費 / 電車・バス",
    );
  },
});

type StoreOption = { label: string; inset: boolean };

const STORE_GROUPS: { value: string; items: StoreOption[] }[] = [
  {
    value: "コンビニB",
    items: [
      { label: "コンビニB（全店）", inset: false },
      { label: "コンビニB 駅前店", inset: true },
      { label: "コンビニB 本町店", inset: true },
    ],
  },
  { value: "チェーンなし", items: [{ label: "カフェC", inset: false }] },
];

/**
 * 見出しでまとめた選択肢。まとまりの中の項目は inset で一段下げる。検索で項目がなくなったまとまりは見出しごと消える。
 */
export const Grouped = meta.story({
  render: () => (
    <div style={{ maxWidth: "20rem" }}>
      <Combobox
        items={STORE_GROUPS}
        itemToStringLabel={(option: StoreOption) => option.label}
        isItemEqualToValue={(a: StoreOption, b: StoreOption) => a.label === b.label}
      >
        <ComboboxTrigger
          render={
            <button
              type="button"
              aria-label="店舗"
              {...selectTriggerStyleProps({ width: "full" })}
            />
          }
        >
          <ComboboxValue>
            {(value: StoreOption | null) => (
              <SelectTriggerText placeholder={value === null}>
                {value?.label ?? "店舗を選択"}
              </SelectTriggerText>
            )}
          </ComboboxValue>
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="店舗を検索" />
          <ComboboxEmpty>店舗が見つかりません</ComboboxEmpty>
          <ComboboxList>
            {(group: (typeof STORE_GROUPS)[number]) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(option: StoreOption) => (
                    <ComboboxItem key={option.label} value={option} inset={option.inset}>
                      {option.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "店舗" }));
    const body = within(canvasElement.ownerDocument.body);
    const inset = await body.findByRole("option", { name: "コンビニB 駅前店" });
    await expect(inset).toHaveAttribute("data-inset");
    await expect(body.getByRole("option", { name: "コンビニB（全店）" })).not.toHaveAttribute(
      "data-inset",
    );

    await userEvent.type(body.getByPlaceholderText("店舗を検索"), "本町");
    await waitFor(() => expect(body.queryByText("チェーンなし")).not.toBeInTheDocument());
    await userEvent.click(body.getByRole("option", { name: "コンビニB 本町店" }));
    await expect(canvas.getByRole("combobox", { name: "店舗" })).toHaveTextContent(
      "コンビニB 本町店",
    );
  },
});

const PLACES = ["スーパーA", "コンビニB", "カフェC"];

/**
 * 打ち込んで選ぶ欄（店舗など）。欄そのものに打ち込み、候補は箱にせず欄の続きとして罫線で区切って並べる。
 * 一覧にない名前は追加の候補として出す。
 */
const InlineCandidates = () => {
  const [value, setValue] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const anchor = useComboboxAnchor();
  const { contains } = ComboboxPrimitive.useFilter();
  const trimmed = query.trim();
  const items = trimmed === "" || PLACES.includes(trimmed) ? PLACES : [...PLACES, `+${trimmed}`];

  return (
    <div style={{ maxWidth: "20rem" }}>
      <Combobox
        items={items}
        value={value}
        onValueChange={(next: string | null) => setValue(next?.replace(/^\+/, "") ?? null)}
        inputValue={query}
        onInputValueChange={setQuery}
        autoHighlight
        filter={(item: string, q: string) => item.startsWith("+") || contains(item, q)}
      >
        <ComboboxField ref={anchor}>
          <ComboboxPrimitive.Input aria-label="店舗" placeholder="なし" render={<Input />} />
        </ComboboxField>
        <ComboboxContent anchor={anchor} variant="inline">
          <ComboboxEmpty>過去の店舗はありません</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item.startsWith("+") ? (
                  <>
                    <PlusIcon aria-hidden="true" />「{item.slice(1)}」を追加
                  </>
                ) : (
                  item
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
};

export const InlineInput = meta.story({
  render: () => <InlineCandidates />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(canvas.getByRole("combobox", { name: "店舗" }), "はじめての店");
    const body = within(canvasElement.ownerDocument.body);
    const option = await body.findByRole("option", { name: "「はじめての店」を追加" });
    // 開くときのアニメーションが終わるまでは見えない扱いになる
    await waitFor(() => expect(option).toBeVisible());
  },
});
