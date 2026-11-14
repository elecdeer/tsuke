import styles from "./FieldStatus.module.css";

/**
 * 選択肢を読み込んでいる間、欄の代わりに置く棒。
 */
export const FieldLoading = ({
  label,
  variant = "default",
}: {
  /** 読み上げで伝える文言（「口座を読み込み中」など） */
  label: string;
  /** caption は品目の行で小さな見出しのように出す欄の代わり */
  variant?: "default" | "caption";
}) => <output className={styles.FieldLoading} data-variant={variant} aria-label={label} />;

/**
 * 選択肢を取得できなかったときの知らせ。
 */
export const FieldError = ({ message }: { message: string }) => (
  <p className={styles.FieldError}>{message}</p>
);
