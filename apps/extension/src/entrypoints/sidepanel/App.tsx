import { SettingsIcon } from "lucide-react";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { SettingsOverlay } from "../../components/SettingsOverlay.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@tsuke/ui/components/tabs";
import { Toaster, ToastProvider } from "@tsuke/ui/components/toast";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useSuspenseQuery } from "@/lib/query";
import { authStatusQuery, serverUrlQuery } from "../../queries.ts";
import MainScreen from "./screens/MainScreen.tsx";
import StatementScreen from "./screens/StatementScreen.tsx";

/**
 * アプリケーションのルートコンポーネント。
 */
export default function App() {
  return (
    <ToastProvider>
      <Suspense fallback={<AppShell />}>
        <AppContent />
      </Suspense>
    </ToastProvider>
  );
}

const AppShell = () => (
  <div className="min-h-screen bg-background">
    <Header />
  </div>
);

/**
 * 画面の上に固定するヘッダー。台帳のヘッダー（apps/ledger/pages/layout.tsx）にそろえ、
 * 名前と画面の切り替え（下線のタブ）と設定への入口を 1 段に並べる。
 */
const Header = ({ nav, onOpenSettings }: { nav?: ReactNode; onOpenSettings?: () => void }) => (
  <header className="sticky top-0 z-30 flex h-11 items-end gap-5 border-b bg-background px-4">
    <h1 className="pb-2 text-sm font-semibold">tsuke</h1>
    {nav}
    {onOpenSettings && (
      <button
        type="button"
        aria-label="設定"
        className="mb-1 ml-auto p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={onOpenSettings}
      >
        <SettingsIcon className="size-4" aria-hidden="true" />
      </button>
    )}
  </header>
);

const AppContent = () => {
  const { data: serverUrl } = useSuspenseQuery(serverUrlQuery, undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  if (!serverUrl) {
    return (
      <AppLayout settingsOpen={true} onSettingsOpenChange={() => {}}>
        <Screens serverUrl="" />
      </AppLayout>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <AppLayout settingsOpen={!autoOpenedRef.current} onSettingsOpenChange={() => {}}>
          <Screens serverUrl={serverUrl} />
        </AppLayout>
      }
    >
      <Suspense fallback={<AppShell />}>
        <AppWithAuth
          serverUrl={serverUrl}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          autoOpenedRef={autoOpenedRef}
        />
      </Suspense>
    </ErrorBoundary>
  );
};

interface AppWithAuthProps {
  serverUrl: string;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  autoOpenedRef: React.RefObject<boolean>;
}

const AppWithAuth = ({
  serverUrl,
  settingsOpen,
  setSettingsOpen,
  autoOpenedRef,
}: AppWithAuthProps) => {
  const { data: auth } = useSuspenseQuery(authStatusQuery, serverUrl);

  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!auth.isServerAuthenticated) {
      setSettingsOpen(true);
    }
    autoOpenedRef.current = true;
  }, [auth.isServerAuthenticated, setSettingsOpen, autoOpenedRef]);

  return (
    <AppLayout settingsOpen={settingsOpen} onSettingsOpenChange={setSettingsOpen}>
      <Screens serverUrl={serverUrl} />
    </AppLayout>
  );
};

/**
 * 1 件ずつ登録する通常の画面と、明細から一括登録する画面をタブで切り替える。
 * 切り替えても入力中の内容が消えないよう、非表示のタブも mount したままにする。
 */
const Screens = ({ serverUrl }: { serverUrl: string }) => (
  <>
    <TabsContent value="payment" keepMounted>
      <MainScreen serverUrl={serverUrl} />
    </TabsContent>
    <TabsContent value="statement" keepMounted>
      <StatementScreen serverUrl={serverUrl} />
    </TabsContent>
  </>
);

interface AppLayoutProps {
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/**
 * タブの切り替えはヘッダーに、タブの中身（`Screens`）は本文に置くので、Tabs で全体を包む。
 */
const AppLayout = ({ settingsOpen, onSettingsOpenChange, children }: AppLayoutProps) => (
  <Tabs defaultValue="payment" className="min-h-screen bg-background">
    <Header
      nav={
        <TabsList aria-label="画面">
          <TabsTrigger value="payment">支払い</TabsTrigger>
          <TabsTrigger value="statement">明細から一括</TabsTrigger>
        </TabsList>
      }
      onOpenSettings={() => onSettingsOpenChange(true)}
    />
    <main className="px-4 pt-6">{children}</main>
    <SettingsOverlay open={settingsOpen} onOpenChange={onSettingsOpenChange} />
    <Toaster />
  </Tabs>
);
