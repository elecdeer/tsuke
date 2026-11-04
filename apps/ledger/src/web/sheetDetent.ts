/**
 * シートの中身の高さは、置ける高さ全体に対する割合で持つ。画面を回しても高さの関係が保たれる。
 *
 * 写真を見る（0）、写真と結果を見比べる（既定）、結果を広く見る（1）の 3 段に止める。
 */
export const SHEET_DETENTS = [0, 0.4, 1] as const;

/** 開いたときの高さ。写真と結果の両方が見える */
export const DEFAULT_SHEET_DETENT = 0.4;

/** 指を離した後も動き続けるとみなす時間（ms）。軽く払っただけでも次の段へ移れるようにする */
const FLICK_PROJECTION = 150;

/**
 * 高さをドラッグした分だけ変える。上へ動かす（dy が負）と高くなる。置ける高さの外へは出ない。
 */
export const draggedFraction = (start: number, dy: number, stageHeight: number): number =>
  Math.min(1, Math.max(0, start - dy / stageHeight));

/**
 * 指を離したときに止まる段を返す。速さ（割合/ms、高くなる向きが正）から止まる位置を見込み、一番近い段を選ぶ。
 */
export const settledDetent = (fraction: number, velocity = 0): number => {
  const projected = fraction + velocity * FLICK_PROJECTION;
  return SHEET_DETENTS.reduce((nearest, detent) =>
    Math.abs(detent - projected) < Math.abs(nearest - projected) ? detent : nearest,
  );
};

/**
 * 隣の段を返す。offset が正なら高い方へ動かす。端より先へは動かない。
 */
export const steppedDetent = (fraction: number, offset: 1 | -1): number => {
  const next =
    offset > 0
      ? SHEET_DETENTS.find((detent) => detent > fraction)
      : SHEET_DETENTS.filter((detent) => detent < fraction).at(-1);
  return next ?? fraction;
};

/**
 * 取っ手を押したときの高さを返す。写真を全部見たいときにすぐ畳めるよう、開いていれば畳み、畳んでいれば開く。
 */
export const toggledDetent = (fraction: number): number =>
  fraction > 0 ? 0 : DEFAULT_SHEET_DETENT;
