import { eq } from "drizzle-orm";
import * as v from "valibot";
import { accounts } from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";

/** 口座の編集の入力 */
export const AccountUpdateSchema = v.object({
  aiHint: v.pipe(v.string(), v.trim(), v.maxLength(500)),
});

export type AccountUpdate = v.InferOutput<typeof AccountUpdateSchema>;

export type AccountEditResult = { ok: true } | { ok: false; status: 404; error: string };

/**
 * 口座の、AI の読み取りに渡すヒントを書き換える。空なら消す。
 */
export const updateAccount = async (
  db: LedgerDb,
  id: number,
  input: AccountUpdate,
): Promise<AccountEditResult> => {
  const updated = await db
    .update(accounts)
    .set({ aiHint: input.aiHint === "" ? null : input.aiHint })
    .where(eq(accounts.id, id))
    .returning({ id: accounts.id });
  return updated.length === 0
    ? { ok: false, status: 404, error: "口座が見つかりません" }
    : { ok: true };
};
