/**
 * 履歴 CSV から読み取った行の一括登録。
 */
import { and, asc, eq, isNotNull, max, sql, type SQL } from "drizzle-orm";
import * as v from "valibot";
import {
  accounts,
  categories,
  genreInferences,
  genres,
  importBatches,
  places,
  statementCsvDescriptions,
  statementCsvFormats,
  transactionItems,
  transactions,
} from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { descriptionKey } from "../import/statementCsv.ts";
import {
  ColumnMappingSchema,
  StatementCsvFormatSchema,
  type RowClassification,
  type StatementCsvFormat,
} from "../import/statementCsvEvents.ts";
import { upsertPlaceByName } from "./places.ts";

/** 1 回の登録で受け付ける行数の上限 */
const REGISTER_ROWS_MAX = 500;

const IdSchema = v.pipe(v.number(), v.integer());
const DateSchema = v.pipe(v.string(), v.isoDate());
const TextSchema = v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)));
const PositiveAmountSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1));
/** 明細の利用先の表記。分類を覚えるのに使う */
const DescriptionSchema = v.optional(v.pipe(v.string(), v.maxLength(200)));

/** 一括登録の入力 */
export const StatementCsvRegisterSchema = v.object({
  fileName: v.pipe(v.string(), v.maxLength(200)),
  /** CSV の口座。支出の支払元、収入の入金先、振替の片方になる */
  accountId: IdSchema,
  /** 読み取りで使った形式。登録できた結果なので、次の読み取りのために覚える */
  format: v.optional(v.nullable(StatementCsvFormatSchema)),
  rows: v.pipe(
    v.array(
      v.variant("mode", [
        v.object({
          mode: v.literal("payment"),
          description: DescriptionSchema,
          date: DateSchema,
          /** 返金は負の金額にする */
          amount: v.pipe(v.number(), v.safeInteger()),
          placeName: TextSchema,
          name: TextSchema,
          genreId: IdSchema,
          /**
           * AI が分類した行にだけ付ける、AI が推測した内訳。覚えていた分類の行や、AI の分類が届く前に手で直した行には付けない。
           * AI が支出と分類しなかった行や、内訳を決められなかった行は null
           */
          aiGuess: v.optional(v.object({ genreId: v.nullable(IdSchema) })),
        }),
        v.object({
          mode: v.literal("income"),
          description: DescriptionSchema,
          date: DateSchema,
          amount: PositiveAmountSchema,
          placeName: TextSchema,
          name: TextSchema,
          categoryId: v.nullable(IdSchema),
        }),
        v.object({
          mode: v.literal("transfer"),
          description: DescriptionSchema,
          date: DateSchema,
          amount: PositiveAmountSchema,
          name: TextSchema,
          /** CSV の口座から見たお金の向き */
          direction: v.picklist(["out", "in"]),
          counterAccountId: IdSchema,
        }),
      ]),
    ),
    v.minLength(1),
    v.maxLength(REGISTER_ROWS_MAX),
  ),
  /** 読み取りの API が返した、分類に使ったモデル。行の `aiGuess` と合わせて、推測の記録に使う */
  aiModel: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
});

export type StatementCsvRegisterInput = v.InferOutput<typeof StatementCsvRegisterSchema>;
type RegisterRow = StatementCsvRegisterInput["rows"][number];

/**
 * 前後の空白を取り除いた後の空文字を null にする。
 */
const blankToNull = (value: string | null): string | null => (value === "" ? null : value);

/**
 * 店舗を持てる行の店舗名を返す。
 */
const placeNameOf = (row: RegisterRow): string | null =>
  row.mode === "transfer" ? null : blankToNull(row.placeName);

/**
 * 入力の内訳・カテゴリ・口座が台帳にあるかを確かめ、なければ理由を返す。あれば内訳の親カテゴリを返す。
 *
 * 行ごとの ID を IN で聞くと D1 のバインド数の上限に当たりうるので、マスタを丸ごと読んで照らし合わせる。
 */
