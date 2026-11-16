import * as v from "valibot";

/** Zaim のファイル入出力で出力される CSV の見出し（この順で並ぶ） */
export const ZAIM_CSV_HEADER = [
  "日付",
  "方法",
  "カテゴリ",
  "カテゴリの内訳",
  "支払元",
  "入金先",
  "品目",
  "メモ",
  "お店",
  "通貨",
  "収入",
  "支出",
  "振替",
  "残高調整",
  "通貨変換前の金額",
  "集計の設定",
] as const;

type ZaimCsvColumn = (typeof ZAIM_CSV_HEADER)[number];

/** CSV の 1 行（見出しをキーにした文字列） */
export type ZaimCsvRecord = Record<ZaimCsvColumn, string>;

type TransactionMode = "payment" | "income" | "transfer" | "adjustment";
type Aggregation = "always" | "never" | "yearly_only";
type CategoryMode = "payment" | "income";

/** 検証と正規化を済ませた CSV の 1 行 */
export type ZaimRow = {
  /** CSV ファイル上の行番号（見出しが 1 行目） */
  line: number;
  date: string;
  mode: TransactionMode;
  category: { mode: CategoryMode; name: string; genre: string | null } | null;
  fromAccount: string | null;
  toAccount: string | null;
  itemName: string | null;
  memo: string | null;
  place: string | null;
  amount: number;
  aggregation: Aggregation;
};

export type ZaimRowError = { line: number; message: string };

/** 取り込む品目 */
export type ImportItem = {
  category: ZaimRow["category"];
  name: string | null;
  memo: string | null;
  amount: number;
};

/** 取り込む取引（レシートにまとめた後の単位） */
export type ImportTransaction = {
  date: string;
  mode: TransactionMode;
  fromAccount: string | null;
  toAccount: string | null;
  place: string | null;
  aggregation: Aggregation;
  items: ImportItem[];
};

const MODE_BY_METHOD = {
  payment: "payment",
  income: "income",
  transfer: "transfer",
  balance: "adjustment",
} as const satisfies Record<string, TransactionMode>;

/** 方法ごとに金額が入る列 */
const AMOUNT_COLUMN_BY_METHOD = {
  payment: "支出",
  income: "収入",
  transfer: "振替",
  balance: "残高調整",
} as const satisfies Record<keyof typeof MODE_BY_METHOD, ZaimCsvColumn>;

const AMOUNT_COLUMNS = ["収入", "支出", "振替", "残高調整"] as const satisfies ZaimCsvColumn[];

const AGGREGATION_BY_LABEL = {
  常に集計に含める: "always",
  集計に含めない: "never",
  年の集計にのみ含める: "yearly_only",
} as const satisfies Record<string, Aggregation>;

const AmountSchema = v.pipe(
  v.string(),
  v.regex(/^(-?\d+)?$/, "金額が整数ではありません"),
  v.transform((value) => (value === "" ? 0 : Number(value))),
);

const RecordSchema = v.object({
  日付: v.pipe(v.string(), v.isoDate("日付が YYYY-MM-DD ではありません")),
  方法: v.picklist(
    Object.keys(MODE_BY_METHOD) as (keyof typeof MODE_BY_METHOD)[],
    "方法が不明です",
  ),
  通貨: v.literal("JPY", "JPY 以外の通貨は取り込めません"),
  集計の設定: v.picklist(
    Object.keys(AGGREGATION_BY_LABEL) as (keyof typeof AGGREGATION_BY_LABEL)[],
    "集計の設定が不明です",
  ),
  収入: AmountSchema,
  支出: AmountSchema,
  振替: AmountSchema,
  残高調整: AmountSchema,
});

/**
 * Zaim が「なし」を表す `-` と空文字を null にする。
 */
const orNull = (value: string): string | null => (value === "" || value === "-" ? null : value);

/**
 * マスタの名前を取り出す。前後の空白だけが違う名前を別のマスタにしないよう trim する。
 */
const masterName = (value: string): string | null => orNull(value.trim());

/**
 * 内訳の名前から親カテゴリの名前を引く関数を作る。
 *
 * Zaim にはカテゴリが `-` なのに内訳だけ入っている支出がある（カテゴリを消した後の記録など）。
 * 内訳がほかの行でただ 1 つのカテゴリの下にしか出てこなければ、そのカテゴリを補う。
 * 複数のカテゴリに同じ名前の内訳があるときは決められないので null を返す。
 */
