import { sql } from "void/db";
import {
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "void/schema-d1";
import type { ColumnMapping } from "../src/import/statementCsvEvents.ts";

/**
 * 作成・更新日時（ISO 8601、UTC、ミリ秒まで）。
 *
 * SQL の既定値と `$onUpdate` の値を同じ形式にそろえ、文字列のまま並べ替えられるようにする。
 */
const timestamps = () => ({
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString()),
});

/** マスタに共通する並び順とアーカイブ。参照されているマスタは削除せずアーカイブする */
const masterColumns = () => ({
  sort: integer("sort").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

/** 支払元・入金先になる口座 */
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  /** AI の読み取りに渡す、この口座についての補足 */
  aiHint: text("ai_hint"),
  ...masterColumns(),
  ...timestamps(),
});

/** カテゴリ（大分類）。支出と収入で別に持ち、同じ名前があっても別のカテゴリになる */
export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mode: text("mode", { enum: ["payment", "income"] }).notNull(),
    name: text("name").notNull(),
    ...masterColumns(),
    ...timestamps(),
  },
  (t) => [unique("categories_mode_name_unique").on(t.mode, t.name)],
);

/** カテゴリの内訳 */
export const genres = sqliteTable(
  "genres",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    ...masterColumns(),
    ...timestamps(),
  },
  (t) => [
    unique("genres_category_name_unique").on(t.categoryId, t.name),
    // 品目の (genre_id, category_id) を複合外部キーで参照し、内訳と親カテゴリの組み合わせを DB で保証するため
    uniqueIndex("genres_id_category_unique").on(t.id, t.categoryId),
  ],
);

/**
 * 店舗・取引先。支出のお店と収入の支払元の両方を入れる。支店は別の店舗にし、chain でまとめて見る。
 *
 * address 以降は OpenPOI の施設から作ったときだけ入る。OpenPOI には施設の ID がなく後から引き直せないので、
 * 使っていない項目も含めて、出典（licenses・attributions）と一緒に手元へ写して持つ。
 */
export const places = sqliteTable("places", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  chain: text("chain"),
  address: text("address"),
  lng: real("lng"),
  lat: real("lat"),
  poiCategory: text("poi_category"),
  poiLicenses: text("poi_licenses", { mode: "json" }).$type<string[]>(),
  poiAttributions: text("poi_attributions", { mode: "json" }).$type<string[]>(),
  /** AI の読み取りで同じ店と見なす別の表記。レシートや明細に出てくる書き方を入れる */
  aliases: text("aliases", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  /** AI の読み取りに渡す、この店についての補足 */
  aiHint: text("ai_hint"),
  /** レシートに印字された電話番号（数字だけ）。読み取りで既存の店舗に紐付けるのに使い、登録のたびに覚え直す */
  phone: text("phone"),
  ...masterColumns(),
  ...timestamps(),
});

/**
 * 取り込みの記録。総入れ替えや取り消しのときに取り込み単位で取引を探す
 *
 * account_id は履歴 CSV の口座。口座ごとの前回の取り込みを出すのに使うだけなので、口座の整理を妨げないよう
 * 外部キーにせず読むときに確かめる。Zaim の CSV は複数の口座をまとめて含むので null にする。
 */
export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source", { enum: ["zaim_csv", "statement_csv"] }).notNull(),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull(),
  accountId: integer("account_id"),
  importedAt: text("imported_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

/**
 * 取引。拡張機能の 1 回の登録、Zaim のレシート 1 枚に当たる。
 *
 * 口座の向きは振替・残高調整でもそろえ、from は残高が減る口座、to は増える口座にする。
 * 合計金額は品目の和なので持たない。receipt_image_key はレシートの写真から登録したときの R2 のキー。
 * advance_amount は支出のうち立替の額。残高や明細との突合が全額で合うよう、品目の金額は減らさない。
 * is_favorite はよく使う取引の印。手入力の登録で雛形にする。
 */
export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    mode: text("mode", { enum: ["payment", "income", "transfer", "adjustment"] }).notNull(),
    fromAccountId: integer("from_account_id").references(() => accounts.id, {
      onDelete: "restrict",
    }),
    toAccountId: integer("to_account_id").references(() => accounts.id, {
      onDelete: "restrict",
    }),
    placeId: integer("place_id").references(() => places.id, { onDelete: "restrict" }),
    aggregation: text("aggregation", { enum: ["always", "never", "yearly_only"] })
      .notNull()
      .default("always"),
    source: text("source", { enum: ["manual", "zaim_csv", "statement_csv"] }).notNull(),
    importBatchId: integer("import_batch_id").references(() => importBatches.id, {
      onDelete: "restrict",
    }),
    receiptImageKey: text("receipt_image_key"),
    advanceAmount: integer("advance_amount").notNull().default(0),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    ...timestamps(),
  },
  (t) => [index("transactions_date_idx").on(t.date), index("transactions_place_idx").on(t.placeId)],
);

