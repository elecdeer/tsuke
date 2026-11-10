import { action, Link } from "@void/react";
import { useState } from "react";
import { monthOf } from "@/ledger/dates";
import { FavoriteButton } from "@/web/components/FavoriteButton";
import { TransactionEditor } from "@/web/components/TransactionEditor";
import { transactionsHref } from "@/web/transactionsHref";
import type { Props } from "./[id].server";

/**
 * 取引の編集の画面。
 */
const TransactionEditPage = (props: Props) => {
  // 別の取引の画面へ移っても「保存しました」が残らないよう、保存した取引の ID で持つ
  const [savedId, setSavedId] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={transactionsHref({ month: monthOf(props.transaction.date) })}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {Number(props.transaction.date.slice(5, 7))}月の取引
        </Link>
        <FavoriteButton
          favorite={props.isFavorite}
          label="よく使う取引"
          showLabel
          onToggle={(favorite) =>
            action("/transactions/:id?favorite", {
              params: { id: String(props.transaction.id) },
              data: { favorite },
            })
          }
        />
      </div>
      {/* 保存すると loader の値が変わるので、key を変えて入力中の値を保存した内容で作り直す */}
      <TransactionEditor
        key={JSON.stringify(props.transaction)}
        {...props}
        saved={savedId === props.transaction.id}
        onSavedChange={(saved) => setSavedId(saved ? props.transaction.id : null)}
        onSave={(input) =>
          action("/transactions/:id?update", {
            params: { id: String(props.transaction.id) },
            data: input,
          })
        }
        onDelete={() =>
          action("/transactions/:id?delete", {
            params: { id: String(props.transaction.id) },
            method: "POST",
          })
        }
      />
    </div>
  );
};

export default TransactionEditPage;
