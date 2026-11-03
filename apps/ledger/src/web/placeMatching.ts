/**
 * 新しい店舗の名前を、既存の店舗・チェーンや OpenPOI の施設と突き合わせる。
 *
 * OpenPOI には施設の ID がなく、同じチェーンでも表記が揺れるので、照合は候補を出すところまでにして、決めるのは人に任せる。
 */
import type { PlaceDetail } from "../ledger/placeDetail.ts";
import type { Poi } from "./openPoi.ts";

/** 既存の店舗とチェーンの名前 */
export type PlaceMasters = { placeNames: string[]; chainNames: string[] };

const SEPARATORS = /[\s\-‐‑–—―−・･.,'’&]/g;

/**
 * 名前を比べるためのキー。全角半角・大文字小文字・区切りの記号の違いをなくす。
 * 「セブンーイレブン」のように長音を区切りに使う表記もあるので、長音も落とす。
 */
export const placeKey = (name: string): string =>
  name.normalize("NFKC").toLowerCase().replace(SEPARATORS, "").replaceAll("ー", "");

/**
 * 同じ店かもしれない既存の店舗を、近い順に返す。キーが同じものを先に、片方がもう片方を含むものを後に並べる。
 *
 * 短い名前は無関係な店舗の名前にも含まれやすいので、含むかどうかは 3 文字以上のキーでだけ見る。
 */
export const similarPlaces = (name: string, placeNames: string[], limit = 5): string[] => {
  const key = placeKey(name);
  if (key === "") return [];
  const exact: string[] = [];
  const partial: string[] = [];
  for (const placeName of placeNames) {
    if (placeName === name) continue;
    const other = placeKey(placeName);
    if (other === key) exact.push(placeName);
    else if (
      Math.min(key.length, other.length) >= 3 &&
      (key.includes(other) || other.includes(key))
    ) {
      partial.push(placeName);
    }
  }
  return [...exact, ...partial].slice(0, limit);
};

/**
 * 店舗の名前からチェーンの名前を推測する。わからなければ空文字を返す。
 *
 * 表記を増やさないよう、既存のチェーンの名前で始まるならそれを最優先にする（長く一致するものを選ぶ）。
 * 次に「チェーン名 支店名店」の形から取り、最後に OpenPOI のブランドを使う。ブランドは英語の表記のことがあり、
 * 同じチェーンが分かれやすいので後回しにする。
 */
export const inferChain = (name: string, chainNames: string[], brand = ""): string => {
  const key = placeKey(name);
  const known = chainNames
    .filter((chain) => placeKey(chain) !== "" && key.startsWith(placeKey(chain)))
    .sort((a, b) => placeKey(b).length - placeKey(a).length)[0];
  if (known !== undefined) return known;

  const words = name.trim().split(/\s+/);
  const branch = words.at(-1);
  if (words.length >= 2 && branch?.endsWith("店")) return words.slice(0, -1).join(" ");
  return brand;
};

/** カタカナ（長音を含む）と漢字が入れ替わる位置 */
const SCRIPT_BOUNDARY =
  /(?<=[\p{Script=Katakana}ー])(?=\p{Script=Han})|(?<=\p{Script=Han})(?=[\p{Script=Katakana}ー])/gu;

/**
 * OpenPOI の入力補完に順に投げる語を作る。
 *
 * 入力補完は空白で区切った語をすべて名前や住所に含む施設を探すので、「ローソン 新宿西口店」は当たらず
 * 「ローソン新宿西口」なら当たる。そこで、そのままの名前の次に、区切りと末尾の「店」を落とした語を試す。
 *
 * 逆に施設の名前が「マックスバリュエクスプレス 船堀駅前店」と空白で区切られていると、詰めた語では当たらない。
 * 最後に、カタカナと漢字の境目で区切った語を試す。チェーン名と支店名の境目であることが多い。
 */
export const suggestQueries = (name: string): string[] => {
  const trimmed = name.trim();
  const compact = trimmed
    .normalize("NFKC")
    .replace(/[\s\-‐‑–—―−]/g, "")
    .replace(/店$/, "");
  const split = compact.replace(SCRIPT_BOUNDARY, " ");
  return trimmed === ""
    ? []
    : [...new Set([trimmed, compact, split])].filter((query) => query !== "");
};

/**
 * 店舗の名前を選んだときに、一緒に保存する情報を作る。すでにある店舗なら何も足さないので null を返す。
 */
export const placeDetailFor = (
  name: string,
  { placeNames, chainNames }: PlaceMasters,
  poi: Poi | null = null,
): PlaceDetail | null => {
  if (name === "" || placeNames.includes(name)) return null;
  return {
    chain: inferChain(name, chainNames, poi?.brand),
    poi:
      poi === null
        ? null
        : {
            address: poi.address,
            lng: poi.position.lng,
            lat: poi.position.lat,
            category: poi.kind,
            licenses: poi.licenses,
            attributions: poi.attributions,
          },
  };
};
