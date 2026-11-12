import { Link, useRouter } from "@void/react";
import { ChevronRight } from "lucide-react";
import { useId } from "react";
import { Input } from "@tsuke/ui/components/input";
import { Label } from "@tsuke/ui/components/label";
import { isDate, monthOf } from "@/ledger/dates";
import { Section } from "@tsuke/ui/patterns/Section";
import { formatAmount } from "@/web/format";
import { transactionsHref } from "@/web/transactionsHref";
import type { Props } from "./index.server";

type Balance = Props["balances"][number];

/**
 * 口座 1 つ分の行。押すとその日の月の、その口座の取引の一覧へ移る。
 *
 * マイナスの残高（クレジットカードなど）はふつうにあるので、注意の色にはせず符号だけで示す。
 */
const BalanceRow = ({ balance, date }: { balance: Balance; date: string }) => (
  <li className="border-b">
    <Link
      href={transactionsHref({ month: monthOf(date), accountId: balance.id })}
      className="grid grid-cols-[minmax(0,1fr)_8rem_1rem] items-baseline gap-x-4 py-2.5 hover:bg-muted/60"
    >
      <span className="truncate">{balance.name}</span>
      <span className="text-right tabular-nums">{formatAmount(balance.balance)}</span>
      <span className="text-xs text-muted-foreground">→</span>
    </Link>
  </li>
);

/**
 * 口座の一覧。始まりに黒の線を引く。
 */
const BalanceList = ({ balances, date }: { balances: Balance[]; date: string }) => (
  <ul className="border-t border-foreground">
    {balances.map((balance) => (
      <BalanceRow key={balance.id} balance={balance} date={date} />
    ))}
  </ul>
);

/**
 * 口座の残高の画面。合計がこの画面で一番見てほしい数字なので、アクセントの色で出す。
 */
const AccountsPage = ({ date, today, balances }: Props) => {
  const router = useRouter();
  const dateId = useId();
  const active = balances.filter((balance) => !balance.dormant);
  const dormant = balances.filter((balance) => balance.dormant);
  const total = balances.reduce((sum, balance) => sum + balance.balance, 0);

  return (
    <div className="flex flex-col gap-12">
      <div className="grid gap-x-4 gap-y-6 md:grid-cols-12 md:items-end">
        <div className="flex flex-col gap-4 md:col-span-3">
          <h1 className="text-2xl font-semibold">口座の残高</h1>
          <div className="flex max-w-40 flex-col gap-0.5">
            <Label htmlFor={dateId} className="text-xs font-normal text-muted-foreground">
              日付
            </Label>
            <Input
              id={dateId}
              type="date"
              value={date}
              max={today}
              onChange={(event) => {
                const next = event.target.value;
                if (isDate(next)) void router.visit(`/accounts?date=${next}`, { replace: true });
              }}
            />
          </div>
        </div>
        <dl className="flex flex-col gap-1 border-t border-primary pt-1.5 text-primary md:col-span-9">
          <dt className="text-xs">合計</dt>
          <dd className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatAmount(total)}
          </dd>
        </dl>
      </div>
      <Section label="口座">
        <BalanceList balances={active} date={date} />
      </Section>
      {dormant.length > 0 && (
        <Section label="使っていない口座">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 py-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
              {dormant.length} 件を表示
            </summary>
            <div className="mt-2">
              <BalanceList balances={dormant} date={date} />
            </div>
          </details>
        </Section>
      )}
    </div>
  );
};

export default AccountsPage;
