import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { todayInTokyo } from "../../src/ledger/dates.ts";
import { listAccounts, listCategories, listChains, listPlaces } from "../../src/ledger/masters.ts";

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
