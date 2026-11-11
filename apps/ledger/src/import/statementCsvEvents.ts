/**
 * 履歴 CSV の読み取りの結果を、サーバーから画面へ順に送る NDJSON の形。
 *
 * 画面のバンドルにも入るので、CSV のパーサーに依存しないこのファイルに置く。
 */
import * as v from "valibot";

/** CSV の列の割り当て。列と行の番号は 0 始まり */
export const ColumnMappingSchema = v.strictObject({
  /** 最初の利用の行。見出しや口座情報の行はこれより前にある */
  firstDataRow: v.number(),
  dateColumn: v.number(),
  /** 利用先や摘要の列。複数あれば空白でつなぐ */
  descriptionColumns: v.array(v.number()),
  /** 1 つの列に符号付きで金額が入る形式の列。出金と入金で列が分かれていれば null */
  amountColumn: v.nullable(v.number()),
  /** `amountColumn` の正の値が表す向き */
  amountPositiveMeans: v.picklist(["outflow", "inflow"]),
  outflowColumn: v.nullable(v.number()),
  inflowColumn: v.nullable(v.number()),
});

export type ColumnMapping = v.InferOutput<typeof ColumnMappingSchema>;

/** 見出しの行（JSON の文字列）の長さの上限。これより長い行は見出しと見なさず、形式を覚えない */
export const FORMAT_HEADER_MAX_CHARS = 5000;

/** 登録のときに覚える CSV の形式 */
export const StatementCsvFormatSchema = v.object({
  /** 見出しの行のセルの配列を JSON にした文字列。同じ形式の CSV を見分けるのに使う */
  header: v.pipe(v.string(), v.maxLength(FORMAT_HEADER_MAX_CHARS)),
  mapping: ColumnMappingSchema,
});

export type StatementCsvFormat = v.InferOutput<typeof StatementCsvFormatSchema>;

/** 列の読み取りの結果。画面で確かめるために送る */
const ReadColumnsSchema = v.object({
  mapping: ColumnMappingSchema,
  /** 利用の行の直前の行。見出しのない CSV は null */
  header: v.nullable(v.array(v.string())),
  /** 最初の利用の行 */
  sampleRow: v.array(v.string()),
});

export type StatementCsvReadColumns = v.InferOutput<typeof ReadColumnsSchema>;

/** 利用先の分類 */
const RowClassificationSchema = v.object({
  mode: v.picklist(["payment", "income", "transfer"]),
  placeName: v.nullable(v.string()),
  genreId: v.nullable(v.number()),
  categoryId: v.nullable(v.number()),
  counterAccountId: v.nullable(v.number()),
});

export type RowClassification = v.InferOutput<typeof RowClassificationSchema>;

/** 行に割り当てた登録済みの取引 */
const RegisteredSchema = v.nullable(
  v.object({
    transactionId: v.number(),
    date: v.string(),
    amount: v.number(),
    placeName: v.nullable(v.string()),
  }),
);

/** 読み取った 1 行 */
const ReadRowSchema = v.object({
  ...RowClassificationSchema.entries,
  line: v.number(),
  date: v.string(),
  description: v.string(),
  direction: v.picklist(["out", "in"]),
  amount: v.number(),
  registered: RegisteredSchema,
  /** AI の分類を待っている行。分類は後の `classified` で届く */
  pending: v.boolean(),
});

export type StatementCsvReadResultRow = v.InferOutput<typeof ReadRowSchema>;

/** AI の分類が届いた 1 行 */
const ClassifiedRowSchema = v.object({
  ...RowClassificationSchema.entries,
  line: v.number(),
  registered: RegisteredSchema,
  /** AI が分類を返さず、既定の分類のままの行なら false */
  classified: v.boolean(),
});

export type StatementCsvClassifiedRow = v.InferOutput<typeof ClassifiedRowSchema>;

/** 読み取りの結果として順に届く出来事 */
const ReadEventSchema = v.variant("type", [
  v.object({
    type: v.literal("rows"),
    /** 分類に使うモデル。登録のときに推測の記録へ残す */
    model: v.string(),
    accountId: v.nullable(v.number()),
    skippedCount: v.number(),
    /** 登録のときに覚える形式。見出しのない CSV は null */
    format: v.nullable(StatementCsvFormatSchema),
    /** 覚えていた形式で列を読んだか */
    formatKnown: v.boolean(),
    columns: ReadColumnsSchema,
    rows: v.array(ReadRowSchema),
  }),
  v.object({ type: v.literal("classified"), rows: v.array(ClassifiedRowSchema) }),
  v.object({ type: v.literal("error"), message: v.string() }),
  v.object({ type: v.literal("done") }),
]);

export type StatementCsvReadEvent = v.InferOutput<typeof ReadEventSchema>;

/**
 * 届いた本文を行ごとに区切り、出来事を順に返す。チャンクの切れ目は行や文字の途中にも来る。
 */
export const readStatementCsvEvents = async function* (
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StatementCsvReadEvent> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line !== "") yield v.parse(ReadEventSchema, JSON.parse(line));
      }
    }
  } finally {
    reader.releaseLock();
  }
};
