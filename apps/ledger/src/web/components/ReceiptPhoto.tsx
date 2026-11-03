import { Crop, Maximize } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cropLayout, type ReceiptCrop } from "@/web/receiptCrop";

/**
 * 確かめているレシートの写真。読み取った範囲が分かるときはレシートだけを見せ、写真の全体にも切り替えられる。
 *
 * 切り取りは表示だけで、写真そのものは変えない。登録する写真から背景が切れないようにし、
 * 範囲が外れていたときに全体へすぐ戻せるようにするため。
 */
export const ReceiptPhoto = ({
  src,
  crop,
  alt,
}: {
  src: string;
  /** 切り取る範囲。読み取る前や、範囲が使えないときは null */
  crop: ReceiptCrop | null;
  alt: string;
}) => {
  const [showsWhole, setShowsWhole] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const cropped = crop !== null && !showsWhole;
  const layout = cropped && natural !== null ? cropLayout(crop, natural) : null;

  return (
    <div className="relative">
      {crop !== null && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          // レシートの上に重ねるので、下の文字に紛れないよう背景で塗る
          className="absolute top-1 right-1 z-10 bg-background hover:bg-muted"
          onClick={() => setShowsWhole(!showsWhole)}
        >
          {showsWhole ? <Crop /> : <Maximize />}
          {showsWhole ? "レシートだけ" : "全体を表示"}
        </Button>
      )}
      <div
        className="relative overflow-hidden border"
        style={layout === null ? undefined : { aspectRatio: layout.aspectRatio }}
      >
        <img
          src={src}
          alt={alt}
          onLoad={(event) =>
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          // 細かい文字を読めるよう幅いっぱいに出す。長いレシートはスクロールして見る
          className={
            cropped
              ? // 大きさが分かるまでは位置を決められないので、一瞬でも全体が見えないよう隠す
                `absolute max-w-none ${layout === null ? "invisible" : ""}`
              : "block h-auto w-full"
          }
          style={layout?.image}
        />
      </div>
    </div>
  );
};
