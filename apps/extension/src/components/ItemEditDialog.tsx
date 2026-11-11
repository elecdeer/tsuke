import { useId, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CategoryCombobox, type CategorySelection } from "./CategoryCombobox.tsx";
import { FormField, YenUnit } from "./FormField.tsx";

export type ItemEditField = "name" | "memo" | "amount";

interface ItemDraft {
  name: string;
  amount: string;
  memo: string;
  category: CategorySelection | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverUrl: string;
  item: ItemDraft;
  /** モーダルが開いたときにフォーカスを当てる項目 */
  initialFocus: ItemEditField;
  onChange: (patch: Partial<ItemDraft>) => void;
}

/**
 * 品目（品名・メモ・金額・カテゴリ）をまとめて編集するためのモーダル。
 * `initialFocus` で指定した項目に開いた直後フォーカスを当てる。
 */
export const ItemEditDialog = ({
  open,
  onOpenChange,
  serverUrl,
  item,
  initialFocus,
  onChange,
}: Props) => {
  const ids = { name: useId(), memo: useId(), amount: useId() };
  const nameRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const initialFocusFn = useMemo(
    () => () => {
      switch (initialFocus) {
        case "name":
          return nameRef.current;
        case "memo":
          return memoRef.current;
        case "amount":
          return amountRef.current;
        default:
          return null;
      }
    },
    [initialFocus],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={initialFocusFn} className="gap-4 sm:min-w-72">
        <DialogHeader>
          <DialogTitle>品目を編集</DialogTitle>
        </DialogHeader>
        <FormField label="品名" htmlFor={ids.name}>
          <Input
            ref={nameRef}
            id={ids.name}
            value={item.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </FormField>
        <FormField label="メモ" htmlFor={ids.memo}>
          <Input
            ref={memoRef}
            id={ids.memo}
            value={item.memo}
            onChange={(e) => onChange({ memo: e.target.value })}
          />
        </FormField>
        <FormField label="金額" htmlFor={ids.amount}>
          <div className="relative">
            <Input
              ref={amountRef}
              id={ids.amount}
              className="appearance-none pr-4 text-right tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              type="number"
              min={1}
              step={1}
              placeholder="0"
              value={item.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
            />
            {/* 入力欄の文字と同じ大きさの行に置き、小さくした「円」の下端を数字にそろえる */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 py-1 text-sm"
            >
              <YenUnit />
            </span>
          </div>
        </FormField>
        <CategoryCombobox
          serverUrl={serverUrl}
          value={item.category}
          onChange={(value) => onChange({ category: value })}
        />
        <DialogFooter>
          <DialogClose render={<Button type="button">完了</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
