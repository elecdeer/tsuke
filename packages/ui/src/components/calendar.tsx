import * as React from "react";
import { DayPicker, type DayButton, type Locale } from "react-day-picker";
import { cn } from "@tsuke/ui/lib/utils";
import { Button } from "@tsuke/ui/components/button";
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "lucide-react";
import styles from "./calendar.module.css";

/**
 * 日付を選ぶカレンダー。見出しは「年月」の文字で出し、前後の月へはボタンで移る。
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(styles.Calendar, className)}
      captionLayout="label"
      locale={locale}
      formatters={formatters}
      classNames={{
        months: styles.Months,
        month: styles.Month,
        nav: styles.Nav,
        button_previous: styles.NavButton,
        button_next: styles.NavButton,
        month_caption: styles.Caption,
        caption_label: styles.CaptionLabel,
        month_grid: styles.Grid,
        weekdays: styles.Weekdays,
        weekday: styles.Weekday,
        week: styles.Week,
        day: styles.Day,
        today: styles.Today,
        outside: styles.Outside,
        disabled: styles.Disabled,
        hidden: styles.Hidden,
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return <div data-slot="calendar" ref={rootRef} className={className} {...props} />;
        },
        PreviousMonthButton: ({ className, ...props }) => (
          <Button variant="ghost" size="icon" className={className} {...props} />
        ),
        NextMonthButton: ({ className, ...props }) => (
          <Button variant="ghost" size="icon" className={className} {...props} />
        ),
        Chevron: ({ orientation, ...props }) => {
          if (orientation === "left") {
            return <ChevronLeftIcon {...props} />;
          }
          if (orientation === "right") {
            return <ChevronRightIcon {...props} />;
          }
          return <ChevronDownIcon {...props} />;
        },
        DayButton: ({ ...props }) => <CalendarDayButton locale={locale} {...props} />,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(styles.DayButton, className)}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
