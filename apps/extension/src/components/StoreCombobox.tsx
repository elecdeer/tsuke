import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { PlusIcon, XIcon } from "lucide-react";
import { Suspense, useId, useState } from "react";
import { Button } from "@tsuke/ui/components/button";
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@tsuke/ui/components/combobox";
import { Input } from "@tsuke/ui/components/input";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useSuspenseQuery } from "@/lib/query";
import { placeOptions, type PlaceOption } from "@/lib/placeOptions";
import { placesQuery } from "../queries";
import { FormField } from "@tsuke/ui/patterns/FormField";

interface Props {
  serverUrl: string;
  /** 選んだ店舗の名前。一覧にない名前（自動入力で読み取った新しい店舗など）も持てる */
  value: string | null;
  onChange: (value: string | null) => void;
  /** ラベルを見た目から隠す。行の中に並べるときに使う */
  hideLabel?: boolean;
}

const LABEL = "店舗";

/**
 * 店舗選択の combobox コンポーネント。
 * 台帳の店舗を最後に使った日の新しい順に表示し、一覧から選ぶか、一覧にない名前を打ち込んで追加する。
 *
 * 台帳の店舗の欄（apps/ledger/src/web/components/TransactionFields.tsx の PlaceInput）にそろえ、
 * 欄そのものに打ち込み、候補は欄の下に罫線で区切って並べる。押すと検索の欄を別に開く形は、
 * 打ち始めるまでに 2 回押す必要があり、影の付いた箱がほかの欄（下線だけ）から浮くので使わない。
 */
export const StoreCombobox = ({ serverUrl, value, onChange, hideLabel = false }: Props) => {
  const id = useId();
  if (!serverUrl) return null;

  return (
    <FormField label={LABEL} htmlFor={id} hideLabel={hideLabel}>
      <ErrorBoundary
        fallback={<p className="py-1.5 text-sm text-destructive">店舗の取得に失敗しました</p>}
      >
        <Suspense
          fallback={
            <output
              className="block h-8 animate-pulse border-b border-foreground/40 bg-muted"
              aria-label="店舗を読み込み中"
            />
          }
        >
          <StoreComboboxContent id={id} serverUrl={serverUrl} value={value} onChange={onChange} />
        </Suspense>
      </ErrorBoundary>
    </FormField>
  );
};

const StoreComboboxContent = ({
  id,
  serverUrl,
  value,
  onChange,
}: { id: string; serverUrl: string } & Pick<Props, "value" | "onChange">) => {
  const { data } = useSuspenseQuery(placesQuery, serverUrl);
  // 欄に出す文字。打ち込んだだけでは店舗を変えず、候補を選んだときに変える
  const [query, setQuery] = useState(value ?? "");
  // 自動入力で店舗が変わったら、欄の文字もその名前にする
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    setQuery(value ?? "");
  }
  const anchor = useComboboxAnchor();
  const { contains } = ComboboxPrimitive.useFilter();

  const selected: PlaceOption | null = value === null ? null : { name: value, isNew: false };

  return (
    <Combobox
      items={placeOptions(
        data.places.map((place) => place.name),
        query,
      )}
      value={selected}
      onValueChange={(next: PlaceOption | null) => onChange(next?.name ?? null)}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        // 選ばずに閉じたら、打ちかけの文字を捨てて選んでいる店舗に戻す。選んで閉じたときは、
        // 上で新しい店舗の名前に合わせ直す
        if (!open) setQuery(value ?? "");
      }}
      isItemEqualToValue={(a: PlaceOption | null, b: PlaceOption | null) => a?.name === b?.name}
      itemToStringLabel={(option: PlaceOption | null) => option?.name ?? ""}
      // 欄はフォームの中にあるので、候補が選ばれていないと Enter でフォームを送ってしまう。
      // 打ち込んだら先頭の候補を選んだ状態にして、Enter でその候補に決まるようにする
      autoHighlight
      // 追加の候補は入力した名前そのものなので、絞り込みに関わらず常に出す
      filter={(option: PlaceOption, q: string) => option.isNew || contains(option.name, q)}
    >
      <div ref={anchor} className="flex min-w-0 items-center gap-0.5">
        <ComboboxPrimitive.Input id={id} placeholder="なし" render={<Input />} />
        {value !== null && (
          <ComboboxClear
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label="クリア" />}
          >
            <XIcon />
          </ComboboxClear>
        )}
      </div>
      <ComboboxContent
        // 欄の右のボタンまで含めた幅で、欄のすぐ下に出す
        anchor={anchor}
        sideOffset={0}
        // 箱ではなく欄の続きに見せたいので、影・枠をやめ、下の端だけ黒の線で閉じる
        className="border-b border-foreground bg-background shadow-none ring-0"
      >
        <ComboboxEmpty className="py-2 text-left text-muted-foreground">
          過去の店舗はありません
        </ComboboxEmpty>
        <ComboboxList className="p-0">
          {(option: PlaceOption) => (
            <ComboboxItem
              key={`${option.isNew}:${option.name}`}
              value={option}
              className="border-b py-2 pl-0 last:border-b-0"
            >
              {option.isNew ? (
                <>
                  <PlusIcon aria-hidden="true" />「{option.name}」を追加
                </>
              ) : (
                option.name
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
};
