import { PlusIcon } from "lucide-react";
import { useState } from "react";
import preview from "#storybook/preview";
import { expect, waitFor, within } from "storybook/test";
import { Input } from "./input.tsx";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "./combobox.tsx";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { selectTriggerClassName } from "./select.tsx";
import { cn } from "@tsuke/ui/lib/utils";

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
    <div className="max-w-xs">
      <Combobox items={CATEGORIES}>
        <ComboboxTrigger
          render={
            <button
              type="button"
              aria-label="カテゴリ"
              data-size="default"
              className={cn(selectTriggerClassName, "w-full")}
            />
          }
        >
          <ComboboxValue>
            {(value: string | null) => (
              <span className={cn("truncate", value === null && "text-muted-foreground")}>
                {value ?? "カテゴリを選択"}
              </span>
            )}
          </ComboboxValue>
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput showTrigger={false} placeholder="カテゴリを検索" />
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
    <div className="max-w-xs">
      <Combobox
        items={items}
        value={value}
        onValueChange={(next: string | null) => setValue(next?.replace(/^\+/, "") ?? null)}
        inputValue={query}
        onInputValueChange={setQuery}
        autoHighlight
        filter={(item: string, q: string) => item.startsWith("+") || contains(item, q)}
      >
        <div ref={anchor}>
          <ComboboxPrimitive.Input aria-label="店舗" placeholder="なし" render={<Input />} />
        </div>
        <ComboboxContent
          anchor={anchor}
          sideOffset={0}
          className="rounded-none border-b border-foreground bg-background shadow-none ring-0"
        >
          <ComboboxEmpty className="justify-start py-2 text-left">
            過去の店舗はありません
          </ComboboxEmpty>
          <ComboboxList className="p-0">
            {(item: string) => (
              <ComboboxItem
                key={item}
                value={item}
                className="rounded-none border-b py-2 pl-0 last:border-b-0 data-highlighted:bg-muted"
              >
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
