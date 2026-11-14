import "../src/styles.css";
import { Link, useNavigation, useRouter } from "@void/react";
import { Camera, ChartPie, List, type LucideIcon, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { isActive, isNavigating, navHref, navPath } from "../src/web/nav.ts";
import styles from "./layout.module.css";

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
const BottomNav = ({
  activePath,
  hrefOf,
}: {
  activePath: string;
  hrefOf: (href: string) => string;
}) => (
  <nav aria-label="メイン" className={styles.BottomNav}>
    {NAV_ITEMS.map((item) => {
      const active = isActive(activePath, item.href);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={hrefOf(item.href)}
          aria-current={active ? "page" : undefined}
          className={styles.item}
        >
          <Icon className={styles.icon} aria-hidden="true" />
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
 * 集計（月の表示）と取引の一覧の間は、見ている月を引き継いで移る（navHref）。
 * 画面の移動中は前の画面が残るので、ヘッダーの上端に進行バーを出し、押したタブにすぐ下線を移す。
 */
const Layout = ({ children }: { children: ReactNode }) => {
  const { path, query } = useRouter();
  const navigation = useNavigation();
  const activePath = navPath(path, navigation);
  // 集計と取引の一覧の間では、見ている月を引き継いで移る
  const hrefOf = (href: string) => navHref(href, path, query);
  // 取引の一覧でサイドパネルを開いている間は、一覧とパネルを並べられるようヘッダーと本文を広げる
  const wide = path === "/transactions" && query.has("selected");

  return (
    <div className={styles.Layout}>
      <header className={styles.header}>
        {isNavigating(navigation) && (
          // 支援技術には main の aria-busy で伝えるので、バーは飾りとして隠す。
          // <progress> は不定の進み具合を左右に流す見た目にしにくいので使わない
          <div aria-hidden className={styles.progress}>
            <div className={styles.progressBar} />
          </div>
        )}
        <div className={styles.headerInner} data-wide={wide || undefined}>
          <span className={styles.brand}>tsuke</span>
          <div className={styles.headerNav}>
            <nav aria-label="メイン" className={styles.nav}>
              {NAV_ITEMS.map((item) => {
                const active = isActive(activePath, item.href);
                return (
                  <Link
                    key={item.href}
                    href={hrefOf(item.href)}
                    aria-current={active ? "page" : undefined}
                    className={styles.navLink}
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
              className={styles.settings}
            >
              <Settings className={styles.settingsIcon} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>
      <main
        aria-busy={isNavigating(navigation)}
        // 狭い画面では下のナビに本文の最後が隠れないよう、ナビの高さ分の余白を足す
        className={styles.main}
        data-wide={wide || undefined}
      >
        {children}
      </main>
      <BottomNav activePath={activePath} hrefOf={hrefOf} />
    </div>
  );
};

export default Layout;