const resolveMasters = async (
  db: LedgerDb,
  input: StatementCsvRegisterInput,
): Promise<{ ok: true; categoryIdByGenre: Map<number, number> } | { ok: false; error: string }> => {
  const [genreRows, incomeRows, accountRows] = await Promise.all([
    db
      .select({ id: genres.id, categoryId: genres.categoryId })
      .from(genres)
      .innerJoin(categories, eq(categories.id, genres.categoryId))
      .where(eq(categories.mode, "payment")),
    db.select({ id: categories.id }).from(categories).where(eq(categories.mode, "income")),
    db.select({ id: accounts.id }).from(accounts),
  ]);
  const categoryIdByGenre = new Map(genreRows.map((genre) => [genre.id, genre.categoryId]));
  const incomeIds = new Set(incomeRows.map((category) => category.id));
  const accountIds = new Set(accountRows.map((account) => account.id));

  if (!accountIds.has(input.accountId)) return { ok: false, error: "口座が見つかりません" };
  for (const row of input.rows) {
    if (row.mode === "payment" && !categoryIdByGenre.has(row.genreId)) {
      return { ok: false, error: `支出の内訳が見つかりません: ${row.genreId}` };
    }
    if (row.mode === "income" && row.categoryId !== null && !incomeIds.has(row.categoryId)) {
      return { ok: false, error: `収入のカテゴリが見つかりません: ${row.categoryId}` };
    }
    if (row.mode === "transfer") {
      if (!accountIds.has(row.counterAccountId)) {
        return { ok: false, error: "振替の相手の口座が見つかりません" };
      }
      if (row.counterAccountId === input.accountId) {
        return { ok: false, error: "振替の支払元と入金先は別の口座にしてください" };
      }
    }
  }
  return { ok: true, categoryIdByGenre };
};

/**
 * 行の取引の口座の向きを決める。from は残高が減る口座、to は増える口座。
 */
const accountColumns = (
  row: RegisterRow,
  accountId: number,
): { fromAccountId: number | null; toAccountId: number | null } => {
  if (row.mode === "payment") return { fromAccountId: accountId, toAccountId: null };
  if (row.mode === "income") return { fromAccountId: null, toAccountId: accountId };
  return row.direction === "out"
    ? { fromAccountId: accountId, toAccountId: row.counterAccountId }
    : { fromAccountId: row.counterAccountId, toAccountId: accountId };
};

/** 覚えている形式と分類 */
export type StatementCsvMemory = {
  formats: ReadonlyArray<StatementCsvFormat & { accountId: number | null }>;
  classifications: ReadonlyMap<string, RowClassification>;
};

/**
 * 覚えている形式と分類を読む。
 *
 * 利用先ごとに IN で聞くと D1 のバインド数の上限に当たりうるので、丸ごと読む。
 */
export const loadStatementCsvMemory = async (db: LedgerDb): Promise<StatementCsvMemory> => {
  const [formatRows, descriptionRows] = await Promise.all([
    db.select().from(statementCsvFormats),
    db.select().from(statementCsvDescriptions),
  ]);
  return {
    formats: formatRows.flatMap(({ header, mapping, accountId }) => {
      // JSON の列の中身は型で保証されないので、読めない形式は覚えていないものとして扱う
      const parsed = v.safeParse(ColumnMappingSchema, mapping);
      return parsed.success ? [{ header, mapping: parsed.output, accountId }] : [];
    }),
    classifications: new Map(
      descriptionRows.map((row) => [
        row.key,
        {
          mode: row.mode,
          placeName: row.placeName,
          genreId: row.genreId,
          categoryId: row.categoryId,
          counterAccountId: row.counterAccountId,
        },
      ]),
    ),
  };
};

/**
 * 行の、口座から見たお金の向きを返す。返金は負の金額の支出で、口座に入るお金になる。
 */
const directionOf = (row: RegisterRow): "out" | "in" => {
  if (row.mode === "transfer") return row.direction;
  if (row.mode === "income") return "in";
  return row.amount < 0 ? "in" : "out";
};

/**
 * 登録する行から、覚える分類を作る。同じ利用先が複数あれば後の行を残す。
 */
const classificationsFromRows = (
  rows: ReadonlyArray<RegisterRow>,
): Array<RowClassification & { key: string }> => {
  const byKey = new Map<string, RowClassification & { key: string }>();
  for (const row of rows) {
    if (row.description === undefined || row.description.trim() === "") continue;
    const direction = directionOf(row);
    const key = descriptionKey(row.description, direction);
    byKey.set(key, {
      key,
      mode: row.mode,
      placeName: placeNameOf(row),
      genreId: row.mode === "payment" ? row.genreId : null,
      categoryId: row.mode === "income" ? row.categoryId : null,
      counterAccountId: row.mode === "transfer" ? row.counterAccountId : null,
    });
  }
  return [...byKey.values()];
};

/**
 * 履歴 CSV の行をまとめて登録する。
 *
 * 全体を 1 回の batch で入れるので、途中で失敗しても一部の行だけが残って、やり直しで二重に登録されることはない。
 * batch の中では作った行の ID を受け渡せないので、createPayment と同じく取引は取り込みの記録を MAX(id) で、
 * 品目は直前に入れた取引を MAX(id) で参照する。
 * 形式と分類は、人が確かめた結果だけを覚えるよう、読み取りではなく登録のときに同じ batch で覚える。
 * AI が分類した支出の行は、推測した内訳と確定した内訳を同じ batch で記録する（プロンプトの改善に使う）。
 */
