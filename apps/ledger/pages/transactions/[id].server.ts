import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { storage } from "void/storage";
import { monthOf } from "../../src/ledger/dates.ts";
import { listAccounts, listCategories, listChains, listPlaces } from "../../src/ledger/masters.ts";
import { removeReceiptImage } from "../../src/ledger/receiptImages.ts";
import { listReimbursementCandidates } from "../../src/ledger/reimbursements.ts";
import {
  deleteTransaction,
  getTransaction,
  TransactionUpdateSchema,
  updateTransaction,
} from "../../src/ledger/transactionEdit.ts";
import {
  isTransactionFavorite,
  setTransactionFavorite,
} from "../../src/ledger/transactionTemplates.ts";
import { MODE_LABELS } from "../../src/web/labels.ts";
import { transactionsHref } from "../../src/web/transactionsHref.ts";

export type Props = InferProps<typeof loader>;

const ParamsSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.safeInteger()),
});

export const loader = defineHandler.withValidator({ params: ParamsSchema })(async (
  _c,
  { params },
) => {
  const [
    transaction,
    isFavorite,
    accounts,
    paymentCategories,
    incomeCategories,
    places,
    chainNames,
  ] = await Promise.all([
    getTransaction(db, params.id),
    isTransactionFavorite(db, params.id),
    listAccounts(db),
    listCategories(db, "payment"),
    listCategories(db, "income"),
    listPlaces(db),
    listChains(db),
  ]);
  if (transaction === undefined) {
    throw new HTTPException(404, { message: "取引が見つかりません" });
  }
  return {
    transaction,
    isFavorite,
    reimbursementCandidates:
      transaction.mode === "income" ? await listReimbursementCandidates(db, transaction.id) : [],
    accounts,
    categories: { payment: paymentCategories, income: incomeCategories },
    placeNames: places.map((place) => place.name),
    chainNames,
  };
});

export const head = defineHead<Props>((_c, props) => ({
  title: `${MODE_LABELS[props.transaction.mode]}の編集`,
}));

export const actions = {
  update: defineHandler.withValidator({ params: ParamsSchema, body: TransactionUpdateSchema })(
    async (c, { params, body }) => {
      const result = await updateTransaction(db, params.id, body);
      if (!result.ok) return c.json({ error: result.error }, result.status);
      // 何も返さないと loader が走り直し、保存した内容で画面が描き直される
      return undefined;
    },
  ),

  favorite: defineHandler.withValidator({
    params: ParamsSchema,
    body: v.object({ favorite: v.boolean() }),
  })(async (c, { params, body }) => {
    const result = await setTransactionFavorite(db, params.id, body.favorite);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  delete: defineHandler.withValidator({ params: ParamsSchema })(async (c, { params }) => {
    const transaction = await getTransaction(db, params.id);
    const result = await deleteTransaction(db, params.id);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    if (result.receiptImageKey !== null) await removeReceiptImage(storage, result.receiptImageKey);
    return c.redirect(
      transaction === undefined
        ? "/transactions"
        : transactionsHref({ period: monthOf(transaction.date) }),
    );
  }),
};
