import { defineHandler } from "void";
import { db } from "void/db";
import {
  registerStatementCsv,
  StatementCsvRegisterSchema,
} from "../../../../src/ledger/statementCsv.ts";

/**
 * 履歴 CSV から読み取った行を、支出・収入・振替としてまとめて登録する。
 */
export const POST = defineHandler.withValidator({ body: StatementCsvRegisterSchema })(async (
  c,
  { body },
) => {
  const result = await registerStatementCsv(db, body);
  if (!result.ok) return c.json({ error: result.error }, 400);
  return { count: result.count };
});
