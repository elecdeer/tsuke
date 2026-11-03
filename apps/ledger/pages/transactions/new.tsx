import { action, Link } from "@void/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TransactionMode } from "@/ledger/transactions";
import { actionErrorMessage } from "@/web/actionError";
import { ErrorMessage } from "@/web/components/ErrorMessage";
import { Section } from "@/web/components/Section";
import { TransactionDraftFields } from "@/web/components/TransactionFields";
import { MODE_LABELS, TRANSACTION_MODES } from "@/web/labels";
import { emptyPaymentDraft } from "@/web/receiptDraft";
import { draftForMode, updateFromDraft, type TransactionDraft } from "@/web/transactionDraft";
import type { Props } from "./new.server";

/**
 * 取引の種類を選ぶボタンの列。よく切り替えるので、開かずに一度の操作で選べるようボタンを並べる。
 */
const ModePicker = ({
  mode,
  onChange,
}: {
  mode: TransactionMode;
  onChange: (mode: TransactionMode) => void;
}) => (
  <div role="group" aria-label="種類" className="grid grid-cols-4 gap-2">
    {TRANSACTION_MODES.map((candidate) => (
      <Button
        key={candidate}
        variant={candidate === mode ? "default" : "outline"}
        aria-pressed={candidate === mode}
        onClick={() => {
          if (candidate !== mode) onChange(candidate);
        }}
      >
        {MODE_LABELS[candidate]}
      </Button>
    ))}
  </div>
);

/**
 * レシートなしで取引を手で入力して登録する画面。登録すると、登録した取引の画面へ移る。
 */
const TransactionNewPage = ({ accounts, categories, placeNames, chainNames, today }: Props) => {
  const [mode, setMode] = useState<TransactionMode>("payment");
  const [draft, setDraft] = useState(() => emptyPaymentDraft(today));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = (patch: Partial<TransactionDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const changeMode = (next: TransactionMode) => {
    setMode(next);
    setDraft((current) => draftForMode(current, next));
    setError(null);
  };
  const register = async () => {
    const parsed = updateFromDraft(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setPending(true);
    const result = await action("/transactions/new?create", {
      data: { ...parsed.input, mode },
    });
    setPending(false);
    if (!result.ok) setError(actionErrorMessage(result.error));
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/transactions"
        className="self-start text-xs text-muted-foreground hover:text-foreground"
      >
        ← 取引
      </Link>
      <form
        className="flex flex-col gap-10"
        onSubmit={(event) => {
          event.preventDefault();
          void register();
        }}
      >
        <Section label={<h1 className="text-2xl font-semibold">取引の追加</h1>}>
          <div className="border-t border-foreground pt-3">
            <ModePicker mode={mode} onChange={changeMode} />
          </div>
        </Section>

        <TransactionDraftFields
          mode={mode}
          heading={MODE_LABELS[mode]}
          draft={draft}
          accounts={accounts}
          categories={categories}
          placeNames={placeNames}
          chainNames={chainNames}
          update={update}
        />

        <Section label="">
          <div className="flex flex-col gap-4">
            {error !== null && <ErrorMessage message={error} />}
            <Button
              type="submit"
              size="lg"
              // スマホでは幅いっぱいにして親指で押しやすくする（レシートの登録と同じ）
              className="h-12 w-full text-base sm:h-11 sm:w-auto sm:self-start sm:px-10"
              disabled={pending}
            >
              登録
            </Button>
          </div>
        </Section>
      </form>
    </div>
  );
};

export default TransactionNewPage;
