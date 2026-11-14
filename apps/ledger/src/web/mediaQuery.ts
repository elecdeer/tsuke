import { useSyncExternalStore } from "react";

/** matchMedia のうち、ここで使う部分 */
type MatchMedia = (
  query: string,
) => Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">;

/**
 * メディアクエリの一致が変わるたびに onChange を呼ぶよう登録し、登録を外す関数を返す。
 */
export const subscribeMediaQuery = (
  matchMedia: MatchMedia,
  query: string,
  onChange: () => void,
): (() => void) => {
  const list = matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
};

/**
 * 画面がメディアクエリに一致しているかを返し、一致が変わったら描き直す。
 *
 * サーバーでは画面の幅がわからないので serverValue を返す。読み込み直後の描画もこの値で行い、そのあと実際の値に合わせる。
 */
export const useMediaQuery = (query: string, serverValue: boolean): boolean =>
  useSyncExternalStore(
    (onChange) => subscribeMediaQuery(window.matchMedia.bind(window), query, onChange),
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
