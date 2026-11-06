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

/**
 * 並ぶ数が月ごとに変わる所（カテゴリや日ごとのまとまり）を読む前に、まとめて置く骨組み。
 *
 * 見出しや罫線まで本物で描くと、読んだあとに数が合わずに下の行がずれるので、ここはまるごと棒にする。
 */
export const SkeletonBlock = ({ rows }: { rows: number }) => (
  <div aria-hidden className="flex flex-col gap-3">
    {Array.from({ length: rows }, (_, index) => (
      <div
        // 中身のない飾りの行なので、並びの位置をそのまま key にする
        key={index}
        className="h-4 rounded-sm bg-muted"
        style={{ width: `${90 - (index % 3) * 15}%` }}
      />
    ))}
  </div>
);
