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
  ...masterColumns(),
  ...timestamps(),
});

/** 取り込みの記録。総入れ替えや取り消しのときに取り込み単位で取引を探す */
export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source", { enum: ["zaim_csv"] }).notNull(),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull(),
  importedAt: text("imported_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

/**
 * 取引。拡張機能の 1 回の登録、Zaim のレシート 1 枚に当たる。
 *
 * 口座の向きは振替・残高調整でもそろえ、from は残高が減る口座、to は増える口座にする。
 * 合計金額は品目の和なので持たない。receipt_image_key はレシートの写真から登録したときの R2 のキー。
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
    source: text("source", { enum: ["manual", "zaim_csv"] }).notNull(),
    importBatchId: integer("import_batch_id").references(() => importBatches.id, {
      onDelete: "restrict",
    }),
    receiptImageKey: text("receipt_image_key"),
    ...timestamps(),
  },
  (t) => [index("transactions_date_idx").on(t.date), index("transactions_place_idx").on(t.placeId)],
);

/** 品目。金額は符号付きで、レシート内の値引きは負の品目として持つ */
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
