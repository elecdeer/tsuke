import * as v from "valibot";

/** マスタの編集の結果 */
export type MasterEditResult = { ok: true } | { ok: false; status: 400 | 404 | 409; error: string };

/** 並び順で 1 つ前か後ろか */
export const MoveOffsetSchema = v.picklist([-1, 1]);

export type MoveOffset = v.InferOutput<typeof MoveOffsetSchema>;

/**
 * マスタの名前の入力のスキーマを作る。
 */
export const masterNameSchema = (label: string) =>
  v.pipe(v.string(), v.trim(), v.minLength(1, `${label}を入力してください`), v.maxLength(200));

/**
 * ID の並びの中で、指定の ID を前後へ動かした並びを返す。ID がなければ null、端より先へは動かさない。
 */
export const moveInOrder = (ids: number[], id: number, offset: MoveOffset): number[] | null => {
  const from = ids.indexOf(id);
  if (from === -1) return null;
  const to = Math.min(Math.max(from + offset, 0), ids.length - 1);
  const moved = ids.filter((other) => other !== id);
  moved.splice(to, 0, id);
  return moved;
};

/**
 * 同じ名前のマスタがあるときの文言。名前は一意なので、アーカイブ済みのものとも重ねられない。
 */
export const nameConflictMessage = (name: string, archived: boolean): string =>
  archived
    ? `「${name}」はアーカイブ済みです。元に戻して使ってください`
    : `「${name}」はすでにあります`;
