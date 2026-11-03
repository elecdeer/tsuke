import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import type { LedgerDb } from "../db.ts";
import { listManagedPlaces, listPlaces, listPlacesForExtraction } from "./masters.ts";
import { createPayment } from "./payments.ts";
import { deleteUnusedPlace, mergePlace, updatePlace } from "./places.ts";
import { updateTransaction } from "./transactionEdit.ts";

describe("店舗の管理", () => {
  let db: LedgerDb;
  let sqlite: DatabaseSync;
  let walletId: number;
  let genreId: number;

  beforeEach(() => {
    ({ db, sqlite } = createTestLedgerDb());
    walletId = insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");
    const categoryId = insert(
      sqlite,
      "INSERT INTO categories (mode, name) VALUES ('payment', '食費')",
    );
    genreId = insert(
      sqlite,
      "INSERT INTO genres (category_id, name) VALUES (?, '食料品')",
      categoryId,
    );
  });

  const insertPlace = (name: string): number =>
    insert(sqlite, "INSERT INTO places (name) VALUES (?)", name);

  const insertTransaction = (placeId: number, date = "2026-10-01"): number =>
    insert(
      sqlite,
      "INSERT INTO transactions (date, mode, from_account_id, place_id, source) VALUES (?, 'payment', ?, ?, 'manual')",
      date,
      walletId,
      placeId,
    );

  const placeOf = async (name: string) =>
    (await listManagedPlaces(db)).find((place) => place.name === name);

  describe("updatePlace", () => {
    test("名前・別名・ヒントを書き換える", async () => {
      const id = insertPlace("アマゾン");

      expect(
        await updatePlace(db, id, {
          name: "Amazon",
          aliases: ["AMAZON.CO.JP", "ｱﾏｿﾞﾝ"],
          aiHint: "書籍は別の店舗にする",
        }),
      ).toEqual({ ok: true });

      expect(await placeOf("Amazon")).toMatchObject({
        id,
        aliases: ["AMAZON.CO.JP", "ｱﾏｿﾞﾝ"],
        aiHint: "書籍は別の店舗にする",
      });
    });

    test("空のヒントは null にし、別名の重複と店舗名と同じ別名を取り除く", async () => {
      const id = insertPlace("Amazon");

      await updatePlace(db, id, { name: "Amazon", aliases: ["A", "A", "Amazon"], aiHint: "" });

      expect(await placeOf("Amazon")).toMatchObject({ aliases: ["A"], aiHint: null });
    });

    test("他の店舗と同じ名前には変えられない", async () => {
      insertPlace("Amazon");
      const id = insertPlace("アマゾン");

      expect(await updatePlace(db, id, { name: "Amazon", aliases: [], aiHint: "" })).toMatchObject({
        ok: false,
        status: 409,
      });
      expect(await placeOf("アマゾン")).toBeDefined();
    });

    test("名前を変えずに別名だけを書き換えられる", async () => {
      const id = insertPlace("Amazon");

      expect(await updatePlace(db, id, { name: "Amazon", aliases: ["A"], aiHint: "" })).toEqual({
        ok: true,
      });
    });

    test("ない店舗は 404 を返す", async () => {
      expect(await updatePlace(db, 999, { name: "A", aliases: [], aiHint: "" })).toMatchObject({
        ok: false,
        status: 404,
      });
    });
  });

  describe("mergePlace", () => {
    test("取引を統合先へ付け替えて統合元を消し、統合元の名前と別名を統合先の別名に残す", async () => {
      const sourceId = insertPlace("ｱﾏｿﾞﾝ");
      const targetId = insertPlace("Amazon");
      sqlite
        .prepare("UPDATE places SET aliases = ? WHERE id = ?")
        .run(JSON.stringify(["AMZN"]), sourceId);
      sqlite
        .prepare("UPDATE places SET aliases = ? WHERE id = ?")
        .run(JSON.stringify(["AMAZON.CO.JP"]), targetId);
      const transactionId = insertTransaction(sourceId);

      expect(await mergePlace(db, sourceId, targetId)).toEqual({ ok: true });

      const places = await listManagedPlaces(db);
      expect(places).toHaveLength(1);
      expect(places[0]).toMatchObject({
        id: targetId,
        aliases: ["AMAZON.CO.JP", "ｱﾏｿﾞﾝ", "AMZN"],
        useCount: 1,
      });
      expect(
        sqlite.prepare("SELECT place_id FROM transactions WHERE id = ?").get(transactionId),
      ).toEqual({ place_id: targetId });
    });

    test("統合先にヒントがなければ統合元のヒントを引き継ぎ、あれば統合先のものを残す", async () => {
      const sourceId = insertPlace("元");
      const emptyId = insertPlace("ヒントなし");
      sqlite.prepare("UPDATE places SET ai_hint = '元のヒント' WHERE id = ?").run(sourceId);

      await mergePlace(db, sourceId, emptyId);
      expect(await placeOf("ヒントなし")).toMatchObject({ aiHint: "元のヒント" });

      const sourceId2 = insertPlace("元2");
      sqlite.prepare("UPDATE places SET ai_hint = '元2のヒント' WHERE id = ?").run(sourceId2);
      await mergePlace(db, sourceId2, emptyId);
      expect(await placeOf("ヒントなし")).toMatchObject({ aiHint: "元のヒント" });
    });

    test("統合先に電話番号がなければ統合元から引き継ぎ、あれば統合先のものを残す", async () => {
      const sourceId = insertPlace("元");
      const emptyId = insertPlace("番号なし");
      sqlite.prepare("UPDATE places SET phone = '0311111111' WHERE id = ?").run(sourceId);

      await mergePlace(db, sourceId, emptyId);
      expect(await placeOf("番号なし")).toMatchObject({ phone: "0311111111" });

      const sourceId2 = insertPlace("元2");
      sqlite.prepare("UPDATE places SET phone = '0322222222' WHERE id = ?").run(sourceId2);
      await mergePlace(db, sourceId2, emptyId);
      expect(await placeOf("番号なし")).toMatchObject({ phone: "0311111111" });
    });

    test("統合先にチェーンや施設の情報がなければ統合元から引き継ぐ", async () => {
      const sourceId = insertPlace("元");
      const targetId = insertPlace("先");
      sqlite
        .prepare(
          "UPDATE places SET chain = 'チェーン', address = '東京都', lng = 139.7, lat = 35.6, poi_category = 'shop', poi_licenses = ?, poi_attributions = ? WHERE id = ?",
        )
        .run(JSON.stringify(["CC0"]), JSON.stringify(["OpenPOI"]), sourceId);

      await mergePlace(db, sourceId, targetId);

      expect(
        sqlite
          .prepare(
            "SELECT chain, address, lng, lat, poi_category, poi_licenses, poi_attributions FROM places WHERE id = ?",
          )
          .get(targetId),
      ).toEqual({
        chain: "チェーン",
        address: "東京都",
        lng: 139.7,
        lat: 35.6,
        poi_category: "shop",
        poi_licenses: '["CC0"]',
        poi_attributions: '["OpenPOI"]',
      });
    });

    test("統合先に施設の情報があれば、統合元の情報と混ぜない", async () => {
      const sourceId = insertPlace("元");
      const targetId = insertPlace("先");
      sqlite
        .prepare(
          "UPDATE places SET chain = '元のチェーン', address = '東京都', lng = 139.7, lat = 35.6, poi_category = 'shop' WHERE id = ?",
        )
        .run(sourceId);
      sqlite
        .prepare("UPDATE places SET chain = '先のチェーン', lng = 135.5, lat = 34.7 WHERE id = ?")
        .run(targetId);

      await mergePlace(db, sourceId, targetId);

      expect(
        sqlite
          .prepare("SELECT chain, address, lng, lat, poi_category FROM places WHERE id = ?")
          .get(targetId),
      ).toEqual({
        chain: "先のチェーン",
        address: null,
        lng: 135.5,
        lat: 34.7,
        poi_category: null,
      });
    });

    test("アーカイブ済みの統合先は元に戻す", async () => {
      const sourceId = insertPlace("元");
      const targetId = insertPlace("先");
      sqlite.prepare("UPDATE places SET archived = 1 WHERE id = ?").run(targetId);

      await mergePlace(db, sourceId, targetId);

      expect(await placeOf("先")).toMatchObject({ archived: false });
    });

    test("同じ店舗には統合できない", async () => {
      const id = insertPlace("Amazon");
      insertTransaction(id);

      expect(await mergePlace(db, id, id)).toMatchObject({ ok: false, status: 400 });
      expect(await placeOf("Amazon")).toBeDefined();
    });

    test("どちらかがなければ 404 を返し、何も変えない", async () => {
      const id = insertPlace("Amazon");
      insertTransaction(id);

      expect(await mergePlace(db, id, 999)).toMatchObject({ ok: false, status: 404 });
      expect(await mergePlace(db, 999, id)).toMatchObject({ ok: false, status: 404 });
      expect(await placeOf("Amazon")).toMatchObject({ useCount: 1 });
    });
  });

  describe("deleteUnusedPlace", () => {
    test("取引のない店舗を消す", async () => {
      const id = insertPlace("未使用");

      expect(await deleteUnusedPlace(db, id)).toEqual({ ok: true });

      expect(await listManagedPlaces(db)).toEqual([]);
    });

    test("取引がある店舗は消さない", async () => {
      const id = insertPlace("Amazon");
      insertTransaction(id);

      expect(await deleteUnusedPlace(db, id)).toMatchObject({ ok: false, status: 409 });
      expect(await placeOf("Amazon")).toBeDefined();
    });

    test("ない店舗は 404 を返す", async () => {
      expect(await deleteUnusedPlace(db, 999)).toMatchObject({ ok: false, status: 404 });
    });
  });

  describe("一覧", () => {
    test("管理画面にはアーカイブ済みも出し、読み取りと入力の候補には出さない", async () => {
      insertPlace("使う店");
      const archivedId = insertPlace("閉じた店");
      sqlite.prepare("UPDATE places SET archived = 1 WHERE id = ?").run(archivedId);

      expect((await listManagedPlaces(db)).map((place) => place.name)).toEqual([
        "使う店",
        "閉じた店",
      ]);
      expect((await listPlacesForExtraction(db)).map((place) => place.name)).toEqual(["使う店"]);
      expect((await listPlaces(db)).map((place) => place.name)).toEqual(["使う店"]);
    });
  });

  describe("アーカイブ済みの店舗の再利用", () => {
    const archive = (id: number): void => {
      sqlite.prepare("UPDATE places SET archived = 1 WHERE id = ?").run(id);
    };

    test("支出の登録で同じ名前を入力すると元に戻る", async () => {
      const id = insertPlace("閉じた店");
      archive(id);

      const result = await createPayment(db, {
        date: "2026-11-01",
        fromAccountId: walletId,
        placeName: "閉じた店",
        items: [{ genreId, amount: 100, name: "", memo: "" }],
      });

      expect(result.ok).toBe(true);
      expect(await placeOf("閉じた店")).toMatchObject({ id, archived: false, useCount: 1 });
    });

    test("元に戻すときも、すでにある店舗の情報は変えない", async () => {
      const id = insertPlace("閉じた店");
      archive(id);
      sqlite.prepare("UPDATE places SET chain = '元のチェーン' WHERE id = ?").run(id);

      await createPayment(db, {
        date: "2026-11-01",
        fromAccountId: walletId,
        placeName: "閉じた店",
        placeDetail: { chain: "別のチェーン", poi: null },
        items: [{ genreId, amount: 100, name: "", memo: "" }],
      });

      expect(sqlite.prepare("SELECT chain, archived FROM places WHERE id = ?").get(id)).toEqual({
        chain: "元のチェーン",
        archived: 0,
      });
    });

    test("取引の編集で別の店舗から変えると元に戻り、店舗を変えない編集では戻らない", async () => {
      const closedId = insertPlace("閉じた店");
      const otherId = insertPlace("別の店");
      archive(closedId);
      const unchanged = insertTransaction(closedId);
      const changed = insertTransaction(otherId);
      const input = (placeName: string) => ({
        date: "2026-10-01",
        aggregation: "always" as const,
        fromAccountId: walletId,
        toAccountId: null,
        placeName,
        items: [{ categoryId: null, genreId, amount: 100, name: "", memo: "" }],
      });

      expect(await updateTransaction(db, unchanged, input("閉じた店"))).toEqual({ ok: true });
      expect(await placeOf("閉じた店")).toMatchObject({ archived: true });

      expect(await updateTransaction(db, changed, input("閉じた店"))).toEqual({ ok: true });
      expect(await placeOf("閉じた店")).toMatchObject({ archived: false, useCount: 2 });
    });
  });
});
