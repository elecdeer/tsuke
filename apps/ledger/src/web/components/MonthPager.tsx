import { useRouter } from "@void/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { shiftMonth } from "@/ledger/dates";
import { cn } from "@/lib/utils";
import { neighborOffset, snappedPage } from "@/web/monthPager";

/** scrollend の来ないブラウザで、スクロールが止まったとみなすまでの時間（ms） */
const SCROLL_IDLE = 120;

/** 変わらない値を読むので、購読するものはない */
const subscribeNothing = (): (() => void) => () => {};
/** ブラウザで描いているときは true。サーバーとハイドレーションの間は isServer の false を使う */
const isClient = (): boolean => true;
/** サーバーで描くときとハイドレーションの間の値 */
const isServer = (): boolean => false;

/**
 * 隣の月を見せはじめる位置（ビューポートの上からの px）。上に固定したヘッダーの下端にする。
 */
const viewportTopOf = (): number =>
  document.querySelector("body header")?.getBoundingClientRect().bottom ?? 0;

/**
 * 前後の月を左右に並べ、横にスクロールして月を移れるようにする。左へ送ると次の月、右へ送ると前の月。
 *
 * 指への追従と止まる位置はブラウザのスクロールスナップに任せ、隣の月のページで止まったらその月の URL へ移る。
 * 隣の月の中身は移るまで読まず、placeholder（月の見出しと骨組みなど）を出しておく。
 *
 * 隣の月は、縦にスクロールした途中でもその先頭が画面の上端に来るよう縦にずらして見せ、
 * 移ったあとは並びの上端がヘッダーのすぐ下に来るよう縦のスクロールを戻す。
 */
export const MonthPager = ({
  month,
  hrefOf,
  placeholder,
  className,
  children,
}: {
  month: string;
  hrefOf: (month: string) => string;
  placeholder: (month: string) => ReactNode;
  className?: string;
  children: ReactNode;
}) => {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLDivElement>(null);
  const neighbors = useRef<HTMLDivElement[]>([]);
  // 移る先の月。読み込みの間に同じ月へ何度も移らないようにし、移り終えたら縦のスクロールを戻す目印にする
  const pending = useRef<string | null>(null);
  // サーバーで描いた HTML は横のスクロール位置を持てないので、隣の月は読み込みのあとに足す。
  // 先に足すと、スクリプトが動くまで前の月の仮の中身が正面に見えてしまう
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer);

  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  /**
   * 隣の月のページを、その先頭がヘッダーのすぐ下に来るよう縦にずらす。
   */
  const alignNeighbors = () => {
    const element = scroller.current;
    if (element === null) return;
    const offset = neighborOffset(element.getBoundingClientRect().top, viewportTopOf());
    for (const neighbor of neighbors.current) {
      neighbor.style.transform = offset === 0 ? "" : `translateY(${offset}px)`;
    }
  };

  // 月が変わったら（隣の月へ移り終えたら）今の月のページを正面に戻す。描く前に戻し、隣の月が一瞬見えないようにする
  useLayoutEffect(() => {
    const element = scroller.current;
    const page = current.current;
    if (!hydrated || element === null || page === null) return;
    element.scrollTo({ left: page.offsetLeft, behavior: "instant" });
    if (pending.current === month) {
      const top = element.getBoundingClientRect().top - viewportTopOf();
      if (top < 0) window.scrollBy({ top, behavior: "instant" });
    }
    pending.current = null;
    alignNeighbors();
  }, [hydrated, month]);

  useEffect(() => {
    const element = scroller.current;
    if (!hydrated || element === null) return;

    /**
     * 横のスクロールが止まったとき、隣の月のページにいればその月へ移る。
     */
    const onSettle = () => {
      const lefts = [...element.children].map((child) =>
        child instanceof HTMLElement ? child.offsetLeft : Number.NaN,
      );
      const [prevLeft, currentLeft, nextLeft] = lefts;
      if (prevLeft === undefined || currentLeft === undefined || nextLeft === undefined) return;
      const page = snappedPage(element.scrollLeft, [prevLeft, currentLeft, nextLeft]);
      if (page === null || page === "current") return;
      const target = page === "prev" ? previous : next;
      if (pending.current === target) return;
      pending.current = target;
      void router.visit(hrefOf(target), { preserveScroll: true });
    };

    let idle: ReturnType<typeof setTimeout> | undefined;
    const supportsScrollEnd = "onscrollend" in window;
    const onScroll = () => {
      alignNeighbors();
      if (supportsScrollEnd) return;
      clearTimeout(idle);
      idle = setTimeout(onSettle, SCROLL_IDLE);
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    if (supportsScrollEnd) element.addEventListener("scrollend", onSettle);
    window.addEventListener("scroll", alignNeighbors, { passive: true });
    window.addEventListener("resize", alignNeighbors, { passive: true });
    return () => {
      clearTimeout(idle);
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("scrollend", onSettle);
      window.removeEventListener("scroll", alignNeighbors);
      window.removeEventListener("resize", alignNeighbors);
    };
  }, [hydrated, router, hrefOf, previous, next]);

  /**
   * 隣の月のページ。高さは今の月に合わせ、仮の中身はその上に重ねて縦にずらせるようにする。
   */
  const neighbor = (neighborMonth: string, index: number) => (
    <div aria-hidden inert className="relative w-full shrink-0 snap-center snap-always px-4">
      <div
        ref={(element) => {
          if (element !== null) neighbors.current[index] = element;
        }}
        className="absolute inset-x-4 top-0"
      >
        {placeholder(neighborMonth)}
      </div>
    </div>
  );

  return (
    // main の左右の余白の分だけ広げ、隣の月が画面の端まで動いて見えるようにする。
    // relative にして各ページの offsetLeft をこの箱からの位置にし、スクロール位置と比べられるようにする
    // （付けないと中央に寄せた main の外からの位置になり、広い画面で止まったページを見分けられない）
    <div
      ref={scroller}
      className="relative -mx-4 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {hydrated && neighbor(previous, 0)}
      <div
        ref={current}
        className={cn("w-full min-w-0 shrink-0 snap-center snap-always px-4", className)}
      >
        {children}
      </div>
      {hydrated && neighbor(next, 1)}
    </div>
  );
};
