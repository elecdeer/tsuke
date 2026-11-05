/**
 * AI の読み取りで使う、速さと正確さの設定。レシート、ページ、明細、履歴 CSV で共通にする。
 */
import * as v from "valibot";

/** 読み取りで、速さと正確さのどちらを優先するか */
export const ReadQualitySchema = v.picklist(["fast", "accurate"]);

export type ReadQuality = v.InferOutput<typeof ReadQualitySchema>;

/**
 * 読み取りの優先ごとのモデルと推論量。受け付ける推論量はモデルごとに違うので、組にして持つ。
 *
 * まず fast で読み、誤りが目立つときだけ画面から accurate で読み直す。レシート 5 枚で比べると、
 * fast は 2 秒ほどだが値引きのある税抜のレシートの合計を誤り、accurate は 4 秒ほどかかるが品名・金額とも誤らなかった。
 * ページからの読み取りでも金額はどちらも正しく、accurate は品名も崩さなかったが、遅いと 20 秒以上かかることがあった。
 * gpt-6-luna はレシートで 3.8 秒ほどかかるうえ、印字にない品名を書くことが多く、推論量を上げても直りきらなかったのでやめた。
 * 推論しない Clairic・Clef（Workers AI の抽出・判定モデル）も試したが、Clairic は画像の日本語を読み落とすので使えなかった。
 *
 * - fast：low を送る。Gemini は none を受け付けない。レシートでは low で推論トークンが増えても精度が上がらなかったが、
 *   モデルの既定に任せず読み取りごとの推論量を揃えるために明示する
 * - accurate：low を送る。送らないと推論トークンが 3000 を超え、20 秒以上かかることがあった
 */
export const READ_SETTINGS: Record<ReadQuality, { model: string; reasoningEffort: string }> = {
  fast: { model: "google/gemini-3.1-flash-lite", reasoningEffort: "low" },
  accurate: { model: "google/gemini-3.8-flash", reasoningEffort: "low" },
};
