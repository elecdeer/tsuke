import * as React from "react";
import { cn } from "@tsuke/ui/lib/utils";
import styles from "./textarea.module.css";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(styles.Textarea, className)} {...props} />;
}

export { Textarea };
