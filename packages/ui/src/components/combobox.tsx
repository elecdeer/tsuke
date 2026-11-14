import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { cn } from "@tsuke/ui/lib/utils";
import {
  listItemClassName,
  listLabelClassName,
  popupMotionClassName,
  popupSurfaceClassName,
} from "@tsuke/ui/lib/control";

import { Button } from "@tsuke/ui/components/button";
import { Input } from "@tsuke/ui/components/input";
import { ChevronDownIcon, XIcon, CheckIcon } from "lucide-react";
import styles from "./combobox.module.css";

/**
 * 候補の出し方。
 * - popup: 浮く面に出す（選択欄から開くとき）
 * - inline: 欄のすぐ下に、欄の続きのように出す（店舗の欄のように打ち込みながら選ぶとき）
 */
type ComboboxContentVariant = "popup" | "inline";

const ContentVariantContext = React.createContext<ComboboxContentVariant>("popup");

const Combobox = ComboboxPrimitive.Root;

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(styles.Trigger, className)}
      {...props}
    >
      {children}
      <ChevronDownIcon className={styles.icon} />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<Button variant="ghost" size="icon-xs" />}
      {...props}
    >
      <XIcon />
    </ComboboxPrimitive.Clear>
  );
}

/**
 * 候補の一覧の上に置く検索欄。ComboboxContent の中に置く。
 */
function ComboboxInput({
  className,
  children,
  disabled = false,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <div data-slot="combobox-search" className={cn(styles.Search, className)}>
      <ComboboxPrimitive.Input
        render={<Input className={styles.input} disabled={disabled} />}
        {...props}
      />
      {children}
    </div>
  );
}

/**
 * 欄と、その右に並べるボタン（消す・地図から選ぶなど）をまとめる。
 * ref を useComboboxAnchor の値にすると、候補はこの幅で欄のすぐ下に出る。
 */
function ComboboxField({ ...props }: Omit<React.ComponentProps<"div">, "className">) {
  return <div data-slot="combobox-field" className={styles.Field} {...props} />;
}

function ComboboxContent({
  className,
  variant = "popup",
  side = "bottom",
  sideOffset = variant === "inline" ? 0 : 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  > & {
    variant?: ComboboxContentVariant;
  }) {
  return (
    <ContentVariantContext value={variant}>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          anchor={anchor}
          className={styles.Positioner}
        >
          <ComboboxPrimitive.Popup
            data-slot="combobox-content"
            data-variant={variant}
            data-anchored={anchor === undefined ? undefined : ""}
            className={cn(styles.Content, popupSurfaceClassName, popupMotionClassName, className)}
            {...props}
          />
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ContentVariantContext>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  const variant = React.use(ContentVariantContext);
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      data-variant={variant}
      className={cn(styles.List, className)}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  const variant = React.use(ContentVariantContext);
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      data-variant={variant}
      className={cn(listItemClassName, styles.Item, className)}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator render={<span className={styles.indicator} />}>
        <CheckIcon />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ ...props }: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" {...props} />;
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn(listLabelClassName, className)}
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />;
}

/**
 * 候補がないときの知らせ。ComboboxContent の直下に置く。
 */
function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  const variant = React.use(ContentVariantContext);
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      data-variant={variant}
      className={cn(styles.Empty, styles.empty, className)}
      {...props}
    />
  );
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxClear,
  ComboboxInput,
  ComboboxField,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
};
