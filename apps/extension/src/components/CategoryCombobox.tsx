import { Suspense, useId, useMemo } from "react";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@tsuke/ui/components/combobox";
import { selectTriggerClassName } from "@tsuke/ui/components/select";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useSuspenseQuery } from "@/lib/query";
import { cn } from "@tsuke/ui/lib/utils";
import { categoriesQuery } from "../queries";
import { FormField } from "@tsuke/ui/patterns/FormField";

export type CategorySelection = {
  categoryId: number;
  genreId: number;
};

type GenreItem = {
  categoryId: number;
  categoryName: string;
  genreId: number;
  genreName: string;
};

type GenreGroup = {
  categoryId: number;
  categoryName: string;
  items: GenreItem[];
};

interface Props {
  serverUrl: string;
  value: CategorySelection | null;
  onChange: (value: CategorySelection | null) => void;
  /** ラベルを見た目から隠す。行の中に並べるときに使う */
  hideLabel?: boolean;
  /**
   * 欄の見た目。`inline` は品目の行で品目名の上に添える見出しのように、低く小さく薄く出し、
   * 下線も消して下の品目名の欄と取り違えないようにする（台帳の品目の行と同じ）。
   */
  variant?: "default" | "inline";
}

const LABEL = "カテゴリ";

/** 選んだ内訳の名前。台帳の選択欄（categoryLabels）と同じく「カテゴリ / 内訳」と書く */
const genreLabel = (item: GenreItem): string => `${item.categoryName} / ${item.genreName}`;

/**
 * カテゴリ（カテゴリでグループ化された内訳）の combobox コンポーネント。
 * 支出のカテゴリのみ対象。1つの Popover 内でカテゴリごとにグループ表示する。
 */
export const CategoryCombobox = ({
  serverUrl,
  value,
  onChange,
  hideLabel = false,
  variant = "default",
}: Props) => {
  const id = useId();
  if (!serverUrl) return null;

  return (
    <FormField label={LABEL} htmlFor={id} hideLabel={hideLabel}>
      <ErrorBoundary
        fallback={<p className="py-1.5 text-sm text-destructive">カテゴリの取得に失敗しました</p>}
      >
        <Suspense
          fallback={
            <output
              className={cn(
                "block animate-pulse bg-muted",
                variant === "inline" ? "h-6 w-24" : "h-8 border-b border-foreground/40",
              )}
              aria-label="カテゴリを読み込み中"
            />
          }
        >
          <CategoryComboboxContent
            id={id}
            serverUrl={serverUrl}
            value={value}
            onChange={onChange}
            variant={variant}
          />
        </Suspense>
      </ErrorBoundary>
    </FormField>
  );
};

const CategoryComboboxContent = ({
  id,
  serverUrl,
  value,
  onChange,
  variant,
}: { id: string; serverUrl: string } & Pick<Props, "value" | "onChange" | "variant">) => {
  const { data } = useSuspenseQuery(categoriesQuery, serverUrl);

  const groups = useMemo<GenreGroup[]>(
    () =>
      data.categories.map((c) => ({
        categoryId: c.id,
        categoryName: c.name,
        items: c.genres.map((genre) => ({
          categoryId: c.id,
          categoryName: c.name,
          genreId: genre.id,
          genreName: genre.name,
        })),
      })),
    [data],
  );

  const selectedItem = useMemo<GenreItem | null>(() => {
    if (!value) return null;
    for (const g of groups) {
      const found = g.items.find((i) => i.genreId === value.genreId);
      if (found) return found;
    }
    return null;
  }, [groups, value]);

  return (
    <Combobox
      items={groups}
      value={selectedItem}
      onValueChange={(next) => {
        if (!next) return;
        onChange({ categoryId: next.categoryId, genreId: next.genreId });
      }}
      isItemEqualToValue={(item: GenreItem | null, v: GenreItem | null) =>
        item?.genreId === v?.genreId
      }
      itemToStringLabel={(item: GenreItem | null) => item?.genreName ?? ""}
      filter={(itemValue: GenreItem, query: string) =>
        `${itemValue.categoryName} ${itemValue.genreName}`
          .toLowerCase()
          .includes(query.toLowerCase())
      }
    >
      <ComboboxTrigger
        id={id}
        render={
          // 名前はラベルからも付くが、lint はラベルとの結び付きを読めないので、同じ名前を直接付ける
          <button
            type="button"
            aria-label={LABEL}
            data-size="default"
            className={cn(
              selectTriggerClassName,
              "w-full",
              // 品目の行では品目名に添える見出しのように、低く小さく薄く出す。下線も消し、下の品目名の欄と取り違えないようにする
              variant === "inline" &&
                "w-fit max-w-full border-transparent text-xs text-muted-foreground data-[size=default]:h-6",
            )}
          />
        }
      >
        <ComboboxValue>
          {(v: GenreItem | null) => (
            <span className={cn("truncate", !v && "text-muted-foreground")}>
              {/* 台帳と違い未分類のままでは登録できないので、選ぶよう促す */}
              {v ? genreLabel(v) : "カテゴリを選択"}
            </span>
          )}
        </ComboboxValue>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput showTrigger={false} placeholder="カテゴリを検索" />
        <ComboboxEmpty>カテゴリが見つかりません</ComboboxEmpty>
        <ComboboxList>
          {(group: GenreGroup) => (
            <ComboboxGroup key={group.categoryId} items={group.items}>
              <ComboboxLabel>{group.categoryName}</ComboboxLabel>
              <ComboboxCollection>
                {(item: GenreItem) => (
                  <ComboboxItem key={item.genreId} value={item}>
                    {item.genreName}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
};
