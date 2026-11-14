import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { visuallyHiddenClassName } from "@tsuke/ui/lib/a11y";
import { cn } from "@tsuke/ui/lib/utils";

import { Button } from "@tsuke/ui/components/button";
import { XIcon } from "lucide-react";
import styles from "./dialog.module.css";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(styles.Overlay, className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  size = "default",
  layout = "grid",
  gap = "default",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  /** 広い画面での幅。lg は入力の多いもの、xl は地図など画面いっぱいを使うもの */
  size?: "default" | "lg" | "xl";
  /** column は縦に並べ、中の一部（写真や地図）を残りの高さに縮めて収める */
  layout?: "grid" | "column";
  /** 中身どうしの間隔 */
  gap?: "tight" | "default" | "loose";
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-size={size}
        data-layout={layout}
        data-gap={gap}
        className={cn(styles.Content, className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={<Button variant="ghost" className={styles.close} size="icon-sm" />}
          >
            <XIcon />
            <span className={visuallyHiddenClassName}>Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn(styles.Header, className)} {...props} />;
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div data-slot="dialog-footer" className={cn(styles.Footer, className)} {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(styles.Title, className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  visuallyHidden = false,
  ...props
}: DialogPrimitive.Description.Props & {
  /** 見た目からは隠し、読み上げにだけ残す */
  visuallyHidden?: boolean;
}) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(visuallyHidden ? visuallyHiddenClassName : styles.Description, className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
