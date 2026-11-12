import { action, Link } from "@void/react";
import { Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@tsuke/ui/components/button";
import type { TransactionMode } from "@/ledger/transactions";
import { actionErrorMessage } from "@/web/actionError";
import { ErrorMessage } from "@tsuke/ui/patterns/ErrorMessage";
import { FavoriteButton } from "@/web/components/FavoriteButton";
import { Section } from "@tsuke/ui/patterns/Section";
import { TransactionDraftFields } from "@/web/components/TransactionFields";
import { formatAmount } from "@/web/format";
import { MODE_LABELS, TRANSACTION_MODES } from "@/web/labels";
import { emptyPaymentDraft } from "@/web/receiptDraft";
import {
  draftForMode,
  draftFromTemplate,
  isDraftEdited,
  updateFromDraft,
  type TransactionDraft,
} from "@/web/transactionDraft";
import { titleOf } from "@/web/transactionTitle";
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
 * よく使う取引の一覧。押すとその内容をフォームに入れる。印のある取引がなければ、印の付け方を案内する。
 */
const TemplateList = ({
  templates,
  onSelect,
}: {
  templates: Props["templates"];
  onSelect: (template: Props["templates"][number]) => void;
}) => {
  if (templates.length === 0) {
    return (
      <p className="border-t border-foreground pt-3 text-xs text-muted-foreground">
        取引の編集画面で
        <Star className="mx-1 inline size-3.5 align-text-bottom" aria-hidden="true" />
        よく使うを押すと、ここから同じ内容で入力できます
      </p>
    );
  }
  return (
    <ul className="border-t border-foreground">
      {templates.map((template) => {
        const title = titleOf(template);
        const total = template.items.reduce((sum, item) => sum + item.amount, 0);
        const details = [
          ...new Set(
            template.items.flatMap((item) => {
              const category = item.genreName ?? item.categoryName;
              return category === null ? [] : [category];
            }),
          ),
        ];
        return (
          <li key={template.id} className="flex items-center gap-2 border-b">
            <button
              type="button"
              className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_6rem] items-baseline gap-x-4 py-2.5 text-left hover:bg-muted/60"
              onClick={() => onSelect(template)}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate">
                  {/* 店舗も品目もない取引は見出しが種類の名前になるので、重ねて出さない */}
                  {template.mode !== "payment" && title !== MODE_LABELS[template.mode] && (
                    <span className="mr-2 text-xs text-muted-foreground">
                      {MODE_LABELS[template.mode]}
                    </span>
                  )}
                  {title}
                </span>
                {details.length > 0 && (
                  <span className="truncate text-xs text-muted-foreground">
                    {details.join("・")}
                  </span>
                )}
              </span>
              <span className="text-right tabular-nums">
                {template.mode === "income" && "+"}
                {formatAmount(total)}
              </span>
            </button>
            <FavoriteButton
              favorite
              label={`${title}をよく使う取引にする`}
              onToggle={(favorite) =>
                action("/transactions/new?favorite", { data: { id: template.id, favorite } })
              }
            />
          </li>
        );
      })}
    </ul>
  );
};

/**
 * レシートなしで取引を手で入力して登録する画面。登録すると、登録した取引の画面へ移る。
 */
const TransactionNewPage = ({
  accounts,
  categories,
  placeNames,
  chainNames,
  templates,
  today,
}: Props) => {
  const [mode, setMode] = useState<TransactionMode>("payment");
  const [draft, setDraft] = useState(() => emptyPaymentDraft(today));
  // 手を入れたかを確かめる基準。雛形を選んだら、その内容を基準にする
  const [original, setOriginal] = useState(draft);
  // 雛形を選んだら入力欄を作り直し、品目の入力欄に前の内容を残さない
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = (patch: Partial<TransactionDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const changeMode = (next: TransactionMode) => {
    setMode(next);
    setDraft((current) => draftForMode(current, next));
    setError(null);
  };
  const applyTemplate = (template: Props["templates"][number]) => {
    if (
      isDraftEdited(draft, original) &&
      !window.confirm("入力中の内容は、よく使う取引の内容に置き換わります。よろしいですか？")
    ) {
      return;
    }
    const next = draftFromTemplate(template, { today, accounts, categories, placeNames });
    setMode(template.mode);
    setDraft(next);
    setOriginal(next);
    setFormKey((key) => key + 1);
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

        <Section label="よく使う取引">
          <TemplateList templates={templates} onSelect={applyTemplate} />
        </Section>

        <TransactionDraftFields
          key={formKey}
          mode={mode}
          heading={MODE_LABELS[mode]}
          draft={draft}
          accounts={accounts}
          categories={categories}
          placeNames={placeNames}
          chainNames={chainNames}
          update={update}
          onItemsChange={(items) => update({ items })}
        />

        <Section label="">
          <div className="flex flex-col gap-4">
            {error !== null && <ErrorMessage message={error} />}
            <Button
              type="submit"
              size="lg"
              // スマホでは幅いっぱいにして親指で押しやすくする（レシートの登録と同じ）
              className="h-12 w-full sm:h-11 sm:w-auto sm:self-start sm:px-10"
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
