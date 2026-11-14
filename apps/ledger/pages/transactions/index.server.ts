import { eq } from "drizzle-orm";
import * as v from "valibot";
import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { places } from "@schema";
import { formatMonth, isYearPeriod, monthOf, todayInTokyo } from "../../src/ledger/dates.ts";
import { listAccounts, listCategories, listChains, listPlaces } from "../../src/ledger/masters.ts";
import {
  deleteTransaction,
  getTransaction,
  TransactionUpdateSchema,
  updateTransaction,
} from "../../src/ledger/transactionEdit.ts";
import { listReimbursementCandidates } from "../../src/ledger/reimbursements.ts";
import {
  isTransactionFavorite,
  setTransactionFavorite,
} from "../../src/ledger/transactionTemplates.ts";
import { listTransactions, type TransactionFilter } from "../../src/ledger/transactions.ts";
import { OptionalIdSchema, OptionalMonthSchema, OptionalYearSchema } from "../../src/web/params.ts";

export type Props = InferProps<typeof loader>;

const TransactionsQuerySchema = v.object({
  month: OptionalMonthSchema,
  /** 年の一覧にするときの年。month より優先する */
  year: OptionalYearSchema,
  mode: v.optional(v.picklist(["payment", "income", "transfer", "adjustment"])),
  accountId: OptionalIdSchema,
  categoryId: OptionalIdSchema,
  genreId: OptionalIdSchema,
  placeId: OptionalIdSchema,
  chain: v.optional(v.pipe(v.string(), v.maxLength(200))),
  advance: v.optional(v.picklist(["any", "unreceived"])),
  /** 広い画面のサイドパネルや狭い画面の下から出るシートで開いている取引 */
  selected: OptionalIdSchema,
});

type TransactionsQuery = v.InferOutput<typeof TransactionsQuerySchema>;

/**
 * クエリから絞り込みの条件を取り出す。期間は年の指定があればその年、なければ月にし、どちらもなければ今月にする。
 */
const filterOf = (
  { selected: _selected, month, year, ...query }: TransactionsQuery,
  currentMonth: string,
): TransactionFilter => ({
  ...query,
  period: year === undefined ? (month ?? currentMonth) : String(year),
});

/**
 * サイドパネルで開く取引と、その編集に使う店舗の名前を読む。取引がなければ null にしてパネルを閉じる。
 */
const loadSelected = async (id: number | undefined) => {
  if (id === undefined) return null;
  const [transaction, isFavorite, placeList] = await Promise.all([
    getTransaction(db, id),
    isTransactionFavorite(db, id),
    listPlaces(db),
  ]);
  if (transaction === undefined) return null;
  return {
    transaction,
    isFavorite,
    placeNames: placeList.map((place) => place.name),
    reimbursementCandidates:
      transaction.mode === "income" ? await listReimbursementCandidates(db, transaction.id) : [],
  };
};

export const loader = defineHandler.withValidator({ query: TransactionsQuerySchema })(async (
  _c,
  { query },
) => {
  const currentMonth = monthOf(todayInTokyo());
  const filter = filterOf(query, currentMonth);
  const [transactions, accounts, paymentCategories, incomeCategories, place, selected, chainNames] =
    await Promise.all([
      listTransactions(db, filter),
      listAccounts(db),
      listCategories(db, "payment"),
      listCategories(db, "income"),
      filter.placeId === undefined
        ? undefined
        : db
            .select({ id: places.id, name: places.name })
            .from(places)
            .where(eq(places.id, filter.placeId))
            .get(),
      loadSelected(query.selected),
      listChains(db),
    ]);
  return {
    filter,
    currentMonth,
    transactions,
    accounts,
    categories: { payment: paymentCategories, income: incomeCategories },
    placeName: place?.name ?? null,
    chainNames,
    selected,
  };
});

export const head = defineHead<Props>((_c, props) => ({
  title: `${isYearPeriod(props.filter.period) ? `${props.filter.period}年` : formatMonth(props.filter.period)}の取引`,
}));

const SelectedQuerySchema = v.object({
  ...TransactionsQuerySchema.entries,
  selected: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.safeInteger()),
});

/**
 * サイドパネルからの保存と削除。
 *
 * 取引の画面（[id].server.ts）のアクションを呼ぶと、その画面へ移ってしまうので、一覧の画面にも同じアクションを置く。
 * どちらも何も返さず、送った URL の一覧（とパネル）を loader で描き直させる。
 */
export const actions = {
  update: defineHandler.withValidator({
    query: SelectedQuerySchema,
    body: TransactionUpdateSchema,
  })(async (c, { query, body }) => {
    const result = await updateTransaction(db, query.selected, body);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  favorite: defineHandler.withValidator({
    query: SelectedQuerySchema,
    body: v.object({ favorite: v.boolean() }),
  })(async (c, { query, body }) => {
    const result = await setTransactionFavorite(db, query.selected, body.favorite);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  // 消した取引のパネルを閉じるため、クライアントは selected を外した一覧の URL に送り、取引の ID は本文で渡す。
  // リダイレクトで selected を外そうとしても、Void はアクションの URL のクエリをリダイレクト先に引き継いでしまう
  delete: defineHandler.withValidator({
    query: TransactionsQuerySchema,
    body: v.object({ id: v.pipe(v.number(), v.safeInteger()) }),
  })(async (c, { body }) => {
    const result = await deleteTransaction(db, body.id);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),
};
