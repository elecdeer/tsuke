import { action } from "@void/react";
import { useState } from "react";
import { monthOf } from "@/ledger/dates";
import { BackLink } from "@/web/components/BackLink";
import { FavoriteButton } from "@/web/components/FavoriteButton";
import { TransactionEditor } from "@/web/components/TransactionEditor";
import { transactionsHref } from "@/web/transactionsHref";
import type { Props } from "./[id].server";
import styles from "./[id].module.css";

/**
 * 取引の編集の画面。
 */
const TransactionEditPage = (props: Props) => {
  // 別の取引の画面へ移っても「保存しました」が残らないよう、保存した取引の ID で持つ
  const [savedId, setSavedId] = useState<number | null>(null);
  return (
    <div className={styles.TransactionEditPage}>
      <div className={styles.header}>
        <BackLink href={transactionsHref({ period: monthOf(props.transaction.date) })}>
          ← {Number(props.transaction.date.slice(5, 7))}月の取引
        </BackLink>
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
