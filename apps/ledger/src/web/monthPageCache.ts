/**
 * 最近見た月の画面のデータ。隣の月を骨組みではなく前に見た中身で見せるのに使う。
 */
export type MonthPageCache<T> = {
  /** 画面に出したデータを覚える。同じキーなら新しいもので置き換える */
  remember: (key: string, value: T) => void;
  /** 覚えているデータを返す。なければ undefined */
  recall: (key: string) => T | undefined;
};

/** 覚えておく画面の数の既定値。行き来する前後の数か月分あれば足りる */
const DEFAULT_LIMIT = 12;

/**
 * 最近見た月の画面のデータを、URL などのキーごとに覚えておく入れ物を作る。
 *
 * 数が limit を超えたら、いちばん長く見ていないものから忘れる。
 * 隣の月は移ったあとに読み直すので、ここのデータが古くても、見えるのは移り終えるまでの間だけ。
 */
export const createMonthPageCache = <T>(limit: number = DEFAULT_LIMIT): MonthPageCache<T> => {
  const entries = new Map<string, T>();
  return {
    remember: (key, value) => {
      // Map は入れた順に並ぶので、入れ直して新しい側へ移す
      entries.delete(key);
      entries.set(key, value);
      for (const oldest of entries.keys()) {
        if (entries.size <= limit) break;
        entries.delete(oldest);
      }
    },
    recall: (key) => entries.get(key),
  };
};
