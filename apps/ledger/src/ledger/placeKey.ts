/**
 * 店舗の名前の表記の揺れをなくして比べるためのキー。読み取りと登録画面の両方で使う。
 */

const SEPARATORS = /[\s\-‐‑–—―−・･.,'’&]/g;

/**
 * 名前を比べるためのキー。全角半角・大文字小文字・区切りの記号の違いをなくす。
 * 「セブンーイレブン」のように長音を区切りに使う表記もあるので、長音も落とす。
 */
export const placeKey = (name: string): string =>
  name.normalize("NFKC").toLowerCase().replace(SEPARATORS, "").replaceAll("ー", "");

/**
 * 同じ店舗かどうかを比べるキー。レシートには末尾の「店」を省いた表記もあるので、placeKey からさらに落とす。
 */
export const storeKey = (name: string): string => placeKey(name).replace(/店$/, "");
