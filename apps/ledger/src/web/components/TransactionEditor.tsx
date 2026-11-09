import { Check, Info, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CategoryWithGenres } from "@/ledger/masters";
import type { ReimbursementCandidate } from "@/ledger/reimbursements";
import type { getTransaction, TransactionUpdate } from "@/ledger/transactionEdit";
import { actionErrorMessage } from "@/web/actionError";
import { IncomeReimbursementFields, PaymentAdvanceFields } from "@/web/components/AdvanceFields";
import { ErrorMessage } from "@/web/components/ErrorMessage";
import { Section } from "@/web/components/Section";
import { TransactionDraftFields, type AccountOption } from "@/web/components/TransactionFields";
import { MODE_LABELS } from "@/web/labels";
import {
  allocateReimbursements,
  draftFromTransaction,
  hasAdvanceInput,
  itemsTotalOf,
  updateFromDraft,
  type TransactionDraft,
} from "@/web/transactionDraft";

type Transaction = NonNullable<Awaited<ReturnType<typeof getTransaction>>>;

/** 保存・削除の結果。失敗したときの error は Void のアクションのエラー（VoidActionError）の形 */
export type EditorActionResult =
  | { ok: true }
  | { ok: false; error: { body: unknown; message: string } };

/**
 * 取引を消す確認のダイアログ。
 */
const DeleteButton = ({ onDelete }: { onDelete: () => Promise<EditorActionResult> }) => {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const remove = async () => {
    setPending(true);
    const result = await onDelete();
    setPending(false);
    if (!result.ok) setError(actionErrorMessage(result.error));
  };

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" className="text-destructive" />}>
        <Trash2 />
        削除
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>この取引を削除しますか？</DialogTitle>
          <DialogDescription>品目もすべて消え、元に戻せません。</DialogDescription>
        </DialogHeader>
        {error !== null && <ErrorMessage message={error} />}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>やめる</DialogClose>
          <Button variant="destructive" disabled={pending} onClick={() => void remove()}>
            削除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export type TransactionEditorProps = {
  transaction: Transaction;
  accounts: AccountOption[];
  categories: { payment: CategoryWithGenres[]; income: CategoryWithGenres[] };
  placeNames: string[];
  chainNames: string[];
  /** 収入に紐付ける支出の候補 */
  reimbursementCandidates: ReimbursementCandidate[];
  /** 保存したか。作り直しても「保存しました」を出し続けられるよう、親が持つ */
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  /** 保存する。成功すると loader が走り直す */
  onSave: (input: TransactionUpdate) => Promise<EditorActionResult>;
  /** 削除する */
  onDelete: () => Promise<EditorActionResult>;
};

/**
 * 取引の編集フォーム。取引の画面と、取引の一覧のサイドパネルの両方で使う。
 *
 * 保存すると loader が走り直すので、親は key を変えてこのフォームを作り直す。
 * 保存・削除のアクションは置き場所ごとに違う（サイドパネルからは一覧の画面のアクションを呼ぶ）ので、親から受け取る。
 */
export const TransactionEditor = ({
  transaction,
  accounts,
  categories,
  placeNames,
  chainNames,
  reimbursementCandidates,
  saved,
  onSavedChange,
  onSave,
  onDelete,
}: TransactionEditorProps) => {
  const { mode } = transaction;
  const [draft, setDraft] = useState(() => draftFromTransaction(transaction));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 立替を使う取引は少ないので、入力がなければ欄を畳んでおく。開いたあと空にしても畳み直さない（入力中に消えると戸惑うため）
  const [advanceOpen, setAdvanceOpen] = useState(
    () => hasAdvanceInput(draft) || transaction.linkedIncomes.length > 0,
  );

  const update = (patch: Partial<TransactionDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    onSavedChange(false);
  };
  /** 紐付けのある収入の金額を変えたら、支出へ充てる額も配分し直す */
  const updateItems = (items: TransactionDraft["items"]) => {
    const reimbursements = draft.reimbursements ?? [];
    update(
      reimbursements.length > 0
        ? { items, reimbursements: allocateReimbursements(reimbursements, itemsTotalOf(items)) }
        : { items },
    );
  };
  const save = async () => {
    const parsed = updateFromDraft(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setPending(true);
    const result = await onSave(parsed.input);
    setPending(false);
    if (result.ok) onSavedChange(true);
    else setError(actionErrorMessage(result.error));
  };

  return (
    <form
      className="flex flex-col gap-10"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <TransactionDraftFields
        mode={mode}
        heading={<h1 className="text-2xl font-semibold">{MODE_LABELS[mode]}</h1>}
        draft={draft}
        accounts={accounts}
        categories={categories}
        placeNames={placeNames}
        chainNames={chainNames}
        update={update}
        onItemsChange={updateItems}
      />

      {(mode === "payment" || mode === "income") && !advanceOpen && (
        <Section label="">
          <Button
            variant="ghost"
            className="-ml-2.5 text-muted-foreground"
            onClick={() => setAdvanceOpen(true)}
          >
            <Plus />
            {mode === "payment" ? "立替を入力" : "立替の入金を紐付ける"}
          </Button>
        </Section>
      )}

      {mode === "payment" && advanceOpen && (
        <Section label="立替">
          <PaymentAdvanceFields
            draft={draft}
            linkedIncomes={transaction.linkedIncomes}
            update={update}
          />
        </Section>
      )}

      {mode === "income" && advanceOpen && (
        <Section label="立替の入金">
          <IncomeReimbursementFields
            candidates={reimbursementCandidates}
            draft={draft}
            update={update}
          />
        </Section>
      )}

      {transaction.hasReceiptImage && (
        <Section label="レシート">
          <a
            href={`/api/transactions/${transaction.id}/receipt-image`}
            target="_blank"
            rel="noreferrer"
            className="block w-fit"
          >
            <img
              src={`/api/transactions/${transaction.id}/receipt-image`}
              alt="この取引のレシート"
              loading="lazy"
              className="max-h-96 border object-contain"
            />
          </a>
        </Section>
      )}

      <Section label="">
        <div className="flex flex-col gap-4">
          {transaction.source === "zaim_csv" && (
            <p className="flex gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              Zaim
              から取り込んだ取引です。拡張機能を台帳に切り替える前に直すと、切り替えのときの再取り込みで元に戻ります。
            </p>
          )}
          {error !== null && <ErrorMessage message={error} />}
          <div className="flex items-center gap-4">
            <Button type="submit" size="lg" disabled={pending}>
              保存
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="size-4" aria-hidden="true" />
                保存しました
              </span>
            )}
            <div className="ml-auto">
              <DeleteButton onDelete={onDelete} />
            </div>
          </div>
        </div>
      </Section>
    </form>
  );
};
