import * as React from "react";
import { cn } from "@tsuke/ui/lib/utils";
import styles from "./table.module.css";

type TableSize = "default" | "sm";

/** 表の大きさ。見出しとセルの余白も表に合わせるので、中へ伝える */
const TableSizeContext = React.createContext<TableSize>("default");

type CellOptions = {
  /** end は右に寄せる（金額の列など） */
  align?: "start" | "end";
  /** 数字（日付・金額）の桁をそろえる */
  numeric?: boolean;
  /** 長い文字列（ID や URL）を折り返す */
  wrap?: boolean;
};

const cellDataProps = ({ align = "start", numeric = false, wrap = false }: CellOptions) => ({
  "data-align": align,
  "data-numeric": numeric || undefined,
  "data-wrap": wrap || undefined,
});

function Table({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"table"> & {
  /** sm は中身の幅だけで小さく出す（細かい内訳など） */
  size?: TableSize;
}) {
  return (
    <TableSizeContext value={size}>
      <div data-slot="table-container" data-size={size} className={cn(styles.Container, className)}>
        <table data-slot="table" className={styles.table} {...props} />
      </div>
    </TableSizeContext>
  );
}

function TableHeader({ ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(styles.Body, className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn(styles.Row, styles.row, className)} {...props} />;
}

function TableHead({
  className,
  align,
  numeric,
  wrap,
  ...props
}: Omit<React.ComponentProps<"th">, "align"> & CellOptions) {
  return (
    <th
      data-slot="table-head"
      data-size={React.use(TableSizeContext)}
      {...cellDataProps({ align, numeric, wrap })}
      className={cn(styles.Head, className)}
      {...props}
    />
  );
}

function TableCell({
  className,
  align,
  numeric,
  wrap,
  ...props
}: Omit<React.ComponentProps<"td">, "align"> & CellOptions) {
  return (
    <td
      data-slot="table-cell"
      data-size={React.use(TableSizeContext)}
      {...cellDataProps({ align, numeric, wrap })}
      className={cn(styles.Cell, className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
