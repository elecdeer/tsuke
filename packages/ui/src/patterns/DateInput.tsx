import { CalendarDaysIcon } from "lucide-react";
import { useState } from "react";
import { buttonStyleProps } from "@tsuke/ui/components/button";
import { Calendar } from "@tsuke/ui/components/calendar";
import { Input } from "@tsuke/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@tsuke/ui/components/popover";
import styles from "./DateInput.module.css";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * YYYY-MM-DD の文字列を、カレンダーが扱うその日の 0 時（その地域の時刻）の Date にする。
 * 打ちかけや実在しない日なら undefined を返す。
 */
const toJsDate = (value: string): Date | undefined => {
  if (!ISO_DATE_PATTERN.test(value)) return undefined;
  try {
    const date = Temporal.PlainDate.from(value, { overflow: "reject" });
    return new Date(date.year, date.month - 1, date.day);
  } catch {
    return undefined;
  }
};

/**
 * カレンダーで選んだ Date を YYYY-MM-DD の文字列にする。
 */
const fromJsDate = (date: Date): string =>
  new Temporal.PlainDate(date.getFullYear(), date.getMonth() + 1, date.getDate()).toString();

/**
 * 日付の入力欄。YYYY-MM-DD を文字で打つほか、欄の右のボタンからカレンダーを開いて選べる。
 * カレンダーを開くボタンは、台帳の店舗の欄の地図のボタンと同じく欄の右に置く。
 *
 * ラベルは持たないので、FormField で囲んで id を渡す。
 * native の date の欄は端末ごとに見た目と操作が大きく違うので使わない。
 * Temporal を使うので、ない環境（iOS の Safari など）では使う側で polyfill を読み込んでおく。
 */
export const DateInput = ({
  id,
  value,
  onChange,
  required,
  max,
}: {
  id: string;
  /** YYYY-MM-DD の文字列。打ちかけの途中の値もそのまま持つ */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** 選べる最後の日（YYYY-MM-DD）。カレンダーでそれより後の日を選べなくする */
  max?: string;
}) => {
  const [open, setOpen] = useState(false);
  const selectedDate = toJsDate(value);
  const maxDate = max === undefined ? undefined : toJsDate(max);

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    onChange(fromJsDate(date));
    setOpen(false);
  };

  return (
    <div className={styles.DateInput}>
      <Input
        id={id}
        className={styles.input}
        type="text"
        inputMode="numeric"
        pattern="\d{4}-\d{2}-\d{2}"
        placeholder="YYYY-MM-DD"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
            defaultMonth={selectedDate ?? maxDate}
            onSelect={handleCalendarSelect}
            disabled={maxDate === undefined ? undefined : { after: maxDate }}
            endMonth={maxDate}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};
