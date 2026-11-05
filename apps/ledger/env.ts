import { defineEnv, string, url } from "void/env";

export default defineEnv({
  // Access のチームドメイン。ctx.access が渡らないリクエストで Cf-Access-Jwt-Assertion を検証するのに使う
  ACCESS_TEAM_DOMAIN: url().default("https://elecdeer.cloudflareaccess.com"),
  // Worker を保護している Access アプリケーションの AUD タグ。未設定なら JWT 検証は行わない
  ACCESS_AUD: string().optional(),
});
