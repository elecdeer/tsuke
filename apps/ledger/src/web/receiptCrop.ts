import type { ReceiptBox } from "../llm/extractReceipt.ts";

/** 写真の中のレシートの範囲。写真の幅・高さに対する割合（0〜1）で持つ */
export type ReceiptCrop = { left: number; top: number; width: number; height: number };

/** AI の座標の範囲（写真の左上が 0、右下が 1000） */
const BOX_SCALE = 1000;

/**
 * レシートの端を切らないよう、四方に足す余白（写真の幅・高さに対する割合）。
 * 速いモデルは写真の 5% ほど狭く返すことがある。背景が少し入っても、端が切れるより困らない
 */
const CROP_MARGIN = 0.05;

/** これより狭い範囲は、レシートの一部しか指していないと見なして使わない */
const MIN_CROP_EDGE = 0.1;

/** 幅も高さもこれより広ければ、切り取っても見え方が変わらないので切り取らない */
const MAX_CROP_EDGE = 0.95;

/**
 * AI が返した範囲を、写真を切り取る範囲にする。使えない範囲なら null を返し、写真の全体を見せる。
 *
 * 座標が範囲の外なら単位を取り違えていて、丸めても正しい範囲にならないので使わない。
 */
export const receiptCrop = (box: ReceiptBox | null | undefined): ReceiptCrop | null => {
  if (box === null || box === undefined) return null;
  const { xmin, ymin, xmax, ymax } = box;
  const coordinates = [xmin, ymin, xmax, ymax];
  if (coordinates.some((value) => !Number.isFinite(value) || value < 0 || value > BOX_SCALE)) {
    return null;
  }
  if ((xmax - xmin) / BOX_SCALE < MIN_CROP_EDGE || (ymax - ymin) / BOX_SCALE < MIN_CROP_EDGE) {
    return null;
  }

  const left = Math.max(0, xmin / BOX_SCALE - CROP_MARGIN);
  const top = Math.max(0, ymin / BOX_SCALE - CROP_MARGIN);
  const width = Math.min(1, xmax / BOX_SCALE + CROP_MARGIN) - left;
  const height = Math.min(1, ymax / BOX_SCALE + CROP_MARGIN) - top;
  if (width > MAX_CROP_EDGE && height > MAX_CROP_EDGE) return null;
  return { left, top, width, height };
};

/** 切り取った写真の見せ方。枠の縦横比と、枠に対する写真の位置・大きさ（CSS の %） */
export type CropLayout = {
  aspectRatio: number;
  image: { left: string; top: string; width: string; height: string };
};

/**
 * 写真の本来の大きさから、切り取る範囲だけを枠いっぱいに見せるレイアウトを計算する。
 */
export const cropLayout = (
  crop: ReceiptCrop,
  natural: { width: number; height: number },
): CropLayout => ({
  aspectRatio: (crop.width * natural.width) / (crop.height * natural.height),
  image: {
    left: `${(-crop.left / crop.width) * 100}%`,
    top: `${(-crop.top / crop.height) * 100}%`,
    width: `${(1 / crop.width) * 100}%`,
    height: `${(1 / crop.height) * 100}%`,
  },
});
