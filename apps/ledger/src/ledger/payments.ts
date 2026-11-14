import { and, asc, between, eq, inArray, isNull, or, sql } from "drizzle-orm";
import * as v from "valibot";
import {
  accounts,
  categories,
  genreInferences,
  genres,
  places,
  transactionItems,
  transactions,
} from "../../db/schema.ts";
import { chunkInsertRows, type LedgerDb } from "../db.ts";
import { PlaceDetailSchema, placeDetailColumns } from "./placeDetail.ts";
import { PlacePhoneSchema } from "./placePhone.ts";
import { rememberPlacePhone, upsertPlaceByName } from "./places.ts";

const TextSchema = v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)));

/**
 * AI の読み取りから登録するときの、読み取りの元とモデル。モデルは読み取りの API が返した値をそのまま送る。
 *
 * 読み取りの優先（fast・accurate）から登録のときに引き直さないのは、読み直しに失敗して前の結果が残ったときに、
 * 実際に読み取ったモデルとずれるため。
 */
export const AiReadSchema = v.object({
  source: v.picklist(["page", "statement", "receipt"]),
  model: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
});

/** AI が読み取ったままの品目。フォームで直す前の値 */
const AiGuessSchema = v.object({
  /** AI が推測した内訳。決められなかったときは null */
  genreId: v.nullable(v.pipe(v.number(), v.safeInteger())),
  /** AI が読み取った品名。明細では利用先名 */
  name: TextSchema,
});

/** 支出の登録の入力 */
export const PaymentInputSchema = v.object({
  date: v.pipe(v.string(), v.isoDate()),
  fromAccountId: v.nullable(v.pipe(v.number(), v.integer())),
  placeName: TextSchema,
  placeDetail: v.optional(v.nullable(PlaceDetailSchema)),
  /** レシートから読み取った店舗の電話番号 */
  placePhone: v.optional(v.nullable(PlacePhoneSchema)),
  items: v.pipe(
    v.array(
      v.object({
        genreId: v.pipe(v.number(), v.integer()),
        name: TextSchema,
        memo: TextSchema,
        amount: v.pipe(v.number(), v.safeInteger()),
        /** AI が読み取った品目にだけ付ける。手で足した品目には付けない */
        aiGuess: v.optional(AiGuessSchema),
      }),
    ),
    v.minLength(1),
    v.maxLength(100),
  ),
  /** AI の読み取りから登録するときだけ付ける。品目の `aiGuess` と合わせて、推測の記録に使う */
  aiRead: v.optional(AiReadSchema),
});

export type PaymentInput = v.InferOutput<typeof PaymentInputSchema>;

/**
 * 前後の空白を取り除いた後の空文字を null にする。
 */
const blankToNull = (value: string | null): string | null => (value === "" ? null : value);

/**
 * AI が読み取った品目ごとに、推測の記録の行を作る。AI の読み取りからの登録でなければ空になる。
 */
const genreInferenceRows = (
  input: PaymentInput,
  placeName: string | null,
): Omit<typeof genreInferences.$inferInsert, "transactionId">[] => {
  const { aiRead } = input;
  if (aiRead === undefined) return [];
  return input.items.flatMap((item) =>
    item.aiGuess === undefined
      ? []
      : [
          {
            source: aiRead.source,
            model: aiRead.model,
            placeName,
            itemName: blankToNull(item.aiGuess.name),
            amount: item.amount,
            inferredGenreId: item.aiGuess.genreId,
            genreId: item.genreId,
          },
        ],
  );
};

/**
 * 支出を 1 件の取引として登録する。
 *
 * 店舗の作成・取引・品目を 1 回の batch で入れるので、途中で失敗しても一部の品目だけが残ることはない。
 * batch の中では作った行の ID を受け渡せないので、取引は店舗を名前で、品目は直前に入れた取引を MAX(id) で
 * 参照する（batch はトランザクションで流れ、AUTOINCREMENT なので直前の取引の ID が最大になる）。
 * receiptImageKey には、先に保存したレシートの写真のキーを渡す。
 * AI が読み取った品目は、推測した内訳と確定した内訳を同じ batch で記録する（プロンプトの改善に使う）。
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
  const itemRows = input.items.map((item, index) => ({
    transactionId: sql`(SELECT MAX(${transactions.id}) FROM ${transactions})`,
    categoryId: categoryIdByGenre.get(item.genreId) ?? null,
    genreId: item.genreId,
    name: blankToNull(item.name),
    memo: blankToNull(item.memo),
    amount: item.amount,
    sort: index,
  }));
  const insertItems = chunkInsertRows(transactionItems, itemRows).map((rows) =>
    db.insert(transactionItems).values(rows),
  );

  const inferenceRows = genreInferenceRows(input, placeName).map((row) => ({
    ...row,
    transactionId: sql`(SELECT MAX(${transactions.id}) FROM ${transactions})`,
  }));
  const insertInferences = chunkInsertRows(genreInferences, inferenceRows).map((rows) =>
    db.insert(genreInferences).values(rows),
  );

  if (placeName === null) {
    const [[created]] = await db.batch([insertTransaction, ...insertItems, ...insertInferences]);
    return created === undefined
      ? { ok: false, error: "取引を作れませんでした" }
      : { ok: true, id: created.id };
  }
  const [, , [created]] = await db.batch([
    upsertPlaceByName(db, placeName, input.placeDetail),
    rememberPlacePhone(db, placeName, input.placePhone ?? null),
    insertTransaction,
    ...insertItems,
    ...insertInferences,
  ]);
  return created === undefined
    ? { ok: false, error: "取引を作れませんでした" }
    : { ok: true, id: created.id };
};

/** 重複チェックの入力。amount は品目の金額の合計 */
export const DuplicateCheckInputSchema = v.object({
  date: v.pipe(v.string(), v.isoDate()),
  amount: v.pipe(v.number(), v.safeInteger()),
  placeName: TextSchema,
});

export type DuplicateCheckInput = v.InferOutput<typeof DuplicateCheckInputSchema>;

/** 重複の候補。amount は取引の品目の金額の合計 */
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
 * すでに登録されている支出から、重複の候補を探す。
 *
 * 日付が ±1 日で、品目の金額の合計が一致する取引を候補にする。品目の内訳や数は見ない
 * （レシートと明細で品目の分け方が違っても、同じ支払いを見つけられるようにする）。
 * 店舗名が入力されていれば、同じ店舗の取引に加えて店舗のない取引も候補にする。店舗のない取引は明細の取り込みなどで
 * 店舗が分からなかっただけかもしれないため。店舗名が空なら店舗では絞らない。
 */
export const findDuplicates = async (
  db: LedgerDb,
  input: DuplicateCheckInput,
): Promise<DuplicateCandidate[]> => {
  const placeName = blankToNull(input.placeName);
  const total = sql<number>`SUM(${transactionItems.amount})`.mapWith(Number);
  return db
    .select({
      transactionId: transactions.id,
      date: transactions.date,
      amount: total,
      placeName: places.name,
    })
    .from(transactions)
    .innerJoin(transactionItems, eq(transactionItems.transactionId, transactions.id))
    .leftJoin(places, eq(places.id, transactions.placeId))
    .where(
      and(
        eq(transactions.mode, "payment"),
        between(transactions.date, shiftDate(input.date, -1), shiftDate(input.date, 1)),
        placeName === null
          ? undefined
          : or(eq(places.name, placeName), isNull(transactions.placeId)),
      ),
    )
    .groupBy(transactions.id)
    .having(eq(total, input.amount))
    .orderBy(asc(transactions.date), asc(transactions.id));
};
