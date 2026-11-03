import * as v from "valibot";
import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { AccountUpdateSchema, updateAccount } from "../../src/ledger/accounts.ts";
import { listAccountsWithHint } from "../../src/ledger/masters.ts";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async () => ({ accounts: await listAccountsWithHint(db) }));

export const head = defineHead(() => ({ title: "口座" }));

export const actions = {
  update: defineHandler.withValidator({
    body: v.object({ id: v.pipe(v.number(), v.safeInteger()), ...AccountUpdateSchema.entries }),
  })(async (c, { body: { id, ...input } }) => {
    const result = await updateAccount(db, id, input);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    // 何も返さないと loader が走り直し、保存した内容で画面が描き直される
    return undefined;
  }),
};
