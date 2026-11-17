import { createContext, useContext, useState, type ReactNode } from "react";
import { createStatementCsvHandoff, type StatementCsvHandoff } from "@/web/fileDrop";

const StatementCsvHandoffContext = createContext<StatementCsvHandoff | null>(null);

/**
 * 取引の一覧から取り込みの画面へ CSV を渡す預け先を配る。
 *
 * File は URL に載せられず、画面を移るときにも値を渡せないので、画面を移っても作り直されない layout に置く。
 */
export const StatementCsvHandoffProvider = ({ children }: { children: ReactNode }) => {
  const [handoff] = useState(createStatementCsvHandoff);
  return (
    <StatementCsvHandoffContext.Provider value={handoff}>
      {children}
    </StatementCsvHandoffContext.Provider>
  );
};

/**
 * 取り込みの画面に渡す CSV の預け先を返す。StatementCsvHandoffProvider の内側で使う。
 */
export const useStatementCsvHandoff = (): StatementCsvHandoff => {
  const handoff = useContext(StatementCsvHandoffContext);
  if (handoff === null) {
    throw new Error("useStatementCsvHandoff は StatementCsvHandoffProvider の内側で使ってください");
  }
  return handoff;
};
