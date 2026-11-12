import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind のクラス名をマージしつつ、条件付きクラスを解決する。
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
