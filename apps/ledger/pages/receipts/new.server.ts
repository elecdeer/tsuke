import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { todayInTokyo } from "../../src/ledger/dates.ts";
import { listAccounts, listCategories, listChains, listPlaces } from "../../src/ledger/masters.ts";
import { createPayment, PaymentInputSchema } from "../../src/ledger/payments.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async () => {
  const [accounts, categories, places, chainNames] = await Promise.all([
    listAccounts(db),
    listCategories(db, "payment"),
    listPlaces(db),
    listChains(db),
  ]);
  return {
    accounts,
    categories,
    placeNames: places.map((place) => place.name),
    chainNames,
    today: todayInTokyo(),
  };
});

export const head = defineHead<Props>(() => ({ title: "レシートの登録" }));

/**
 * 確かめた内容で支出を登録し、登録した取引の編集画面へ移る。
 */
export const action = defineHandler.withValidator({ body: PaymentInputSchema })(async (
  c,
  { body },
) => {
  const result = await createPayment(db, body);
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.redirect(`/transactions/${result.id}`);
});
