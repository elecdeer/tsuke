import type { ReactNode } from "react";
// 単体テストの設定は @/ の別名を解決しないので、相対パスで読み込む
import { cn } from "../../lib/utils.ts";

/**
 * 入力欄の名前に添える、形を限界まで減らしたアイコンの共通の枠。
 *
 * lucide の絵は細部が多く、小さなラベルの横では文字より目立つので、四角・円・線だけで描く。
 * 角丸は使わない（docs/design.md）ので、線の端と角は尖らせる。名前の文字があるので読み上げない。
 */
const FieldIcon = ({ className, children }: { className?: string; children: ReactNode }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="square"
    strokeLinejoin="miter"
    aria-hidden="true"
    focusable="false"
    className={cn("size-3.5 shrink-0", className)}
  >
    {children}
  </svg>
);

/**
 * 日付。上を塗った四角で、日めくりの 1 枚を表す。
 */
export const DateIcon = ({ className }: { className?: string }) => (
  <FieldIcon className={className}>
    <rect x="2.75" y="2.75" width="10.5" height="10.5" />
    <rect x="2" y="2" width="12" height="4" fill="currentColor" stroke="none" />
  </FieldIcon>
);

/**
 * 支払元（口座）。円の中に四角い穴を開けて、お金（穴あき銭）を表す。
 */
export const AccountIcon = ({ className }: { className?: string }) => (
  <FieldIcon className={className}>
    <circle cx="8" cy="8" r="5.75" />
    <rect x="6.25" y="6.25" width="3.5" height="3.5" />
  </FieldIcon>
);

/**
 * 店舗。横の棒から垂らした 3 枚の布で、店先の暖簾を表す。
 */
export const PlaceIcon = ({ className }: { className?: string }) => (
  <FieldIcon className={className}>
    <path d="M1.75 2.75h12.5" />
    <g fill="currentColor" stroke="none">
      <rect x="2" y="4.5" width="3.5" height="8" />
      <rect x="6.25" y="4.5" width="3.5" height="8" />
      <rect x="10.5" y="4.5" width="3.5" height="8" />
    </g>
  </FieldIcon>
);
