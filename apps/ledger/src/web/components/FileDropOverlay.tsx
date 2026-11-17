import { FileUp } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { carriesFiles, createFileDragTracker } from "@/web/fileDrop";
import styles from "./FileDropOverlay.module.css";

/**
 * ページ全体へのファイルのドロップを受け、ファイルが重なっている間は true を返す。
 *
 * 落とされたファイルの先頭を onDrop に渡す。enabled が false の間は受けないが、ブラウザがファイルを開いて画面を離れないよう既定の動きは止める。
 */
export const usePageFileDrop = (onDrop: (file: File) => void, enabled = true): boolean => {
  const [dragging, setDragging] = useState(false);
  // 描くたびに作り直される関数でも登録し直さないよう、Effect Event にして最新のものを呼ぶ
  const handleDrop = useEffectEvent(onDrop);

  useEffect(() => {
    const tracker = createFileDragTracker();
    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer?.types)) return;
      event.preventDefault();
      if (enabled) setDragging(tracker.enter());
    };
    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer?.types)) return;
      // dragover を止めないと drop が届かない
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = enabled ? "copy" : "none";
    };
    const onDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer?.types)) return;
      if (enabled) setDragging(tracker.leave());
    };
    const onDropEvent = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer?.types)) return;
      event.preventDefault();
      tracker.reset();
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (enabled && file !== undefined) handleDrop(file);
    };
    const onDragEnd = () => {
      tracker.reset();
      setDragging(false);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDropEvent);
    window.addEventListener("dragend", onDragEnd);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDropEvent);
      window.removeEventListener("dragend", onDragEnd);
      setDragging(false);
    };
  }, [enabled]);

  return dragging;
};

/**
 * ファイルをページに重ねている間、画面全体に出す受け口。ドラッグの出入りを邪魔しないよう、ポインターは通す。
 */
export const FileDropOverlay = ({ shown, message }: { shown: boolean; message: string }) => {
  if (!shown) return null;
  return (
    <div className={styles.FileDropOverlay} aria-hidden="true">
      <div className={styles.inner}>
        <FileUp className={styles.icon} />
        <p className={styles.message}>{message}</p>
      </div>
    </div>
  );
};
