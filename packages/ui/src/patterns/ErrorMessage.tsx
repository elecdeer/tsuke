import { TriangleAlert } from "lucide-react";

/**
 * 入力の誤りや保存の失敗の知らせ。注意の赤は主ボタンと同じ色なので、色だけに頼らずアイコンを添える。
 */
export const ErrorMessage = ({ message }: { message: string }) => (
  <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    {message}
  </p>
);
