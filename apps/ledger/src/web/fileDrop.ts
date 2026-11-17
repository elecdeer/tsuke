/**
 * ドラッグで運ばれているものにファイルが含まれるかを返す。テキストやリンクのドラッグでは受け口を出さない。
 */
export const carriesFiles = (types: Iterable<string> | null | undefined): boolean =>
  types !== null && types !== undefined && Array.from(types).includes("Files");

/**
 * CSV のファイルかを返す。OS によって種類が空や Excel のものになるので、拡張子でも見る。
 */
export const isCsvFile = (file: Pick<File, "name" | "type">): boolean =>
  file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");

/** ページ全体へのファイルのドラッグを数える入れ物 */
export type FileDragTracker = {
  /** 要素に入った。ファイルが重なっているかを返す */
  enter: () => boolean;
  /** 要素から出た。ファイルがまだ重なっているかを返す */
  leave: () => boolean;
  /** 落とした、またはドラッグをやめた */
  reset: () => void;
};

/**
 * ページ全体へのファイルのドラッグを数える。
 *
 * dragenter と dragleave は子の要素に出入りするたびに届くので、入った数と出た数の差でまだ重なっているかを見る。
 */
export const createFileDragTracker = (): FileDragTracker => {
  let depth = 0;
  return {
    enter: () => {
      depth += 1;
      return true;
    },
    leave: () => {
      depth = Math.max(0, depth - 1);
      return depth > 0;
    },
    reset: () => {
      depth = 0;
    },
  };
};

let handedOff: File | null = null;

/**
 * 取り込みの画面に渡す CSV を預ける。取引の一覧に落としたファイルを、画面を移った先で読み取るのに使う。
 */
export const handOffStatementCsv = (file: File): void => {
  handedOff = file;
};

/**
 * 預けられた CSV を受け取る。一度受け取ったら空にし、画面を開き直しても読み直さない。
 */
export const takeHandedOffStatementCsv = (): File | null => {
  const file = handedOff;
  handedOff = null;
  return file;
};
