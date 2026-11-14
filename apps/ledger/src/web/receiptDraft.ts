import type { CategoryWithGenres } from "../ledger/masters.ts";
import type { DuplicateCheckInput, PaymentInput } from "../ledger/payments.ts";
import type { ExtractedPayment } from "../llm/extractPayment.ts";
import { categoryValueOf } from "./categoryValue.ts";
import { placeDetailFor, type PlaceMasters } from "./placeMatching.ts";
import {
  emptyItem,
  missingFromAccountError,
  updateFromDraft,
  type TransactionDraft,
} from "./transactionDraft.ts";

/**
 * 写真を撮る前の空のフォーム。日付は今日にしておく。
 */
export const emptyPaymentDraft = (today: string): TransactionDraft => ({
  date: today,
  aggregation: "always",
  fromAccountId: "",
  toAccountId: "",
  placeName: "",
  placeDetail: null,
  items: [emptyItem(0)],
});

/**
 * 内訳の ID から、それを持つカテゴリと合わせた選択肢の値を引く表を作る。
 */
const genreValues = (categories: CategoryWithGenres[]): Map<number, string> =>
  new Map(
    categories.flatMap((category) =>
      category.genres.map((genre) => [genre.id, categoryValueOf(category.id, genre.id)] as const),
    ),
  );

/**
 * 読み取った支払い情報をフォームの値にする。
 *
 * 読み取れなかった項目は空のままにする。日付が読み取れなければ今日にする。
 * 候補にない口座・内訳（LLM が作った ID）は選ばれていないものとして扱う。
 */
export const draftFromExtracted = (
  extracted: ExtractedPayment,
  context: PlaceMasters & {
    categories: CategoryWithGenres[];
    accounts: { id: number }[];
    today: string;
  },
): TransactionDraft => {
  const values = genreValues(context.categories);
  const accountKnown = context.accounts.some((account) => account.id === extracted.accountId);
  const items = extracted.items.map((item, index) => ({
    key: index,
    category: item.genreId === null ? "" : (values.get(item.genreId) ?? ""),
    name: item.name ?? "",
    memo: item.memo ?? "",
    amount: item.amount === null ? "" : String(item.amount),
    aiGuess: { genreId: item.genreId, name: item.name },
  }));
  return {
    date: extracted.date ?? context.today,
    aggregation: "always",
    fromAccountId: accountKnown ? String(extracted.accountId) : "",
    toAccountId: "",
    placeName: extracted.placeName ?? "",
    placeDetail: placeDetailFor(extracted.placeName ?? "", context),
    items: items.length === 0 ? [emptyItem(0)] : items,
  };
};

/**
 * フォームの値を支出の登録の入力にする。支払元を選んでいないときや、金額が整数でない品目、
 * 内訳を選んでいない品目があれば理由を返す。
 *
 * AI が読み取った品目には、推測の記録のために読み取ったままの値を付ける。
 */
export const paymentFromDraft = (
  draft: TransactionDraft,
): { ok: true; input: PaymentInput } | { ok: false; error: string } => {
  const accountError = missingFromAccountError(draft);
  if (accountError !== null) return { ok: false, error: accountError };
  const parsed = updateFromDraft(draft);
  if (!parsed.ok) return parsed;
  const items: PaymentInput["items"] = [];
  for (const [index, item] of parsed.input.items.entries()) {
    if (item.genreId === null) {
      return { ok: false, error: `${index + 1} 件目の内訳を選んでください` };
    }
    const aiGuess = draft.items[index]?.aiGuess;
    items.push({
      genreId: item.genreId,
      name: item.name,
      memo: item.memo,
      amount: item.amount,
      ...(aiGuess !== undefined && { aiGuess }),
    });
  }
  return {
    ok: true,
    input: {
      date: parsed.input.date,
      fromAccountId: parsed.input.fromAccountId,
      placeName: parsed.input.placeName,
      placeDetail: parsed.input.placeDetail,
      items,
    },
  };
};

/**
 * フォームの値から重複の確かめの入力を作る。日付が空のときや、金額が整数になっていない品目があるときは
 * 合計が決まらないので null を返す。金額も内訳も空の品目は、まだ書いていない行として飛ばす。
 */
export const duplicateCheckFromDraft = (
  draft: Pick<TransactionDraft, "date" | "placeName" | "items">,
): DuplicateCheckInput | null => {
  if (draft.date === "") return null;
  let amount = 0;
  let counted = 0;
  for (const item of draft.items) {
    const amountText = item.amount.replaceAll(",", "").trim();
    if (amountText === "" && item.category === "") continue;
    if (!/^-?\d+$/.test(amountText)) return null;
    amount += Number(amountText);
    counted += 1;
  }
  if (counted === 0) return null;
  return { date: draft.date, amount, placeName: draft.placeName };
};
