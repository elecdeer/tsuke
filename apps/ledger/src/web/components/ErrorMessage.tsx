import { TriangleAlert } from "lucide-react";

/**
 * 入力の誤りや保存の失敗の知らせ。色だけに頼らず、アイコンを添える。
 */
export const ErrorMessage = ({ message }: { message: string }) => (
  <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
    <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
    {message}
  </p>
);
