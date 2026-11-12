import type { ReactNode } from "react";
import { cn } from "@tsuke/ui/lib/utils";

/**
 * 見出しを左の 3 列、中身を右の 9 列に置くまとまり。狭いところでは見出しを中身の上に積む。
 *
 * 取引の一覧のサイドパネルのように、広い画面でも幅の狭い場所に置くことがあるので、
 * 画面の幅ではなく置き場所の幅（コンテナクエリ）で切り替える。切り替える幅は、画面の幅の md（48rem）から
 * 本文の左右の余白（2rem）を引いたもので、ヘッダーのグリッドと同じところで切り替わる。
 */
export const Section = ({
  label,
  children,
  className,
  labelClassName,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  /** 見出しの列に足すクラス。見出しを sticky にするときなどに使う */
  labelClassName?: string;
}) => (
  <section className="@container">
    <div className={cn("grid gap-x-4 gap-y-2 @min-[46rem]:grid-cols-12", className)}>
      <div className={cn("text-base font-semibold @min-[46rem]:col-span-3", labelClassName)}>
        {label}
      </div>
      <div className="min-w-0 @min-[46rem]:col-span-9">{children}</div>
    </div>
  </section>
);
