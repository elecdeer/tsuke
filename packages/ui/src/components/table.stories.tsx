import preview from "#storybook/preview";
import { formatAmount } from "@tsuke/ui/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table.tsx";

const ROWS = [
  { date: "11/1", place: "スーパーA", amount: 1280 },
  { date: "11/3", place: "カフェC", amount: 450 },
  { date: "11/5", place: "ドラッグストアD", amount: -120 },
];

/**
 * 一覧の表。数字は等幅にし、金額は右揃えで桁をそろえる。列の名前で金額だと分かるので「円」は付けない。
 */
const meta = preview.meta({
  title: "Components/Table",
  component: Table,
  render: () => (
    <Table style={{ maxWidth: "28rem" }}>
      <TableHeader>
        <TableRow>
          <TableHead>日付</TableHead>
          <TableHead>店舗</TableHead>
          <TableHead align="end">金額</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={`${row.date}-${row.place}`}>
            <TableCell numeric>{row.date}</TableCell>
            <TableCell>{row.place}</TableCell>
            <TableCell align="end" numeric>
              {formatAmount(row.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
});

export default meta;

export const Default = meta.story({});
