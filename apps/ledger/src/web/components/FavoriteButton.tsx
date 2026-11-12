import { Star } from "lucide-react";
import { useState } from "react";
import { actionErrorMessage } from "@/web/actionError";
import { ErrorMessage } from "@tsuke/ui/patterns/ErrorMessage";
import type { EditorActionResult } from "@/web/components/TransactionEditor";
import { cn } from "@tsuke/ui/lib/utils";

/**
 * よく使う取引の印を付け外しするボタン。印の有無は色だけに頼らず、星を塗るかどうかでも示す。
 *
 * 印の状態は親の loader の値を見せる。フォームの外に置くので、押しても入力中の値は変わらない。
 */
export const FavoriteButton = ({
  favorite,
  onToggle,
  label,
  showLabel = false,
}: {
  favorite: boolean;
  onToggle: (favorite: boolean) => Promise<EditorActionResult>;
  /** 読み上げの名前 */
  label: string;
  /** 「よく使う」の文字をアイコンに添える */
  showLabel?: boolean;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setError(null);
    setPending(true);
    const result = await onToggle(!favorite);
    setPending(false);
    if (!result.ok) setError(actionErrorMessage(result.error));
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={label}
        disabled={pending}
        onClick={() => void toggle()}
        className={cn(
          "flex items-center gap-1 p-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50",
          favorite && "text-foreground",
        )}
      >
        <Star className={cn("size-4", favorite && "fill-current")} aria-hidden="true" />
        {showLabel && "よく使う"}
      </button>
      {error !== null && <ErrorMessage message={error} />}
    </span>
  );
};
