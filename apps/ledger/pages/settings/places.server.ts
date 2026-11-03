import * as v from "valibot";
import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { listManagedPlaces } from "../../src/ledger/masters.ts";
import {
  deleteUnusedPlace,
  mergePlace,
  PlaceUpdateSchema,
  updatePlace,
} from "../../src/ledger/places.ts";

export type Props = InferProps<typeof loader>;

const PlaceIdSchema = v.pipe(v.number(), v.safeInteger());

export const loader = defineHandler(async () => ({ places: await listManagedPlaces(db) }));

export const head = defineHead(() => ({ title: "店舗" }));

export const actions = {
  update: defineHandler.withValidator({
    body: v.object({ id: PlaceIdSchema, ...PlaceUpdateSchema.entries }),
  })(async (c, { body: { id, ...input } }) => {
    const result = await updatePlace(db, id, input);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    // 何も返さないと loader が走り直し、保存した内容で画面が描き直される
    return undefined;
  }),

  merge: defineHandler.withValidator({
    body: v.object({ sourceId: PlaceIdSchema, targetId: PlaceIdSchema }),
  })(async (c, { body }) => {
    const result = await mergePlace(db, body.sourceId, body.targetId);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return undefined;
  }),

  delete: defineHandler.withValidator({ body: v.object({ id: PlaceIdSchema }) })(
    async (c, { body }) => {
      const result = await deleteUnusedPlace(db, body.id);
      if (!result.ok) return c.json({ error: result.error }, result.status);
      return undefined;
    },
  ),
};
