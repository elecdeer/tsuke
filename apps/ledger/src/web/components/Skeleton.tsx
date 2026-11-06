import { cn } from "@/lib/utils";

/**
 * 読むまでわからない文字（金額や名前など）の代わりに置く棒。文字と同じ行の高さに収め、まわりの配置をずらさない。
 *
 * 見出しや罫線など、どの月でも同じ所は本物を描き、月ごとに変わる所だけをこれにする。
 */
export const SkeletonText = ({ className }: { className?: string }) => (
  <span
    aria-hidden
    className={cn("inline-block h-[0.8em] w-16 rounded-sm bg-muted align-middle", className)}
  />
);
