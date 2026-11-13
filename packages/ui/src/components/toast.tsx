import { XIcon } from "lucide-react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { Button } from "@tsuke/ui/components/button";
import { cn } from "@tsuke/ui/lib/utils";
import { popupSurfaceClassName } from "@tsuke/ui/lib/control";

const ToastProvider = ToastPrimitive.Provider;
const useToastManager = ToastPrimitive.useToastManager;

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toast-viewport"
        // justify-self は fixed 要素にも効き、幅が中身（absolute のトーストなので 0）に縮むため使わない。
        // 左右の inset と mx-auto + max-w で中央寄せする
        className={cn(
          "fixed inset-x-4 bottom-4 z-50 mx-auto flex h-(--toast-frontmost-height) w-auto max-w-72 outline-hidden",
          className,
        )}
        {...props}
      />
    </ToastPrimitive.Portal>
  );
}

function ToastRoot({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "absolute inset-x-0 bottom-0 z-(--toast-z-index) origin-bottom p-3 text-sm transition-all duration-200 [transform:translateY(calc(var(--toast-offset-y)*-1))_scale(calc(1_-_var(--toast-index)*0.05))] data-ending-style:translate-y-2 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0 data-[type=error]:ring-destructive",
        popupSurfaceClassName,
        className,
      )}
      style={{ "--toast-z-index": "calc(100 - var(--toast-index))" } as React.CSSProperties}
      {...props}
    />
  );
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn("flex items-start gap-2 overflow-hidden", className)}
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("font-medium leading-none", className)}
      {...props}
    />
  );
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

function ToastClose({ className, ...props }: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      render={<Button variant="ghost" size="icon-sm" className={cn("-m-1 shrink-0", className)} />}
      {...props}
    >
      <XIcon />
      <span className="sr-only">閉じる</span>
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
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
