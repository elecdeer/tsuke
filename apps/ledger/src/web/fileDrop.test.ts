import { describe, expect, test } from "vite-plus/test";
import {
  carriesFiles,
  createFileDragTracker,
  createStatementCsvHandoff,
  isCsvFile,
} from "./fileDrop.ts";

describe("carriesFiles", () => {
  test("Files を含むときだけ true を返す", () => {
    expect(carriesFiles(["Files"])).toBe(true);
    expect(carriesFiles(["text/plain", "Files"])).toBe(true);
    expect(carriesFiles(["text/plain", "text/uri-list"])).toBe(false);
    expect(carriesFiles([])).toBe(false);
    expect(carriesFiles(null)).toBe(false);
    expect(carriesFiles(undefined)).toBe(false);
  });
});

describe("isCsvFile", () => {
  test("種類が text/csv のファイルは CSV とみなす", () => {
    expect(isCsvFile({ name: "statement", type: "text/csv" })).toBe(true);
  });

  test("種類が空や Excel でも、拡張子が .csv なら大文字小文字を問わず CSV とみなす", () => {
    expect(isCsvFile({ name: "meisai.csv", type: "" })).toBe(true);
    expect(isCsvFile({ name: "MEISAI.CSV", type: "application/vnd.ms-excel" })).toBe(true);
  });

  test("拡張子も種類も CSV でなければ CSV とみなさない", () => {
    expect(isCsvFile({ name: "receipt.png", type: "image/png" })).toBe(false);
    expect(isCsvFile({ name: "csv.txt", type: "text/plain" })).toBe(false);
  });
});

describe("createFileDragTracker", () => {
  test("子の要素への出入りがあっても、入った数だけ出るまで重なっているとみなす", () => {
    const tracker = createFileDragTracker();

    expect(tracker.enter()).toBe(true);
    expect(tracker.enter()).toBe(true);
    expect(tracker.leave()).toBe(true);
    expect(tracker.leave()).toBe(false);
  });

  test("入るより多く出ても数は負にならず、次に入れば重なっているとみなす", () => {
    const tracker = createFileDragTracker();

    expect(tracker.leave()).toBe(false);
    tracker.enter();
    expect(tracker.leave()).toBe(false);
  });

  test("reset のあとは一度出れば重なっていないとみなす", () => {
    const tracker = createFileDragTracker();
    tracker.enter();
    tracker.enter();

    tracker.reset();
    tracker.enter();

    expect(tracker.leave()).toBe(false);
  });
});

describe("createStatementCsvHandoff", () => {
  test("預けた CSV を一度だけ受け取れる", () => {
    const handoff = createStatementCsvHandoff();
    const file = new File(["日付,金額\n"], "meisai.csv", { type: "text/csv" });

    handoff.handOff(file);

    expect(handoff.take()).toBe(file);
    expect(handoff.take()).toBeNull();
  });

  test("続けて預けると後のものを受け取る", () => {
    const handoff = createStatementCsvHandoff();
    const first = new File([""], "a.csv");
    const second = new File([""], "b.csv");

    handoff.handOff(first);
    handoff.handOff(second);

    expect(handoff.take()).toBe(second);
  });

  test("預け先ごとに中身は分かれる", () => {
    const one = createStatementCsvHandoff();
    const other = createStatementCsvHandoff();

    one.handOff(new File([""], "a.csv"));

    expect(other.take()).toBeNull();
  });
});
