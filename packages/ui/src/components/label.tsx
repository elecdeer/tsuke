import * as React from "react";
import { cn } from "@tsuke/ui/lib/utils";
import styles from "./label.module.css";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn(styles.Label, className)} {...props} />;
}

export { Label };
