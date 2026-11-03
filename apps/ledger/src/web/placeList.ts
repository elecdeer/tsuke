/** 管理画面の一覧で使う店舗の項目 */
export type PlaceListItem = {
  id: number;
  name: string;
  aliases: string[];
  lastUsedOn: string | null;
  useCount: number;
};

export const PLACE_SORTS = ["recent", "count", "name"] as const;

export type PlaceSort = (typeof PLACE_SORTS)[number];

export const PLACE_SORT_LABELS: Record<PlaceSort, string> = {
  recent: "最近使った順",
  count: "利用回数の多い順",
  name: "名前順",
};

/**
 * 値が一覧の並び順なら true を返す。
 */
export const isPlaceSort = (value: string): value is PlaceSort =>
  (PLACE_SORTS as readonly string[]).includes(value);

/** 全角・半角、大文字・小文字の違いを無視して比べられる形にする */
const normalize = (text: string): string => text.normalize("NFKC").toLowerCase();

/**
 * 店舗名か別名に検索語を含む店舗に絞り込む。
 */
export const filterPlaces = <T extends PlaceListItem>(places: T[], query: string): T[] => {
  const wanted = normalize(query.trim());
  if (wanted === "") return places;
  return places.filter((place) =>
    [place.name, ...place.aliases].some((text) => normalize(text).includes(wanted)),
  );
};

/**
 * 店舗を指定の順に並べる。元の配列は変えない。
 *
 * 表記ゆれを見つけやすいよう、名前順は全角・半角をそろえてから比べる。
 */
export const sortPlaces = <T extends PlaceListItem>(places: T[], sort: PlaceSort): T[] => {
  const byName = (a: T, b: T): number => normalize(a.name).localeCompare(normalize(b.name), "ja");
  const copied = [...places];
  switch (sort) {
    case "recent":
      return copied.sort(
        (a, b) => (b.lastUsedOn ?? "").localeCompare(a.lastUsedOn ?? "") || byName(a, b),
      );
    case "count":
      return copied.sort((a, b) => b.useCount - a.useCount || byName(a, b));
    case "name":
      return copied.sort(byName);
  }
};

/**
 * 1 行 1 件で書いた別名を配列にする。空行と重複は取り除く。
 */
export const parseAliases = (text: string): string[] => [
  ...new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  ),
];
