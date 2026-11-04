import * as v from "valibot";
import { defineHandler } from "void";
import { db } from "void/db";
import { env } from "void/env";
import {
  listAccountsWithHint,
  listCategories,
  listPlacesForExtraction,
} from "../../../../src/ledger/masters.ts";
import { findRegisteredTransactions } from "../../../../src/ledger/statements.ts";
import { readStatementCsv } from "../../../../src/llm/readStatementCsv.ts";

/** 受け付ける CSV の文字数の上限。上限の行数の明細より十分に大きくしておく */
const CSV_TEXT_MAX_CHARS = 2_000_000;

const ReadBodySchema = v.object({
  fileName: v.pipe(v.string(), v.maxLength(200)),
  text: v.pipe(v.string(), v.maxLength(CSV_TEXT_MAX_CHARS)),
});

/**
 * 銀行やカードの履歴 CSV を読み取る。AI で列を判定して値を読み、利用先を分類して、登録済みの取引を割り当てる。
 *
 * ファイルの文字コードは画面で文字列に直してから受け取る。DB は変えない。
 */
export const POST = defineHandler.withValidator({ body: ReadBodySchema })(async (c, { body }) => {
  const [paymentCategories, incomeCategories, accounts, places] = await Promise.all([
    listCategories(db, "payment"),
    listCategories(db, "income"),
    listAccountsWithHint(db),
    listPlacesForExtraction(db),
  ]);
  const result = await readStatementCsv({
    ai: c.env.AI,
    model: env.LLM_MODEL,
    fileName: body.fileName,
    text: body.text,
    context: { paymentCategories, incomeCategories, accounts, places },
  });
  if (!result.ok) return c.json({ error: result.message }, result.status);

  const matches = await findRegisteredTransactions(
    db,
    result.rows.map((row) => ({
      date: row.date,
      mode: row.mode,
      // 返金は負の品目として登録するので、負の金額で比べる
      amount: row.mode === "payment" && row.direction === "in" ? -row.amount : row.amount,
    })),
  );
  console.info("LLM read-statement-csv completed", {
    model: env.LLM_MODEL,
    rowCount: result.rows.length,
    skippedCount: result.skippedCount,
    unclassifiedCount: result.unclassifiedCount,
  });
  return {
    accountId: result.accountId,
    skippedCount: result.skippedCount,
    unclassifiedCount: result.unclassifiedCount,
    rows: result.rows.map((row, index) => ({ ...row, registered: matches[index] ?? null })),
  };
});
