/** 立替の額の計算。画面でも使うので、DB には触らない */

/** 立替の状態。立替額と紐付けた額の合計を比べて決まるので、列には持たない */
export type AdvanceStatus = "none" | "provisional" | "partial" | "settled";

export type AdvanceItem = { amount: number; isAdvanceTarget: boolean };

/** 紐付けの配分の計算に使う支出の値 */
export type AdvancePayment = {
  advanceAmount: number;
  /** 対象の品目の合計 */
  advanceLimit: number;
  /** 他の収入から紐付けた額の合計 */
  otherLinked: number;
};

/**
 * 品目ごとに、立替の対象かどうかを返す。どの品目にも印がなければ全品目を対象にする。
 */
const targetFlags = (items: readonly AdvanceItem[]): boolean[] => {
  const marked = items.some((item) => item.isAdvanceTarget);
  return items.map((item) => !marked || item.isAdvanceTarget);
};

/**
 * 立替額の上限（対象の品目の合計）を返す。
 */
export const advanceLimitOf = (items: readonly AdvanceItem[]): number => {
  const flags = targetFlags(items);
  return items.reduce((sum, item, index) => (flags[index] ? sum + item.amount : sum), 0);
};

/**
 * 整数の額を重みに比例して分ける。端数は余りの大きいものから 1 ずつ足し、和を額と一致させる。
 *
 * 重みの和が 0 以下なら分けようがないので、すべて 0 を返す。
 */
export const allocateByWeight = (total: number, weights: readonly number[]): number[] => {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) return weights.map(() => 0);

  const shares = weights.map((weight) => Math.floor((total * weight) / weightSum));
  const remainders = weights.map(
    (weight, index) => total * weight - (shares[index] ?? 0) * weightSum,
  );
  const leftover = total - shares.reduce((sum, share) => sum + share, 0);
  const order = weights
    .map((_, index) => index)
    .sort((a, b) => (remainders[b] ?? 0) - (remainders[a] ?? 0) || a - b);
  for (const index of order.slice(0, leftover)) {
    shares[index] = (shares[index] ?? 0) + 1;
  }
  return shares;
};

/**
 * 立替額を対象の品目の金額に比例して分け、品目の並びで返す。対象でない品目は 0 にする。
 */
export const advanceSharesOf = (items: readonly AdvanceItem[], advanceAmount: number): number[] => {
  const flags = targetFlags(items);
  return allocateByWeight(
    advanceAmount,
    items.map((item, index) => (flags[index] ? item.amount : 0)),
  );
};

/**
 * 立替額と紐付けた額の合計から、立替の状態を返す。
 */
export const advanceStatusOf = (advanceAmount: number, linkedAmount: number): AdvanceStatus => {
  if (linkedAmount > 0) return linkedAmount < advanceAmount ? "partial" : "settled";
  return advanceAmount > 0 ? "provisional" : "none";
};

/**
 * 未入金の残りを返す。
 */
export const unreceivedAmountOf = (advanceAmount: number, linkedAmount: number): number =>
  Math.max(0, advanceAmount - linkedAmount);

/**
 * 収入の金額を支出へ配分する候補を返す。
 *
 * 未入金の残りに比例させる。全支出の残りが 0 なら、紐付けられる余地（上限から紐付け済みの額を引いた額）に比例させ、
 * それも 0 なら最初の支出に寄せる。範囲に収まるかは保存時に確かめる。
 */
export const suggestAllocation = (
  amount: number,
  payments: readonly AdvancePayment[],
): number[] => {
  const unreceived = payments.map((payment) =>
    unreceivedAmountOf(payment.advanceAmount, payment.otherLinked),
  );
  if (unreceived.some((value) => value > 0)) return allocateByWeight(amount, unreceived);
  const room = payments.map((payment) => Math.max(0, payment.advanceLimit - payment.otherLinked));
  if (room.some((value) => value > 0)) return allocateByWeight(amount, room);
  return payments.map((_, index) => (index === 0 ? amount : 0));
};

/**
 * 紐付けた後の立替額を返す。
 *
 * 既定では紐付けた額の合計で上書きして確定する。まだ入金があるなら立替額を変えず、合計が超えるときだけ合計まで上げる。
 */
export const advanceAmountAfterLink = (
  advanceAmount: number,
  linkedAmount: number,
  expectMore: boolean,
): number => (expectMore ? Math.max(advanceAmount, linkedAmount) : linkedAmount);
