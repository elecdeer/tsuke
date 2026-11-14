import { useId, useMemo, useRef } from "react";
import { Button } from "@tsuke/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tsuke/ui/components/dialog";
import { Input } from "@tsuke/ui/components/input";
import { CategoryCombobox, type CategorySelection } from "./CategoryCombobox.tsx";
import { FormField } from "@tsuke/ui/patterns/FormField";
import { AmountInput } from "@tsuke/ui/patterns/AmountInput";

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
      <DialogContent initialFocus={initialFocusFn}>
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
          <AmountInput
            ref={amountRef}
            id={ids.amount}
            type="number"
            min={1}
            step={1}
            placeholder="0"
            value={item.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
          />
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
