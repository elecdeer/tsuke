import * as React from "react";
import { cn } from "@tsuke/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default";
};

function NativeSelect({ className, size = "default", ...props }: NativeSelectProps) {
  return (
    <div
      className={cn(
        "group/native-select relative w-fit has-[select:disabled]:opacity-50",
        className,
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        // 入力欄（input.tsx）と同じく、枠の代わりに下線だけを引き、選んでいる間は下線を太くする
        className="h-8 w-full min-w-0 appearance-none rounded-none border-0 border-b border-foreground/40 bg-transparent py-1 pr-7 pl-0 text-sm transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground hover:border-foreground focus-visible:border-foreground focus-visible:shadow-[inset_0_-1px_0_var(--foreground)] disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:shadow-[inset_0_-1px_0_var(--destructive)] data-[size=sm]:h-7 data-[size=sm]:py-0.5"
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-0.5 size-4 -translate-y-1/2 text-muted-foreground select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
