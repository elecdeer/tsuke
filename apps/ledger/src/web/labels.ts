import type { Aggregation, TransactionMode } from "../ledger/transactions.ts";

/** 取引の種類の並び */
export const TRANSACTION_MODES: TransactionMode[] = ["payment", "income", "transfer", "adjustment"];

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
