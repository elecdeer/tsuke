import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@tsuke/ui/components/combobox";
import { SelectTriggerText, selectTriggerStyleProps } from "@tsuke/ui/components/select";
import {
  parsePlaceFilterValue,
  type PlaceFilter,
  type PlaceFilterGroup,
  type PlaceFilterOption,
  placeFilterGroups,
  selectedPlaceFilterOption,
} from "@/web/placeFilter";
import styles from "./PlaceFilterSelect.module.css";

/**
 * 取引の一覧の、店舗とチェーンの絞り込み。
 * 店舗は多くなるので、選択欄（Select）ではなく検索欄の付いた combobox にし、チェーンごとにまとめて「全店」も選べるようにする。
 */
export const PlaceFilterSelect = ({
  filter,
  places,
  placeName,
  onChange,
}: {
  filter: PlaceFilter;
  places: ReadonlyArray<{ id: number; name: string; chain: string | null }>;
  /** 絞り込んでいる店舗の名前。選択肢にない店舗（アーカイブ済みなど）の表示に使う */
  placeName: string | null;
  onChange: (next: { placeId: number | undefined; chain: string | undefined }) => void;
}) => {
  const groups = placeFilterGroups(places);
  const selected = selectedPlaceFilterOption(groups, filter, placeName);
  const { contains } = ComboboxPrimitive.useFilter();

  return (
    <Combobox
      items={groups}
      value={selected}
      onValueChange={(next: PlaceFilterOption | null) =>
        onChange(parsePlaceFilterValue(next?.value ?? ""))
      }
      isItemEqualToValue={(a: PlaceFilterOption, b: PlaceFilterOption) => a.value === b.value}
      itemToStringLabel={(option: PlaceFilterOption) => option.label}
      filter={(option: PlaceFilterOption, query: string) => contains(option.searchText, query)}
      autoHighlight
    >
      <ComboboxTrigger
        render={
          <button type="button" aria-label="店舗" {...selectTriggerStyleProps({ size: "sm" })} />
        }
      >
        <ComboboxValue>
          {(value: PlaceFilterOption | null) => (
            <SelectTriggerText>{value?.label ?? "すべての店舗"}</SelectTriggerText>
          )}
        </ComboboxValue>
      </ComboboxTrigger>
      <ComboboxContent className={styles.Content}>
        <ComboboxInput placeholder="店舗・チェーンを検索" />
        <ComboboxEmpty>店舗が見つかりません</ComboboxEmpty>
        <ComboboxList>
          {(group: PlaceFilterGroup) => (
            <ComboboxGroup key={group.value} items={group.items}>
              {group.value !== "" && <ComboboxLabel>{group.value}</ComboboxLabel>}
              <ComboboxCollection>
                {(option: PlaceFilterOption) => (
                  <ComboboxItem key={option.value} value={option} inset={option.inset}>
                    {option.label}
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
