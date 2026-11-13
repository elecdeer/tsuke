/**
 * 自動入力（支払いの抽出）の評価スクリプト。
 *
 * `scripts/eval-fixtures/*.json` の事例を複数のモデルで台帳の `runExtractPayment` に通し、
 * 項目ごとの一致率・所要時間・トークン数をまとめて表示する。結果の全体は `scripts/eval-results/` に JSON で書く。
 *
 * Workers AI は Cloudflare の AI の REST API で呼ぶ（台帳には wrangler の設定がなく、Void の開発サーバーのリモート接続は
 * Access のサービストークンが要るため）。認証は環境変数 `CLOUDFLARE_API_TOKEN`（Workers AI の権限）と
 * `CLOUDFLARE_ACCOUNT_ID`。Workers AI の利用枠を実際に使う。
 *
 *   pnpm -F ledger run eval:extract-payment
 *   pnpm -F ledger run eval:extract-payment -- --models openai/gpt-5.4-mini,@cf/moonshotai/kimi-k2.5
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createAI } from "agents/models/ai-sdk";
import * as v from "valibot";
import { compareExtraction, type ExpectedPayment, type FieldDiff } from "../src/llm/evaluation.ts";
import {
  PageContentSchema,
  runExtractPayment,
  type ExtractedPayment,
} from "../src/llm/extractPayment.ts";
import type { ModelProvider } from "../src/llm/structuredChat.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(SCRIPT_DIR, "eval-fixtures");
const RESULTS_DIR = join(SCRIPT_DIR, "eval-results");

const DEFAULT_MODELS = ["google/gemini-3.1-flash-lite"];

const NullableString = v.nullable(v.string());
const NullableNumber = v.nullable(v.number());

/** 事例。入力は台帳が抽出に渡すもの（ページの内容と、口座・カテゴリ・店舗の候補）と同じ形 */
const FixtureSchema = v.object({
  name: v.string(),
  input: v.object({
    pageContent: PageContentSchema,
    categories: v.array(
      v.object({
        id: v.number(),
        name: v.string(),
        genres: v.array(v.object({ id: v.number(), name: v.string() })),
      }),
    ),
    accounts: v.array(v.object({ id: v.number(), name: v.string() })),
    places: v.array(
      v.object({
        id: v.number(),
        name: v.string(),
        lastUsedOn: NullableString,
        useCount: v.number(),
      }),
    ),
  }),
  expected: v.object({
    date: v.optional(NullableString),
    accountId: v.optional(NullableNumber),
    placeName: v.optional(NullableString),
    items: v.optional(
      v.array(
        v.partial(
          v.object({
            name: NullableString,
            amount: NullableNumber,
            memo: NullableString,
            genreId: NullableNumber,
          }),
        ),
      ),
    ),
  }),
});

type Fixture = v.InferOutput<typeof FixtureSchema>;

type CaseResult = {
  fixture: string;
  ok: boolean;
  matched: number;
  total: number;
  durationMs: number;
  usage: unknown;
  diffs: FieldDiff[];
  error?: string;
  actual?: ExtractedPayment;
};

type ModelResult = {
  model: string;
  cases: CaseResult[];
  totalMatched: number;
  totalEvaluated: number;
  totalDurationMs: number;
};

/**
 * コマンドラインの引数から比べるモデルを読む。
 */
const parseCliArgs = (argv: string[]): { models: string[] } => {
  // `pnpm run ... -- --models foo` では先頭に `--` が入り、parseArgs はそれをオプションの終わりとみなすので外す
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const { values } = parseArgs({ args, options: { models: { type: "string" } }, strict: true });
  if (values.models === undefined) return { models: DEFAULT_MODELS };
  const models = values.models.split(",").map((model) => model.trim());
  if (models.some((model) => model === "")) throw new Error("--models に空のモデル ID があります");
  return { models };
};

/**
 * 環境変数を読む。なければ理由を付けて投げる。
 */
const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`環境変数 ${name} を設定してください`);
  return value;
};

/**
 * 事例をすべて読み、スキーマで確かめる。
 */
