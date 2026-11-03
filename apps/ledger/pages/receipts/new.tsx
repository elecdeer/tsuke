import { action, Link } from "@void/react";
import { Camera, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ChangeEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createLedgerClient, type LedgerOutput } from "@/client";
import type { DuplicateCandidate } from "@/ledger/payments";
import { actionErrorMessage } from "@/web/actionError";
import { Section } from "@/web/components/Section";
import {
  AccountSelect,
  ErrorMessage,
  FormField,
  ItemsFields,
  PlaceInput,
} from "@/web/components/TransactionFields";
import { formatDay, formatYen } from "@/web/format";
import {
  draftFromExtracted,
  duplicateCheckFromDraft,
  emptyPaymentDraft,
  paymentFromDraft,
} from "@/web/receiptDraft";
import { resizeReceiptImage } from "@/web/receiptImage";
import type { TransactionDraft } from "@/web/transactionDraft";
import { cn } from "@/lib/utils";
import type { Props } from "./new.server";

type Extracted = LedgerOutput<"/api/receipts/extract", "POST">;

/** 入力が止まってから重複を確かめるまでの間（ms） */
const DUPLICATE_CHECK_DELAY = 500;

/**
 * 同じ origin の台帳 API を呼ぶ。Access の Cookie は同じ origin なのでそのまま送られる。
 */
const ledgerApi = () => createLedgerClient(window.location.origin);

/**
 * 品目ごとの重複の候補を、入力が止まってから台帳に問い合わせる。戻り値はフォームの品目と同じ順に並ぶ。
 */
