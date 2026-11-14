import { action } from "@void/react";
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
  missingFromAccountError,
  updateFromDraft,
  type TransactionDraft,
} from "@/web/transactionDraft";
import { titleOf } from "@/web/transactionTitle";
import type { Props } from "./new.server";
import { BackLink } from "@/web/components/BackLink";
import { PageTitle } from "@tsuke/ui/patterns/PageTitle";
import styles from "./new.module.css";

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
  <div role="group" aria-label="種類" className={styles.ModePicker}>
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
      <p className={styles.TemplatesEmpty}>
        取引の編集画面で
        <Star className={styles.starIcon} aria-hidden="true" />
        よく使うを押すと、ここから同じ内容で入力できます
      </p>
    );
  }
  return (
    <ul className={styles.Templates}>
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
          <li key={template.id} className={styles.template}>
            <button
              type="button"
              className={styles.templateButton}
              onClick={() => onSelect(template)}
            >
              <span className={styles.templateText}>
                <span className={styles.templateTitle}>
                  {/* 店舗も品目もない取引は見出しが種類の名前になるので、重ねて出さない */}
                  {template.mode !== "payment" && title !== MODE_LABELS[template.mode] && (
                    <span className={styles.templateMode}>{MODE_LABELS[template.mode]}</span>
                  )}
                  {title}
                </span>
                {details.length > 0 && (
                  <span className={styles.templateDetails}>{details.join("・")}</span>
                )}
              </span>
              <span className={styles.templateAmount}>
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
  // 開いたばかりの空のフォームを赤くしないよう、足りない欄は登録を試みてから示す
  const [attempted, setAttempted] = useState(false);

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
    setAttempted(true);
    const accountError = mode === "payment" ? missingFromAccountError(draft) : null;
    if (accountError !== null) {
      setError(accountError);
      return;
    }
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
    <div className={styles.TransactionNewPage}>
      <BackLink href="/transactions">← 取引</BackLink>
      <form
        className={styles.Form}
        onSubmit={(event) => {
          event.preventDefault();
          void register();
        }}
      >
        <Section label={<PageTitle>取引の追加</PageTitle>}>
          <div className={styles.ModeField}>
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
          requireFromAccount
          showInvalid={attempted}
          update={update}
          onItemsChange={(items) => update({ items })}
        />

        <Section label="">
          <div className={styles.Footer}>
            {error !== null && <ErrorMessage message={error} />}
            <Button type="submit" size="xl" className={styles.submit} disabled={pending}>
              登録
            </Button>
          </div>
        </Section>
      </form>
    </div>
  );
};

export default TransactionNewPage;
