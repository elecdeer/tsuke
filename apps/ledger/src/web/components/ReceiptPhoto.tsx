import { Crop, Maximize } from "lucide-react";
import { useState } from "react";
import { Button } from "@tsuke/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@tsuke/ui/components/dialog";
import { cn } from "@tsuke/ui/lib/utils";
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

/**
 * 確かめているレシートの写真の小さな見本。押すと写真を大きく開く（狭い画面）。
 *
 * 写真の上にシートを重ねて見比べる形は、シートの高さを操る手間が多かったのでやめた。
 * 写真は見たいときだけ開けば足りるので、常に見える下の帯に入口だけを置く。
 */
export const ReceiptPhotoThumbnail = ({
  src,
  crop,
  className,
}: {
  src: string;
  crop: ReceiptCrop | null;
  className?: string;
}) => (
  <Dialog>
    <DialogTrigger
      aria-label="レシートの写真を開く"
      className={cn(
        "relative block h-12 w-9 shrink-0 overflow-hidden border bg-muted outline-offset-2",
        className,
      )}
    >
      {/* 小さな見本では切り取らない。どのレシートか分かれば足りる */}
      <img src={src} alt="" className="size-full object-cover" />
    </DialogTrigger>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>レシートの写真</DialogTitle>
      </DialogHeader>
      {/* 閉じるボタンと写真の切り替えが重ならないよう、写真は見出しの下でスクロールさせる */}
      <div className="-mx-4 -mb-4 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
        <ReceiptPhoto src={src} crop={crop} alt="確かめているレシート" />
      </div>
    </DialogContent>
  </Dialog>
);