/**
 * 品目。金額は符号付きで、レシート内の値引きは負の品目として持つ。
 *
 * is_advance_target は立替の対象の印。取引のどの品目にも印がなければ、全品目が対象になる。
 */
export const transactionItems = sqliteTable(
  "transaction_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "restrict" }),
    genreId: integer("genre_id"),
    name: text("name"),
    memo: text("memo"),
    amount: integer("amount").notNull(),
    isAdvanceTarget: integer("is_advance_target", { mode: "boolean" }).notNull().default(false),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    index("transaction_items_transaction_idx").on(t.transactionId),
    index("transaction_items_genre_idx").on(t.genreId),
    // genre_id が null のときは照合されないので、内訳のない品目はカテゴリだけを持てる
    foreignKey({
      name: "transaction_items_genre_fk",
      columns: [t.genreId, t.categoryId],
      foreignColumns: [genres.id, genres.categoryId],
    }).onDelete("restrict"),
  ],
);

/**
 * 立替の支出と、その分の入金である収入の紐付け。amount は収入からその支出へ充てる額。
 *
 * まとめての入金と別々の入金の両方があるので多対多にする。取り込みの総入れ替えを止めないよう、外部キーは cascade にし、
 * 紐付いた支出の削除を止めるのはアプリ側で行う。
 */
export const advanceReimbursements = sqliteTable(
  "advance_reimbursements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paymentTransactionId: integer("payment_transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    incomeTransactionId: integer("income_transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
  },
  (t) => [
    unique("advance_reimbursements_payment_income_unique").on(
      t.paymentTransactionId,
      t.incomeTransactionId,
    ),
    index("advance_reimbursements_income_idx").on(t.incomeTransactionId),
  ],
);

/**
 * 履歴 CSV の形式。登録で確かめられた列の割り当てを見出しごとに覚え、次から AI の判定を省く。
 *
 * account_id は読み取りの初期値に使うだけなので、外部キーにせず読むときに確かめる。
 */
export const statementCsvFormats = sqliteTable("statement_csv_formats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** 見出しの行のセルの配列を JSON にした文字列 */
  header: text("header").notNull().unique(),
  mapping: text("mapping", { mode: "json" }).$type<ColumnMapping>().notNull(),
  accountId: integer("account_id"),
  ...timestamps(),
});

/**
 * 履歴 CSV の利用先の分類。登録で確かめられた分類を覚え、次から AI の分類を省く。
 *
 * 店舗の統合や口座の整理を妨げないよう、外部キーにせず読むときに今の台帳で確かめる。
 */
export const statementCsvDescriptions = sqliteTable("statement_csv_descriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** `descriptionKey` で揃えた、向き付きの利用先の表記 */
  key: text("key").notNull().unique(),
  mode: text("mode", { enum: ["payment", "income", "transfer"] }).notNull(),
  placeName: text("place_name"),
  genreId: integer("genre_id"),
  categoryId: integer("category_id"),
  counterAccountId: integer("counter_account_id"),
  ...timestamps(),
});

/**
 * AI が推測した品目の内訳と、登録のときに確定した内訳の記録。プロンプトの改善に使う。
 *
 * 正答率も出せるよう、AI が読み取った品目は推測どおりに登録したものも残す。手で変えた品目は
 * `inferred_genre_id IS NOT genre_id` で絞れる。
 * 取引の編集は品目を入れ直すので、品目ではなく取引に結びつけ、品名と店舗名は登録のときの値を写して持つ。
 * 記録のために内訳を消せなくならないよう、また AI が候補にない ID を返しても残せるよう、内訳には外部キーを張らない。
 */
export const genreInferences = sqliteTable(
  "genre_inferences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    /**
     * 読み取りの元。page は拡張機能でのページ、statement は明細のページ、receipt はレシートの写真、
     * statement_csv は履歴 CSV
     */
    source: text("source", { enum: ["page", "statement", "receipt", "statement_csv"] }).notNull(),
    /** 読み取ったモデル */
    model: text("model").notNull(),
    /** 登録した店舗の名前 */
    placeName: text("place_name"),
    /** AI が読み取った品名。明細と履歴 CSV では利用先の表記 */
    itemName: text("item_name"),
    amount: integer("amount").notNull(),
    /** AI が推測した内訳。決められなかったときは null */
    inferredGenreId: integer("inferred_genre_id"),
    /** 登録のときに確定した内訳 */
    genreId: integer("genre_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [index("genre_inferences_transaction_idx").on(t.transactionId)],
);