const useDuplicates = ({
  date,
  items,
}: Pick<TransactionDraft, "date" | "items">): DuplicateCandidate[][] => {
  // 店舗や口座を変えても問い合わせ直さないよう、日付と品目だけから作る
  const check = useMemo(() => duplicateCheckFromDraft({ date, items }), [date, items]);
  const key = JSON.stringify(check);
  const [duplicates, setDuplicates] = useState<{ key: string; byItem: DuplicateCandidate[][] }>({
    key: "",
    byItem: [],
  });

  useEffect(() => {
    if (check === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void ledgerApi()("/api/transactions/duplicates", "POST", { body: check.input })
        .then(({ duplicates: found }) => {
          if (cancelled) return;
          const byItem: DuplicateCandidate[][] = [];
          check.indexes.forEach((itemIndex, i) => {
            byItem[itemIndex] = found[i] ?? [];
          });
          setDuplicates({ key, byItem });
        })
        // 重複の確かめは登録を助けるだけなので、失敗しても知らせない
        .catch(() => undefined);
    }, DUPLICATE_CHECK_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [check, key]);

  // 入力を変えた後は、確かめ直すまで前の結果を出さない
  return check !== null && duplicates.key === key ? duplicates.byItem : [];
};

/**
 * 重複の候補の警告。色だけに頼らず、アイコンと文言を付ける。
 */
const DuplicateWarning = ({ byItem }: { byItem: DuplicateCandidate[][] }) => {
  const candidates = [
    ...new Map(byItem.flat().map((candidate) => [candidate.transactionId, candidate])).values(),
  ];
  if (candidates.length === 0) return null;
  return (
    <div className="flex gap-1.5 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p>
          同じ内訳・金額の支出が前後の日にすでにあります。二重に登録していないか確かめてください。
        </p>
        <ul className="flex flex-col gap-0.5 text-foreground">
          {candidates.map((candidate) => (
            <li key={candidate.transactionId}>
              <Link
                href={`/transactions/${candidate.transactionId}`}
                className="underline underline-offset-4"
              >
                {formatDay(candidate.date)} {candidate.placeName ?? "店舗なし"}{" "}
                {formatYen(candidate.amount)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/**
 * レシートの写真を撮る（選ぶ）ボタンと、撮った写真。
 *
 * `capture="environment"` でスマートフォンでは背面のカメラが開く。PC ではファイルを選べる。
 */
const PhotoPicker = ({
  image,
  reading,
  onPick,
}: {
  image: string | null;
  reading: boolean;
  onPick: (file: File) => void;
}) => {
  const inputId = useId();
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じ写真を選び直しても change が起きるよう、値を空に戻す
    event.target.value = "";
    if (file !== undefined) onPick(file);
  };

  return (
    <div className="flex flex-col gap-3 border-t border-foreground pt-3">
      <div className="flex items-center gap-4">
        <label
          htmlFor={inputId}
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "cursor-pointer",
            reading && "pointer-events-none opacity-50",
          )}
        >
          <Camera />
          {image === null ? "レシートを撮る" : "撮り直す"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={reading}
          onChange={pick}
        />
        {reading && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            読み取っています
          </span>
        )}
      </div>
      {image !== null && (
        <img
          src={image}
          alt="撮影したレシート"
          className="max-h-96 self-start border object-contain"
        />
      )}
    </div>
  );
};

/**
 * 読み取りに自信がないときの知らせ。
 */
const ConfidenceNote = ({ extracted }: { extracted: Extracted }) =>
  extracted.confidence === "high" ? null : (
    <p className="flex gap-1.5 text-xs text-muted-foreground">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      読み取れなかった所があるかもしれません。写真と見比べて確かめてください。（
      {extracted.reasoning}）
    </p>
  );

/**
 * レシートの写真から支出を登録する画面。
 *
 * 写真を撮ると AI が読み取ってフォームに入れる。内容を確かめて直してから登録する。
 * 写真はこの画面の中にだけ持ち、台帳には保存しない。
 */
const ReceiptNewPage = ({ accounts, categories, placeNames, chainNames, today }: Props) => {
  const [image, setImage] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [draft, setDraft] = useState(() => emptyPaymentDraft(today));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const duplicates = useDuplicates(draft);
  const ids = { date: useId(), account: useId(), place: useId() };

  const update = (patch: Partial<TransactionDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const read = async (file: File) => {
    setError(null);
    setReading(true);
    try {
      const resized = await resizeReceiptImage(file);
      setImage(resized);
      const result = await ledgerApi()("/api/receipts/extract", "POST", {
        body: { image: resized },
      });
      setExtracted(result);
      setDraft(draftFromExtracted(result, { categories, accounts, placeNames, chainNames, today }));
    } catch {
      setError("レシートを読み取れませんでした。撮り直すか、手で入力してください");
    } finally {
      setReading(false);
    }
  };

  const register = async () => {
    const parsed = paymentFromDraft(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setPending(true);
    // 登録できると登録した取引の画面へ移る
    const result = await action("/receipts/new", { data: parsed.input });
    setPending(false);
    if (!result.ok) setError(actionErrorMessage(result.error));
  };

  return (
    <form
      className="flex flex-col gap-10"
      onSubmit={(event) => {
        event.preventDefault();
        void register();
      }}
    >
      <Section label={<h1 className="text-2xl font-semibold">レシート</h1>}>
        <PhotoPicker image={image} reading={reading} onPick={(file) => void read(file)} />
      </Section>

      <Section label="支出">
        <div className="flex flex-col gap-4 border-t border-foreground pt-3">
          {extracted !== null && <ConfidenceNote extracted={extracted} />}
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <FormField label="日付" htmlFor={ids.date}>
              <Input
                id={ids.date}
                type="date"
                required
                value={draft.date}
                onChange={(event) => update({ date: event.target.value })}
              />
            </FormField>
            <FormField label="支払元" htmlFor={ids.account}>
              <AccountSelect
                id={ids.account}
                value={draft.fromAccountId}
                accounts={accounts}
                allowEmpty
                onChange={(fromAccountId) => update({ fromAccountId })}
              />
            </FormField>
            <FormField label="店舗" htmlFor={ids.place}>
              <PlaceInput
                id={ids.place}
                value={draft.placeName}
                detail={draft.placeDetail}
                placeNames={placeNames}
                chainNames={chainNames}
                onChange={(placeName, placeDetail) => update({ placeName, placeDetail })}
              />
            </FormField>
          </div>
        </div>
      </Section>

      <Section label="品目">
        <ItemsFields
          mode="payment"
          items={draft.items}
          categories={categories}
          onChange={(items) => update({ items })}
        />
      </Section>

      <Section label="">
        <div className="flex flex-col gap-4">
          <DuplicateWarning byItem={duplicates} />
          {error !== null && <ErrorMessage message={error} />}
          <div>
            <Button
              type="submit"
              size="lg"
              // この画面で押すのはほぼこのボタンだけなので、スマホでは幅いっぱいにして親指で押しやすくする
              className="h-12 w-full text-base sm:h-11 sm:w-auto sm:px-10"
              disabled={pending || reading}
            >
              登録
            </Button>
          </div>
        </div>
      </Section>
    </form>
  );
};

export default ReceiptNewPage;
