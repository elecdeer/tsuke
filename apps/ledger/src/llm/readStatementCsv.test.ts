import { describe, expect, test, vi } from "vite-plus/test";
import {
  buildClassifyPrompt,
  buildDetectColumnsPrompt,
  prepareStatementCsv,
  sanitizeClassification,
  STATEMENT_CSV_ROWS_MAX,
  streamStatementCsvClassification,
  type StatementCsvContext,
} from "./readStatementCsv.ts";
import { descriptionKey, type ColumnMapping } from "../import/statementCsv.ts";
import {
  readStatementCsvEvents,
  type RowClassification,
  type StatementCsvReadEvent,
} from "../import/statementCsvEvents.ts";
import type { StatementCsvMemory } from "../ledger/statementCsv.ts";
import type { AiRunner } from "./structuredChat.ts";

const context: StatementCsvContext = {
  paymentCategories: [{ id: 101, name: "食費", genres: [{ id: 10101, name: "食料品" }] }],
  incomeCategories: [{ id: 201, name: "給与", genres: [] }],
  accounts: [
    { id: 1, name: "A銀行" },
    { id: 2, name: "Bカード" },
  ],
  places: [{ id: 1, name: "スーパーA", lastUsedOn: "2026-05-01", useCount: 3, aliases: ["ｽｰﾊﾟｰA"] }],
};

const mapping: ColumnMapping = {
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

const noMemory: StatementCsvMemory = { formats: [], classifications: new Map() };

const prepare = (
  ai: AiRunner,
  text: string = CSV,
  memory: StatementCsvMemory = noMemory,
  redetect = false,
) => prepareStatementCsv({ ai, model: "test", fileName: "a.csv", text, context, memory, redetect });

/**
 * 読み取りの全体を流し、届いた出来事を順に集める。
 */
const collect = async (
  ai: AiRunner,
  memory: StatementCsvMemory = noMemory,
  text: string = CSV,
  findRegistered: Parameters<typeof streamStatementCsvClassification>[0]["findRegistered"] = async (
    entries,
  ) => entries.map(() => null),
): Promise<StatementCsvReadEvent[]> => {
  const prepared = await prepare(ai, text, memory);
  if (!prepared.ok) throw new Error(prepared.message);
  const stream = streamStatementCsvClassification({
    ai,
    model: "test",
    prepared,
    context,
    memory,
    findRegistered,
  });
  const events: StatementCsvReadEvent[] = [];
  for await (const event of readStatementCsvEvents(stream)) events.push(event);
  return events;
};

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

const paymentEntry = {
  id: 0,
  mode: "payment",
  placeName: "スーパーA",
  genreId: 10101,
  categoryId: null,
  counterAccountId: null,
};
const incomeEntry = {
  id: 1,
  mode: "income",
  placeName: null,
  genreId: null,
  categoryId: 201,
  counterAccountId: null,
};
const classified = { entries: [paymentEntry, incomeEntry] };

const HEADER = JSON.stringify(["日付", "摘要", "出金", "入金"]);

const memoryWithFormat: StatementCsvMemory = {
  formats: [{ header: HEADER, mapping, accountId: 2 }],
  classifications: new Map(),
};

describe("prepareStatementCsv", () => {
  test("値はコードで読み、見出しの行と割り当てを形式として返す", async () => {
    const result = await prepare(fakeAi(() => classified));

    expect(result).toMatchObject({
      ok: true,
      accountId: 1,
      skippedCount: 1,
      formatKnown: false,
      format: { header: HEADER, mapping },
    });
    if (!result.ok) throw new Error("読み取りに失敗した");
    expect(result.rows.map((row) => [row.date, row.amount, row.direction])).toEqual([
      ["2026-05-10", 1000, "out"],
      ["2026-05-11", 2000, "out"],
      ["2026-05-25", 200000, "in"],
    ]);
  });

  test("覚えていた形式なら AI を呼ばず、前回の口座を使う", async () => {
    const ai = fakeAi(() => classified);

    const result = await prepare(ai, CSV, memoryWithFormat);

    expect(result).toMatchObject({ ok: true, accountId: 2, formatKnown: true });
    expect(ai.run).not.toHaveBeenCalled();
  });

  test("見出しの前の行数が変わっても、覚えていた形式で読む", async () => {
    const ai = fakeAi(() => classified);

    const result = await prepare(ai, `口座番号,123\n${CSV}`, memoryWithFormat);

    expect(result).toMatchObject({ ok: true, formatKnown: true });
    if (!result.ok) throw new Error("読み取りに失敗した");
    expect(result.rows[0]).toMatchObject({ date: "2026-05-10", line: 3 });
    expect(ai.run).not.toHaveBeenCalled();
  });

  test("判定し直すときは覚えていた形式を使わない", async () => {
    const ai = fakeAi(() => classified);

    const result = await prepare(ai, CSV, memoryWithFormat, true);

    expect(result).toMatchObject({ ok: true, accountId: 1, formatKnown: false });
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  test("見出しが同じでも読めなければ AI の判定に回す", async () => {
    const ai = fakeAi(() => classified);
    const memory: StatementCsvMemory = {
      formats: [{ header: HEADER, mapping: { ...mapping, dateColumn: 1 }, accountId: 2 }],
      classifications: new Map(),
    };

    expect(await prepare(ai, CSV, memory)).toMatchObject({ ok: true, formatKnown: false });
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  test("候補にない口座は null にする", async () => {
    const result = await prepare(
      fakeAi(() => classified, { mapping, accountId: 99, reasoning: "x" }),
    );

    expect(result).toMatchObject({ ok: true, accountId: null });
  });

  test("列の判定に失敗したら 502 を返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await prepareStatementCsv({
        ai: { run: vi.fn().mockRejectedValue(new Error("boom")) },
        model: "test",
        fileName: "a.csv",
        text: CSV,
        context,
        memory: noMemory,
      }),
    ).toEqual({ ok: false, status: 502, message: "CSV の列を判定できませんでした" });
  });

  test("範囲外の列を判定したら 502 を返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await prepare(
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

    expect(await prepare(ai, "\n\n")).toMatchObject({ ok: false, status: 400 });
    expect(ai.run).not.toHaveBeenCalled();
  });

  test("行数が上限を超えたら 400 を返す", async () => {
    const rows = Array.from(
      { length: STATEMENT_CSV_ROWS_MAX + 1 },
      (_, index) => `2026/05/10,店${index},100,`,
    );

    expect(
      await prepare(
        fakeAi(() => classified),
        ["日付,摘要,出金,入金", ...rows].join("\n"),
      ),
    ).toMatchObject({ ok: false, status: 400 });
  });
});

