import { Link, useShared } from "@void/react";
import { buttonVariants } from "@/components/ui/button";
import { Section } from "@/web/components/Section";

/**
 * 設定の画面。ログイン中のアカウントと、マスタの管理の画面への入口を置く。
 */
const SettingsPage = () => {
  const { email } = useShared();
  return (
    <div className="flex flex-col gap-12">
      <h1 className="text-3xl font-semibold tracking-tight">設定</h1>
      <Section label="アカウント">
        <dl className="border-t border-foreground">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b py-2.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">ログイン中</dt>
              <dd className="truncate">{email}</dd>
            </div>
            {/* Cloudflare Access のログアウトへリダイレクトするので、画面の中の移動（Link）にはしない */}
            <a href="/logout" className={buttonVariants({ variant: "outline", size: "sm" })}>
              ログアウト
            </a>
          </div>
        </dl>
      </Section>
      <Section label="マスタ">
        <ul className="border-t border-foreground">
          <li className="border-b">
            <Link
              href="/settings/accounts"
              className="grid grid-cols-[minmax(0,1fr)_1rem] items-baseline gap-x-4 py-2.5 hover:bg-muted/60"
            >
              <span>口座</span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
          </li>
          <li className="border-b">
            <Link
              href="/settings/categories"
              className="grid grid-cols-[minmax(0,1fr)_1rem] items-baseline gap-x-4 py-2.5 hover:bg-muted/60"
            >
              <span>カテゴリ</span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
          </li>
          <li className="border-b">
            <Link
              href="/settings/places"
              className="grid grid-cols-[minmax(0,1fr)_1rem] items-baseline gap-x-4 py-2.5 hover:bg-muted/60"
            >
              <span>店舗</span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
          </li>
        </ul>
      </Section>
    </div>
  );
};

export default SettingsPage;
