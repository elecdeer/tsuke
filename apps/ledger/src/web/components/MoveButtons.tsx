import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 並びの中で行を上下へ動かすボタン。端の行では、その向きのボタンを押せなくする。
 */
export const MoveButtons = ({
  name,
  index,
  count,
  disabled,
  onMove,
}: {
  /** 読み上げに使う、行の名前 */
  name: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (offset: -1 | 1) => void;
}) => (
  <div className="flex shrink-0">
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`${name}を上へ`}
      disabled={disabled || index === 0}
      onClick={() => onMove(-1)}
    >
      <ArrowUp />
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`${name}を下へ`}
      disabled={disabled || index === count - 1}
      onClick={() => onMove(1)}
    >
      <ArrowDown />
    </Button>
  </div>
);
