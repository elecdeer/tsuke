import * as v from "valibot";
import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { todayInTokyo } from "../../src/ledger/dates.ts";
import { listAccounts, listCategories, listChains, listPlaces } from "../../src/ledger/masters.ts";
import { createTransaction, TransactionCreateSchema } from "../../src/ledger/transactionEdit.ts";
import {
  listTransactionTemplates,
  setTransactionFavorite,
} from "../../src/ledger/transactionTemplates.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async () => {
  const [accounts, paymentCategories, incomeCategories, places, chainNames, templates] =
    await Promise.all([
      listAccounts(db),
      listCategories(db, "payment"),
      listCategories(db, "income"),
      listPlaces(db),
      listChains(db),
      listTransactionTemplates(db),
    ]);
  return {
    accounts,
    categories: { payment: paymentCategories, income: incomeCategories },
    placeNames: places.map((place) => place.name),
    chainNames,
    templates,
    today: todayInTokyo(),
  };
});

export const head = defineHead<Props>(() => ({ title: "取引の追加" }));

export const actions = {
  create: defineHandler.withValidator({ body: TransactionCreateSchema })(async (c, { body }) => {
    const result = await createTransaction(db, body);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.redirect(`/transactions/${result.id}`);
  }),

  favorite: defineHandler.withValidator({
    body: v.object({ id: v.pipe(v.number(), v.safeInteger()), favorite: v.boolean() }),
  })(async (c, { body }) => {
    const result = await setTransactionFavorite(db, body.id, body.favorite);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),
};
