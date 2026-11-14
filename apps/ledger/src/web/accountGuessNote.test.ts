import { describe, expect, test } from "vite-plus/test";
import { accountGuessNote } from "./accountGuessNote.ts";

describe("accountGuessNote", () => {
  test("推測で選んだ支払元のままなら、読み取った表記とともに推測だと知らせる", () => {
    const note = accountGuessNote(
      { paymentMethod: "クレジット", accountId: 3, accountMatch: "inferred" },
      3,
    );
    expect(note).toBe("支払い方法の表記「クレジット」からの推測です");
  });

  test("表記がないまま推測したときは、表記がないことを知らせる", () => {
    const note = accountGuessNote(
      { paymentMethod: null, accountId: 3, accountMatch: "inferred" },
      3,
    );
    expect(note).toBe("支払い方法が書かれていないので、支払元は推測です");
  });

  test("表記から決めきれた支払元には出さない", () => {
    const note = accountGuessNote(
      { paymentMethod: "VISA ****1234", accountId: 3, accountMatch: "explicit" },
      3,
    );
    expect(note).toBeNull();
  });

  test("ユーザーが支払元を選び直したら出さない", () => {
    const note = accountGuessNote(
      { paymentMethod: "クレジット", accountId: 3, accountMatch: "inferred" },
      4,
    );
    expect(note).toBeNull();
  });

  test("支払元を選んでいなければ出さない", () => {
    const note = accountGuessNote(
      { paymentMethod: "クレジット", accountId: null, accountMatch: null },
      null,
    );
    expect(note).toBeNull();
  });
});
