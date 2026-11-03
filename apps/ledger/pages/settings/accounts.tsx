import { action, Link } from "@void/react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/web/actionError";
import { ErrorMessage } from "@/web/components/ErrorMessage";
import type { Props } from "./accounts.server";

type Account = Props["accounts"][number];

/**
 * 口座 1 件のヒントを編集するダイアログの中身。
 */
const AccountEditor = ({ account, onClose }: { account: Account; onClose: () => void }) => {
  const hintId = useId();
  const [aiHint, setAiHint] = useState(account.aiHint ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async () => {
    setPending(true);
    setError(null);
    const result = await action("/settings/accounts?update", {
      data: { id: account.id, aiHint },
    });
    setPending(false);
    if (result.ok) onClose();
    else setError(actionErrorMessage(result.error));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{account.name}</DialogTitle>
        <DialogDescription>読み取りのときに、この口座かどうかの手がかりにします</DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
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
    </>
  );
};

/**
 * 口座 1 件の行。押すと編集のダイアログを開く。
 */
const AccountRow = ({ account, onSelect }: { account: Account; onSelect: () => void }) => (
  <li className="border-b">
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full min-w-0 cursor-pointer flex-col gap-0.5 py-2.5 text-left hover:bg-muted/60"
    >
      <span className="truncate">{account.name}</span>
      {account.aiHint !== null && (
        <span className="truncate text-xs text-muted-foreground">{account.aiHint}</span>
      )}
    </button>
  </li>
);

/**
 * 口座の管理の画面。今は AI の読み取りに渡すヒントだけを編集できる。
 */
const AccountsPage = ({ accounts }: Props) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = accounts.find((account) => account.id === selectedId);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/settings"
        className="self-start text-xs text-muted-foreground hover:text-foreground"
      >
        ← 設定
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">口座</h1>
      {accounts.length === 0 ? (
        <p className="border-t border-foreground py-6 text-sm text-muted-foreground">
          口座はありません
        </p>
      ) : (
        <ul className="border-t border-foreground">
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              onSelect={() => setSelectedId(account.id)}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent>
          {selected !== undefined && (
            <AccountEditor
              key={selected.id}
              account={selected}
              onClose={() => setSelectedId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountsPage;
