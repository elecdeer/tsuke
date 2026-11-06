import { eq, max } from "drizzle-orm";
import * as v from "valibot";
import { accounts } from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { computeBalances } from "./balances.ts";
import { listAccounts } from "./masters.ts";
import {
  type MasterEditResult,
  masterNameSchema,
  type MoveOffset,
  moveInOrder,
  nameConflictMessage,
} from "./masterEdit.ts";

/** 口座の追加と編集の入力 */
export const AccountUpdateSchema = v.object({
  name: masterNameSchema("口座名"),
  aiHint: v.pipe(v.string(), v.trim(), v.maxLength(500)),
});

export type AccountUpdate = v.InferOutput<typeof AccountUpdateSchema>;

const NOT_FOUND = { ok: false, status: 404, error: "口座が見つかりません" } as const;

/** 残高を確かめるときの日付。先の日付の取引も含めて、口座に残っている額を見る */
const ALL_TIME = "9999-12-31";

/**
 * 同じ名前の別の口座があれば、その文言を返す。
 */
const findNameConflict = async (
  db: LedgerDb,
  name: string,
  id: number | null,
): Promise<string | null> => {
  const rows = await db
    .select({ id: accounts.id, archived: accounts.archived })
    .from(accounts)
    .where(eq(accounts.name, name));
  const other = rows.find((row) => row.id !== id);
  return other === undefined ? null : nameConflictMessage(name, other.archived);
};

/**
 * 口座を並びの最後に追加する。
 */
export const createAccount = async (
  db: LedgerDb,
  input: AccountUpdate,
): Promise<MasterEditResult> => {
  const conflict = await findNameConflict(db, input.name, null);
  if (conflict !== null) return { ok: false, status: 409, error: conflict };
  const [last] = await db.select({ sort: max(accounts.sort) }).from(accounts);
  await db.insert(accounts).values({
    name: input.name,
    aiHint: input.aiHint === "" ? null : input.aiHint,
    sort: (last?.sort ?? -1) + 1,
  });
  return { ok: true };
};

/**
 * 口座の名前と、AI の読み取りに渡すヒントを書き換える。ヒントが空なら消す。
 *
 * 取引は口座を ID で参照するので、名前を変えても書き換えなくて済む。
 */
export const updateAccount = async (
  db: LedgerDb,
  id: number,
  input: AccountUpdate,
): Promise<MasterEditResult> => {
  const conflict = await findNameConflict(db, input.name, id);
  if (conflict !== null) return { ok: false, status: 409, error: conflict };
  const updated = await db
    .update(accounts)
    .set({ name: input.name, aiHint: input.aiHint === "" ? null : input.aiHint })
    .where(eq(accounts.id, id))
    .returning({ id: accounts.id });
  return updated.length === 0 ? NOT_FOUND : { ok: true };
};

/**
 * 口座をアーカイブするか元に戻す。
 *
 * 残高の画面はアーカイブした口座を合計に入れないので、残高のある口座をアーカイブすると合計が黙って変わる。
 * そのため残高が 0 のときだけアーカイブできるようにし、残っていれば残高調整を案内する。
 */
export const setAccountArchived = async (
  db: LedgerDb,
  id: number,
  archived: boolean,
): Promise<MasterEditResult> => {
  if (archived) {
    const balances = await computeBalances(db, ALL_TIME);
    const balance = balances.find((account) => account.id === id)?.balance ?? 0;
    if (balance !== 0) {
      return {
        ok: false,
        status: 409,
        error: `残高が ${balance.toLocaleString("ja-JP")} 円あります。残高調整で 0 にしてからアーカイブしてください`,
      };
    }
  }
  const updated = await db
    .update(accounts)
    .set({ archived })
    .where(eq(accounts.id, id))
    .returning({ id: accounts.id });
  return updated.length === 0 ? NOT_FOUND : { ok: true };
};

/**
 * アーカイブしていない口座の並びの中で、口座を前後へ動かす。
 *
 * 取り込んだ口座は sort がすべて 0 なので、入れ替える 2 件だけでなく全件に番号を振り直す。
 */
export const moveAccount = async (
  db: LedgerDb,
  id: number,
  offset: MoveOffset,
): Promise<MasterEditResult> => {
  const rows = await listAccounts(db);
  const order = moveInOrder(
    rows.map((row) => row.id),
    id,
    offset,
  );
  if (order === null) return NOT_FOUND;
  const [first, ...rest] = order.map((accountId, sort) =>
    db.update(accounts).set({ sort }).where(eq(accounts.id, accountId)),
  );
  if (first !== undefined) await db.batch([first, ...rest]);
  return { ok: true };
};
