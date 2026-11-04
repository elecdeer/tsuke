import "../src/styles.css";
import { Link, useNavigation, useRouter } from "@void/react";
import { Camera, ChartPie, List, type LucideIcon, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isActive, isNavigating, navPath } from "../src/web/nav.ts";

const NAV_ITEMS: ReadonlyArray<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "集計", icon: ChartPie },
  { href: "/transactions", label: "取引", icon: List },
  { href: "/accounts", label: "口座", icon: Wallet },
  { href: "/receipts/new", label: "レシート", icon: Camera },
];

/**
 * 狭い画面で画面の下に固定するナビゲーション。スマホのアプリのタブバーのように、親指の届く位置に置く。
 *
 * 今いる画面は、広い画面のナビの下線と同じ赤の線を項目の上端に引いて示す。
 */
const BottomNav = ({ activePath }: { activePath: string }) => (
  <nav
    aria-label="メイン"
    className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
  >
    {NAV_ITEMS.map((item) => {
      const active = isActive(activePath, item.href);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "-mt-px flex h-(--bottom-nav-height) flex-col items-center justify-center gap-0.5 border-t-2 border-transparent text-[0.6875rem] text-muted-foreground",
            active && "border-primary font-medium text-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          {item.label}
        </Link>
      );
    })}
  </nav>
);

/**
 * 台帳の画面に共通のヘッダー（ナビゲーションと設定への入口）。
 *
 * ヘッダーは画面の上に固定し、スクロールしてもナビと進行バーが見えるようにする。
 * ヘッダーも本文と同じ 12 列のグリッドに載せ、ナビを本文の中身の列（右の 9 列）にそろえる。
 * 狭い画面ではナビをヘッダーから外し、画面の下に固定する（BottomNav）。
 * 画面の移動中は前の画面が残るので、ヘッダーの上端に進行バーを出し、押したタブにすぐ下線を移す。
 */
const Layout = ({ children }: { children: ReactNode }) => {
  const { path, query } = useRouter();
  const navigation = useNavigation();
  const activePath = navPath(path, navigation);
  // 取引の一覧でサイドパネルを開いている間は、一覧とパネルを並べられるようヘッダーと本文を広げる
  const wide = path === "/transactions" && query.has("selected");

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 h-(--header-height) border-b bg-background">
        {isNavigating(navigation) && (
          // 支援技術には main の aria-busy で伝えるので、バーは飾りとして隠す。
          // <progress> は不定の進み具合を左右に流す見た目にしにくいので使わない
          <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
            <div className="nav-progress h-full w-1/3 bg-foreground" />
          </div>
        )}
        <div
          className={cn(
            "mx-auto grid h-full max-w-5xl grid-cols-[auto_1fr] items-end gap-x-4 px-4 transition-[max-width] duration-300 ease-out motion-reduce:transition-none md:grid-cols-12",
            wide && "xl:max-w-7xl",
          )}
        >
          <span className="pb-2 text-sm font-semibold md:col-span-3">tsuke</span>
          <div className="flex items-end gap-6 md:col-span-9">
            <nav aria-label="メイン" className="hidden gap-6 md:flex">
              {NAV_ITEMS.map((item) => {
                const active = isActive(activePath, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-mb-px border-b-2 border-transparent pb-2 text-sm text-muted-foreground hover:text-foreground",
                      active && "border-primary font-medium text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <Link
              href="/settings"
              aria-label="設定"
              aria-current={isActive(activePath, "/settings") ? "page" : undefined}
              className={cn(
                "ml-auto mb-1 p-1 text-muted-foreground hover:text-foreground",
                isActive(activePath, "/settings") && "text-foreground",
              )}
            >
              <Settings className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>
      <main
        aria-busy={isNavigating(navigation)}
        // 狭い画面では下のナビに本文の最後が隠れないよう、ナビの高さ分の余白を足す
        className={cn(
          "mx-auto max-w-5xl px-4 pt-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] transition-[max-width] duration-300 ease-out motion-reduce:transition-none md:pb-8",
          wide && "xl:max-w-7xl",
        )}
      >
        {children}
      </main>
      <BottomNav activePath={activePath} />
    </div>
  );
};

export default Layout;
