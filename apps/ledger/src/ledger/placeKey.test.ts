import { describe, expect, test } from "vite-plus/test";
import { placeKey, storeKey } from "./placeKey.ts";

describe("placeKey", () => {
  test.each([
    ["セブン-イレブン", "セブンーイレブン"],
    ["ｾﾌﾞﾝｲﾚﾌﾞﾝ", "セブンイレブン"],
    ["Amazon.co.jp", "AMAZON CO JP"],
    ["ＪＲ東日本", "JR 東日本"],
  ])("%s と %s は同じキーになる", (a, b) => {
    expect(placeKey(a)).toBe(placeKey(b));
  });

  test("別の名前は別のキーになる", () => {
    expect(placeKey("ローソン")).not.toBe(placeKey("ファミリーマート"));
  });
});

describe("storeKey", () => {
  test.each([
    ["マックスバリュエクスプレス船堀駅前", "マックスバリュエクスプレス船堀駅前店"],
    ["マックスバリュエクスプレス船堀駅前", "マックスバリュエクスプレス　船堀駅前店"],
  ])("%s と %s は同じキーになる", (a, b) => {
    expect(storeKey(a)).toBe(storeKey(b));
  });

  test("末尾にない「店」は残す", () => {
    expect(storeKey("本店通り")).toBe("本店通り");
  });

  test("「店」だけの名前は空になる", () => {
    expect(storeKey("店")).toBe("");
  });
});
