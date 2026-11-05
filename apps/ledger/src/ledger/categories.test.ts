import { describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import {
  createCategory,
  createGenre,
  moveCategory,
  moveGenre,
  renameCategory,
  renameGenre,
  setCategoryArchived,
  setGenreArchived,
} from "./categories.ts";
import { listCategories, listManagedCategories } from "./masters.ts";

describe("createCategory", () => {
  test("同じ種類の並びの最後に追加する", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO categories (mode, name, sort) VALUES ('payment', '食費', 4)");

    expect(await createCategory(db, "payment", "趣味")).toEqual({ ok: true });

    expect((await listCategories(db, "payment")).map((category) => category.name)).toEqual([
      "食費",
      "趣味",
    ]);
  });

  test("支出と収入には同じ名前を付けられるが、同じ種類には付けられない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', 'その他')");

    expect(await createCategory(db, "income", "その他")).toEqual({ ok: true });
    expect(await createCategory(db, "payment", "その他")).toEqual({
      ok: false,
      status: 409,
      error: "「その他」はすでにあります",
    });
  });
});

describe("renameCategory", () => {
  test("名前を変える", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");

    expect(await renameCategory(db, id, "食べ物")).toEqual({ ok: true });

    expect(await listCategories(db, "payment")).toEqual([{ id, name: "食べ物", genres: [] }]);
  });

  test("同じ種類の別のカテゴリと同じ名前にはできず、なければ 404 を返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
    const id = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '趣味')");

    expect(await renameCategory(db, id, "食費")).toMatchObject({ ok: false, status: 409 });
    expect(await renameCategory(db, 999, "別")).toMatchObject({ ok: false, status: 404 });
  });
});

describe("setCategoryArchived", () => {
  test("アーカイブすると内訳ごと候補から外れ、管理の一覧には残る", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
    const genreId = insert(sqlite, "INSERT INTO genres (category_id, name) VALUES (?, '外食')", id);

    expect(await setCategoryArchived(db, id, true)).toEqual({ ok: true });

    expect(await listCategories(db, "payment")).toEqual([]);
    expect(await listManagedCategories(db, "payment")).toEqual([
      {
        id,
        name: "食費",
        archived: true,
        genres: [{ id: genreId, name: "外食", archived: false }],
      },
    ]);

    expect(await setCategoryArchived(db, id, false)).toEqual({ ok: true });
    expect(await listCategories(db, "payment")).toHaveLength(1);
  });
});

describe("moveCategory", () => {
  test("同じ種類の中だけで順番を入れ替える", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const a = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', 'A')");
    const income = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('income', 'I')");
    const b = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', 'B')");

    expect(await moveCategory(db, b, -1)).toEqual({ ok: true });

    expect((await listCategories(db, "payment")).map((category) => category.id)).toEqual([b, a]);
    expect((await listCategories(db, "income")).map((category) => category.id)).toEqual([income]);
  });
});

describe("createGenre", () => {
  test("支出のカテゴリの並びの最後に追加する", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
    insert(sqlite, "INSERT INTO genres (category_id, name, sort) VALUES (?, '外食', 2)", id);

    expect(await createGenre(db, id, "食料品")).toEqual({ ok: true });

    const [category] = await listCategories(db, "payment");
    expect(category?.genres.map((genre) => genre.name)).toEqual(["外食", "食料品"]);
  });

  test("収入のカテゴリには追加できない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('income', '給与')");

    expect(await createGenre(db, id, "本給")).toEqual({
      ok: false,
      status: 400,
      error: "収入のカテゴリには内訳を追加できません",
    });
  });

  test("同じカテゴリには同じ名前を付けられず、別のカテゴリなら付けられる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const food = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
    const fun = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '趣味')");
    insert(sqlite, "INSERT INTO genres (category_id, name) VALUES (?, 'その他')", food);

    expect(await createGenre(db, food, "その他")).toMatchObject({ ok: false, status: 409 });
    expect(await createGenre(db, fun, "その他")).toEqual({ ok: true });
  });

  test("カテゴリがなければ 404 を返す", async () => {
    const { db } = createTestLedgerDb();

    expect(await createGenre(db, 1, "外食")).toMatchObject({ ok: false, status: 404 });
  });
});

describe("renameGenre と setGenreArchived", () => {
  test("名前を変え、アーカイブすると候補から外れる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const categoryId = insert(
      sqlite,
      "INSERT INTO categories (mode, name) VALUES ('payment', '食費')",
    );
    const id = insert(
      sqlite,
      "INSERT INTO genres (category_id, name) VALUES (?, '外食')",
      categoryId,
    );

    expect(await renameGenre(db, id, "レストラン")).toEqual({ ok: true });
    expect((await listCategories(db, "payment"))[0]?.genres).toEqual([{ id, name: "レストラン" }]);

    expect(await setGenreArchived(db, id, true)).toEqual({ ok: true });
    expect((await listCategories(db, "payment"))[0]?.genres).toEqual([]);
    expect((await listManagedCategories(db, "payment"))[0]?.genres).toEqual([
      { id, name: "レストラン", archived: true },
    ]);
  });

  test("内訳がなければ 404 を返す", async () => {
    const { db } = createTestLedgerDb();

    expect(await renameGenre(db, 1, "外食")).toMatchObject({ ok: false, status: 404 });
    expect(await setGenreArchived(db, 1, true)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("moveGenre", () => {
  test("同じカテゴリの中だけで順番を入れ替える", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const food = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
    const fun = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '趣味')");
    const a = insert(sqlite, "INSERT INTO genres (category_id, name) VALUES (?, 'A')", food);
    const other = insert(sqlite, "INSERT INTO genres (category_id, name) VALUES (?, 'X')", fun);
    const b = insert(sqlite, "INSERT INTO genres (category_id, name) VALUES (?, 'B')", food);

    expect(await moveGenre(db, b, -1)).toEqual({ ok: true });

    const [foodCategory, funCategory] = await listCategories(db, "payment");
    expect(foodCategory?.genres.map((genre) => genre.id)).toEqual([b, a]);
    expect(funCategory?.genres.map((genre) => genre.id)).toEqual([other]);
  });
});
