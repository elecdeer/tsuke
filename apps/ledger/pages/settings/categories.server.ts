import * as v from "valibot";
import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import {
  CategoryNameSchema,
  createCategory,
  createGenre,
  GenreNameSchema,
  moveCategory,
  moveGenre,
  renameCategory,
  renameGenre,
  setCategoryArchived,
  setGenreArchived,
} from "../../src/ledger/categories.ts";
import { MoveOffsetSchema } from "../../src/ledger/masterEdit.ts";
import { listManagedCategories, type CategoryMode } from "../../src/ledger/masters.ts";

export type Props = InferProps<typeof loader>;

const IdSchema = v.pipe(v.number(), v.safeInteger());
const ModeSchema = v.picklist<CategoryMode[]>(["payment", "income"]);

export const loader = defineHandler(async () => {
  const [payment, income] = await Promise.all([
    listManagedCategories(db, "payment"),
    listManagedCategories(db, "income"),
  ]);
  return { payment, income };
});

export const head = defineHead(() => ({ title: "カテゴリ" }));

export const actions = {
  createCategory: defineHandler.withValidator({
    body: v.object({ mode: ModeSchema, name: CategoryNameSchema }),
  })(async (c, { body }) => {
    const result = await createCategory(db, body.mode, body.name);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    // 何も返さないと loader が走り直し、保存した内容で画面が描き直される
    return undefined;
  }),

  renameCategory: defineHandler.withValidator({
    body: v.object({ id: IdSchema, name: CategoryNameSchema }),
  })(async (c, { body }) => {
    const result = await renameCategory(db, body.id, body.name);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  archiveCategory: defineHandler.withValidator({
    body: v.object({ id: IdSchema, archived: v.boolean() }),
  })(async (c, { body }) => {
    const result = await setCategoryArchived(db, body.id, body.archived);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  moveCategory: defineHandler.withValidator({
    body: v.object({ id: IdSchema, offset: MoveOffsetSchema }),
  })(async (c, { body }) => {
    const result = await moveCategory(db, body.id, body.offset);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  createGenre: defineHandler.withValidator({
    body: v.object({ categoryId: IdSchema, name: GenreNameSchema }),
  })(async (c, { body }) => {
    const result = await createGenre(db, body.categoryId, body.name);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  renameGenre: defineHandler.withValidator({
    body: v.object({ id: IdSchema, name: GenreNameSchema }),
  })(async (c, { body }) => {
    const result = await renameGenre(db, body.id, body.name);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  archiveGenre: defineHandler.withValidator({
    body: v.object({ id: IdSchema, archived: v.boolean() }),
  })(async (c, { body }) => {
    const result = await setGenreArchived(db, body.id, body.archived);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  moveGenre: defineHandler.withValidator({
    body: v.object({ id: IdSchema, offset: MoveOffsetSchema }),
  })(async (c, { body }) => {
    const result = await moveGenre(db, body.id, body.offset);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),
};
