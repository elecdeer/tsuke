import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@tsuke/ui/lib/utils";
import styles from "./tabs.module.css";

/**
 * タブの切り替え。見た目は台帳のヘッダーのナビ（apps/ledger/pages/layout.tsx）にそろえ、
 * 箱や背景で囲まず、今いるタブだけに赤の下線を引く（docs/design.md）。
 */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn(styles.Tabs, className)} {...props} />;
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List data-slot="tabs-list" className={cn(styles.List, className)} {...props} />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(styles.Trigger, className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(styles.Content, className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
