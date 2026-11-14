import { type ClassValue, clsx } from "clsx";

/**
 * 条件付きのクラス名を解決して 1 つにつなげる。
 * 部品の CSS は ui レイヤーに入っているので、後ろに足したアプリ側のクラスが常に勝つ（styles/theme.css）。
 */
export const cn = (...inputs: ClassValue[]): string => clsx(inputs);
