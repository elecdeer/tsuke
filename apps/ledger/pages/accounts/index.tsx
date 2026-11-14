import { Link, useRouter } from "@void/react";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { isDate, monthOf } from "@/ledger/dates";
import { DateInput } from "@tsuke/ui/patterns/DateInput";
import { FormField } from "@tsuke/ui/patterns/FormField";
import { PageTitle } from "@tsuke/ui/patterns/PageTitle";
import { Section } from "@tsuke/ui/patterns/Section";
import { formatAmount } from "@/web/format";
import { transactionsHref } from "@/web/transactionsHref";
import type { Props } from "./index.server";
import styles from "./index.module.css";

type Balance = Props["balances"][number];

/**
 * 口座 1 つ分の行。押すとその日の月の、その口座の取引の一覧へ移る。
 *
 * マイナスの残高（クレジットカードなど）はふつうにあるので、注意の色にはせず符号だけで示す。
 */
const BalanceRow = ({ balance, date }: { balance: Balance; date: string }) => (
  <li className={styles.row}>
    <Link
      href={transactionsHref({ period: monthOf(date), accountId: balance.id })}
      className={styles.rowLink}
    >
      <span className={styles.name}>{balance.name}</span>
      <span className={styles.balance}>{formatAmount(balance.balance)}</span>
      <span className={styles.arrow}>→</span>
    </Link>
  </li>
);

/**
 * 口座の一覧。始まりに黒の線を引く。
 */
const BalanceList = ({ balances, date }: { balances: Balance[]; date: string }) => (
  <ul className={styles.BalanceList}>
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
  // 文字で打ちかけの値は画面に持ち、正しい日付になったときだけ移る。移った先の日付が来たら打ちかけを捨てる
  const [typedDate, setTypedDate] = useState({ shownFor: date, value: date });
  if (typedDate.shownFor !== date) setTypedDate({ shownFor: date, value: date });
  const active = balances.filter((balance) => !balance.dormant);
  const dormant = balances.filter((balance) => balance.dormant);
  const total = balances.reduce((sum, balance) => sum + balance.balance, 0);

  return (
    <div className={styles.AccountsPage}>
      <div className={styles.Header}>
        <div className={styles.titleColumn}>
          <PageTitle>口座の残高</PageTitle>
          <FormField label="日付" htmlFor={dateId} className={styles.dateField}>
            <DateInput
              id={dateId}
              value={typedDate.value}
              max={today}
              onChange={(next) => {
                setTypedDate({ shownFor: date, value: next });
                // 文字で打つと max を超えられるので、未来の日には移らない
                if (isDate(next) && next <= today && next !== date) {
                  void router.visit(`/accounts?date=${next}`, { replace: true });
                }
              }}
            />
          </FormField>
        </div>
        <dl className={styles.total}>
          <dt className={styles.totalLabel}>合計</dt>
          <dd className={styles.totalValue}>{formatAmount(total)}</dd>
        </dl>
      </div>
      <Section label="口座">
        <BalanceList balances={active} date={date} />
      </Section>
      {dormant.length > 0 && (
        <Section label="使っていない口座">
          <details className={styles.Dormant}>
            <summary className={styles.toggle}>
              <ChevronRight className={styles.chevron} />
              {dormant.length} 件を表示
            </summary>
            <div className={styles.dormantList}>
              <BalanceList balances={dormant} date={date} />
            </div>
          </details>
        </Section>
      )}
    </div>
  );
};

export default AccountsPage;
