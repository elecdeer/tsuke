import type { CategoryWithGenres } from "../ledger/masters.ts";
import type { DuplicateCheckInput, PaymentInput } from "../ledger/payments.ts";
import type { ExtractedPayment } from "../llm/extractPayment.ts";
import { categoryValueOf, parseCategoryValue } from "./categoryValue.ts";
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
 * 重複の確かめに使える品目（内訳と整数の金額がそろったもの）だけを集める。1 つもなければ null を返す。
 *
 * 返す品目の `index` は、フォームの品目の位置。
 */
export const duplicateCheckFromDraft = (
  draft: Pick<TransactionDraft, "date" | "items">,
): { input: DuplicateCheckInput; indexes: number[] } | null => {
  const values = draft.items.flatMap((item, index) => {
    const { genreId } = parseCategoryValue(item.category);
    const amountText = item.amount.replaceAll(",", "").trim();
    if (genreId === null || !/^-?\d+$/.test(amountText)) return [];
    return [{ index, genreId, amount: Number(amountText) }];
  });
  if (values.length === 0 || draft.date === "") return null;
  return {
    input: {
      date: draft.date,
      items: values.map(({ genreId, amount }) => ({ genreId, amount })),
    },
    indexes: values.map(({ index }) => index),
  };
};
