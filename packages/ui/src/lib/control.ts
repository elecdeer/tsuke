/*
 * 浮く面（メニュー・選択肢の一覧・ポップアップ）と、その中の一覧の行の見た目を部品どうしでそろえるためのクラス。
 * 見た目は UI SDK（https://ui-sdk.dev）の見本を借りている。挙動は base-ui のまま、クラスだけを当てる。
 * 入力欄・選択欄は tsuke の下線の見た目のままにしている（docs/design.md）。
 */

/** 浮く面（メニュー・選択肢の一覧・ポップアップ）の枠・面・影 */
export const popupSurfaceClassName =
  "bg-popover text-popover-foreground ring-1 ring-input shadow-popup";

/** 浮く面を開く・閉じるときの動き */
export const popupMotionClassName =
  "origin-(--transform-origin) duration-100 data-[side=bottom]:slide-in-from-top-1 data-[side=inline-end]:slide-in-from-left-1 data-[side=inline-start]:slide-in-from-right-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-98 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-98";

/** メニューや選択肢の一覧の 1 行。指している行は薄い面に黒の枠で示す */
export const listItemClassName =
  "relative flex min-h-8 w-full cursor-default items-center gap-2 px-2.5 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-muted data-highlighted:text-foreground data-highlighted:inset-ring data-highlighted:inset-ring-foreground data-disabled:pointer-events-none data-disabled:text-foreground/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/** 一覧の中のまとまりの名前 */
export const listLabelClassName = "px-2.5 pt-2 pb-1 text-xs text-muted-foreground";

/** 一覧の中の区切り線。浮く面の余白まで伸ばす */
export const listSeparatorClassName = "pointer-events-none -mx-1 my-1 h-px bg-border";
