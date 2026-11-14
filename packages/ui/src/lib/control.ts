import styles from "./control.module.css";

/*
 * 浮く面と一覧の行の見た目を部品どうしでそろえるためのクラス（control.module.css）。
 */

/** 浮く面（メニュー・選択肢の一覧・ポップアップ）の枠・面・影 */
export const popupSurfaceClassName = styles.PopupSurface;

/** 浮く面を開く・閉じるときの動き */
export const popupMotionClassName = styles.PopupMotion;

/** メニューや選択肢の一覧の 1 行 */
export const listItemClassName = styles.ListItem;

/** 一覧の中のまとまりの名前 */
export const listLabelClassName = styles.ListLabel;

/** 一覧の中の区切り線 */
export const listSeparatorClassName = styles.ListSeparator;