export const registerStatementCsv = async (
  db: LedgerDb,
  input: StatementCsvRegisterInput,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> => {
  const masters = await resolveMasters(db, input);
  if (!masters.ok) return masters;

  const lastTransactionId = sql`(SELECT MAX(${transactions.id}) FROM ${transactions})`;
  const lastBatchId: SQL<number> = sql`(SELECT MAX(${importBatches.id}) FROM ${importBatches})`;

  const placeNames = [...new Set(input.rows.flatMap((row) => placeNameOf(row) ?? []))];
  const { aiModel } = input;
  const rowStatements = input.rows.flatMap((row) => {
    const placeName = placeNameOf(row);
    const insertInference =
      aiModel === undefined || row.mode !== "payment" || row.aiGuess === undefined
        ? []
        : [
            db.insert(genreInferences).values({
              transactionId: lastTransactionId,
              source: "statement_csv",
              model: aiModel,
              placeName,
              itemName: blankToNull(row.description?.trim() ?? ""),
              amount: row.amount,
              inferredGenreId: row.aiGuess.genreId,
              genreId: row.genreId,
            }),
          ];
    return [
      db.insert(transactions).values({
        date: row.date,
        mode: row.mode,
        ...accountColumns(row, input.accountId),
        placeId:
          placeName === null
            ? null
            : sql`(SELECT ${places.id} FROM ${places} WHERE ${places.name} = ${placeName})`,
        source: "statement_csv",
        importBatchId: lastBatchId,
      }),
      db.insert(transactionItems).values({
        transactionId: lastTransactionId,
        categoryId:
          row.mode === "payment"
            ? (masters.categoryIdByGenre.get(row.genreId) ?? null)
            : row.mode === "income"
              ? row.categoryId
              : null,
        genreId: row.mode === "payment" ? row.genreId : null,
        name: blankToNull(row.name),
        amount: row.amount,
      }),
      ...insertInference,
    ];
  });

  await db.batch([
    db.insert(importBatches).values({
      source: "statement_csv",
      fileName: input.fileName,
      rowCount: input.rows.length,
      accountId: input.accountId,
    }),
    ...placeNames.map((name) => upsertPlaceByName(db, name, null)),
    ...rowStatements,
    ...(input.format == null
      ? []
      : [
          db
            .insert(statementCsvFormats)
            .values({ ...input.format, accountId: input.accountId })
            .onConflictDoUpdate({
              target: statementCsvFormats.header,
              set: {
                mapping: input.format.mapping,
                accountId: input.accountId,
                updatedAt: new Date().toISOString(),
              },
            }),
        ]),
    ...classificationsFromRows(input.rows).map(({ key, ...classification }) =>
      db
        .insert(statementCsvDescriptions)
        .values({ key, ...classification })
        .onConflictDoUpdate({
          target: statementCsvDescriptions.key,
          set: { ...classification, updatedAt: new Date().toISOString() },
        }),
    ),
  ]);
  return { ok: true, count: input.rows.length };
};

/** 口座ごとの前回の履歴 CSV の取り込み */
export type LastStatementImport = {
  accountId: number;
  accountName: string;
  /** 取り込んだ日時（ISO 8601、UTC） */
  importedAt: string;
  fileName: string;
  rowCount: number;
  /** 取り込んだ取引のうち最も新しい日付。取引がすべて消されていれば null */
  lastDate: string | null;
};

/**
 * 口座ごとに、最後の履歴 CSV の取り込みを返す。次にどこからの CSV を出せばよいか分かるよう、取り込んだ取引の最も新しい日付も返す。
 *
 * 取り込みの口座は外部キーではないので、今の台帳にない口座の取り込みは除く。並びは口座の並び順。
 */
export const listLastStatementImports = async (db: LedgerDb): Promise<LastStatementImport[]> => {
  const latestBatches = db
    .select({ id: max(importBatches.id).as("latest_id") })
    .from(importBatches)
    .where(and(eq(importBatches.source, "statement_csv"), isNotNull(importBatches.accountId)))
    .groupBy(importBatches.accountId)
    .as("latest_batches");
  const rows = await db
    .select({
      accountId: accounts.id,
      accountName: accounts.name,
      importedAt: importBatches.importedAt,
      fileName: importBatches.fileName,
      rowCount: importBatches.rowCount,
      lastDate: sql<
        string | null
      >`(SELECT MAX(${transactions.date}) FROM ${transactions} WHERE ${transactions.importBatchId} = ${importBatches.id})`,
    })
    .from(latestBatches)
    .innerJoin(importBatches, eq(importBatches.id, latestBatches.id))
    .innerJoin(accounts, eq(accounts.id, importBatches.accountId))
    .orderBy(asc(accounts.sort), asc(accounts.id));
  return rows;
};
