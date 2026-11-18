import { McpServer, type CallToolResult, type ToolAnnotations } from "@modelcontextprotocol/server";
import * as v from "valibot";
import type { LedgerDb } from "../db.ts";
import {
  AccountUpdateSchema,
  createAccount,
  moveAccount,
  setAccountArchived,
  updateAccount,
} from "../ledger/accounts.ts";
import { computeBalances } from "../ledger/balances.ts";
import {
  CategoryNameSchema,
  changeGenreCategory,
  createCategory,
  createGenre,
  GenreNameSchema,
  moveCategory,
  moveGenre,
  renameCategory,
  renameGenre,
  setCategoryArchived,
  setGenreArchived,
} from "../ledger/categories.ts";
import { isDate, isMonth, todayInTokyo } from "../ledger/dates.ts";
import { MoveOffsetSchema } from "../ledger/masterEdit.ts";
import {
  listManagedAccounts,
  listManagedCategories,
  listManagedPlaces,
  type CategoryMode,
} from "../ledger/masters.ts";
import { deleteUnusedPlace, mergePlace, PlaceUpdateSchema, updatePlace } from "../ledger/places.ts";
import { removeReceiptImage, type ReceiptImageBucket } from "../ledger/receiptImages.ts";
import { summarizeMonth, summarizeYear } from "../ledger/summary.ts";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  TransactionCreateSchema,
  TransactionUpdateSchema,
  updateTransaction,
} from "../ledger/transactionEdit.ts";
import { listTransactions } from "../ledger/transactions.ts";
import { toolSchema } from "./toolSchema.ts";

/** MCP サーバーが読み書きする先 */
export type LedgerMcpDeps = {
  db: LedgerDb;
  /** 取引を消したときにレシートの写真を消すのに使う */
  storage: Pick<ReceiptImageBucket, "delete">;
};

/** ドメイン層の書き込みの結果。作ったときは ID を、失敗すると理由の文言を持つ */
type DomainResult = { ok: true; id?: number } | { ok: false; error: string };

const IdSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1));
const ModeSchema = v.picklist<CategoryMode[]>(["payment", "income"]);
const PeriodSchema = v.pipe(
  v.string(),
  v.check(
    (value) => isMonth(value) || /^\d{4}$/.test(value),
    "期間は YYYY-MM か YYYY で指定してください",
  ),
  v.description("月（YYYY-MM）か年（YYYY）"),
);

const READ_ONLY: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};
const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};

/**
 * 値を JSON の文字列にして tool の結果にする。
 */
const jsonResult = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

/**
 * 失敗の理由を tool のエラーとして返す。
 *
 * プロトコルのエラーにせず isError の結果にするのは、理由をモデルに読ませて入力を直させるため。
 */
const errorResult = (message: string): CallToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/**
 * ドメイン層の書き込みの結果を tool の結果にする。成功したら ok 以外の値（作った ID など）を返す。
 */
const domainResult = (result: DomainResult): CallToolResult => {
  if (!result.ok) return errorResult(result.error);
  const { ok: _ok, ...rest } = result;
  return jsonResult({ ok: true, ...rest });
};

/**
 * 家計簿の参照・取引の登録・マスタの編集を tool として持つ MCP サーバーを作る。
 *
 * ステートレスに動かすので、リクエストごとに作り直す。
 */
