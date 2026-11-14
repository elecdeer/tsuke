import { action } from "@void/react";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@tsuke/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tsuke/ui/components/dialog";
import { Input } from "@tsuke/ui/components/input";
import { Label } from "@tsuke/ui/components/label";
import { Textarea } from "@tsuke/ui/components/textarea";
import { type ActionResult, actionErrorMessage } from "@/web/actionError";
import { ArchiveButton } from "@/web/components/ArchiveButton";
import { ErrorMessage } from "@tsuke/ui/patterns/ErrorMessage";
import { BackLink } from "@/web/components/BackLink";
import { MoveButtons } from "@/web/components/MoveButtons";
import { PageTitle } from "@tsuke/ui/patterns/PageTitle";
import type { Props } from "./accounts.server";
import styles from "./accounts.module.css";
import settings from "./settings.module.css";

type Account = Props["accounts"][number];

/**
 * 口座を追加・編集するダイアログの中身。account がなければ追加になる。
 */
const AccountEditor = ({ account, onClose }: { account: Account | null; onClose: () => void }) => {
  const nameId = useId();
  const hintId = useId();
  const [name, setName] = useState(account?.name ?? "");
  const [aiHint, setAiHint] = useState(account?.aiHint ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = async (request: () => Promise<ActionResult>) => {
    setPending(true);
    setError(null);
    const result = await request();
    setPending(false);
    if (result.ok) onClose();
    else setError(actionErrorMessage(result.error));
  };

  const save = () =>
    run(() =>
      account === null
        ? action("/settings/accounts?create", { data: { name, aiHint } })
        : action("/settings/accounts?update", { data: { id: account.id, name, aiHint } }),
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{account === null ? "口座の追加" : "口座の編集"}</DialogTitle>
        <DialogDescription>
          アーカイブした口座は、入力の候補と残高の画面に出なくなります
        </DialogDescription>
      </DialogHeader>
      <form
        className={settings.EditorForm}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={settings.field}>
          <Label htmlFor={nameId}>口座名</Label>
          <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className={settings.field}>
          <Label htmlFor={hintId}>AI 読み取り用のヒント</Label>
          <Textarea
            id={hintId}
            rows={3}
            value={aiHint}
            placeholder="例: レシートに VISA 下 4 桁 1234 とあればこのカード"
            onChange={(event) => setAiHint(event.target.value)}
          />
        </div>
        {error !== null && <ErrorMessage message={error} />}
        <div className={settings.actions}>
          <DialogClose render={<Button variant="outline" />}>やめる</DialogClose>
          <Button type="submit" disabled={pending}>
            保存
          </Button>
        </div>
      </form>
      {account !== null && (
        <div className={settings.EditorSection}>
          <ArchiveButton
            archived={account.archived}
            disabled={pending}
            onClick={() =>
              void run(() =>
                action("/settings/accounts?archive", {
                  data: { id: account.id, archived: !account.archived },
                }),
              )
            }
          />
        </div>
      )}
    </>
  );
};

/**
 * 口座 1 件の行。押すと編集のダイアログを開く。アーカイブ済みの口座は並びに入らないので、移動のボタンを出さない。
 */
const AccountRow = ({
  account,
  index,
  count,
  moving,
  onSelect,
  onMove,
}: {
  account: Account;
  index: number;
  count: number;
  moving: boolean;
  onSelect: () => void;
  onMove: (offset: -1 | 1) => void;
}) => (
  <li className={styles.AccountRow}>
    <button type="button" onClick={onSelect} className={styles.select}>
      <span className={settings.RowTitle}>
        <span className={settings.rowName}>{account.name}</span>
        {account.archived && <span className={settings.badge}>アーカイブ済み</span>}
      </span>
      {account.aiHint !== null && <span className={settings.RowNote}>{account.aiHint}</span>}
    </button>
    {!account.archived && (
      <MoveButtons
        name={account.name}
        index={index}
        count={count}
        disabled={moving}
        onMove={onMove}
      />
    )}
  </li>
);

/**
 * 口座の管理の画面。追加・名前の変更・並び替え・アーカイブと、AI の読み取りに渡すヒントの編集ができる。
 */
const AccountsPage = ({ accounts }: Props) => {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  // 保存した後も最新の値を見るよう、ID で持って引き直す
  const selected = accounts.find((account) => account.id === editing);
  const activeCount = accounts.filter((account) => !account.archived).length;

  const move = async (id: number, offset: -1 | 1) => {
    setMoving(true);
    setMoveError(null);
    const result = await action("/settings/accounts?move", { data: { id, offset } });
    setMoving(false);
    if (!result.ok) setMoveError(actionErrorMessage(result.error));
  };

  return (
    <div className={settings.Page}>
      <BackLink href="/settings">← 設定</BackLink>
      <div className={settings.Header}>
        <PageTitle size="lg">口座</PageTitle>
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus />
          口座を追加
        </Button>
      </div>
      {moveError !== null && <ErrorMessage message={moveError} />}
      {accounts.length === 0 ? (
        <p className={settings.Empty}>口座はありません</p>
      ) : (
        <ul className={settings.List}>
          {accounts.map((account, index) => (
            <AccountRow
              key={account.id}
              account={account}
              index={index}
              count={activeCount}
              moving={moving}
              onSelect={() => setEditing(account.id)}
              onMove={(offset) => void move(account.id, offset)}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={editing === "new" || selected !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          {(editing === "new" || selected !== undefined) && (
            <AccountEditor
              key={selected?.id ?? "new"}
              account={selected ?? null}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountsPage;
