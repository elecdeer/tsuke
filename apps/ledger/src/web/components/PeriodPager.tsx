import { useRouter } from "@void/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { type MonthSlideDirection, setMonthSlide } from "@/web/monthSlide";
import { fillHeight, neighborOffset, revealHeight, snappedPage } from "@/web/monthPager";

/** scrollend の来ないブラウザで、スクロールが止まったとみなすまでの時間（ms） */
const SCROLL_IDLE = 120;

/** 変わらない値を読むので、購読するものはない */
const subscribeNothing = (): (() => void) => () => {};
/** ブラウザで描いているときは true。サーバーとハイドレーションの間は isServer の false を使う */
const isClient = (): boolean => true;
/** サーバーで描くときとハイドレーションの間の値 */
const isServer = (): boolean => false;

/**
 * 隣の期間を見せはじめる位置（ビューポートの上からの px）。上に固定したヘッダーの下端にする。
 */
const viewportTopOf = (): number =>
  document.querySelector("body header")?.getBoundingClientRect().bottom ?? 0;

/** 期間を並べたスクロールの箱に付ける印。見出しのリンクから箱を探すのに使う */
const PAGER_ATTRIBUTE = "data-period-pager";

/**
 * 画面の期間の並びを隣の期間まで滑らかに横へ送る。送り終えると PeriodPager がその期間へ移る。
 *
 * 前後の月や年へのリンクを押したときも、払ったときと同じ所を同じように動かすために使う。
 * 取引の一覧では見出しが並びの外にあるので、React の木ではなく DOM から箱を探す。
 * 並びがない（未入金の一覧）か、隣の期間をまだ足していない（読み込み中）ときは false を返す。
 */
const scrollPeriodPager = (direction: MonthSlideDirection): boolean => {
  const scroller = document.querySelector(`[${PAGER_ATTRIBUTE}]`);
  const page = scroller?.children[direction === "next" ? 2 : 0];
  if (scroller === null || !(page instanceof HTMLElement)) return false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollTo({ left: page.offsetLeft, behavior: reduceMotion ? "instant" : "smooth" });
  return true;
};

/**
 * 前後の期間へのリンクの onNavigate に渡す処理を作る。
 *
 * 期間の並び（PeriodPager）があれば横に送って移り、リンクでは移らない。
 * 並びがなければ、リンクで移りつつ本文を横にずらすビュー遷移の向きを伝える（src/styles.css）。
 */
export const navigatePeriod =
  (direction: MonthSlideDirection) =>
  (event: { preventDefault: () => void }): void => {
    if (scrollPeriodPager(direction)) {
      event.preventDefault();
      return;
    }
    setMonthSlide(document.documentElement, direction);
  };

/**
 * 前後の期間（月や年）を左右に並べ、横にスクロールして移れるようにする。左へ送ると次、右へ送ると前の期間。
 * 期間は URL を作るための文字列で、前後の期間は呼ぶ側が previous と next で渡す。
 *
 * 指への追従と止まる位置はブラウザのスクロールスナップに任せ、隣の期間のページで止まったらその URL へ移る。
 * 隣の期間の中身は移るまで読まず、placeholder（覚えておいた中身か骨組み）を出しておく。
 *
 * 隣の期間は、縦にスクロールした途中でもその先頭が画面の上端に来るよう縦にずらして見せ、
 * 移ったあとは並びの上端がヘッダーのすぐ下に来るよう縦のスクロールを戻す。
 */