/**
 * 届いた分類の行を、行番号の順に集める。届く単位は処理の速さで変わるので単位には依存しない。
 */
const classifiedRows = (events: StatementCsvReadEvent[]) =>
  events
    .flatMap((event) => (event.type === "classified" ? event.rows : []))
    .sort((a, b) => a.line - b.line);

describe("streamStatementCsvClassification", () => {
  test("先に全行を分類待ちで送り、同じ利用先は 1 度だけ分類して全行に戻す", async () => {
    const ai = fakeAi(() => classified);

    const events = await collect(ai);

    expect(events.at(0)?.type).toBe("rows");
    expect(events.at(-1)?.type).toBe("done");
    expect(events[0]).toMatchObject({
      accountId: 1,
      skippedCount: 1,
      rows: [{ pending: true }, { pending: true }, { pending: true }],
    });
    expect(classifiedRows(events)).toMatchObject([
      { line: 2, mode: "payment", genreId: 10101, classified: true },
      { line: 3, mode: "payment", genreId: 10101, classified: true },
      { line: 4, mode: "income", categoryId: 201, classified: true },
    ]);
    // 列の判定と分類で 1 回ずつ
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  test("覚えている利用先は AI に渡さず、最初から分類を付けて送る", async () => {
    const ai = fakeAi(() => ({
      entries: [{ ...incomeEntry, id: 0 }],
    }));
    const memory: StatementCsvMemory = {
      formats: memoryWithFormat.formats,
      classifications: new Map([
        [
          // 全角と半角の違いは同じ利用先と見なす
          descriptionKey("スーパーＡ".normalize("NFKC").replace("スーパー", "ｽｰﾊﾟｰ"), "out"),
          {
            mode: "payment" as const,
            placeName: "スーパーA",
            genreId: 10101,
            categoryId: null,
            counterAccountId: null,
          },
        ],
      ]),
    };

    const events = await collect(ai, memory);

    expect(events[0]).toMatchObject({
      rows: [
        { line: 2, pending: false, genreId: 10101, placeName: "スーパーA" },
        { line: 3, pending: false, genreId: 10101 },
        { line: 4, pending: true },
      ],
    });
    expect(classifiedRows(events)).toMatchObject([{ line: 4, mode: "income" }]);
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  test("すべて覚えていれば AI を呼ばない", async () => {
    const ai = fakeAi(() => classified);
    const learned: RowClassification = {
      mode: "payment" as const,
      placeName: null,
      genreId: 10101,
      categoryId: null,
      counterAccountId: null,
    };
    const memory: StatementCsvMemory = {
      formats: memoryWithFormat.formats,
      classifications: new Map([
        [descriptionKey("ｽｰﾊﾟｰA", "out"), learned],
        [descriptionKey("ｷﾕｳﾖ", "in"), { ...learned, mode: "income", genreId: null }],
      ]),
    };

    const events = await collect(ai, memory);

    expect(events.map((event) => event.type)).toEqual(["rows", "done"]);
    expect(ai.run).not.toHaveBeenCalled();
  });

  test("覚えた内訳がなくなっていたら AI に分類させる", async () => {
    const ai = fakeAi(() => ({ entries: [] }));
    const memory: StatementCsvMemory = {
      formats: memoryWithFormat.formats,
      classifications: new Map([
        [
          descriptionKey("ｽｰﾊﾟｰA", "out"),
          {
            mode: "payment" as const,
            placeName: null,
            genreId: 999,
            categoryId: null,
            counterAccountId: null,
          },
        ],
      ]),
    };

    const events = await collect(ai, memory);

    expect(events[0]).toMatchObject({
      rows: [{ pending: true }, { pending: true }, { pending: true }],
    });
  });

  test("分類に失敗しても読み取りは続け、未分類の行として返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const events = await collect(
      fakeAi(() => {
        throw new Error("boom");
      }),
    );

    expect(events.at(-1)?.type).toBe("done");
    expect(classifiedRows(events)).toMatchObject([
      { mode: "payment", classified: false },
      { mode: "payment", classified: false },
      { mode: "income", classified: false },
    ]);
  });

  test("利用先が多ければ分けて分類する", async () => {
    const ai = fakeAi(() => ({ entries: [] }));
    const rows = Array.from({ length: 70 }, (_, index) => `2026/05/10,店${index},100,`);

    const events = await collect(ai, noMemory, ["日付,摘要,出金,入金", ...rows].join("\n"));

    // 列の判定と、3 つに分けた分類
    expect(ai.run).toHaveBeenCalledTimes(4);
    expect(classifiedRows(events)).toHaveLength(70);
  });

  test("AI の応答が途中まででも、届いた利用先の分だけ先に送る", async () => {
    const encoder = new TextEncoder();
    let finishResponse = (): void => {};
    const sse = (content: string) =>
      encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
    const ai = {
      run: vi.fn(async (_model: string, inputs: Record<string, unknown>) => {
        if (inputs["stream"] !== true) {
          return { response: { mapping, accountId: 1, reasoning: "x" } };
        }
        return new ReadableStream<Uint8Array>({
          start: (controller) => {
            controller.enqueue(sse(`{"entries":[${JSON.stringify(paymentEntry)},`));
            finishResponse = () => {
              controller.enqueue(sse(`${JSON.stringify(incomeEntry)}]}`));
              controller.close();
            };
          },
        });
      }),
    };
    const prepared = await prepare(ai);
    if (!prepared.ok) throw new Error(prepared.message);
    const stream = streamStatementCsvClassification({
      ai,
      model: "test",
      prepared,
      context,
      memory: noMemory,
      findRegistered: async (entries) => entries.map(() => null),
    });
    const events = readStatementCsvEvents(stream);

    expect((await events.next()).value?.type).toBe("rows");
    expect((await events.next()).value).toMatchObject({
      type: "classified",
      rows: [{ line: 2 }, { line: 3 }],
    });

    finishResponse();

    expect((await events.next()).value).toMatchObject({ type: "classified", rows: [{ line: 4 }] });
    expect((await events.next()).value?.type).toBe("done");
  });

  test("応答の途中で失敗しても、届かなかった利用先だけを未分類にする", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ai = {
      run: vi.fn(async (_model: string, inputs: Record<string, unknown>) => {
        if (inputs["stream"] !== true) {
          return { response: { mapping, accountId: 1, reasoning: "x" } };
        }
        return new ReadableStream<Uint8Array>({
          start: (controller) => {
            const content = `{"entries":[${JSON.stringify(paymentEntry)},`;
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
              ),
            );
          },
          pull: (controller) => controller.error(new Error("boom")),
        });
      }),
    };
    const prepared = await prepare(ai);
    if (!prepared.ok) throw new Error(prepared.message);
    const events: StatementCsvReadEvent[] = [];
    for await (const event of readStatementCsvEvents(
      streamStatementCsvClassification({
        ai,
        model: "test",
        prepared,
        context,
        memory: noMemory,
        findRegistered: async (entries) => entries.map(() => null),
      }),
    )) {
      events.push(event);
    }

    expect(classifiedRows(events)).toMatchObject([
      { line: 2, classified: true },
      { line: 3, classified: true },
      { line: 4, classified: false },
    ]);
  });

  test("分類した行の登録済みの取引を、返金は負の金額で探す", async () => {
    const registered = { transactionId: 5, date: "2026-05-10", amount: 1000, placeName: null };
    const findRegistered = vi.fn(async (entries: ReadonlyArray<{ amount: number }>) =>
      entries.map((entry) => (entry.amount === 1000 ? registered : null)),
    );
    const refund = {
      entries: [
        { ...paymentEntry, id: 0 },
        { ...paymentEntry, id: 1 },
      ],
    };

    const events = await collect(
      fakeAi(() => refund),
      noMemory,
      CSV,
      findRegistered,
    );

    expect(classifiedRows(events)).toMatchObject([
      { line: 2, registered },
      { line: 3 },
      { line: 4, registered: null },
    ]);
    expect(findRegistered.mock.calls.flatMap(([entries]) => entries)).toContainEqual(
      expect.objectContaining({ mode: "payment", amount: -200000 }),
    );
  });

  test("途中で失敗したら error を送って閉じる", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;

    const events = await collect(
      fakeAi(() => classified),
      noMemory,
      CSV,
      async (entries) => {
        calls += 1;
        if (calls > 1) throw new Error("boom");
        return entries.map(() => null);
      },
    );

    expect(events.at(-1)?.type).toBe("error");
  });

  test("読み手が止めたら AI の呼び出しも止める", async () => {
    const signals: AbortSignal[] = [];
    const ai = {
      run: vi.fn(
        (_model: string, _inputs: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
          if (options?.signal !== undefined) signals.push(options.signal);
          return new Promise<unknown>(() => {});
        },
      ),
    };
    const stream = streamStatementCsvClassification({
      ai,
      model: "test",
      prepared: {
        ok: true,
        accountId: 1,
        skippedCount: 0,
        format: null,
        formatKnown: false,
        rows: [{ line: 1, date: "2026-05-10", description: "店", direction: "out", amount: 1 }],
      },
      context,
      memory: noMemory,
      findRegistered: async (entries) => entries.map(() => null),
    });
    const reader = stream.getReader();
    await reader.read();
    await vi.waitFor(() => expect(signals).toHaveLength(1));

    await reader.cancel();

    expect(signals[0]?.aborted).toBe(true);
  });
});
