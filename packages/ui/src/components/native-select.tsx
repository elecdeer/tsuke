import * as React from "react";
import { cn } from "@tsuke/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import styles from "./native-select.module.css";

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default";
  /** full は置き場所の幅いっぱいに広げる */
  width?: "fit" | "full";
};

function NativeSelect({ className, size = "default", width = "fit", ...props }: NativeSelectProps) {
  return (
    <div
      className={cn(styles.NativeSelect, className)}
      data-slot="native-select-wrapper"
      data-size={size}
      data-width={width}
    >
      <select data-slot="native-select" data-size={size} className={styles.control} {...props} />
      <ChevronDownIcon className={styles.icon} aria-hidden="true" data-slot="native-select-icon" />
    </div>
  );
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<"option">) {
  return (
    <option data-slot="native-select-option" className={cn(styles.Option, className)} {...props} />
  );
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn(styles.Option, className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
