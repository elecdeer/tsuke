import { cn } from "@/lib/utils";

/**
 * 中身を読むまで出しておく骨組み。行の幅を少しずつ変え、一覧らしく見せる。
 */
export const Skeleton = ({ rows, className }: { rows: number; className?: string }) => (
  <div className={cn("flex flex-col gap-3", className)}>
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
