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
import styles from "./AdvanceFields.module.css";
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

const CHECKBOX_CLASS = styles.Checkbox;

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
    <div className={styles.PaymentAdvance}>
      <div className={styles.amountRow}>
        <FormField label="立替額" htmlFor={amountId}>
          <Input
            id={amountId}
            inputMode="numeric"
            align="end"
            placeholder="0"
            value={draft.advanceAmount ?? ""}
            onChange={(event) => update({ advanceAmount: event.target.value })}
          />
        </FormField>
        <dl className={styles.stats}>
          {status !== "none" && <dd className={styles.status}>{ADVANCE_STATUS_LABELS[status]}</dd>}
          <div className={styles.stat}>
            <dt>負担額</dt>
            <dd className={styles.statValue}>
              {formatAmount(itemsTotalOf(draft.items) - advanceAmount)}
            </dd>
          </div>
          {unreceived > 0 && (
            <div className={styles.stat}>
              <dt>未入金</dt>
              <dd className={styles.statValue}>{formatAmount(unreceived)}</dd>
            </div>
          )}
        </dl>
      </div>

      {draft.items.length > 1 && (
        <fieldset className={styles.targets}>
          <legend className={styles.targetsLegend}>対象の品目（印がなければすべて）</legend>
          {draft.items.map((item, index) => (
            <label key={item.key} className={styles.target}>
              <input
                type="checkbox"
                className={CHECKBOX_CLASS}
                checked={item.isAdvanceTarget ?? false}
                onChange={(event) =>
                  update(toggleAdvanceTarget(draft.items, item.key, event.target.checked))
                }
              />
              <span className={styles.targetName}>
                {item.name === "" ? `${index + 1} 件目の品目` : item.name}
              </span>
              <span className={styles.targetAmount}>
                {formatAmount(draftAmountOf(item.amount))}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {linkedIncomes.length > 0 && (
        <div className={styles.linked}>
          <p className={styles.linkedCaption}>紐付いた収入</p>
          <ul className={styles.linkedList}>
            {linkedIncomes.map((income) => (
              <li key={income.incomeId} className={styles.linkedItem}>
                <Link href={`/transactions/${income.incomeId}`} className={styles.linkedLink}>
                  <span className={styles.linkedName}>
                    {formatDay(income.date)} {income.placeName ?? income.accountName ?? "収入"}
                  </span>
                  <span className={styles.linkedAmount}>+{formatAmount(income.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {unreceived > 0 && (
            <Button
              variant="ghost"
              tone="muted"
              flush
              className={styles.settle}
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
      <DialogTrigger render={<Button variant="ghost" tone="muted" flush />}>
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
        <ul className={styles.Candidates}>
          {shown.length === 0 && (
            <li className={styles.candidateEmpty}>条件に合う支出はありません</li>
          )}
          {shown.map((candidate) => {
            const unreceived = unreceivedAmountOf(candidate.advanceAmount, candidate.otherLinked);
            return (
              <li key={candidate.paymentId} className={styles.candidate}>
                <button
                  type="button"
                  className={styles.candidateButton}
                  onClick={() => {
                    const { searchText: _searchText, ...payment } = candidate;
                    onPick(payment);
                    setOpen(false);
                  }}
                >
                  <span className={styles.candidateText}>
                    <span className={styles.candidateTitle}>
                      {formatDay(candidate.date)} {candidate.title ?? "支出"}
                    </span>
                    {unreceived > 0 && (
                      <span className={styles.candidateNote}>
                        未入金 {formatAmount(unreceived)}
                      </span>
                    )}
                  </span>
                  <span className={styles.candidateTotal}>{formatAmount(candidate.total)}</span>
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
    <li className={styles.ReimbursementRow}>
      <div className={styles.rowHeader}>
        <Link href={`/transactions/${payment.paymentId}`} className={styles.rowLink}>
          {formatDay(payment.date)} {payment.title ?? "支出"}
        </Link>
        <button
          type="button"
          aria-label="紐付けを外す"
          className={styles.remove}
          onClick={onRemove}
        >
          <X className={styles.removeIcon} aria-hidden="true" />
        </button>
      </div>
      <p className={styles.rowNote}>
        全額 {formatAmount(payment.total)}・立替額 {formatAmount(payment.advanceAmount)}
        {payment.otherLinked > 0 && `・他の入金 ${formatAmount(payment.otherLinked)}`}
        {unreceived > 0 && `・未入金 ${formatAmount(unreceived)}`}
      </p>
      <div className={styles.rowInputs}>
        <label className={styles.expectMore}>
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
          align="end"
          className={styles.rowAmount}
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
    <div className={styles.IncomeReimbursement}>
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
        <div className={styles.summary}>
          <div className={styles.allocated}>
            <span>充てた額の合計</span>
            <span className={styles.allocatedValue}>
              {formatAmount(allocated)} / {formatAmount(incomeAmount)}
            </span>
          </div>
          {allocated !== incomeAmount && (
            <div className={styles.mismatch}>
              <span className={styles.mismatchText}>
                <TriangleAlert className={styles.mismatchIcon} aria-hidden="true" />
                収入の金額と {formatAmount(Math.abs(allocated - incomeAmount))} ずれています
              </span>
              <Button variant="ghost" size="sm" onClick={() => setReimbursements(reimbursements)}>
                配分し直す
              </Button>
            </div>
          )}
          <p className={styles.summaryNote}>
            紐付いた収入は集計に含めません。支出の立替額は、「まだ入金がある」を選ばなければ充てた額で確定します。
          </p>
        </div>
      )}
      <div className={styles.picker} data-spaced={reimbursements.length === 0 || undefined}>
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
