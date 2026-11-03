/**
 * レシートの写真からの抽出のプロンプトと、画像の入力の検証のテスト。
 */
import * as v from "valibot";
import { describe, expect, test, vi } from "vite-plus/test";
import {
  buildReceiptPrompt,
  ReceiptImageSchema,
  resolveReceiptPlaceName,
  runExtractReceipt,
  type ExtractReceiptContext,
} from "./extractReceipt.ts";

const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const baseInput = (overrides: Partial<ExtractReceiptContext> = {}): ExtractReceiptContext => ({
  image: IMAGE,
  today: "2026-10-29",
  categories: [{ id: 101, name: "食費", genres: [{ id: 10101, name: "食料品" }] }],
  accounts: [
    { id: 1, name: "現金" },
    { id: 2, name: "楽天カード" },
  ],
  places: [{ id: 1, name: "スーパーA", lastUsedOn: "2026-10-20", useCount: 5 }],
  ...overrides,
});

const extracted = {
  date: "2026-10-27",
  accountId: 2,
  placeName: "スーパーA",
  placePhone: null,
  items: [{ name: "牛乳", amount: 248, memo: null, genreId: 10101 }],
  confidence: "high",
  reasoning: "receipt",
};

describe("buildReceiptPrompt", () => {
  test("画像を 1 枚添える", () => {
    const { images } = buildReceiptPrompt(baseInput());
    expect(images).toEqual([IMAGE]);
  });

  test("今日の日付と、カテゴリ・口座・店舗の候補を本文に並べる", () => {
    const { prompt } = buildReceiptPrompt(baseInput());
    expect(prompt).toContain("Today: 2026-10-29\n");
    expect(prompt).toContain("101=食費: 10101=食料品");
    expect(prompt).toContain("1=現金, 2=楽天カード");
    expect(prompt).toContain("スーパーA [5x, 2026-10-20]");
  });

  test("キャッシュが効くよう、変わりにくい候補を前に、日付と店舗を後ろに並べる", () => {
    const { prompt } = buildReceiptPrompt(baseInput());
    const positions = ["## Categories", "## Accounts", "Today:", "## Recent stores"].map((label) =>
      prompt.indexOf(label),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions[0]).toBe(0);
  });

  test("日付や店舗の使用回数が違っても、カテゴリと口座までのプロンプトは同じになる", () => {
    const before = buildReceiptPrompt(baseInput()).prompt;
    const after = buildReceiptPrompt(
      baseInput({
        today: "2026-10-30",
        places: [{ id: 1, name: "スーパーA", lastUsedOn: "2026-10-30", useCount: 6 }],
      }),
    ).prompt;
    const stablePrefix = before.slice(0, before.indexOf("Today:"));
    expect(after.startsWith(stablePrefix)).toBe(true);
  });

  test("合計・お預り・お釣りの行を品目にしないよう指示する", () => {
    const { system } = buildReceiptPrompt(baseInput());
    expect(system).toContain("Do NOT make items from subtotal, total, tax, tendered");
  });

  test("読み取った店舗名はチェーン名と支店名を空白で区切るよう指示する", () => {
    const { system } = buildReceiptPrompt(baseInput());
    expect(system).toContain("one half-width space between the chain name and the branch name");
  });

  test("品目のメモに金額の内訳を入れないよう指示する", () => {
    const { system } = buildReceiptPrompt(baseInput());
    expect(system).toContain("Never put prices or their breakdown");
  });
});

describe("resolveReceiptPlaceName", () => {
  const place = (name: string, aliases?: string[]) => ({
    id: 1,
    name,
    lastUsedOn: null,
    useCount: 0,
    aliases,
  });
  const store = "マックスバリュエクスプレス船堀駅前店";

  test.each([
    ["店のない名前", "マックスバリュエクスプレス船堀駅前"],
    ["チェーン名と支店名を区切った名前", "マックスバリュエクスプレス 船堀駅前店"],
    ["区切って店のない名前", "マックスバリュエクスプレス　船堀駅前"],
  ])("%s を、語がすべて含まれる既存の店舗に直す", (_, read) => {
    expect(resolveReceiptPlaceName(read, [place(store)])).toBe(store);
  });

  test("空白を含む店舗名にも、空白のない読み取りの名前で当たる", () => {
    const spaced = "マックスバリュエクスプレス　船堀駅前店";
    expect(resolveReceiptPlaceName("マックスバリュエクスプレス船堀駅前", [place(spaced)])).toBe(
      spaced,
    );
  });

  test("全角半角と大文字小文字の違いは無視する", () => {
    expect(resolveReceiptPlaceName("ａｅｏｎ 船堀", [place("AEON船堀店")])).toBe("AEON船堀店");
  });

  test("複数の店舗に当たるときは決めずにそのまま返す", () => {
    const places = [place("ローソン新宿西口店"), place("ローソン新宿南口店")];
    expect(resolveReceiptPlaceName("ローソン 新宿", places)).toBe("ローソン 新宿");
  });

  test("含まれない語があれば直さない", () => {
    expect(resolveReceiptPlaceName("ローソン 渋谷店", [place("ローソン新宿西口店")])).toBe(
      "ローソン 渋谷店",
    );
  });

  test("短い名前は一部が同じだけでは直さない", () => {
    expect(resolveReceiptPlaceName("ヤマ", [place("ヤマト運輸")])).toBe("ヤマ");
  });

  test("完全に一致する店舗名と別名は、部分一致より先に見る", () => {
    const places = [place("スーパーA本店"), place("スーパーA"), place("B店", ["スーパーAB"])];
    expect(resolveReceiptPlaceName("スーパーA", places)).toBe("スーパーA");
    expect(resolveReceiptPlaceName("スーパーAB", places)).toBe("B店");
  });

  test("null は null のまま返す", () => {
    expect(resolveReceiptPlaceName(null, [place(store)])).toBeNull();
  });

  describe("電話番号", () => {
    const withPhone = (name: string, phone: string) => ({ ...place(name), phone });

    test("名前で当たらなければ、電話番号が同じ店舗に直す", () => {
      const places = [withPhone("八百屋みどり", "0312345678")];
      expect(resolveReceiptPlaceName("ミドリ青果", places, "0312345678")).toBe("八百屋みどり");
    });

    test("店舗名が読めなくても、電話番号で店舗が決まる", () => {
      const places = [withPhone("八百屋みどり", "0312345678")];
      expect(resolveReceiptPlaceName(null, places, "0312345678")).toBe("八百屋みどり");
    });

    test("店舗名の完全一致を電話番号より優先する", () => {
      const places = [place("スーパーA"), withPhone("スーパーB", "0312345678")];
      expect(resolveReceiptPlaceName("スーパーA", places, "0312345678")).toBe("スーパーA");
    });

    test("電話番号を部分一致より優先する", () => {
      const places = [place("ローソン新宿西口店"), withPhone("ローソン新宿南口店", "0312345678")];
      expect(resolveReceiptPlaceName("ローソン 新宿", places, "0312345678")).toBe(
        "ローソン新宿南口店",
      );
    });

    test("同じ電話番号の店舗が複数あれば電話番号では決めず、部分一致に進む", () => {
      const places = [
        withPhone("ローソン新宿西口店", "0312345678"),
        withPhone("ファミリーマート渋谷店", "0312345678"),
      ];
      expect(resolveReceiptPlaceName("ローソン 新宿", places, "0312345678")).toBe(
        "ローソン新宿西口店",
      );
      expect(resolveReceiptPlaceName("喫茶ひだまり", places, "0312345678")).toBe("喫茶ひだまり");
    });

    test("電話番号が違えば直さない", () => {
      const places = [withPhone("八百屋みどり", "0312345678")];
      expect(resolveReceiptPlaceName("ミドリ青果", places, "0300000000")).toBe("ミドリ青果");
    });
  });
});