const loadFixtures = async (): Promise<Fixture[]> => {
  const entries = (await readdir(FIXTURES_DIR)).filter((entry) => entry.endsWith(".json")).sort();
  return Promise.all(
    entries.map(async (entry) =>
      v.parse(FixtureSchema, JSON.parse(await readFile(join(FIXTURES_DIR, entry), "utf8"))),
    ),
  );
};

/**
 * 1 つの事例を 1 つのモデルで流し、期待する値と比べる。
 */
const runCase = async (ai: ModelProvider, model: string, fixture: Fixture): Promise<CaseResult> => {
  const started = performance.now();
  try {
    const { object, usage } = await runExtractPayment({ ai, model, input: fixture.input });
    const expected: ExpectedPayment = fixture.expected;
    return {
      fixture: fixture.name,
      ok: true,
      ...compareExtraction(expected, object),
      durationMs: performance.now() - started,
      usage,
      actual: object,
    };
  } catch (error) {
    return {
      fixture: fixture.name,
      ok: false,
      matched: 0,
      total: 0,
      durationMs: performance.now() - started,
      usage: undefined,
      diffs: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * モデルごとの一致率・平均時間・成功数を表にして出す。
 */
const printTable = (results: ModelResult[]): void => {
  const headers = ["Model", "Cases", "Accuracy", "Avg time", "OK"];
  const rows = results.map((result) => [
    result.model,
    String(result.cases.length),
    result.totalEvaluated > 0
      ? `${((result.totalMatched / result.totalEvaluated) * 100).toFixed(1)}%`
      : "n/a",
    result.cases.length > 0
      ? `${(result.totalDurationMs / result.cases.length).toFixed(0)}ms`
      : "n/a",
    `${result.cases.filter((c) => c.ok).length}/${result.cases.length}`,
  ]);
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => row[i]?.length ?? 0)),
  );
  const renderRow = (cols: string[]): string =>
    cols.map((col, i) => col.padEnd(widths[i] ?? 0)).join("  ");
  console.log(renderRow(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(renderRow(row));
};

/**
 * 事例ごとの点数と、期待と違った項目を出す。
 */
const printDiffs = (results: ModelResult[]): void => {
  for (const result of results) {
    console.log(`\n## ${result.model}`);
    for (const c of result.cases) {
      if (!c.ok) {
        console.log(`  - [${c.fixture}] ERROR: ${c.error}`);
        continue;
      }
      console.log(`  - [${c.fixture}] ${c.matched}/${c.total} (${c.durationMs.toFixed(0)}ms)`);
      for (const diff of c.diffs) {
        console.log(
          `      ${diff.field}: expected=${JSON.stringify(diff.expected)} actual=${JSON.stringify(diff.actual)}`,
        );
      }
    }
  }
};

/**
 * 結果の全体を日時の名前の JSON に書き、そのパスを返す。
 */
const saveResults = async (results: ModelResult[]): Promise<string> => {
  await mkdir(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(RESULTS_DIR, `${stamp}.json`);
  await writeFile(outPath, JSON.stringify(results, null, 2), "utf8");
  return outPath;
};

const { models } = parseCliArgs(process.argv.slice(2));
const fixtures = await loadFixtures();
if (fixtures.length === 0) {
  console.log(`${FIXTURES_DIR} に事例がありません`);
} else {
  const ai = createAI({
    accountId: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: requireEnv("CLOUDFLARE_API_TOKEN"),
  });
  console.log(`${fixtures.length} 件の事例を ${models.length} 個のモデルで評価します\n`);

  const results: ModelResult[] = [];
  for (const model of models) {
    const cases: CaseResult[] = [];
    // 事例は順に流す（並べて投げると利用枠の制限にかかりやすく、時間の比較も崩れるため）
    for (const fixture of fixtures) cases.push(await runCase(ai, model, fixture));
    results.push({
      model,
      cases,
      totalMatched: cases.reduce((sum, c) => sum + c.matched, 0),
      totalEvaluated: cases.reduce((sum, c) => sum + c.total, 0),
      totalDurationMs: cases.reduce((sum, c) => sum + c.durationMs, 0),
    });
  }

  printTable(results);
  printDiffs(results);
  console.log(`\n結果の全体: ${resolve(await saveResults(results))}`);
}
