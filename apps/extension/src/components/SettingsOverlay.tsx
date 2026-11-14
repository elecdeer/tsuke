import { Suspense, useEffect, useId, useState } from "react";
import { browser } from "wxt/browser";
import { Button } from "@tsuke/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tsuke/ui/components/dialog";
import { Input } from "@tsuke/ui/components/input";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useSuspenseQuery } from "@/lib/query";
import { launchServerLogin } from "../auth/serverAuth.ts";
import { UNAUTHENTICATED } from "../entrypoints/sidepanel/authQueries.ts";
import {
  accountsQuery,
  authStatusQuery,
  categoriesQuery,
  placesQuery,
  serverUrlQuery,
} from "../queries.ts";
import { ErrorMessage } from "@tsuke/ui/patterns/ErrorMessage";
import { FormField } from "@tsuke/ui/patterns/FormField";
import ServerLogin from "./ServerLogin.tsx";
import styles from "./SettingsOverlay.module.css";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * サーバー URL 設定とサーバー認証をまとめて行う設定オーバーレイ。
 */
export const SettingsOverlay = ({ open, onOpenChange }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="column" gap="loose">
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
        </DialogHeader>
        <Suspense fallback={null}>
          <SettingsOverlayContent onOpenChange={onOpenChange} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
};

const SettingsOverlayContent = ({ onOpenChange: _onOpenChange }: Pick<Props, "onOpenChange">) => {
  const { data: serverUrl } = useSuspenseQuery(serverUrlQuery, undefined);
  const serverUrlId = useId();
  const [serverUrlInput, setServerUrlInput] = useState("");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  useEffect(() => {
    setServerUrlInput(serverUrl);
  }, [serverUrl]);

  const refetchMasterQueries = async (): Promise<void> => {
    await Promise.all([
      categoriesQuery.refetch(serverUrl),
      accountsQuery.refetch(serverUrl),
      placesQuery.refetch(serverUrl),
    ]);
  };

  const refetchAuth = async (): Promise<void> => {
    setIsRefetching(true);
    try {
      await authStatusQuery.refetch(serverUrl);
    } finally {
      setIsRefetching(false);
    }
  };

  const handleSaveServerUrl = async () => {
    const url = serverUrlInput.replace(/\/$/, "");
    try {
      await browser.storage.local.set({ serverUrl: url });
      serverUrlQuery.setData(undefined, url);
      setStorageError(null);
    } catch {
      setStorageError("サーバー URL の保存に失敗しました");
    }
  };

  const handleServerLogin = async () => {
    try {
      await launchServerLogin(serverUrl);
      await refetchAuth();
      await refetchMasterQueries();
    } catch {
      // ユーザーがポップアップを閉じた場合など
    }
  };

  const handleServerLogout = () => {
    void browser.tabs.create({ url: `${serverUrl}/logout` });
    authStatusQuery.setData(serverUrl, UNAUTHENTICATED);
  };

  return (
    <>
      <section className={styles.ServerUrl}>
        <FormField label="サーバー URL" htmlFor={serverUrlId} className={styles.urlField}>
          <Input
            id={serverUrlId}
            type="url"
            value={serverUrlInput}
            onChange={(e) => setServerUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveServerUrl()}
            placeholder="https://your-server.workers.dev"
          />
        </FormField>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSaveServerUrl}
          disabled={!serverUrlInput || serverUrlInput === serverUrl}
        >
          保存
        </Button>
      </section>

      {storageError && <ErrorMessage message={storageError} />}

      {serverUrl && (
        <ErrorBoundary fallback={(error) => <ErrorMessage message={error.message} />}>
          <Suspense fallback={null}>
            <AuthSection
              serverUrl={serverUrl}
              isRefetching={isRefetching}
              onLogin={handleServerLogin}
              onLogout={handleServerLogout}
              onRefresh={() => void refetchAuth()}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      <DialogFooter>
        <DialogClose
          render={
            <Button type="button" variant="outline">
              閉じる
            </Button>
          }
        />
      </DialogFooter>
    </>
  );
};

interface AuthSectionProps {
  serverUrl: string;
  isRefetching: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onRefresh: () => void;
}

const AuthSection = ({
  serverUrl,
  isRefetching,
  onLogin,
  onLogout,
  onRefresh,
}: AuthSectionProps) => {
  const { data: auth } = useSuspenseQuery(authStatusQuery, serverUrl);

  return (
    <ServerLogin
      isAuthenticated={auth.isServerAuthenticated}
      user={auth.serverUser}
      isLoading={isRefetching}
      onLogin={onLogin}
      onLogout={onLogout}
      onRefresh={onRefresh}
    />
  );
};
