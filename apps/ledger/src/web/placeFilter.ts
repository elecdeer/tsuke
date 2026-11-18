/**
 * 取引の一覧の、店舗の絞り込み。店舗 1 件か、チェーンの全店のどちらかで絞り込む。
 */
export type PlaceFilter = { placeId?: number | undefined; chain?: string | undefined };

/**
 * 店舗の絞り込みの選択肢。
 * value は `placeFilterValueOf` の形、label は欄に出す名前、searchText は検索で照らし合わせる文字。
 * inset はチェーンの下に字下げして並べる店舗のとき true にする。
 */
export type PlaceFilterOption = {
  value: string;
  label: string;
  searchText: string;
  inset: boolean;
};

/**
 * 選択肢のまとまり。value は見出しにする名前で、空文字なら見出しを出さない。
 */
export type PlaceFilterGroup = { value: string; items: PlaceFilterOption[] };

/** 絞り込まないときの選択肢 */
export const ALL_PLACES_OPTION: PlaceFilterOption = {
  value: "",
  label: "すべての店舗",
  searchText: "すべての店舗",
  inset: false,
};

/** チェーンのない店舗のまとまりの見出し */
const OTHER_PLACES_LABEL = "チェーンなし";

/**
 * 店舗の絞り込みを、選択肢の値にする。店舗なら `p:店舗ID`、チェーンなら `c:チェーン名`、なければ空文字。
 * 両方あれば店舗を優先する。
 */
export const placeFilterValueOf = ({ placeId, chain }: PlaceFilter): string => {
  if (placeId !== undefined) return `p:${placeId}`;
  if (chain !== undefined) return `c:${chain}`;
  return "";
};

/**
 * 選択肢の値を、店舗の絞り込みに戻す。どちらか一方だけを入れ、もう一方は undefined にして外す。
 */
export const parsePlaceFilterValue = (
  value: string,
): { placeId: number | undefined; chain: string | undefined } => {
  if (value.startsWith("p:")) {
    const placeId = Number(value.slice(2));
    if (Number.isSafeInteger(placeId) && placeId > 0) return { placeId, chain: undefined };
  }
  if (value.startsWith("c:") && value.length > 2) {
    return { placeId: undefined, chain: value.slice(2) };
  }
  return { placeId: undefined, chain: undefined };
};

/** チェーンの全店を選ぶ選択肢の名前 */
const chainLabelOf = (chain: string): string => `${chain}（全店）`;

/**
 * 店舗の一覧から、絞り込みの選択肢を作る。
 * 先頭に「すべての店舗」を置き、チェーンごとに見出しを付けて「全店」とその店舗を並べ、チェーンのない店舗を最後にまとめる。
 * チェーンは名前順、店舗は渡した順のままにする。チェーン名でも店舗が見つかるよう、店舗の検索にはチェーン名も含める。
 */
export const placeFilterGroups = (
  places: ReadonlyArray<{ id: number; name: string; chain: string | null }>,
): PlaceFilterGroup[] => {
  const byChain = new Map<string, PlaceFilterOption[]>();
  const others: PlaceFilterOption[] = [];
  for (const place of places) {
    const option: PlaceFilterOption = {
      value: placeFilterValueOf({ placeId: place.id }),
      label: place.name,
      searchText: place.chain === null ? place.name : `${place.name} ${place.chain}`,
      inset: place.chain !== null,
    };
    if (place.chain === null) {
      others.push(option);
    } else {
      byChain.set(place.chain, [...(byChain.get(place.chain) ?? []), option]);
    }
  }
  const chainGroups = [...byChain.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ja"))
    .map(([chain, items]) => ({
      value: chain,
      items: [
        {
          value: placeFilterValueOf({ chain }),
          label: chainLabelOf(chain),
          searchText: chain,
          inset: false,
        },
        ...items,
      ],
    }));
  return [
    { value: "", items: [ALL_PLACES_OPTION] },
    ...chainGroups,
    ...(others.length === 0 ? [] : [{ value: OTHER_PLACES_LABEL, items: others }]),
  ];
};

/**
 * 今の絞り込みに当たる選択肢を返す。選択肢にない店舗（アーカイブ済みなど）やチェーンなら、
 * 店舗は placeName（なければ「削除された店舗」）、チェーンはその名前で選択肢を作る。
 */
export const selectedPlaceFilterOption = (
  groups: readonly PlaceFilterGroup[],
  filter: PlaceFilter,
  placeName: string | null,
): PlaceFilterOption => {
  const value = placeFilterValueOf(filter);
  const found = groups.flatMap((group) => group.items).find((option) => option.value === value);
  if (found !== undefined) return found;
  if (filter.placeId !== undefined) {
    const label = placeName ?? "（削除された店舗）";
    return { value, label, searchText: label, inset: false };
  }
  if (filter.chain !== undefined) {
    return { value, label: chainLabelOf(filter.chain), searchText: filter.chain, inset: false };
  }
  return ALL_PLACES_OPTION;
};
