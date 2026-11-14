/// <reference types="vite/client" />

// CSS Modules のクラス名の対応表。下の "*.css" より先に書き、*.module.css にはこちらを当てる
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.css" {}
