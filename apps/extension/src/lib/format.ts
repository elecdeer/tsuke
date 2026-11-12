/**
 * YYYY-MM-DD の日付を、明細の表記に近い「5/19」の形で書く。
 */
export const formatShortDate = (date: string): string => {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
};
