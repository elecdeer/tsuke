import { TriangleAlert } from "lucide-react";
import styles from "./ErrorMessage.module.css";

/**
 * 入力の誤りや保存の失敗の知らせ。注意の赤は主ボタンと同じ色なので、色だけに頼らずアイコンを添える。
 */
export const ErrorMessage = ({ message }: { message: string }) => (
  <p role="alert" className={styles.ErrorMessage}>
    <TriangleAlert className={styles.icon} aria-hidden="true" />
    {message}
  </p>
);
