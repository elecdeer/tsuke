import { Link } from "@void/react";
import {
  Camera,
  CircleCheck,
  ImagePlus,
  Info,
  LoaderCircle,
  RotateCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createLedgerClient, LedgerFetchError } from "@/client";
import type { DuplicateCandidate } from "@/ledger/payments";
import type { ExtractedPayment } from "@/llm/extractPayment";
import { ErrorMessage } from "@/web/components/ErrorMessage";
import { Section } from "@/web/components/Section";
import {
  AccountSelect,
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
import {
  nextAfterRemoval,
  selectedEntry,
  type ReceiptEntry,
  type ReceiptStatus,
} from "@/web/receiptQueue";
import { isDraftEdited, type TransactionDraft } from "@/web/transactionDraft";
import { useReceiptQueue } from "@/web/useReceiptQueue";
import { cn } from "@/lib/utils";
import type { Props } from "./new.server";

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
 * 写真を選ぶボタン 1 つ。label の中に file の input を隠す。
 */
const FilePickButton = ({
  icon,
  children,
  capture,
  multiple,
  disabled,
  onPick,
}: {
  icon: ReactNode;
  children: ReactNode;
  capture?: "environment";
  multiple?: boolean;
  disabled: boolean;
  onPick: (files: File[]) => void;
}) => {
  const inputId = useId();
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    // 同じ写真を選び直しても change が起きるよう、値を空に戻す
    event.target.value = "";
    if (files.length > 0) onPick(files);
  };
  return (
    <>
      <label
        htmlFor={inputId}
        className={cn(
          buttonVariants({ variant: "outline", size: "lg" }),
          "cursor-pointer",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {icon}
        {children}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture={capture}
        multiple={multiple}
        className="sr-only"
        disabled={disabled}
        onChange={pick}
      />
    </>
  );
};

/**
 * レシートを撮る（選ぶ）ボタン。撮った写真はキューに溜まり、確かめている間も続けて撮れる。
 *
 * `capture="environment"` でスマートフォンでは背面のカメラが開く。カメラは 1 枚ずつしか撮れないので、
 * 撮りためた写真をまとめて足せるよう、写真から選ぶボタンも置く。
 */
const PhotoPicker = ({ adding, onPick }: { adding: boolean; onPick: (files: File[]) => void }) => (
  <div className="flex flex-wrap items-center gap-3">
    <FilePickButton icon={<Camera />} capture="environment" disabled={adding} onPick={onPick}>
      レシートを撮る
    </FilePickButton>
    <FilePickButton icon={<ImagePlus />} multiple disabled={adding} onPick={onPick}>
      写真から選ぶ
    </FilePickButton>
    {adding && (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        写真を取り込んでいます
      </span>
    )}
  </div>
);

const STATUS_LABELS: Record<ReceiptStatus, string> = {
  waiting: "読み取り待ち",
  reading: "読み取り中",
  read: "確認待ち",
  failed: "読み取り失敗",
};

/**
 * 状態のアイコン。読み取っている間は回し、失敗したら警告にする。
 */
const StatusIcon = ({ status, className }: { status: ReceiptStatus; className?: string }) => {
  switch (status) {
    case "waiting":
    case "reading":
      return (
        <LoaderCircle
          className={cn(status === "reading" && "animate-spin", className)}
          aria-hidden="true"
        />
      );
    case "read":
      return <CircleCheck className={className} aria-hidden="true" />;
    case "failed":
      return <TriangleAlert className={cn("text-destructive", className)} aria-hidden="true" />;
  }
};

/**
 * 撮ったレシートの一覧。押すとそのレシートを確かめる。
 */
const QueueList = ({
  entries,
  images,
  selectedId,
  onSelect,
}: {
  entries: ReceiptEntry[];
  images: ReadonlyMap<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => (
  <ol aria-label="撮ったレシート" className="flex gap-2 overflow-x-auto pb-1">
    {entries.map((entry, index) => {
      const selected = entry.id === selectedId;
      const image = images.get(entry.id);
      return (
        <li key={entry.id} className="shrink-0">
          <button
            type="button"
            aria-current={selected ? "true" : undefined}
            aria-label={`${index + 1} 枚目（${STATUS_LABELS[entry.status]}）`}
            className={cn(
              "relative block h-24 w-16 overflow-hidden border bg-muted outline-offset-2",
              selected && "outline-2 outline-primary",
            )}
            onClick={() => onSelect(entry.id)}
          >
            {image !== undefined && <img src={image} alt="" className="size-full object-cover" />}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-background/85 py-0.5">
              <StatusIcon status={entry.status} className="size-3.5" />
            </span>
          </button>
        </li>
      );
    })}
  </ol>
);

/**
 * 読み取りに自信がないときの知らせ。
 */
const ConfidenceNote = ({ extracted }: { extracted: ExtractedPayment }) =>
  extracted.confidence === "high" ? null : (
    <p className="flex gap-1.5 text-xs text-muted-foreground">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      読み取れなかった所があるかもしれません。写真と見比べて確かめてください。（
      {extracted.reasoning}）
    </p>
  );

/**
 * 登録に失敗したときに画面に出す文言。台帳が `{ error: string }` を返していればそれを使う。
 */
const registerErrorMessage = (error: unknown): string => {
  if (error instanceof LedgerFetchError) {
    const { data } = error;
    if (typeof data === "object" && data !== null && "error" in data) {
      const message: unknown = data.error;
      if (typeof message === "string") return message;
    }
  }
  return "登録できませんでした";
};

/**
 * 確かめているレシートのフォーム。読み取りが済むまでは写真と進み具合だけを出す。
 */
const ReceiptReview = ({
  entry,
  image,
  draft,
  accounts,
  categories,
  placeNames,
  chainNames,
  onChange,
  onRetry,
  onReread,
  onDiscard,
  onRegistered,
}: Pick<Props, "accounts" | "categories" | "placeNames" | "chainNames"> & {
  entry: ReceiptEntry;
  /** 登録する取引と一緒に保存する写真 */
  image: string | undefined;
  draft: TransactionDraft;
  onChange: (draft: TransactionDraft) => void;
  onRetry: () => void;
  onReread: () => void;
  onDiscard: () => void;
  onRegistered: (transactionId: number) => void;
}) => {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const duplicates = useDuplicates(draft);
  const ids = { date: useId(), account: useId(), place: useId() };
  const ready = entry.status === "read" || entry.status === "failed";

  const update = (patch: Partial<TransactionDraft>) => onChange({ ...draft, ...patch });

  const register = async () => {
    const parsed = paymentFromDraft(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { id } = await ledgerApi()("/api/transactions", "POST", {
        body: { ...parsed.input, receiptImage: image },
      });
      onRegistered(id);
    } catch (registerError) {
      setError(registerErrorMessage(registerError));
      setPending(false);
    }
  };

  const discard = () => {
    // 登録するまで写真は端末にしか残っていないので、捨てる前に確かめる
    if (window.confirm("このレシートを登録せずに捨てますか？")) onDiscard();
  };

  return (
    <form
      className="flex flex-col gap-10"
      onSubmit={(event) => {
        event.preventDefault();
        void register();
      }}
    >
      <Section label="支出">
        <div className="flex flex-col gap-4 border-t border-foreground pt-3">
          {entry.status === "waiting" || entry.status === "reading" ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <LoaderCircle
                className={cn("size-4", entry.status === "reading" && "animate-spin")}
                aria-hidden="true"
              />
              {entry.status === "reading"
                ? "読み取っています。ほかのレシートを撮って待てます"
                : "読み取りの順番を待っています"}
            </p>
          ) : entry.status === "failed" ? (
            <div className="flex flex-wrap items-center gap-3">
              <ErrorMessage message="レシートを読み取れませんでした。読み直すか、手で入力してください" />
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                <RotateCw />
                読み直す
              </Button>
            </div>
          ) : (
            <>
              {entry.extracted !== null && <ConfidenceNote extracted={entry.extracted} />}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button type="button" variant="outline" size="sm" onClick={onReread}>
                  <RotateCw />
                  もう一度読み取る
                </Button>
                <span className="text-xs text-muted-foreground">
                  少し時間はかかりますが、より正確に読み取ります
                </span>
              </div>
            </>
          )}
          {ready && (
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
          )}
        </div>
      </Section>

      {ready && (
        <Section label="品目">
          <ItemsFields
            mode="payment"
            items={draft.items}
            categories={categories}
            onChange={(items) => update({ items })}
          />
        </Section>
      )}

      <Section label="">
        <div className="flex flex-col gap-4">
          {ready && <DuplicateWarning byItem={duplicates} />}
          {error !== null && <ErrorMessage message={error} />}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="submit"
              size="lg"
              // この画面で押すのはほぼこのボタンだけなので、スマホでは幅いっぱいにして親指で押しやすくする
              className="h-12 w-full text-base sm:h-11 sm:w-auto sm:px-10"
              disabled={pending || !ready}
            >
              登録
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={discard}>
              <Trash2 />
              捨てる
            </Button>
          </div>
        </div>
      </Section>
    </form>
  );
};

/**
 * 登録できたことの知らせ。登録した取引を開いて直せるよう、取引への入口を付ける。
 */
const RegisteredNotice = ({ transactionId }: { transactionId: number }) => (
  <output className="flex items-center gap-1.5 text-sm">
    <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
    登録しました。
    <Link href={`/transactions/${transactionId}`} className="underline underline-offset-4">
      登録した取引を開く
    </Link>
  </output>
);

/**
 * レシートの写真から支出を登録する画面。
 *
 * 撮った写真はキューに溜まり、裏で AI が順に読み取る。読み取れたものから 1 枚ずつ確かめて登録し、
 * 登録すると次のレシートへ進む。キューは端末の IndexedDB に保存し、写真は登録したものだけ台帳に保存する。
 */
const ReceiptNewPage = ({ accounts, categories, placeNames, chainNames, today }: Props) => {
  const toDraft = (extracted: ExtractedPayment | null): TransactionDraft =>
    extracted === null
      ? emptyPaymentDraft(today)
      : draftFromExtracted(extracted, { categories, accounts, placeNames, chainNames, today });
  const queue = useReceiptQueue({
    read: (image, quality) =>
      ledgerApi()("/api/receipts/extract", "POST", { body: { image, quality } }),
    toDraft,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [registeredId, setRegisteredId] = useState<number | null>(null);
  const selected = selectedEntry(queue.entries, selectedId);
  const unconfirmed = queue.entries.length;

  const add = async (files: File[]) => {
    setAddError(null);
    setAdding(true);
    let failed = 0;
    // 撮った順を保つよう、1 枚ずつ縮めて足す
    for (const file of files) {
      try {
        queue.add(await resizeReceiptImage(file));
      } catch {
        failed += 1;
      }
    }
    setAdding(false);
    if (failed > 0) setAddError(`${failed} 枚の写真を取り込めませんでした`);
  };

  /** キューから外し、次のレシートを選ぶ */
  const removeSelected = (id: string) => {
    setSelectedId(nextAfterRemoval(queue.entries, id));
    queue.remove(id);
  };

  /** より正確なモデルで読み直す。読み取り結果で置き換わるので、直した内容があれば先に確かめる */
  const reread = (entry: ReceiptEntry) => {
    const edited =
      entry.draft !== null &&
      entry.extracted !== null &&
      isDraftEdited(entry.draft, toDraft(entry.extracted));
    if (edited && !window.confirm("直した内容は読み取りの結果に置き換わります。読み直しますか？")) {
      return;
    }
    queue.rereadAccurately(entry.id);
  };

  const image = selected === null ? undefined : queue.images.get(selected.id);

  return (
    <div className="flex flex-col gap-10">
      <Section label={<h1 className="text-2xl font-semibold">レシート</h1>}>
        <div className="flex flex-col gap-3 border-t border-foreground pt-3">
          <PhotoPicker adding={adding} onPick={(files) => void add(files)} />
          {addError !== null && <ErrorMessage message={addError} />}
          {registeredId !== null && <RegisteredNotice transactionId={registeredId} />}
          {unconfirmed > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                確かめていないレシート {unconfirmed} 枚
                {selected !== null &&
                  `（${queue.entries.indexOf(selected) + 1} 枚目・${STATUS_LABELS[selected.status]}）`}
              </p>
              <QueueList
                entries={queue.entries}
                images={queue.images}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
              />
            </div>
          )}
          {queue.loaded && unconfirmed === 0 && registeredId === null && (
            <p className="text-sm text-muted-foreground">
              レシートを撮ると AI が読み取ります。続けて何枚でも撮れます。
            </p>
          )}
          {image !== undefined && (
            <img
              src={image}
              alt="確かめているレシート"
              className="max-h-96 self-start border object-contain"
            />
          )}
        </div>
      </Section>

      {selected !== null && (
        <ReceiptReview
          // レシートを切り替えたら、エラーや重複の確かめを前のレシートから持ち越さない
          key={selected.id}
          entry={selected}
          image={image}
          draft={selected.draft ?? emptyPaymentDraft(today)}
          accounts={accounts}
          categories={categories}
          placeNames={placeNames}
          chainNames={chainNames}
          onChange={(draft) => queue.updateDraft(selected.id, draft)}
          onRetry={() => queue.retry(selected.id)}
          onReread={() => reread(selected)}
          onDiscard={() => removeSelected(selected.id)}
          onRegistered={(transactionId) => {
            setRegisteredId(transactionId);
            removeSelected(selected.id);
          }}
        />
      )}
    </div>
  );
};

export default ReceiptNewPage;