const createParentCategoryLookup = (
  records: ZaimCsvRecord[],
): ((genre: string) => string | null) => {
  const parents = new Map<string, Set<string>>();
  // 内訳があるのは支出のカテゴリだけ（振替のカテゴリも支出のもの）なので、収入の行は見ない
  for (const record of records.filter((r) => r.方法 !== "income")) {
    const category = masterName(record.カテゴリ);
    const genre = masterName(record.カテゴリの内訳);
    if (category === null || genre === null) continue;
    parents.set(genre, (parents.get(genre) ?? new Set()).add(category));
  }
  return (genre) => {
    const candidates = parents.get(genre);
    return candidates?.size === 1 ? ([...candidates][0] ?? null) : null;
  };
};

/**
 * 1 行を検証して正規化する。方法ごとに、口座・カテゴリ・金額の列の組み合わせが想定どおりかも確かめる。
 */
const parseRecord = (
  record: ZaimCsvRecord,
  line: number,
  parentCategoryOf: (genre: string) => string | null,
): ZaimRow | ZaimRowError => {
  const result = v.safeParse(RecordSchema, record);
  if (!result.success) {
    return { line, message: result.issues.map((issue) => issue.message).join(", ") };
  }
  const parsed = result.output;
  const method = parsed.方法;
  const mode = MODE_BY_METHOD[method];
  const amountColumn = AMOUNT_COLUMN_BY_METHOD[method];
  const fail = (message: string): ZaimRowError => ({ line, message });

  const otherAmounts = AMOUNT_COLUMNS.filter((column) => column !== amountColumn);
  if (otherAmounts.some((column) => parsed[column] !== 0)) {
    return fail(`${method} の行に ${amountColumn} 以外の金額が入っています`);
  }

  const fromAccount = masterName(record.支払元);
  const toAccount = masterName(record.入金先);
  const genreName = masterName(record.カテゴリの内訳);
  const categoryName =
    masterName(record.カテゴリ) ?? (genreName === null ? null : parentCategoryOf(genreName));

  if (mode === "payment" && toAccount !== null) return fail("支出の行に入金先が入っています");
  if (mode === "income" && fromAccount !== null) return fail("収入の行に支払元が入っています");
  if (mode === "income" && genreName !== null) return fail("収入の行に内訳が入っています");
  if (mode === "transfer" && (fromAccount === null || toAccount === null)) {
    return fail("振替の行に支払元か入金先がありません");
  }
  if (mode === "adjustment" && (fromAccount === null) === (toAccount === null)) {
    return fail("残高調整の行は支払元か入金先のどちらか一方だけに口座が必要です");
  }
  if (mode === "adjustment" && categoryName !== null)
    return fail("残高調整の行にカテゴリが入っています");
  if (categoryName === null && genreName !== null) {
    return fail("カテゴリのない行に内訳が入っていて、内訳から親カテゴリを決められません");
  }

  // 振替のカテゴリは Zaim では支出のカテゴリから選ぶので、支出のカテゴリとして扱う
  const categoryMode: CategoryMode = mode === "income" ? "income" : "payment";

  return {
    line,
    date: parsed.日付,
    mode,
    category:
      categoryName === null ? null : { mode: categoryMode, name: categoryName, genre: genreName },
    fromAccount,
    toAccount,
    itemName: orNull(record.品目),
    memo: orNull(record.メモ),
    place: masterName(record.お店),
    amount: parsed[amountColumn],
    aggregation: AGGREGATION_BY_LABEL[parsed.集計の設定],
  };
};

/**
 * CSV の行をすべて検証する。1 行でもエラーがあれば、取り込まずに直せるようエラーだけを返す。
 */
