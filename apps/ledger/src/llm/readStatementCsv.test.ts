import { describe, expect, test, vi } from "vite-plus/test";
import {
  buildClassifyPrompt,
  buildDetectColumnsPrompt,
  readStatementCsv,
  sanitizeClassification,
  STATEMENT_CSV_ROWS_MAX,
  type StatementCsvContext,
} from "./readStatementCsv.ts";

const context: StatementCsvContext = {
  paymentCategories: [{ id: 101, name: "食費", genres: [{ id: 10101, name: "食料品" }] }],
  incomeCategories: [{ id: 201, name: "給与", genres: [] }],
  accounts: [
    { id: 1, name: "A銀行" },
    { id: 2, name: "Bカード" },
  ],
  places: [{ id: 1, name: "スーパーA", lastUsedOn: "2026-05-01", useCount: 3, aliases: ["ｽｰﾊﾟｰA"] }],
};

const mapping = {
  firstDataRow: 1,
  dateColumn: 0,
  descriptionColumns: [1],
  amountColumn: null,
  amountPositiveMeans: "outflow",
  outflowColumn: 2,
  inflowColumn: 3,
};

const CSV = [
  "日付,摘要,出金,入金",
  "2026/05/10,ｽｰﾊﾟｰA,1000,",
  "2026/05/11,ｽｰﾊﾟｰA,2000,",
  "2026/05/25,ｷﾕｳﾖ,,200000",
  "合計,,3000,200000",
].join("\n");

/**
 * 列の判定と分類の応答を、スキーマの名前で返し分ける AI の偽物を作る。
 */
const fakeAi = (
  classify: () => unknown,
  detected: unknown = { mapping, accountId: 1, reasoning: "x" },
) => ({
  run: vi.fn(async (_model: string, inputs: Record<string, unknown>) => {
    const format = inputs["response_format"] as { json_schema: { name: string } };
    const payload = format.json_schema.name === "DetectedColumns" ? detected : classify();
    return { response: payload };
  }),
});

const read = (ai: ReturnType<typeof fakeAi>, text: string = CSV) =>
  readStatementCsv({ ai, model: "test", fileName: "a.csv", text, context });

describe("buildDetectColumnsPrompt", () => {
  test("先頭と末尾の行だけを行番号付きで渡す", () => {
    const table = Array.from({ length: 100 }, (_, index) => [`cell${index}`]);

    const { prompt } = buildDetectColumnsPrompt({
      fileName: "a.csv",
      table,
      accounts: context.accounts,
    });

    expect(prompt).toContain('row 19: ["cell19"]');
    expect(prompt).not.toContain("cell20");
    expect(prompt).toContain("... (77 rows omitted)");
    expect(prompt).toContain('row 99: ["cell99"]');
  });
});

describe("buildClassifyPrompt", () => {
  test("利用先に向きと番号を付け、CSV の口座を伝える", () => {
    const { prompt } = buildClassifyPrompt({
      ...context,
      accountName: "A銀行",
      targets: [{ description: "ｷﾕｳﾖ", direction: "in" }],
    });

    expect(prompt).toContain("Account of this history: A銀行");
    expect(prompt).toContain('0: in "ｷﾕｳﾖ"');
    expect(prompt).toContain("201=給与");
  });
});

describe("sanitizeClassification", () => {
  const entry = {
    id: 0,
    mode: "payment" as const,
    placeName: null,
    genreId: null,
    categoryId: null,
    counterAccountId: null,
  };
  const out = { description: "ｽｰﾊﾟｰA", direction: "out" as const };
  const withAccount = { ...context, accountId: 1 };

  test("候補にない内訳と店舗を捨てる", () => {
    expect(
      sanitizeClassification({ ...entry, genreId: 999, placeName: "知らない店" }, out, withAccount),
    ).toMatchObject({ genreId: null, placeName: null });
  });

  test("別名の店舗名を正式な名前に直し、店舗名がなければ利用先の表記から探す", () => {
    expect(
      sanitizeClassification({ ...entry, placeName: "ｽｰﾊﾟｰA" }, out, withAccount).placeName,
    ).toBe("スーパーA");
    expect(sanitizeClassification(entry, out, withAccount).placeName).toBe("スーパーA");
  });

  test("出金が収入と分類されたら支出に直す", () => {
    expect(sanitizeClassification({ ...entry, mode: "income" }, out, withAccount).mode).toBe(
      "payment",
    );
  });

  test("振替は店舗と内訳を持たず、取り込む口座自身や知らない口座を相手にしない", () => {
    const transfer = {
      ...entry,
      mode: "transfer" as const,
      placeName: "スーパーA",
      genreId: 10101,
    };

    expect(sanitizeClassification({ ...transfer, counterAccountId: 2 }, out, withAccount)).toEqual({
      mode: "transfer",
      placeName: null,
      genreId: null,
      categoryId: null,
      counterAccountId: 2,
    });
    expect(
      sanitizeClassification({ ...transfer, counterAccountId: 1 }, out, withAccount)
        .counterAccountId,
    ).toBeNull();
    expect(
      sanitizeClassification({ ...transfer, counterAccountId: 9 }, out, withAccount)
        .counterAccountId,
    ).toBeNull();
  });

  test("収入のカテゴリだけを残す", () => {
    const income = { ...entry, mode: "income" as const, categoryId: 201, genreId: 10101 };

    expect(
      sanitizeClassification(income, { description: "ｷﾕｳﾖ", direction: "in" }, withAccount),
    ).toMatchObject({ mode: "income", categoryId: 201, genreId: null });
  });
});

