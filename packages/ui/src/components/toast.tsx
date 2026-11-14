import { XIcon } from "lucide-react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { Button } from "@tsuke/ui/components/button";
import { cn } from "@tsuke/ui/lib/utils";
import { popupSurfaceClassName } from "@tsuke/ui/lib/control";
import { visuallyHiddenClassName } from "@tsuke/ui/lib/a11y";
import styles from "./toast.module.css";

const ToastProvider = ToastPrimitive.Provider;
const useToastManager = ToastPrimitive.useToastManager;

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toast-viewport"
        className={cn(styles.Viewport, className)}
        {...props}
      />
    </ToastPrimitive.Portal>
  );
}

function ToastRoot({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(styles.Toast, popupSurfaceClassName, className)}
      style={{ "--toast-z-index": "calc(100 - var(--toast-index))" } as React.CSSProperties}
      {...props}
    />
  );
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(styles.Content, className)}
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn(styles.Title, className)}
      {...props}
    />
  );
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn(styles.Description, className)}
      {...props}
    />
  );
}

function ToastClose({ className, ...props }: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      render={<Button variant="ghost" size="icon-sm" className={cn(styles.close, className)} />}
      {...props}
    >
      <XIcon />
      <span className={visuallyHiddenClassName}>閉じる</span>
    </ToastPrimitive.Close>
  );
}

/**
 * アプリ全体に1つだけ配置するトースト描画コンポーネント。
 * トースト表示は `useToastManager().add(...)` で行う。
 */
function Toaster() {
  const { toasts } = useToastManager();

  return (
    <ToastViewport>
      {toasts.map((toast) => (
        <ToastRoot key={toast.id} toast={toast} role={toast.type === "error" ? "alert" : "status"}>
          <ToastContent>
            <div className={styles.text}>
              {toast.title && <ToastTitle>{toast.title}</ToastTitle>}
              {toast.description && <ToastDescription>{toast.description}</ToastDescription>}
            </div>
            <ToastClose />
          </ToastContent>
        </ToastRoot>
      ))}
    </ToastViewport>
  );
}

export {
  Toaster,
  ToastProvider,
  ToastViewport,
  ToastRoot,
  ToastContent,
  ToastTitle,
  ToastDescription,
  ToastClose,
  useToastManager,
};