export const parseZaimRecords = (
  records: ZaimCsvRecord[],
): { ok: true; rows: ZaimRow[] } | { ok: false; errors: ZaimRowError[] } => {
  const rows: ZaimRow[] = [];
  const errors: ZaimRowError[] = [];
  const parentCategoryOf = createParentCategoryLookup(records);
  records.forEach((record, index) => {
    // 見出しが 1 行目なので、データの 1 件目は 2 行目
    const parsed = parseRecord(record, index + 2, parentCategoryOf);
    if ("message" in parsed) errors.push(parsed);
    else rows.push(parsed);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
};

/**
 * 同じレシートの品目として 1 つの取引にまとめてよいか判定する。
 *
 * Zaim でレシートとして入れた記録は連続した行になるので、直前の取引と日付・お店・支払元・集計の設定が
 * 同じ支出だけをまとめる。お店のない行は別々の買い物と区別できないのでまとめない。
 */
const belongsToReceipt = (transaction: ImportTransaction, row: ZaimRow): boolean =>
  transaction.mode === "payment" &&
  row.mode === "payment" &&
  row.place !== null &&
  transaction.place === row.place &&
  transaction.date === row.date &&
  transaction.fromAccount === row.fromAccount &&
  transaction.aggregation === row.aggregation;

/**
 * 行を取引にまとめる。連続する同じレシートの行は 1 つの取引の品目になり、それ以外は 1 行 1 取引になる。
 */
export const groupIntoTransactions = (rows: ZaimRow[]): ImportTransaction[] => {
  const transactions: ImportTransaction[] = [];
  for (const row of rows) {
    const item: ImportItem = {
      category: row.category,
      name: row.itemName,
      memo: row.memo,
      amount: row.amount,
    };
    const last = transactions.at(-1);
    if (last !== undefined && belongsToReceipt(last, row)) {
      last.items.push(item);
      continue;
    }
    transactions.push({
      date: row.date,
      mode: row.mode,
      fromAccount: row.fromAccount,
      toAccount: row.toAccount,
      place: row.place,
      aggregation: row.aggregation,
      items: [item],
    });
  }
  return transactions;
};

/**
 * SQL の文字列リテラルにする。null は NULL にする。
 */
const quote = (value: string | null): string =>
  value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;

const accountRef = (name: string | null): string =>
  name === null ? "NULL" : `(SELECT id FROM accounts WHERE name = ${quote(name)})`;

const placeRef = (name: string | null): string =>
  name === null ? "NULL" : `(SELECT id FROM places WHERE name = ${quote(name)})`;

/**
 * 品目のカテゴリの参照。内訳のある品目はカテゴリを内訳の親から引くので持たせない。
 */
const categoryRef = (category: ZaimRow["category"]): string =>
  category === null || category.genre !== null
    ? "NULL"
    : `(SELECT id FROM categories WHERE mode = ${quote(category.mode)} AND name = ${quote(category.name)})`;

const genreRef = (category: ZaimRow["category"]): string =>
  category === null || category.genre === null
    ? "NULL"
    : `(SELECT g.id FROM genres g JOIN categories c ON c.id = g.category_id WHERE c.mode = ${quote(category.mode)} AND c.name = ${quote(category.name)} AND g.name = ${quote(category.genre)})`;

/**
 * 値を重複なく、最初に出てきた順で返す。
 */
const uniqueBy = <T>(values: T[], key: (value: T) => string): T[] => [
  ...new Map(values.map((value) => [key(value), value])).values(),
];

/**
 * 取り込みの SQL 文を、流す順に作る。
 *
 * 取り込みは総入れ替えなので、前回までに取り込んだ取引を消してから入れ直す。手入力の取引とマスタは残す。
 * マスタは名前で INSERT OR IGNORE するので、何度流しても既存の ID は変わらない。
 * 取引の ID を変数に持てないので、品目は直前に入れた取引を MAX(id) で参照する（AUTOINCREMENT なので
 * 新しい行ほど ID が大きい）。last_insert_rowid() は 2 件目以降の品目で品目の ID になってしまうため使わない。
 */
export const buildImportStatements = (
  transactions: ImportTransaction[],
  batch: { fileName: string; rowCount: number },
): string[] => {
  const items = transactions.flatMap((transaction) => transaction.items);
  const categories = uniqueBy(
    items.flatMap((item) => (item.category === null ? [] : [item.category])),
    (category) => JSON.stringify([category.mode, category.name]),
  );
  const genres = uniqueBy(
    items.flatMap((item) => (item.category?.genre == null ? [] : [item.category])),
    (category) => JSON.stringify([category.mode, category.name, category.genre]),
  );
  const accountNames = uniqueBy(
    transactions.flatMap((transaction) =>
      [transaction.fromAccount, transaction.toAccount].filter((name) => name !== null),
    ),
    (name) => name,
  );
  const placeNames = uniqueBy(
    transactions.flatMap((transaction) => (transaction.place === null ? [] : [transaction.place])),
    (name) => name,
  );

  return [
    "DELETE FROM transactions WHERE source = 'zaim_csv'",
    `INSERT INTO import_batches (source, file_name, row_count) VALUES ('zaim_csv', ${quote(batch.fileName)}, ${batch.rowCount})`,
    ...accountNames.map((name) => `INSERT OR IGNORE INTO accounts (name) VALUES (${quote(name)})`),
    ...categories.map(
      (category) =>
        `INSERT OR IGNORE INTO categories (mode, name) VALUES (${quote(category.mode)}, ${quote(category.name)})`,
    ),
    ...genres.map(
      (category) =>
        `INSERT OR IGNORE INTO genres (category_id, name) SELECT id, ${quote(category.genre)} FROM categories WHERE mode = ${quote(category.mode)} AND name = ${quote(category.name)}`,
    ),
    ...placeNames.map((name) => `INSERT OR IGNORE INTO places (name) VALUES (${quote(name)})`),
    ...transactions.flatMap((transaction) => [
      `INSERT INTO transactions (date, mode, from_account_id, to_account_id, place_id, aggregation, source, import_batch_id) VALUES (${quote(transaction.date)}, ${quote(transaction.mode)}, ${accountRef(transaction.fromAccount)}, ${accountRef(transaction.toAccount)}, ${placeRef(transaction.place)}, ${quote(transaction.aggregation)}, 'zaim_csv', (SELECT MAX(id) FROM import_batches))`,
      ...transaction.items.map(
        (item, index) =>
          `INSERT INTO transaction_items (transaction_id, category_id, genre_id, name, memo, amount, sort) VALUES ((SELECT MAX(id) FROM transactions), ${categoryRef(item.category)}, ${genreRef(item.category)}, ${quote(item.name)}, ${quote(item.memo)}, ${item.amount}, ${index})`,
      ),
    ]),
  ];
};

/**
 * 取り込みの SQL を 1 つのファイルの中身にする（`void db execute --file` 向け）。
 */
export const buildImportSql = (
  transactions: ImportTransaction[],
  batch: { fileName: string; rowCount: number },
): string => `${buildImportStatements(transactions, batch).join(";\n")};\n`;

/**
 * SQL 文を size 件ずつに分ける（`cf d1 raw --batch` 向け）。
 *
 * D1 はバッチごとにトランザクションで流すので、1 つのバッチの中で失敗すればそのバッチは入らない。
 * バッチをまたいでは戻らないが、取り込みは総入れ替えなので、失敗したら最初から流し直せばよい。
 */
export const chunkStatements = (statements: string[], size: number): string[][] =>
  Array.from({ length: Math.ceil(statements.length / size) }, (_, i) =>
    statements.slice(i * size, (i + 1) * size),
  );

/** 方法・月ごとの件数と合計。取り込み前の CSV と取り込み後の台帳を突き合わせるのに使う */
export type ImportSummaryRow = {
  mode: TransactionMode;
  month: string;
  itemCount: number;
  total: number;
};

/**
 * 行を方法・月ごとに集計する。並びは方法、月の順。
 */
export const summarizeRows = (rows: ZaimRow[]): ImportSummaryRow[] => {
  const summary = new Map<string, ImportSummaryRow>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const key = `${row.mode} ${month}`;
    const current = summary.get(key) ?? { mode: row.mode, month, itemCount: 0, total: 0 };
    summary.set(key, {
      ...current,
      itemCount: current.itemCount + 1,
      total: current.total + row.amount,
    });
  }
  return [...summary.values()].sort(
    (a, b) => a.mode.localeCompare(b.mode) || a.month.localeCompare(b.month),
  );
};

/** 台帳側で summarizeRows と同じ集計をする SQL */
export const SUMMARY_SQL = `SELECT t.mode AS mode, substr(t.date, 1, 7) AS month, COUNT(*) AS itemCount, SUM(i.amount) AS total
FROM transactions t JOIN transaction_items i ON i.transaction_id = t.id
WHERE t.source = 'zaim_csv'
GROUP BY t.mode, month
ORDER BY t.mode, month`;