describe("readStatementCsv", () => {
  const classified = {
    entries: [
      {
        id: 0,
        mode: "payment",
        placeName: "スーパーA",
        genreId: 10101,
        categoryId: null,
        counterAccountId: null,
      },
      {
        id: 1,
        mode: "income",
        placeName: null,
        genreId: null,
        categoryId: 201,
        counterAccountId: null,
      },
    ],
  };

  test("値はコードで読み、同じ利用先は 1 度だけ分類して全行に戻す", async () => {
    const ai = fakeAi(() => classified);

    const result = await read(ai);

    expect(result).toMatchObject({ ok: true, accountId: 1, skippedCount: 1, unclassifiedCount: 0 });
    if (!result.ok) throw new Error("読み取りに失敗した");
    expect(result.rows.map((row) => [row.date, row.amount, row.mode, row.genreId])).toEqual([
      ["2026-05-10", 1000, "payment", 10101],
      ["2026-05-11", 2000, "payment", 10101],
      ["2026-05-25", 200000, "income", null],
    ]);
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  test("候補にない口座は null にする", async () => {
    const result = await read(fakeAi(() => classified, { mapping, accountId: 99, reasoning: "x" }));

    expect(result).toMatchObject({ ok: true, accountId: null });
  });

  test("分類に失敗しても読み取りは成功させ、未分類の行として返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await read(
      fakeAi(() => {
        throw new Error("boom");
      }),
    );

    expect(result).toMatchObject({ ok: true, unclassifiedCount: 3 });
    if (!result.ok) throw new Error("読み取りに失敗した");
    expect(result.rows.map((row) => row.mode)).toEqual(["payment", "payment", "income"]);
  });

  test("列の判定に失敗したら 502 を返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ai = { run: vi.fn().mockRejectedValue(new Error("boom")) };

    expect(
      await readStatementCsv({ ai, model: "test", fileName: "a.csv", text: CSV, context }),
    ).toEqual({
      ok: false,
      status: 502,
      message: "CSV の列を判定できませんでした",
    });
  });

  test("範囲外の列を判定したら 502 を返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await read(
        fakeAi(() => classified, {
          mapping: { ...mapping, dateColumn: 99 },
          accountId: 1,
          reasoning: "x",
        }),
      ),
    ).toMatchObject({ ok: false, status: 502 });
  });

  test("空の CSV は AI に渡さず 400 を返す", async () => {
    const ai = fakeAi(() => classified);

    expect(await read(ai, "\n\n")).toMatchObject({ ok: false, status: 400 });
    expect(ai.run).not.toHaveBeenCalled();
  });

  test("行数が上限を超えたら分類せずに 400 を返す", async () => {
    const ai = fakeAi(() => classified);
    const rows = Array.from(
      { length: STATEMENT_CSV_ROWS_MAX + 1 },
      (_, index) => `2026/05/10,店${index},100,`,
    );

    expect(await read(ai, ["日付,摘要,出金,入金", ...rows].join("\n"))).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  test("利用先が多ければ分けて分類する", async () => {
    const ai = fakeAi(() => ({ entries: [] }));
    const rows = Array.from({ length: 150 }, (_, index) => `2026/05/10,店${index},100,`);

    await read(ai, ["日付,摘要,出金,入金", ...rows].join("\n"));

    expect(ai.run).toHaveBeenCalledTimes(3);
  });
});
