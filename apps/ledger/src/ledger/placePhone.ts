import * as v from "valibot";

/** フリーダイヤルやナビダイヤル。本部の窓口の番号で、店舗を見分けられない */
const NON_STORE_PREFIXES = ["0120", "0800", "0570"];

/**
 * 電話番号を、店舗を見分けるのに使える形（数字だけ）にする。使えない番号は null にする。
 */
export const normalizePhone = (value: string | null): string | null => {
  if (value === null) return null;
  const digits = value.normalize("NFKC").replace(/\D/g, "");
  if (!/^0\d{9,10}$/.test(digits)) return null;
  return NON_STORE_PREFIXES.some((prefix) => digits.startsWith(prefix)) ? null : digits;
};

/** 登録の入力の電話番号。使えない番号は null にして、登録は止めない */
export const PlacePhoneSchema = v.pipe(
  v.string(),
  v.maxLength(30),
  v.transform((value: string) => normalizePhone(value)),
);
