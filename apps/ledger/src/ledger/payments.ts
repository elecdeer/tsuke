import { and, asc, between, eq, inArray, sql } from "drizzle-orm";
import * as v from "valibot";
import {
  accounts,
  categories,
  genres,
  places,
  transactionItems,
  transactions,
} from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { PlaceDetailSchema, placeDetailColumns } from "./placeDetail.ts";
import { upsertPlaceByName } from "./places.ts";

const TextSchema = v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)));

/** 支出の登録の入力 */
export const PaymentInputSchema = v.object({
  date: v.pipe(v.string(), v.isoDate()),
  fromAccountId: v.nullable(v.pipe(v.number(), v.integer())),
  placeName: TextSchema,
  placeDetail: v.optional(v.nullable(PlaceDetailSchema)),
  items: v.pipe(
    v.array(
      v.object({
        genreId: v.pipe(v.number(), v.integer()),
        name: TextSchema,
        memo: TextSchema,
        amount: v.pipe(v.number(), v.safeInteger()),
      }),
    ),
    v.minLength(1),
    v.maxLength(100),
  ),
});

export type PaymentInput = v.InferOutput<typeof PaymentInputSchema>;

/**
 * 前後の空白を取り除いた後の空文字を null にする。
 */
const blankToNull = (value: string | null): string | null => (value === "" ? null : value);

/**
 * 支出を 1 件の取引として登録する。
 *
 * 店舗の作成・取引・品目を 1 回の batch で入れるので、途中で失敗しても一部の品目だけが残ることはない。
 * batch の中では作った行の ID を受け渡せないので、取引は店舗を名前で、品目は直前に入れた取引を MAX(id) で
 * 参照する（batch はトランザクションで流れ、AUTOINCREMENT なので直前の取引の ID が最大になる）。
 * receiptImageKey には、先に保存したレシートの写真のキーを渡す。
 */
export const createPayment = async (
  db: LedgerDb,
  input: PaymentInput,
  receiptImageKey: string | null = null,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> => {
  const genreIds = [...new Set(input.items.map((item) => item.genreId))];
  const genreRows = await db
    .select({ id: genres.id, categoryId: genres.categoryId })
    .from(genres)
    .innerJoin(categories, eq(categories.id, genres.categoryId))
    .where(and(inArray(genres.id, genreIds), eq(categories.mode, "payment")));
  const categoryIdByGenre = new Map(genreRows.map((genre) => [genre.id, genre.categoryId]));
  const unknownGenres = genreIds.filter((id) => !categoryIdByGenre.has(id));
  if (unknownGenres.length > 0) {
    return { ok: false, error: `支出の内訳が見つかりません: ${unknownGenres.join(", ")}` };
  }

  if (input.fromAccountId !== null) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, input.fromAccountId));
    if (account === undefined) return { ok: false, error: "口座が見つかりません" };
  }

  const placeName = blankToNull(input.placeName);
  const insertTransaction = db
    .insert(transactions)
    .values({
      date: input.date,
      mode: "payment",
      fromAccountId: input.fromAccountId,
      placeId:
        placeName === null
          ? null
          : sql`(SELECT ${places.id} FROM ${places} WHERE ${places.name} = ${placeName})`,
      source: "manual",
      receiptImageKey,
    })
    .returning({ id: transactions.id });
  const insertItems = db.insert(transactionItems).values(
    input.items.map((item, index) => ({
      transactionId: sql`(SELECT MAX(${transactions.id}) FROM ${transactions})`,
      categoryId: categoryIdByGenre.get(item.genreId) ?? null,
      genreId: item.genreId,
      name: blankToNull(item.name),
      memo: blankToNull(item.memo),
      amount: item.amount,
      sort: index,
    })),
  );

  if (placeName === null) {
    const [[created]] = await db.batch([insertTransaction, insertItems]);
    return created === undefined
      ? { ok: false, error: "取引を作れませんでした" }
      : { ok: true, id: created.id };
  }
  const [, [created]] = await db.batch([
    upsertPlaceByName(db, placeName, input.placeDetail),
    insertTransaction,
    insertItems,
  ]);
  return created === undefined
    ? { ok: false, error: "取引を作れませんでした" }
    : { ok: true, id: created.id };
};

/** 重複チェックの入力 */
export const DuplicateCheckInputSchema = v.object({
  date: v.pipe(v.string(), v.isoDate()),
  items: v.pipe(
    v.array(
      v.object({
        genreId: v.pipe(v.number(), v.integer()),
        amount: v.pipe(v.number(), v.safeInteger()),
      }),
    ),
    v.minLength(1),
    v.maxLength(100),
  ),
});

export type DuplicateCheckInput = v.InferOutput<typeof DuplicateCheckInputSchema>;

export type DuplicateCandidate = {
  transactionId: number;
  date: string;
  amount: number;
  placeName: string | null;
};

/**
 * YYYY-MM-DD の日付を days 日ずらす。
 */
const shiftDate = (date: string, days: number): string => {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

/**
 * 品目ごとに、すでに登録されている支出から重複の候補を探す。
 *
 * 日付が ±1 日で、金額と内訳が一致する品目を持つ取引を候補にする（Zaim API 経由のときと同じ基準）。
 * 戻り値は入力の items と同じ順に並ぶ。
 */
export const findDuplicates = async (
  db: LedgerDb,
  input: DuplicateCheckInput,
): Promise<DuplicateCandidate[][]> => {
  const from = shiftDate(input.date, -1);
  const to = shiftDate(input.date, 1);
  return Promise.all(
    input.items.map((item) =>
      db
        .selectDistinct({
          transactionId: transactions.id,
          date: transactions.date,
          amount: transactionItems.amount,
          placeName: places.name,
        })
        .from(transactionItems)
        .innerJoin(transactions, eq(transactions.id, transactionItems.transactionId))
        .leftJoin(places, eq(places.id, transactions.placeId))
        .where(
          and(
            eq(transactions.mode, "payment"),
            eq(transactionItems.genreId, item.genreId),
            eq(transactionItems.amount, item.amount),
            between(transactions.date, from, to),
          ),
        )
        .orderBy(asc(transactions.date), asc(transactions.id)),
    ),
  );
};
