import type { AdvanceStatus } from "../ledger/advance.ts";
import type { Aggregation, TransactionMode } from "../ledger/transactions.ts";

/** 取引の種類の表示名 */
export const MODE_LABELS: Record<TransactionMode, string> = {
  payment: "支出",
  income: "収入",
  transfer: "振替",
  adjustment: "残高調整",
};

/** 集計の設定の表示名 */
export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  always: "常に集計に含める",
  never: "集計に含めない",
  yearly_only: "年の集計にのみ含める",
};

/** 立替の状態の表示名 */
export const ADVANCE_STATUS_LABELS: Record<Exclude<AdvanceStatus, "none">, string> = {
  provisional: "仮",
  partial: "一部入金",
  settled: "確定",
};
