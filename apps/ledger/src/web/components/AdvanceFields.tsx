import { Link } from "@void/react";
import { Plus, TriangleAlert, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@tsuke/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@tsuke/ui/components/dialog";
import { Input } from "@tsuke/ui/components/input";
import { advanceStatusOf, unreceivedAmountOf } from "@/ledger/advance";
import type {
  LinkedIncome,
  ReimbursablePayment,
  ReimbursementCandidate,
} from "@/ledger/reimbursements";
import { FormField } from "@tsuke/ui/patterns/FormField";
import { formatAmount, formatDay } from "@/web/format";
import { ADVANCE_STATUS_LABELS } from "@/web/labels";
import {
  allocateReimbursements,
  draftAmountOf,
  itemsTotalOf,
  toggleAdvanceTarget,
  type ReimbursementDraft,
  type TransactionDraft,
} from "@/web/transactionDraft";

const CHECKBOX_CLASS = "size-3.5 shrink-0 accent-foreground";

/**
 * 支出の立替額の入力。対象の品目の印と、紐付いた収入も出す。
 *
 * 品目が 1 件なら印を付けても意味がないので、印の欄は複数の品目があるときだけ出す。
 */
export const PaymentAdvanceFields = ({
  draft,
  linkedIncomes,
  update,
}: {
  draft: TransactionDraft;
  linkedIncomes: readonly LinkedIncome[];
  update: (patch: Partial<TransactionDraft>) => void;
}) => {
  const amountId = useId();
  const advanceAmount = draftAmountOf(draft.advanceAmount ?? "");
  const linkedAmount = linkedIncomes.reduce((sum, income) => sum + income.amount, 0);
  const unreceived = unreceivedAmountOf(advanceAmount, linkedAmount);
  const status = advanceStatusOf(advanceAmount, linkedAmount);

  return (
    <div className="flex flex-col gap-4 border-t border-foreground pt-3">
      <div className="grid gap-x-6 gap-y-1 @md:grid-cols-2 @md:items-end">
        <FormField label="立替額" htmlFor={amountId}>
          <Input
            id={amountId}
            inputMode="numeric"
            className="text-right tabular-nums"
            placeholder="0"
            value={draft.advanceAmount ?? ""}
            onChange={(event) => update({ advanceAmount: event.target.value })}
          />
        </FormField>
        <dl className="flex flex-wrap gap-x-5 pb-1.5 text-xs text-muted-foreground">
          {status !== "none" && (
            <dd className="text-foreground">{ADVANCE_STATUS_LABELS[status]}</dd>
          )}
          <div className="flex gap-1.5">
            <dt>負担額</dt>
            <dd className="text-foreground tabular-nums">
              {formatAmount(itemsTotalOf(draft.items) - advanceAmount)}
            </dd>
          </div>
          {unreceived > 0 && (
            <div className="flex gap-1.5">
              <dt>未入金</dt>
              <dd className="text-foreground tabular-nums">{formatAmount(unreceived)}</dd>
            </div>
          )}
        </dl>
      </div>

      {draft.items.length > 1 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="pb-1 text-xs text-muted-foreground">
            対象の品目（印がなければすべて）
          </legend>
          {draft.items.map((item, index) => (
            <label key={item.key} className="flex items-baseline gap-2 text-sm">
              <input
                type="checkbox"
                className={`${CHECKBOX_CLASS} self-center`}
                checked={item.isAdvanceTarget ?? false}
                onChange={(event) =>
                  update(toggleAdvanceTarget(draft.items, item.key, event.target.checked))
                }
              />
              <span className="min-w-0 flex-1 truncate">
                {item.name === "" ? `${index + 1} 件目の品目` : item.name}
              </span>
              <span className="tabular-nums">{formatAmount(draftAmountOf(item.amount))}</span>
            </label>
          ))}
        </fieldset>
      )}

      {linkedIncomes.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">紐付いた収入</p>
          <ul className="border-t">
            {linkedIncomes.map((income) => (
              <li key={income.incomeId} className="border-b">
                <Link
                  href={`/transactions/${income.incomeId}`}
                  className="flex items-baseline justify-between gap-4 py-1.5 text-sm hover:bg-muted/60"
                >
                  <span className="min-w-0 truncate">
                    {formatDay(income.date)} {income.placeName ?? income.accountName ?? "収入"}
                  </span>
                  <span className="tabular-nums">+{formatAmount(income.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {unreceived > 0 && (
            <Button
              variant="ghost"
              className="-ml-2.5 self-start text-muted-foreground"
              onClick={() => update({ advanceAmount: String(linkedAmount) })}
            >
              残りは返ってこないので確定する
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 収入に紐付ける支出を探して選ぶダイアログ。店舗か品目の名前で探す。
 */
const ReimbursementPicker = ({
  candidates,
  excludedIds,
  onPick,
}: {
  candidates: readonly ReimbursementCandidate[];
  excludedIds: readonly number[];
  onPick: (payment: ReimbursablePayment) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const keyword = query.trim();
  const shown = candidates.filter(
    (candidate) =>
      !excludedIds.includes(candidate.paymentId) && candidate.searchText.includes(keyword),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" className="-ml-2.5 text-muted-foreground" />}>
        <Plus />
        支出を紐付ける
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>紐付ける支出</DialogTitle>
        </DialogHeader>
        <Input
          aria-label="店舗や品目の名前で探す"
          placeholder="店舗や品目の名前で探す"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="max-h-80 overflow-y-auto border-t">
          {shown.length === 0 && (
            <li className="py-2.5 text-sm text-muted-foreground">条件に合う支出はありません</li>
          )}
          {shown.map((candidate) => {
            const unreceived = unreceivedAmountOf(candidate.advanceAmount, candidate.otherLinked);
            return (
              <li key={candidate.paymentId} className="border-b">
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-4 py-2 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    const { searchText: _searchText, ...payment } = candidate;
                    onPick(payment);
                    setOpen(false);
                  }}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate">
                      {formatDay(candidate.date)} {candidate.title ?? "支出"}
                    </span>
                    {unreceived > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        未入金 {formatAmount(unreceived)}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatAmount(candidate.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
};

/**
 * 紐付けた支出 1 件の行。充てる額と、まだ入金があるかを入れる。
 */
const ReimbursementRow = ({
  reimbursement,
  onChange,
  onRemove,
}: {
  reimbursement: ReimbursementDraft;
  onChange: (patch: Partial<ReimbursementDraft>) => void;
  onRemove: () => void;
}) => {
  const { payment, amount, expectMore } = reimbursement;
  // 「まだ入金がある」を選ばなければ充てた額で確定するので、残りが出るのは選んだときだけ
  const unreceived = expectMore
    ? unreceivedAmountOf(payment.advanceAmount, payment.otherLinked + draftAmountOf(amount))
    : 0;
  return (
    <li className="flex flex-col gap-2 border-b py-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <Link
          href={`/transactions/${payment.paymentId}`}
          className="min-w-0 truncate text-sm hover:underline"
        >
          {formatDay(payment.date)} {payment.title ?? "支出"}
        </Link>
        <button
          type="button"
          aria-label="紐付けを外す"
          className="p-0.5 text-muted-foreground hover:text-foreground"
          onClick={onRemove}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        全額 {formatAmount(payment.total)}・立替額 {formatAmount(payment.advanceAmount)}
        {payment.otherLinked > 0 && `・他の入金 ${formatAmount(payment.otherLinked)}`}
        {unreceived > 0 && `・未入金 ${formatAmount(unreceived)}`}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className={CHECKBOX_CLASS}
            checked={expectMore}
            onChange={(event) => onChange({ expectMore: event.target.checked })}
          />
          まだ入金がある
        </label>
        <Input
          aria-label="この支出へ充てる額"
          inputMode="numeric"
          className="w-28 text-right tabular-nums"
          value={amount}
          onChange={(event) => onChange({ amount: event.target.value })}
        />
      </div>
    </li>
  );
};

/**
 * 収入に立替の支出を紐付ける入力。金額は支出へ配分した候補を入れ、保存の前に直せる。
 */
export const IncomeReimbursementFields = ({
  candidates,
  draft,
  update,
}: {
  candidates: readonly ReimbursementCandidate[];
  draft: TransactionDraft;
  update: (patch: Partial<TransactionDraft>) => void;
}) => {
  const reimbursements = draft.reimbursements ?? [];
  const incomeAmount = itemsTotalOf(draft.items);
  const allocated = reimbursements.reduce(
    (sum, reimbursement) => sum + draftAmountOf(reimbursement.amount),
    0,
  );
  const setReimbursements = (next: ReimbursementDraft[]) =>
    update({ reimbursements: allocateReimbursements(next, incomeAmount) });

  return (
    <div className="flex flex-col gap-2 border-t border-foreground">
      {reimbursements.length > 0 && (
        <ul>
          {reimbursements.map((reimbursement, index) => (
            <ReimbursementRow
              key={reimbursement.payment.paymentId}
              reimbursement={reimbursement}
              onChange={(patch) =>
                update({
                  reimbursements: reimbursements.map((value, i) =>
                    i === index ? { ...value, ...patch } : value,
                  ),
                })
              }
              onRemove={() => setReimbursements(reimbursements.filter((_, i) => i !== index))}
            />
          ))}
        </ul>
      )}
      {reimbursements.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>充てた額の合計</span>
            <span className="text-foreground tabular-nums">
              {formatAmount(allocated)} / {formatAmount(incomeAmount)}
            </span>
          </div>
          {allocated !== incomeAmount && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-destructive">
              <span className="flex items-center gap-1">
                <TriangleAlert className="size-3.5" aria-hidden="true" />
                収入の金額と {formatAmount(Math.abs(allocated - incomeAmount))} ずれています
              </span>
              <Button variant="ghost" size="sm" onClick={() => setReimbursements(reimbursements)}>
                配分し直す
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            紐付いた収入は集計に含めません。支出の立替額は、「まだ入金がある」を選ばなければ充てた額で確定します。
          </p>
        </div>
      )}
      <div className={reimbursements.length === 0 ? "pt-1" : undefined}>
        <ReimbursementPicker
          candidates={candidates}
          excludedIds={reimbursements.map((reimbursement) => reimbursement.payment.paymentId)}
          onPick={(payment) => {
            update({
              aggregation: "never",
              reimbursements: allocateReimbursements(
                [...reimbursements, { payment, amount: "", expectMore: false }],
                incomeAmount,
              ),
            });
          }}
        />
      </div>
    </div>
  );
};
