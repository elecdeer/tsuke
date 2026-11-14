import { Button } from "@tsuke/ui/components/button";
import styles from "./ServerLogin.module.css";

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
    <section className={styles.ServerLogin}>
      <h2 className={styles.title}>サーバー認証</h2>
      <div className={styles.row}>
        <div className={styles.status}>
          <span className={styles.statusLabel}>
            {isAuthenticated ? "ログイン済み" : "未ログイン"}
          </span>
          {isAuthenticated && user?.email && <span className={styles.email}>{user.email}</span>}
        </div>
        <div className={styles.actions}>
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
