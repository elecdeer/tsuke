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
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, buttonStyleProps } from "@tsuke/ui/components/button";
import { visuallyHiddenClassName } from "@tsuke/ui/lib/a11y";
import { PageTitle } from "@tsuke/ui/patterns/PageTitle";
import { createLedgerClient, LedgerFetchError } from "@/client";
import type { DuplicateCandidate } from "@/ledger/payments";
import type { ExtractedPayment } from "@/llm/extractPayment";
import { ErrorMessage } from "@tsuke/ui/patterns/ErrorMessage";
import { ReceiptPhoto, ReceiptPhotoThumbnail } from "@/web/components/ReceiptPhoto";
import { Section } from "@tsuke/ui/patterns/Section";
import { DateInput } from "@tsuke/ui/patterns/DateInput";
import { FormField } from "@tsuke/ui/patterns/FormField";
import {
  AccountSelect,
  ItemsFields,
  ItemsTotal,
  PlaceInput,
} from "@/web/components/TransactionFields";
import { formatDay, formatYen } from "@/web/format";
import {
  draftFromExtracted,
  duplicateCheckFromDraft,
  emptyPaymentDraft,
  paymentFromDraft,
} from "@/web/receiptDraft";
import { receiptCrop } from "@/web/receiptCrop";
import { resizeReceiptImage } from "@/web/receiptImage";
import {
  formatReadTime,
  nextAfterRemoval,
  selectedEntry,
  type ReceiptEntry,
  type ReceiptStatus,
} from "@/web/receiptQueue";
import { isDraftEdited, type TransactionDraft } from "@/web/transactionDraft";
import { useReceiptQueue } from "@/web/useReceiptQueue";
import { cn } from "@tsuke/ui/lib/utils";
import type { Props } from "./new.server";
import styles from "./new.module.css";

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
    <div className={styles.DuplicateWarning}>
      <TriangleAlert className={styles.warningIcon} aria-hidden="true" />
      <div className={styles.warningBody}>
        <p>
          同じ内訳・金額の支出が前後の日にすでにあります。二重に登録していないか確かめてください。
        </p>
        <ul className={styles.candidates}>
          {candidates.map((candidate) => (
            <li key={candidate.transactionId} className={styles.candidate}>
              <Link
                href={`/transactions/${candidate.transactionId}`}
                className={styles.candidateLink}
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
  compact,
  disabled,
  onPick,
}: {
  icon: ReactNode;
  children: ReactNode;
  capture?: "environment";
  multiple?: boolean;
  /** 狭い画面ではアイコンだけにする */
  compact: boolean;
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
        {...buttonStyleProps({ variant: "outline", size: "lg" })}
        className={cn(buttonStyleProps().className, styles.FilePick)}
        data-compact={compact || undefined}
        data-disabled={disabled || undefined}
      >
        {icon}
        <span className={styles.filePickLabel}>{children}</span>
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture={capture}
        multiple={multiple}
        className={visuallyHiddenClassName}
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
const PhotoPicker = ({
  adding,
  compact,
  onPick,
}: {
  adding: boolean;
  compact: boolean;
  onPick: (files: File[]) => void;
}) => (
  <div className={styles.PhotoPicker}>
    <FilePickButton
      icon={<Camera />}
      capture="environment"
      compact={compact}
      disabled={adding}
      onPick={onPick}
    >
      レシートを撮る
    </FilePickButton>
    <FilePickButton
      icon={<ImagePlus />}
      multiple
      compact={compact}
      disabled={adding}
      onPick={onPick}
    >
      写真から選ぶ
    </FilePickButton>
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
          className={cn(styles.StatusIcon, className)}
          data-status={status}
          aria-hidden="true"
        />
      );
    case "read":
      return <CircleCheck className={className} aria-hidden="true" />;
    case "failed":
      return (
        <TriangleAlert
          className={cn(styles.StatusIcon, className)}
          data-status={status}
          aria-hidden="true"
        />
      );
  }
};

/** 一覧の内側の余白（px）。選んでいる枠（線 2px・間隔 2px）が切り取られないだけ取る */
const QUEUE_LIST_PADDING = 4;

/**
 * 撮ったレシートの一覧。押すとそのレシートを確かめる。
 *
 * 登録して次のレシートへ進むと選ぶものが変わるので、選んでいるものが見える所まで一覧を動かす。
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
}) => {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector("[aria-current]");
    if (list === null || item === null || item === undefined) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    // scrollIntoView はページも縦に動かしてしまい、写真を見ている途中で画面が飛ぶので、一覧だけを横に動かす
    list.scrollBy({
      left:
        Math.min(0, itemRect.left - listRect.left - QUEUE_LIST_PADDING) +
        Math.max(0, itemRect.right - listRect.right + QUEUE_LIST_PADDING),
    });
  }, [selectedId]);

  return (
    <ol ref={listRef} aria-label="撮ったレシート" className={styles.QueueList}>
      {entries.map((entry, index) => {
        const selected = entry.id === selectedId;
        const image = images.get(entry.id);
        return (
          <li key={entry.id} className={styles.queueItem}>
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              aria-label={`${index + 1} 枚目（${STATUS_LABELS[entry.status]}）`}
              className={styles.queueButton}
              onClick={() => onSelect(entry.id)}
            >
              {image !== undefined && <img src={image} alt="" className={styles.queueImage} />}
              <span className={styles.queueStatus}>
                <StatusIcon status={entry.status} className={styles.queueStatusIcon} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
};

/**
 * 読み取りに自信がないときの知らせ。
 */
const ConfidenceNote = ({ extracted }: { extracted: ExtractedPayment }) =>
  extracted.confidence === "high" ? null : (
    <p className={styles.Note}>
      <Info className={styles.noteIcon} aria-hidden="true" />
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
  const ids = { form: useId(), date: useId(), account: useId(), place: useId() };
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
    const model = entry.extracted?.model;
    try {
      const { id } = await ledgerApi()("/api/transactions", "POST", {
        body: {
          ...parsed.input,
          placePhone: entry.extracted?.placePhone ?? null,
          receiptImage: image,
          ...(model !== undefined && { aiRead: { source: "receipt" as const, model } }),
        },
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

  const footer = (
    <div className={styles.Footer}>
      {ready && <DuplicateWarning byItem={duplicates} />}
      {error !== null && <ErrorMessage message={error} />}
      <div className={styles.footerRow}>
        {/* 広い画面では写真を隣に並べているので、見本は狭い画面だけに出す */}
        {image !== undefined && (
          <ReceiptPhotoThumbnail
            src={image}
            crop={receiptCrop(entry.extracted?.receiptBox)}
            className={styles.thumbnail}
          />
        )}
        {/* 写真と最初に見比べる数字なので、フォームをスクロールしていても見えるようにする */}
        {ready && (
          <ItemsTotal
            items={draft.items}
            expected={entry.extracted?.total ?? null}
            className={styles.total}
          />
        )}
        <Button
          type="submit"
          form={ids.form}
          // この画面で押すのはほぼこのボタンだけなので、スマホでは親指で押しやすい大きさにする
          size="xl"
          className={styles.submit}
          disabled={pending || !ready}
        >
          登録
        </Button>
      </div>
    </div>
  );

  return (
    <div className={styles.Review}>
      <form
        id={ids.form}
        className={styles.ReviewForm}
        onSubmit={(event) => {
          event.preventDefault();
          void register();
        }}
      >
        <Section label="支出">
          <div className={styles.Payment}>
            {entry.status === "waiting" || entry.status === "reading" ? (
              <p className={styles.reading}>
                <LoaderCircle
                  className={styles.readingIcon}
                  data-spinning={entry.status === "reading" || undefined}
                  aria-hidden="true"
                />
                {entry.status === "reading"
                  ? "読み取っています。ほかのレシートを撮って待てます"
                  : "読み取りの順番を待っています"}
              </p>
            ) : entry.status === "failed" ? (
              <div className={styles.failed}>
                <ErrorMessage message="レシートを読み取れませんでした。読み直すか、手で入力してください" />
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  <RotateCw />
                  読み直す
                </Button>
              </div>
            ) : (
              entry.extracted !== null && <ConfidenceNote extracted={entry.extracted} />
            )}
            {ready && (
              <div className={styles.fields}>
                <FormField label="日付" htmlFor={ids.date}>
                  <DateInput
                    id={ids.date}
                    required
                    value={draft.date}
                    onChange={(date) => update({ date })}
                  />
                </FormField>
                <FormField label="支払元" htmlFor={ids.account}>
                  <AccountSelect
                    id={ids.account}
                    value={draft.fromAccountId}
                    accounts={accounts}
                    allowEmpty={false}
                    // 読み取れなかったときに選び忘れないよう、登録を試みる前から赤くする
                    invalid={draft.fromAccountId === ""}
                    onChange={(fromAccountId) => update({ fromAccountId })}
                  />
                </FormField>
                <FormField label="店舗" htmlFor={ids.place} className={styles.placeField}>
                  <PlaceInput
                    id={ids.place}
                    value={draft.placeName}
                    detail={draft.placeDetail}
                    placeNames={placeNames}
                    chainNames={chainNames}
                    // AI が読んだ名前が登録済みの店舗と少し違うだけでも新しい店舗になるので、目立たせる
                    warnNewPlace
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

        <div className={styles.AfterActions}>
          {/* 結果を写真と見比べた後に使うものなので、見比べる品目より後ろに置く */}
          {entry.status === "read" && (
            <>
              {entry.readMs !== undefined && (
                <p className={styles.readTime}>
                  読み取りにかかった時間: {formatReadTime(entry.readMs)}
                </p>
              )}
              <div className={styles.reread}>
                <Button type="button" variant="outline" size="sm" onClick={onReread}>
                  <RotateCw />
                  もう一度読み取る
                </Button>
                <span className={styles.rereadNote}>
                  少し時間はかかりますが、より正確に読み取ります
                </span>
              </div>
            </>
          )}
          <Button type="button" variant="ghost" flush disabled={pending} onClick={discard}>
            <Trash2 />
            捨てる
          </Button>
        </div>
      </form>
      {footer}
    </div>
  );
};

/**
 * 登録できたことの知らせ。登録した取引を開いて直せるよう、取引への入口を付ける。
 */
const RegisteredNotice = ({ transactionId }: { transactionId: number }) => (
  <output className={styles.RegisteredNotice}>
    <CircleCheck className={styles.noticeIcon} aria-hidden="true" />
    登録しました。
    <Link href={`/transactions/${transactionId}`} className={styles.noticeLink}>
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

  const reviewing = selected !== null;

  return (
    <div className={styles.ReceiptNewPage} data-reviewing={reviewing || undefined}>
      <Section
        label={
          // 確かめている間は写真を広く見せたい。狭い画面では下のナビで今の画面が分かるので、見出しは読み上げだけにする
          <PageTitle className={styles.Title} data-reviewing={reviewing || undefined}>
            レシート
          </PageTitle>
        }
      >
        <div className={styles.Capture} data-reviewing={reviewing || undefined}>
          <div className={styles.captureRow}>
            <PhotoPicker adding={adding} compact={reviewing} onPick={(files) => void add(files)} />
            {unconfirmed > 0 && (
              <p className={styles.unconfirmed}>
                確かめていないレシート {unconfirmed} 枚
                {selected !== null &&
                  `（${queue.entries.indexOf(selected) + 1} 枚目・${STATUS_LABELS[selected.status]}）`}
              </p>
            )}
            {unconfirmed > 0 && (
              <QueueList
                entries={queue.entries}
                images={queue.images}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
              />
            )}
          </div>
          <Link
            href="/transactions/new"
            className={styles.manualLink}
            data-reviewing={reviewing || undefined}
          >
            レシートなしで手で入力する
          </Link>
          {adding && (
            <span className={styles.adding}>
              <LoaderCircle className={styles.addingIcon} aria-hidden="true" />
              写真を取り込んでいます
            </span>
          )}
          {addError !== null && <ErrorMessage message={addError} />}
          {registeredId !== null && <RegisteredNotice transactionId={registeredId} />}
          {queue.loaded && unconfirmed === 0 && registeredId === null && (
            <p className={styles.hint}>
              レシートを撮ると AI が読み取ります。続けて何枚でも撮れます。
            </p>
          )}
        </div>
      </Section>

      {selected !== null && (
        <div className={styles.Workspace}>
          {/* 狭い画面では写真を隣に並べる幅がないので、下の帯の見本から開く */}
          <div className={styles.photo}>
            {image !== undefined && (
              <ReceiptPhoto
                // レシートごとに全体の表示を選び直す。範囲が外れたレシートのための切り替えなので、次へ持ち越さない
                key={selected.id}
                src={image}
                crop={receiptCrop(selected.extracted?.receiptBox)}
                alt="確かめているレシート"
              />
            )}
          </div>
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
        </div>
      )}
    </div>
  );
};

export default ReceiptNewPage;
