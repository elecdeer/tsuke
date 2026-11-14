import styles from "./Skeleton.module.css";

/**
 * 読むまでわからない文字（金額や名前など）の代わりに置く棒。文字と同じ行の高さに収め、まわりの配置をずらさない。
 *
 * 見出しや罫線など、どの月でも同じ所は本物を描き、月ごとに変わる所だけをこれにする。
 */
export const SkeletonText = ({
  width = "md",
}: {
  /** 置き換える文字の長さの目安。xs は 1 桁の数、sm は短い金額、lg は大きな金額 */
  width?: "xs" | "sm" | "md" | "lg";
}) => <span aria-hidden className={styles.SkeletonText} data-width={width} />;

/**
 * 並ぶ数が月ごとに変わる所（カテゴリや日ごとのまとまり）を読む前に、まとめて置く骨組み。
 *
 * 見出しや罫線まで本物で描くと、読んだあとに数が合わずに下の行がずれるので、ここはまるごと棒にする。
 */
export const SkeletonBlock = ({ rows }: { rows: number }) => (
  <div aria-hidden className={styles.SkeletonBlock}>
    {Array.from({ length: rows }, (_, index) => (
      <div
        // 中身のない飾りの行なので、並びの位置をそのまま key にする
        key={index}
        className={styles.row}
        style={{ width: `${90 - (index % 3) * 15}%` }}
      />
    ))}
  </div>
);
