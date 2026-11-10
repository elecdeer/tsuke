import { action, Link } from "@void/react";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ActionResult, actionErrorMessage } from "@/web/actionError";
import { ArchiveButton } from "@/web/components/ArchiveButton";
import { ErrorMessage } from "@/web/components/ErrorMessage";
import { MoveButtons } from "@/web/components/MoveButtons";
import type { Props } from "./accounts.server";

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
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>口座名</Label>
          <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
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
        <div className="flex justify-end gap-2">
          <DialogClose render={<Button variant="outline" />}>やめる</DialogClose>
          <Button type="submit" disabled={pending}>
            保存
          </Button>
        </div>
      </form>
      {account !== null && (
        <div className="border-t pt-4">
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
  <li className="flex items-center gap-2 border-b">
    <button
      type="button"
      onClick={onSelect}
      className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 py-2.5 text-left hover:bg-muted/60"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{account.name}</span>
        {account.archived && (
          <span className="shrink-0 text-xs text-muted-foreground">アーカイブ済み</span>
        )}
      </span>
      {account.aiHint !== null && (
        <span className="truncate text-xs text-muted-foreground">{account.aiHint}</span>
      )}
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
    <div className="flex flex-col gap-6">
      <Link
        href="/settings"
        className="self-start text-xs text-muted-foreground hover:text-foreground"
      >
        ← 設定
      </Link>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">口座</h1>
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus />
          口座を追加
        </Button>
      </div>
      {moveError !== null && <ErrorMessage message={moveError} />}
      {accounts.length === 0 ? (
        <p className="border-t border-foreground py-6 text-sm text-muted-foreground">
          口座はありません
        </p>
      ) : (
        <ul className="border-t border-foreground">
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
