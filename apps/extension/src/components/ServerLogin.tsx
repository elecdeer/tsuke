import { Button } from "@tsuke/ui/components/button";

interface ServerUser {
  email?: string;
  id?: string;
}

interface Props {
  isAuthenticated: boolean;
  user: ServerUser | null;
  isLoading: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onRefresh: () => void;
}

export default function ServerLogin({
  isAuthenticated,
  user,
  isLoading,
  onLogin,
  onLogout,
  onRefresh,
}: Props) {
  return (
    // 台帳の設定の画面（apps/ledger/pages/settings/index.tsx）のアカウントの行にそろえ、
    // 箱で囲まず、見出しの下の黒の線から行を始める
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">サーバー認証</h2>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-b border-t-foreground py-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">
            {isAuthenticated ? "ログイン済み" : "未ログイン"}
          </span>
          {isAuthenticated && user?.email && <span className="truncate">{user.email}</span>}
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
            更新
          </Button>
          {isAuthenticated ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLogout}
              disabled={isLoading}
            >
              ログアウト
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={onLogin} disabled={isLoading}>
              ログイン
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
