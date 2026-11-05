import * as v from "valibot";
import { defineHandler } from "void";
import { db } from "void/db";
import { env } from "void/env";
import {
  listAccountsWithHint,
  listCategories,
  listPlacesForExtraction,
} from "../../../../src/ledger/masters.ts";
import { loadStatementCsvMemory } from "../../../../src/ledger/statementCsv.ts";
import { findRegisteredTransactions } from "../../../../src/ledger/statements.ts";
import {
  prepareStatementCsv,
  streamStatementCsvClassification,
} from "../../../../src/llm/readStatementCsv.ts";

/** 受け付ける CSV の文字数の上限。上限の行数の明細より十分に大きくしておく */
const CSV_TEXT_MAX_CHARS = 2_000_000;

const ReadBodySchema = v.object({
  fileName: v.pipe(v.string(), v.maxLength(200)),
  text: v.pipe(v.string(), v.maxLength(CSV_TEXT_MAX_CHARS)),
  /** 覚えていた形式を使わず、AI で列を判定し直す */
  redetect: v.optional(v.boolean()),
});

/**
 * 銀行やカードの履歴 CSV を読み取る。列を読めるまで待ってから、行と分類を NDJSON で順に返す。
 *
 * 列を読めないときは、本文を流し始める前に分かるので通常のエラーの応答で返す。
 * ファイルの文字コードは画面で文字列に直してから受け取る。DB は変えない。
 */
export const POST = defineHandler.withValidator({ body: ReadBodySchema })(async (c, { body }) => {
  const [paymentCategories, incomeCategories, accounts, places, memory] = await Promise.all([
    listCategories(db, "payment"),
    listCategories(db, "income"),
    listAccountsWithHint(db),
    listPlacesForExtraction(db),
    loadStatementCsvMemory(db),
  ]);
  const context = { paymentCategories, incomeCategories, accounts, places };
  const prepared = await prepareStatementCsv({
    ai: c.env.AI,
    model: env.LLM_MODEL,
    fileName: body.fileName,
    text: body.text,
    context,
    memory,
    redetect: body.redetect,
  });
  if (!prepared.ok) return c.json({ error: prepared.message }, prepared.status);

  return new Response(
    streamStatementCsvClassification({
      ai: c.env.AI,
      model: env.LLM_MODEL,
      prepared,
      context,
      memory,
      findRegistered: (entries) => findRegisteredTransactions(db, entries),
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
});
