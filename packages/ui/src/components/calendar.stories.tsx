import { useState } from "react";
import preview from "#storybook/preview";
import { Calendar } from "./calendar.tsx";

/**
 * 日付を選ぶカレンダー。拡張機能では日付の欄の横のボタンから Popover で開く。
 */
const meta = preview.meta({
  title: "Components/Calendar",
  component: Calendar,
});

export default meta;

const ControlledCalendar = () => {
  const [selected, setSelected] = useState<Date | undefined>(new Date(2026, 10, 12));
  return (
    <Calendar
      mode="single"
      selected={selected}
      defaultMonth={selected}
      onSelect={setSelected}
      className="border"
    />
  );
};

export const Default = meta.story({
  render: () => <ControlledCalendar />,
});
