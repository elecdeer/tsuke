import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@tsuke/ui/components/button";

/**
 * マスタをアーカイブするか元に戻すボタン。どちらも取り消せる操作なので、確認のダイアログは挟まない。
 */
export const ArchiveButton = ({
  archived,
  disabled,
  onClick,
}: {
  archived: boolean;
  disabled: boolean;
  onClick: () => void;
}) => (
  <Button variant="ghost" disabled={disabled} onClick={onClick}>
    {archived ? <ArchiveRestore /> : <Archive />}
    {archived ? "元に戻す" : "アーカイブ"}
  </Button>
);
