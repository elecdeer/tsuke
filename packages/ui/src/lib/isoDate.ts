/**
 * 日付の欄で扱う YYYY-MM-DD の文字列と、カレンダーが扱う Date との変換。
 *
 * Temporal は iOS の Safari などにまだないので、Date をその地域の時刻の 0 時として使う。
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * YYYY-MM-DD の文字列を、その日の 0 時（その地域の時刻）の Date にする。形が違うか、実在しない日なら undefined を返す。
 */
export const parseIsoDate = (value: string): Date | undefined => {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // Date は 2 月 30 日を 3 月に繰り上げるので、組み立て直した日が元と合うときだけ実在する日とみなす
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
};

/**
 * Date の日付（その地域の時刻）を YYYY-MM-DD の文字列にする。
 */
export const formatIsoDate = (date: Date): string =>
  [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
