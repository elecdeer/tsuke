import * as v from "valibot";
import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import {
  AccountUpdateSchema,
  createAccount,
  moveAccount,
  setAccountArchived,
  updateAccount,
} from "../../src/ledger/accounts.ts";
import { MoveOffsetSchema } from "../../src/ledger/masterEdit.ts";
import { listManagedAccounts } from "../../src/ledger/masters.ts";

export type Props = InferProps<typeof loader>;

const AccountIdSchema = v.pipe(v.number(), v.safeInteger());

export const loader = defineHandler(async () => ({ accounts: await listManagedAccounts(db) }));

export const head = defineHead(() => ({ title: "口座" }));

export const actions = {
  create: defineHandler.withValidator({ body: AccountUpdateSchema })(async (c, { body }) => {
    const result = await createAccount(db, body);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    // 何も返さないと loader が走り直し、保存した内容で画面が描き直される
    return undefined;
  }),

  update: defineHandler.withValidator({
    body: v.object({ id: AccountIdSchema, ...AccountUpdateSchema.entries }),
  })(async (c, { body: { id, ...input } }) => {
    const result = await updateAccount(db, id, input);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  archive: defineHandler.withValidator({
    body: v.object({ id: AccountIdSchema, archived: v.boolean() }),
  })(async (c, { body }) => {
    const result = await setAccountArchived(db, body.id, body.archived);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  move: defineHandler.withValidator({
    body: v.object({ id: AccountIdSchema, offset: MoveOffsetSchema }),
  })(async (c, { body }) => {
    const result = await moveAccount(db, body.id, body.offset);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),
};