describe("runExtractReceipt", () => {
  test("読み取った店舗名を既存の店舗の名前に直して返す", async () => {
    const ai = {
      run: vi.fn(async () => ({
        choices: [
          { message: { content: JSON.stringify({ ...extracted, placeName: "スーパー A" }) } },
        ],
      })),
    };

    const { object } = await runExtractReceipt({ ai, quality: "fast", input: baseInput() });

    expect(object.placeName).toBe("スーパーA");
  });

  test("電話番号を数字だけにして返し、既存の店舗の紐付けに使う", async () => {
    const ai = {
      run: vi.fn(async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...extracted,
                placeName: "ミドリ青果",
                placePhone: "TEL 03-1234-5678",
              }),
            },
          },
        ],
      })),
    };
    const places = [
      { id: 2, name: "八百屋みどり", lastUsedOn: null, useCount: 0, phone: "0312345678" },
    ];

    const { object } = await runExtractReceipt({
      ai,
      quality: "fast",
      input: baseInput({ places }),
    });

    expect(object).toMatchObject({ placeName: "八百屋みどり", placePhone: "0312345678" });
  });

  test("user メッセージに文字と画像を content parts で入れ、抽出結果を返す", async () => {
    const ai = {
      run: vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(extracted) } }] })),
    };

    const { object } = await runExtractReceipt({ ai, quality: "fast", input: baseInput() });

    expect(object).toEqual(extracted);
    expect(ai.run).toHaveBeenCalledWith(
      "google/gemini-3.1-flash-lite",
      expect.objectContaining({
        messages: [
          expect.objectContaining({ role: "system" }),
          {
            role: "user",
            content: [
              { type: "text", text: expect.stringContaining("Today: 2026-10-29") },
              { type: "image_url", image_url: { url: IMAGE } },
            ],
          },
        ],
      }),
      { signal: undefined },
    );
  });

  test("fast は速いモデルを使い、推論量を送らない", async () => {
    const ai = {
      run: vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(extracted) } }] })),
    };

    await runExtractReceipt({ ai, quality: "fast", input: baseInput() });

    expect(ai.run).toHaveBeenCalledWith(
      "google/gemini-3.1-flash-lite",
      expect.not.objectContaining({ reasoning_effort: expect.anything() }),
      { signal: undefined },
    );
  });

  test("accurate は正確なモデルを使い、推論量を low にして送る", async () => {
    const ai = {
      run: vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(extracted) } }] })),
    };

    await runExtractReceipt({ ai, quality: "accurate", input: baseInput() });

    expect(ai.run).toHaveBeenCalledWith(
      "google/gemini-3.8-flash",
      expect.objectContaining({ reasoning_effort: "low" }),
      { signal: undefined },
    );
  });
});

describe("ReceiptImageSchema", () => {
  test("JPEG・PNG・WebP の data URL を受け付ける", () => {
    expect(v.is(ReceiptImageSchema, IMAGE)).toBe(true);
    expect(v.is(ReceiptImageSchema, "data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(v.is(ReceiptImageSchema, "data:image/webp;base64,UklGRg==")).toBe(true);
  });

  test("画像でない data URL や URL は受け付けない", () => {
    expect(v.is(ReceiptImageSchema, "data:text/plain;base64,aGVsbG8=")).toBe(false);
    expect(v.is(ReceiptImageSchema, "https://example.com/receipt.jpg")).toBe(false);
  });

  test("上限より長い画像は受け付けない", () => {
    const tooLong = `data:image/jpeg;base64,${"A".repeat(4_000_000)}`;
    expect(v.is(ReceiptImageSchema, tooLong)).toBe(false);
  });
});