export const createLedgerMcpServer = ({ db, storage }: LedgerMcpDeps): McpServer => {
  const server = new McpServer(
    { name: "tsuke-ledger", version: "1.0.0" },
    {
      instructions: [
        "個人の家計簿（台帳）を読み書きする。金額は円の整数。日付は日本時間の YYYY-MM-DD。",
        "取引の種類は payment（支出）・income（収入）・transfer（振替）・adjustment（残高調整）。",
        "取引を登録・編集する前に list_accounts と list_categories で口座・カテゴリ・内訳の ID を確かめる。",
        "アーカイブ済み（archived: true）の口座・カテゴリ・内訳は新しい取引に使わない。",
      ].join("\n"),
    },
  );

  // --- 参照 ---

  server.registerTool(
    "list_accounts",
    {
      title: "口座の一覧",
      description:
        "口座を並び順で返す。aiHint は明細や支払い方法からこの口座を当てるためのメモ。transferAsPayment はこの口座への振替を支出として集計するか。",
      inputSchema: toolSchema(v.object({})),
      annotations: READ_ONLY,
    },
    async () => jsonResult(await listManagedAccounts(db)),
  );

  server.registerTool(
    "list_categories",
    {
      title: "カテゴリの一覧",
      description:
        "支出か収入のカテゴリを、その中の内訳（genres）と一緒に並び順で返す。取引の品目の categoryId と genreId に使う。",
      inputSchema: toolSchema(v.object({ mode: ModeSchema })),
      annotations: READ_ONLY,
    },
    async ({ mode }) => jsonResult(await listManagedCategories(db, mode)),
  );

  server.registerTool(
    "list_places",
    {
      title: "店舗の一覧",
      description:
        "店舗を、別名（aliases）・チェーン・住所・使った回数と一緒に返す。取引には店舗の名前（placeName）で指定する。",
      inputSchema: toolSchema(v.object({})),
      annotations: READ_ONLY,
    },
    async () => jsonResult(await listManagedPlaces(db)),
  );

  server.registerTool(
    "list_transactions",
    {
      title: "取引の一覧",
      description:
        "期間（月か年）の取引を日付の新しい順に、品目・合計・口座名・店舗名と一緒に返す。種類・口座・カテゴリ・内訳・店舗・チェーン・立替で絞り込める。",
      inputSchema: toolSchema(
        v.object({
          period: PeriodSchema,
          mode: v.optional(v.picklist(["payment", "income", "transfer", "adjustment"])),
          accountId: v.optional(v.pipe(IdSchema, v.description("支払元か入金先がこの口座の取引"))),
          categoryId: v.optional(v.pipe(IdSchema, v.description("このカテゴリの品目を含む取引"))),
          genreId: v.optional(v.pipe(IdSchema, v.description("この内訳の品目を含む取引"))),
          placeId: v.optional(IdSchema),
          chain: v.optional(
            v.pipe(v.string(), v.maxLength(200), v.description("このチェーンの店舗の取引")),
          ),
          advance: v.optional(
            v.pipe(
              v.picklist(["any", "unreceived"]),
              v.description("立替のある支出（any）か、未入金の残りがある支出（unreceived）"),
            ),
          ),
        }),
      ),
      annotations: READ_ONLY,
    },
    async (filter) => jsonResult(await listTransactions(db, filter)),
  );

  server.registerTool(
    "get_transaction",
    {
      title: "取引の詳細",
      description:
        "取引を品目・立替額・紐付いた収入や支出と一緒に返す。update_transaction に渡す値の元にする。",
      inputSchema: toolSchema(v.object({ id: IdSchema })),
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const transaction = await getTransaction(db, id);
      return transaction === undefined
        ? errorResult("取引が見つかりません")
        : jsonResult(transaction);
    },
  );

  server.registerTool(
    "get_summary",
    {
      title: "集計",
      description:
        "月（YYYY-MM）か年（YYYY）の支出と収入を、カテゴリ・内訳ごとに集計して返す。年のときは月ごとの合計も返す。",
      inputSchema: toolSchema(v.object({ period: PeriodSchema })),
      annotations: READ_ONLY,
    },
    async ({ period }) =>
      jsonResult(
        isMonth(period)
          ? await summarizeMonth(db, period)
          : await summarizeYear(db, Number(period)),
      ),
  );

  server.registerTool(
    "get_balances",
    {
      title: "口座の残高",
      description: "日付の終わり時点の口座ごとの残高を返す。日付を省くと今日にする。",
      inputSchema: toolSchema(
        v.object({
          date: v.optional(
            v.pipe(
              v.string(),
              v.check(isDate, "日付は YYYY-MM-DD で指定してください"),
              v.description("YYYY-MM-DD"),
            ),
          ),
        }),
      ),
      annotations: READ_ONLY,
    },
    async ({ date }) => jsonResult(await computeBalances(db, date ?? todayInTokyo())),
  );

  // --- 取引 ---

  server.registerTool(
    "create_transaction",
    {
      title: "取引の登録",
      description: [
        "取引を 1 件登録し、作った取引の ID を返す。",
        "支出は支払元（fromAccountId）だけ、収入は入金先（toAccountId）だけで品目は 1 件・内訳なし、",
        "振替は別々の支払元と入金先、残高調整は支払元か入金先の片方を指定する。振替と残高調整は店舗・カテゴリなし。",
        "aggregation は集計に含めるか（always: 含める、never: 含めない、yearly_only: 年の集計だけ）。ふつうは always。",
        "placeName に知らない店舗名を渡すと店舗を作る。",
      ].join(""),
      inputSchema: toolSchema(TransactionCreateSchema),
      annotations: WRITE,
    },
    async (input) => domainResult(await createTransaction(db, input)),
  );

  server.registerTool(
    "update_transaction",
    {
      title: "取引の編集",
      description:
        "取引の内容を置き換える。種類（mode）は変えられない。品目は全件を渡す。advanceAmount（立替額）と reimbursements（収入に紐付ける支出）は省くと今の値のままにする。",
      inputSchema: toolSchema(v.object({ id: IdSchema, ...TransactionUpdateSchema.entries })),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, ...input }) => domainResult(await updateTransaction(db, id, input)),
  );

  server.registerTool(
    "delete_transaction",
    {
      title: "取引の削除",
      description:
        "取引を削除する。元に戻せない。収入が紐付いている支出は削除できない。レシートの写真も消す。",
      inputSchema: toolSchema(v.object({ id: IdSchema })),
      annotations: DESTRUCTIVE,
    },
    async ({ id }) => {
      const result = await deleteTransaction(db, id);
      if (!result.ok) return errorResult(result.error);
      if (result.receiptImageKey !== null)
        await removeReceiptImage(storage, result.receiptImageKey);
      return jsonResult({ ok: true });
    },
  );

  // --- 口座 ---

  server.registerTool(
    "create_account",
    {
      title: "口座の追加",
      description:
        "口座を追加する。aiHint は明細や支払い方法からこの口座を当てるためのメモ（不要なら空文字）。",
      inputSchema: toolSchema(AccountUpdateSchema),
      annotations: WRITE,
    },
    async (input) => domainResult(await createAccount(db, input)),
  );

  server.registerTool(
    "update_account",
    {
      title: "口座の編集",
      description: "口座の名前・aiHint・transferAsPayment を置き換える。",
      inputSchema: toolSchema(v.object({ id: IdSchema, ...AccountUpdateSchema.entries })),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, ...input }) => domainResult(await updateAccount(db, id, input)),
  );

  server.registerTool(
    "set_account_archived",
    {
      title: "口座のアーカイブ",
      description:
        "口座をアーカイブする（archived: true）か元に戻す（false）。残高が 0 でない口座はアーカイブできない。",
      inputSchema: toolSchema(v.object({ id: IdSchema, archived: v.boolean() })),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, archived }) => domainResult(await setAccountArchived(db, id, archived)),
  );

  server.registerTool(
    "move_account",
    {
      title: "口座の並べ替え",
      description: "口座の並び順を 1 つ前（offset: -1）か後ろ（offset: 1）へ動かす。",
      inputSchema: toolSchema(v.object({ id: IdSchema, offset: MoveOffsetSchema })),
      annotations: WRITE,
    },
    async ({ id, offset }) => domainResult(await moveAccount(db, id, offset)),
  );

  // --- カテゴリと内訳 ---

  server.registerTool(
    "create_category",
    {
      title: "カテゴリの追加",
      description: "支出か収入のカテゴリを追加する。",
      inputSchema: toolSchema(v.object({ mode: ModeSchema, name: CategoryNameSchema })),
      annotations: WRITE,
    },
    async ({ mode, name }) => domainResult(await createCategory(db, mode, name)),
  );

  server.registerTool(
    "rename_category",
    {
      title: "カテゴリの名前の変更",
      description: "カテゴリの名前を変える。",
      inputSchema: toolSchema(v.object({ id: IdSchema, name: CategoryNameSchema })),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, name }) => domainResult(await renameCategory(db, id, name)),
  );

  server.registerTool(
    "set_category_archived",
    {
      title: "カテゴリのアーカイブ",
      description: "カテゴリをアーカイブする（archived: true）か元に戻す（false）。",
      inputSchema: toolSchema(v.object({ id: IdSchema, archived: v.boolean() })),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, archived }) => domainResult(await setCategoryArchived(db, id, archived)),
  );

  server.registerTool(
    "move_category",
    {
      title: "カテゴリの並べ替え",
      description: "カテゴリの並び順を 1 つ前（offset: -1）か後ろ（offset: 1）へ動かす。",
      inputSchema: toolSchema(v.object({ id: IdSchema, offset: MoveOffsetSchema })),
      annotations: WRITE,
    },
    async ({ id, offset }) => domainResult(await moveCategory(db, id, offset)),
  );

  server.registerTool(
    "create_genre",
    {
      title: "内訳の追加",
      description: "カテゴリに内訳を追加する。",
      inputSchema: toolSchema(v.object({ categoryId: IdSchema, name: GenreNameSchema })),
      annotations: WRITE,
    },
    async ({ categoryId, name }) => domainResult(await createGenre(db, categoryId, name)),
  );

  server.registerTool(
    "rename_genre",
    {
      title: "内訳の名前の変更",
      description: "内訳の名前を変える。",
      inputSchema: toolSchema(v.object({ id: IdSchema, name: GenreNameSchema })),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, name }) => domainResult(await renameGenre(db, id, name)),
  );

  server.registerTool(
    "set_genre_archived",
    {
      title: "内訳のアーカイブ",
      description: "内訳をアーカイブする（archived: true）か元に戻す（false）。",
      inputSchema: toolSchema(v.object({ id: IdSchema, archived: v.boolean() })),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, archived }) => domainResult(await setGenreArchived(db, id, archived)),
  );

  server.registerTool(
    "move_genre",
    {
      title: "内訳の並べ替え",
      description: "内訳の並び順を 1 つ前（offset: -1）か後ろ（offset: 1）へ動かす。",
      inputSchema: toolSchema(v.object({ id: IdSchema, offset: MoveOffsetSchema })),
      annotations: WRITE,
    },
    async ({ id, offset }) => domainResult(await moveGenre(db, id, offset)),
  );

  server.registerTool(
    "change_genre_category",
    {
      title: "内訳のカテゴリの変更",
      description:
        "内訳を同じ種類（支出か収入）の別のカテゴリへ移す。この内訳の品目もそのカテゴリで集計される。",
      inputSchema: toolSchema(v.object({ id: IdSchema, categoryId: IdSchema })),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, categoryId }) => domainResult(await changeGenreCategory(db, id, categoryId)),
  );

  // --- 店舗 ---

  server.registerTool(
    "update_place",
    {
      title: "店舗の編集",
      description:
        "店舗の名前・別名（aliases）・aiHint を置き換える。別名は明細などに出る別の表記で、店舗を当てるのに使う。",
      inputSchema: toolSchema(v.object({ id: IdSchema, ...PlaceUpdateSchema.entries })),
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, ...input }) => domainResult(await updatePlace(db, id, input)),
  );

  server.registerTool(
    "merge_place",
    {
      title: "店舗の統合",
      description:
        "店舗（sourceId）の取引を別の店舗（targetId）へ移し、名前を別名として残して元の店舗を消す。元に戻せない。",
      inputSchema: toolSchema(v.object({ sourceId: IdSchema, targetId: IdSchema })),
      annotations: DESTRUCTIVE,
    },
    async ({ sourceId, targetId }) => domainResult(await mergePlace(db, sourceId, targetId)),
  );

  server.registerTool(
    "delete_place",
    {
      title: "店舗の削除",
      description: "取引で使われていない店舗を削除する。元に戻せない。",
      inputSchema: toolSchema(v.object({ id: IdSchema })),
      annotations: DESTRUCTIVE,
    },
    async ({ id }) => domainResult(await deleteUnusedPlace(db, id)),
  );

  return server;
};
