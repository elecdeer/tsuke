import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@tsuke/ui/lib/utils";
import styles from "./drawer.module.css";

/**
 * 画面の下から出るシート。下へスワイプするか、外を押すか、Esc で閉じる。
 */
function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

/**
 * シートを開くボタン。
 */
function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

/**
 * シートを閉じるボタン。
 */
function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

/**
 * シートの面。背景を暗くし、上にスワイプの取っ手を出して、中身が高ければシートの中でスクロールさせる。
 */
function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop data-slot="drawer-overlay" className={styles.Overlay} />
      <DrawerPrimitive.Viewport className={styles.Viewport}>
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(styles.Content, className)}
          {...props}
        >
          <div className={styles.handle} aria-hidden="true" />
          <DrawerPrimitive.Content className={styles.body}>{children}</DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

/**
 * シートの見出し。
 */
function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(styles.Title, className)}
      {...props}
    />
  );
}

export { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger };
