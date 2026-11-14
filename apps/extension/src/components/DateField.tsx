import { CalendarDaysIcon } from "lucide-react";
import { useId, useState } from "react";
import { buttonStyleProps } from "@tsuke/ui/components/button";
import { Calendar } from "@tsuke/ui/components/calendar";
import { Input } from "@tsuke/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@tsuke/ui/components/popover";
import { FormField } from "@tsuke/ui/patterns/FormField";
import styles from "./DateField.module.css";

interface Props {
  /** ISO date string `YYYY-MM-DD` */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toPlainDate = (value: string): Temporal.PlainDate | null => {
  if (!ISO_DATE_RE.test(value)) return null;
  try {
    return Temporal.PlainDate.from(value);
  } catch {
    return null;
  }
};

const toJsDate = (value: string): Date | undefined => {
  const pd = toPlainDate(value);
  if (!pd) return undefined;
  return new Date(pd.year, pd.month - 1, pd.day);
};

const fromJsDate = (d: Date): string =>
  new Temporal.PlainDate(d.getFullYear(), d.getMonth() + 1, d.getDate()).toString();

/**
 * 日付入力フィールド。テキスト直接入力（YYYY-MM-DD）と、カレンダーポップアップによる選択を併用する。
 * カレンダーを開くボタンは、台帳の店舗の欄の地図のボタンと同じく欄の右に置く。
 */
export const DateField = ({ value, onChange, required }: Props) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selectedDate = toJsDate(value);

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    onChange(fromJsDate(date));
    setOpen(false);
  };

  return (
    <FormField label="日付" htmlFor={id}>
      <div className={styles.DateField}>
        <Input
          id={id}
          className={styles.input}
          type="text"
          inputMode="numeric"
          pattern="\d{4}-\d{2}-\d{2}"
          placeholder="YYYY-MM-DD"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            {...buttonStyleProps({ variant: "ghost", size: "icon-sm", tone: "muted" })}
            aria-label="カレンダーを開く"
          >
            <CalendarDaysIcon aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent variant="bare" align="end" sideOffset={4}>
            <Calendar
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate}
              onSelect={handleCalendarSelect}
            />
          </PopoverContent>
        </Popover>
      </div>
    </FormField>
  );
};
