import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { todayInTokyo } from "../../src/ledger/dates.ts";
import { listAccounts, listCategories, listChains, listPlaces } from "../../src/ledger/masters.ts";
import { createTransaction, TransactionCreateSchema } from "../../src/ledger/transactionEdit.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async () => {
  const [accounts, paymentCategories, incomeCategories, places, chainNames] = await Promise.all([
    listAccounts(db),
    listCategories(db, "payment"),
    listCategories(db, "income"),
    listPlaces(db),
    listChains(db),
  ]);
  return {
    accounts,
    categories: { payment: paymentCategories, income: incomeCategories },
    placeNames: places.map((place) => place.name),
    chainNames,
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
};
