import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { listAccounts, listCategories, listPlaces } from "../../src/ledger/masters.ts";
import { listUnreceivedAdvances } from "../../src/ledger/reimbursements.ts";
import { listLastStatementImports } from "../../src/ledger/statementCsv.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async () => {
  const [accounts, paymentCategories, incomeCategories, places, lastImports, unreceivedAdvances] =
    await Promise.all([
      listAccounts(db),
      listCategories(db, "payment"),
      listCategories(db, "income"),
      listPlaces(db),
      listLastStatementImports(db),
      listUnreceivedAdvances(db),
    ]);
  return {
    accounts,
    paymentCategories,
    incomeCategories,
    placeNames: places.map((place) => place.name),
    lastImports,
    unreceivedAdvances,
  };
});

export const head = defineHead<Props>(() => ({ title: "CSV の取り込み" }));
