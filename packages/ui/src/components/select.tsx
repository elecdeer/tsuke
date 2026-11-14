import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "@tsuke/ui/lib/utils";
import {
  listItemClassName,
  listLabelClassName,
  listSeparatorClassName,
  popupMotionClassName,
  popupSurfaceClassName,
} from "@tsuke/ui/lib/control";
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react";
import styles from "./select.module.css";

type SelectTriggerStyleOptions = {
  /**
   * caption は下の欄に添える小さな見出しのように出す。
   * caption-on-narrow は、置き場所（コンテナ）が狭い間だけ caption にする
   */
  variant?: "default" | "caption" | "caption-on-narrow";
  size?: "sm" | "default";
  /** full は置き場所の幅いっぱいに広げる */
  width?: "fit" | "full";
  /** end は値を右に寄せ、数字の桁をそろえる（金額など） */
  align?: "start" | "end";
};

/**
 * 選択欄の見た目を、Select 以外のボタン（店舗やカテゴリの combobox を開くボタンなど）にも当てるための props。
 * 見た目の違いは data 属性で切り替えるので、要素へ広げて渡す。
 */
const selectTriggerStyleProps = ({
  variant = "default",
  size = "default",
  width = "fit",
  align = "start",
}: SelectTriggerStyleOptions = {}) => ({
  className: styles.Trigger,
  "data-variant": variant,
  "data-size": size,
  "data-width": width,
  "data-align": align,
});

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn(styles.Group, className)}
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn(styles.Value, className)}
      {...props}
    />
  );
}

/**
 * 選択欄の形をしたボタンの中に出す値。長いものは末尾を省き、placeholder のときは薄く出す。
 */
function SelectTriggerText({
  placeholder = false,
  align = "start",
  ...props
}: Omit<React.ComponentProps<"span">, "className"> & {
  placeholder?: boolean;
  align?: "start" | "end";
}) {
  return (
    <span
      className={styles.TriggerText}
      data-placeholder={placeholder || undefined}
      data-align={align}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  variant = "default",
  size = "default",
  width = "fit",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & Omit<SelectTriggerStyleOptions, "align">) {
  const { className: triggerClassName, ...dataProps } = selectTriggerStyleProps({
    variant,
    size,
    width,
  });
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      {...dataProps}
      className={cn(triggerClassName, className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className={styles.icon} />} />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className={styles.Positioner}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(styles.Content, popupSurfaceClassName, popupMotionClassName, className)}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className={styles.list}>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn(listLabelClassName, className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  inset = false,
  ...props
}: SelectPrimitive.Item.Props & {
  /** まとまりの中の項目（カテゴリの中の内訳など）を一段下げる */
  inset?: boolean;
}) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      data-inset={inset || undefined}
      className={cn(listItemClassName, styles.Item, className)}
      {...props}
    >
      <SelectPrimitive.ItemText className={styles.text}>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator render={<span className={styles.indicator} />}>
        <CheckIcon />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn(listSeparatorClassName, className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      data-direction="up"
      className={cn(styles.ScrollArrow, className)}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      data-direction="down"
      className={cn(styles.ScrollArrow, className)}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectTriggerText,
  selectTriggerStyleProps,
  SelectValue,
};
