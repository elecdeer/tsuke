import { Link, useShared } from "@void/react";
import { buttonStyleProps } from "@tsuke/ui/components/button";
import { PageTitle } from "@tsuke/ui/patterns/PageTitle";
import { Section } from "@tsuke/ui/patterns/Section";
import styles from "./index.module.css";

/**
 * 設定の画面。ログイン中のアカウントと、マスタの管理の画面への入口を置く。
 */
const SettingsPage = () => {
  const { email } = useShared();
  return (
    <div className={styles.SettingsPage}>
      <PageTitle size="lg">設定</PageTitle>
      <Section label="アカウント">
        <dl className={styles.List}>
          <div className={`${styles.item} ${styles.Account}`}>
            <div className={styles.accountText}>
              <dt className={styles.accountLabel}>ログイン中</dt>
              <dd className={styles.accountEmail}>{email}</dd>
            </div>
            {/* Cloudflare Access のログアウトへリダイレクトするので、画面の中の移動（Link）にはしない */}
            <a href="/logout" {...buttonStyleProps({ variant: "outline", size: "sm" })}>
              ログアウト
            </a>
          </div>
        </dl>
      </Section>
      <Section label="マスタ">
        <ul className={styles.List}>
          <li className={styles.item}>
            <Link href="/settings/accounts" className={styles.MasterLink}>
              <span>口座</span>
              <span className={styles.arrow}>→</span>
            </Link>
          </li>
          <li className={styles.item}>
            <Link href="/settings/categories" className={styles.MasterLink}>
              <span>カテゴリ</span>
              <span className={styles.arrow}>→</span>
            </Link>
          </li>
          <li className={styles.item}>
            <Link href="/settings/places" className={styles.MasterLink}>
              <span>店舗</span>
              <span className={styles.arrow}>→</span>
            </Link>
          </li>
        </ul>
      </Section>
    </div>
  );
};

export default SettingsPage;
