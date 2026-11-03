import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SHEET_DETENT,
  draggedFraction,
  settledDetent,
  steppedDetent,
  toggledDetent,
} from "@/web/sheetDetent";

/** タップとドラッグを分ける移動量（px） */
const DRAG_THRESHOLD = 4;

type Gesture = {
  pointerId: number;
  startY: number;
  startFraction: number;
  dragged: boolean;
  lastY: number;
  lastTime: number;
  /** 高くなる向きを正にした速さ（割合/ms） */
  velocity: number;
};

/**
 * 写真の上に重ねて、読み取りの結果を見比べるためのシート（狭い画面）。広い画面では写真の隣に置く列になる。
 *
 * React Aria の Sheet のようにシートごとスクロールで動かすと、低い段では中身をスクロールできず、
 * 品目を写真と並べて見られない。そこで高さは取っ手のドラッグで変え、中身はどの段でも単独でスクロールする。
 * 同じ理由でモーダルにせず、シートの外（写真とページ）はそのまま触れるようにする。
 */
export const ReviewSheet = ({
  label,
  footer,
  children,
  className,
}: {
  /** 取っ手の名前（読み上げ用） */
  label: string;
  /** 高さに関わらず常に見せる所。登録のボタンなど */
  footer: ReactNode;
  children: ReactNode;
  className?: string;
}) => {
  const bodyId = useId();
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [fraction, setFraction] = useState<number>(DEFAULT_SHEET_DETENT);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startFraction: fraction,
      dragged: false,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    const stageHeight = stage.current?.clientHeight ?? 0;
    if (current?.pointerId !== event.pointerId || stageHeight === 0) return;
    const dy = event.clientY - current.startY;
    if (!current.dragged && Math.abs(dy) < DRAG_THRESHOLD) return;
    if (!current.dragged) {
      current.dragged = true;
      setDragging(true);
    }
    const elapsed = event.timeStamp - current.lastTime;
    if (elapsed > 0) {
      current.velocity = (current.lastY - event.clientY) / stageHeight / elapsed;
      current.lastY = event.clientY;
      current.lastTime = event.timeStamp;
    }
    setFraction(draggedFraction(current.startFraction, dy, stageHeight));
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    if (current.dragged) setFraction(settledDetent(fraction, current.velocity));
    else if (event.type === "pointerup") setFraction(toggledDetent(fraction));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") setFraction(steppedDetent(fraction, 1));
    else if (event.key === "ArrowDown") setFraction(steppedDetent(fraction, -1));
    else if (event.key === "Enter") setFraction(toggledDetent(fraction));
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={stage}
      className={cn(
        // ヘッダーと下のナビの間に置く。シートのない所は押せるようにして、下の写真を動かせるようにする
        "pointer-events-none fixed inset-x-0 top-(--header-height) bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] z-20 flex flex-col justify-end",
        "md:pointer-events-auto md:static md:block",
        className,
      )}
    >
      <div className="pointer-events-auto flex max-h-full min-h-0 flex-col border-t border-foreground bg-background md:max-h-none md:border-t-0">
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={label}
          aria-controls={bodyId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          className="flex h-7 shrink-0 cursor-row-resize touch-none items-center justify-center outline-offset-[-2px] select-none md:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          <span className="h-0.5 w-8 bg-foreground/40" aria-hidden="true" />
        </div>
        <div
          id={bodyId}
          // 中身の高さは段によって変わるので、割合を CSS に渡して計算する。CSSProperties の型は変数名を持たないので広げて渡す
          style={{ "--sheet-fraction": fraction } as CSSProperties}
          className={cn(
            // 全部開いたときは足りない分だけ縮むよう shrink にする（取っ手と footer の高さを JS で測らない）
            "min-h-0 shrink basis-[calc(var(--sheet-stage-height)*var(--sheet-fraction))] overflow-y-auto overscroll-contain px-4",
            "md:basis-auto md:overflow-visible md:px-0",
            !dragging &&
              "transition-[flex-basis] duration-200 ease-out motion-reduce:transition-none",
          )}
          // 畳んだままでは、キーボードで移った入力欄や入力の誤りで戻された欄が見えない
          onFocus={() => {
            if (fraction === 0) setFraction(DEFAULT_SHEET_DETENT);
          }}
        >
          {children}
        </div>
        <div className="flex shrink-0 flex-col gap-3 border-t border-foreground bg-background px-4 py-2 md:sticky md:bottom-0 md:px-0">
          {footer}
        </div>
      </div>
    </div>
  );
};