export const PeriodPager = ({
  period,
  previous,
  next,
  hrefOf,
  placeholder,
  className,
  children,
}: {
  period: string;
  previous: string;
  next: string;
  hrefOf: (period: string) => string;
  placeholder: (period: string) => ReactNode;
  className?: string;
  children: ReactNode;
}) => {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLDivElement>(null);
  const neighbors = useRef<HTMLDivElement[]>([]);
  // 移る先の期間。読み込みの間に同じ月へ何度も移らないようにし、移り終えたら縦のスクロールを戻す目印にする
  const pending = useRef<string | null>(null);
  // サーバーで描いた HTML は横のスクロール位置を持てないので、隣の期間は読み込みのあとに足す。
  // 先に足すと、スクリプトが動くまで前の期間の仮の中身が正面に見えてしまう
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer);

  /**
   * 隣の期間のページを、その先頭がヘッダーのすぐ下に来るよう縦にずらす。
   */
  const alignNeighbors = () => {
    const element = scroller.current;
    if (element === null) return;
    const offset = neighborOffset(element.getBoundingClientRect().top, viewportTopOf());
    for (const neighbor of neighbors.current) {
      neighbor.style.transform = offset === 0 ? "" : `translateY(${offset}px)`;
    }
  };

  // 中身が短くても画面の下端まで届く高さ（fitViewport で測る）。止まっているときの箱の最低の高さにする
  const baseHeight = useRef(0);

  /**
   * 中身が短いときも、並びの箱を画面の下端まで伸ばす。下の空いた所でもつかんで横に送れるようにする。
   *
   * 箱より下の余白（main の下の余白など）は main の下端までの距離で測る。文書全体の高さはレイアウトが
   * 画面の高さ（min-h-dvh）にそろえているので、空いた所まで余白に数えてしまう。
   * この距離は箱の高さで変わらないので、箱の高さを戻さずに測れる（戻すとページが一瞬縮み、縦の位置がずれる）。
   */
  const fitViewport = () => {
    const element = scroller.current;
    if (element === null) return;
    const rect = element.getBoundingClientRect();
    const below =
      (element.closest("main")?.getBoundingClientRect().bottom ?? rect.bottom) - rect.bottom;
    baseHeight.current = fillHeight(rect.top + window.scrollY, window.innerHeight, below);
    element.style.minHeight = `${baseHeight.current}px`;
  };

  /**
   * 横に送っている間、今の期間より長い隣の期間が切れないよう、並びの箱を画面の下端まで伸ばす。
   */
  const revealNeighbors = () => {
    const element = scroller.current;
    if (element === null) return;
    const top = element.getBoundingClientRect().top;
    const bottoms = neighbors.current.map(
      (neighbor) => neighbor.getBoundingClientRect().bottom - top,
    );
    const height = Math.max(baseHeight.current, revealHeight(bottoms, top, window.innerHeight));
    element.style.minHeight = `${height}px`;
  };

  /**
   * 今の期間で止まったら、隣の期間のために伸ばした高さを戻す。伸ばしたままだと短い期間の下に空きが残る。
   */
  const settleHeight = () => {
    if (scroller.current !== null) scroller.current.style.minHeight = `${baseHeight.current}px`;
  };

  // 期間が変わったら（隣の期間へ移り終えたら）今の期間のページを正面に戻す。描く前に戻し、隣の期間が一瞬見えないようにする
  useLayoutEffect(() => {
    const element = scroller.current;
    const page = current.current;
    if (!hydrated || element === null || page === null) return;
    element.scrollTo({ left: page.offsetLeft, behavior: "instant" });
    if (pending.current === period) {
      const top = element.getBoundingClientRect().top - viewportTopOf();
      if (top < 0) window.scrollBy({ top, behavior: "instant" });
    }
    pending.current = null;
    fitViewport();
    alignNeighbors();
  }, [hydrated, period]);

  useEffect(() => {
    const element = scroller.current;
    if (!hydrated || element === null) return;

    /**
     * 横のスクロールが止まったとき、隣の期間のページにいればその期間へ移る。
     */
    const onSettle = () => {
      const lefts = [...element.children].map((child) =>
        child instanceof HTMLElement ? child.offsetLeft : Number.NaN,
      );
      const [prevLeft, currentLeft, nextLeft] = lefts;
      if (prevLeft === undefined || currentLeft === undefined || nextLeft === undefined) return;
      const page = snappedPage(element.scrollLeft, [prevLeft, currentLeft, nextLeft]);
      if (page === "current") settleHeight();
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
      revealNeighbors();
      if (supportsScrollEnd) return;
      clearTimeout(idle);
      idle = setTimeout(onSettle, SCROLL_IDLE);
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    if (supportsScrollEnd) element.addEventListener("scrollend", onSettle);
    window.addEventListener("scroll", alignNeighbors, { passive: true });
    window.addEventListener("resize", alignNeighbors, { passive: true });
    // 画面の大きさや、並びより上の中身（絞り込みの行の折り返しなど）が変わると、下端まで届く高さも変わる
    const observer = new ResizeObserver(fitViewport);
    observer.observe(document.body);
    window.addEventListener("resize", fitViewport, { passive: true });
    return () => {
      clearTimeout(idle);
      observer.disconnect();
      window.removeEventListener("resize", fitViewport);
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("scrollend", onSettle);
      window.removeEventListener("scroll", alignNeighbors);
      window.removeEventListener("resize", alignNeighbors);
    };
  }, [hydrated, router, hrefOf, previous, next]);

  /**
   * 隣の期間のページ。高さは今の期間に合わせ、仮の中身はその上に重ねて縦にずらせるようにする。
   */
  const neighbor = (neighborPeriod: string, index: number) => (
    <div aria-hidden inert className="relative w-full shrink-0 snap-center snap-always px-4">
      <div
        ref={(element) => {
          if (element !== null) neighbors.current[index] = element;
        }}
        className="absolute inset-x-4 top-0"
      >
        {placeholder(neighborPeriod)}
      </div>
    </div>
  );

  return (
    // main の左右の余白の分だけ広げ、隣の期間が画面の端まで動いて見えるようにする。
    // relative にして各ページの offsetLeft をこの箱からの位置にし、スクロール位置と比べられるようにする
    // （付けないと中央に寄せた main の外からの位置になり、広い画面で止まったページを見分けられない）
    <div
      ref={scroller}
      {...{ [PAGER_ATTRIBUTE]: "" }}
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
