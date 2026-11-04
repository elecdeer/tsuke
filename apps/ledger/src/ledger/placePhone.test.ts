import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { normalizePhone, PlacePhoneSchema } from "./placePhone.ts";

describe("normalizePhone", () => {
  test.each([
    ["03-1234-5678", "0312345678"],
    ["TEL (03) 1234-5678", "0312345678"],
    ["０３－１２３４－５６７８", "0312345678"],
    ["090-1234-5678", "09012345678"],
  ])("%s を数字だけにする", (value, expected) => {
    expect(normalizePhone(value)).toBe(expected);
  });

  test.each(["0120-123-456", "0800-123-4567", "0570-123-456"])(
    "本部の窓口の番号 %s は店舗を見分けられないので使わない",
    (value) => {
      expect(normalizePhone(value)).toBeNull();
    },
  );

  test.each(["1234", "03-1234-5678-9012", "+81-3-1234-5678", ""])(
    "電話番号の形でない %s は使わない",
    (value) => {
      expect(normalizePhone(value)).toBeNull();
    },
  );

  test("null は null のまま返す", () => {
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("PlacePhoneSchema", () => {
  test("登録の入力の電話番号を数字だけにする", () => {
    expect(v.parse(PlacePhoneSchema, "03-1234-5678")).toBe("0312345678");
  });

  test("使えない番号は登録を止めずに null にする", () => {
    expect(v.parse(PlacePhoneSchema, "0120-123-456")).toBeNull();
  });
});
