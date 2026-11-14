import { action } from "@void/react";
import { ChevronRight, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@tsuke/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@tsuke/ui/components/dialog";
import { Input } from "@tsuke/ui/components/input";
import { Label } from "@tsuke/ui/components/label";
import { cn } from "@tsuke/ui/lib/utils";
import { type ActionResult, actionErrorMessage } from "@/web/actionError";
import { ArchiveButton } from "@/web/components/ArchiveButton";
import { ErrorMessage } from "@tsuke/ui/patterns/ErrorMessage";
import { MoveButtons } from "@/web/components/MoveButtons";
import { Section } from "@tsuke/ui/patterns/Section";
import type { Props } from "./categories.server";
import { BackLink } from "@/web/components/BackLink";
import { PageTitle } from "@tsuke/ui/patterns/PageTitle";
import styles from "./categories.module.css";
import settings from "./settings.module.css";

type Category = Props["payment"][number];
type Genre = Category["genres"][number];
type Mode = "payment" | "income";

/** ダイアログで開いているもの */
type Editing =
  | { kind: "newCategory"; mode: Mode }
  | { kind: "category"; category: Category }
  | { kind: "newGenre"; category: Category }
  | { kind: "genre"; genre: Genre };

const MODE_LABELS: Record<Mode, string> = { payment: "支出", income: "収入" };

/**
 * ダイアログの見出しと入力欄の名前を返す。
 */
const labelsOf = (editing: Editing): { title: string; field: string } => {
  switch (editing.kind) {
    case "newCategory":
      return { title: `${MODE_LABELS[editing.mode]}のカテゴリの追加`, field: "カテゴリ名" };
    case "category":
      return { title: "カテゴリの編集", field: "カテゴリ名" };
    case "newGenre":
      return { title: `${editing.category.name}の内訳の追加`, field: "内訳名" };
    case "genre":
      return { title: "内訳の編集", field: "内訳名" };
  }
};

/**
 * 名前を保存するアクションを呼ぶ。
 */
const saveName = (editing: Editing, name: string): Promise<ActionResult> => {
  switch (editing.kind) {
    case "newCategory":
      return action("/settings/categories?createCategory", { data: { mode: editing.mode, name } });
    case "category":
      return action("/settings/categories?renameCategory", {
        data: { id: editing.category.id, name },
      });
    case "newGenre":
      return action("/settings/categories?createGenre", {
        data: { categoryId: editing.category.id, name },
      });
    case "genre":
      return action("/settings/categories?renameGenre", { data: { id: editing.genre.id, name } });
  }
};

/**
 * アーカイブの状態を反転するアクションを呼ぶ。追加のときは対象がないので呼ばれない。
 */
const toggleArchived = (
  target: { kind: "category"; category: Category } | { kind: "genre"; genre: Genre },
): Promise<ActionResult> =>
  target.kind === "category"
    ? action("/settings/categories?archiveCategory", {
        data: { id: target.category.id, archived: !target.category.archived },
      })
    : action("/settings/categories?archiveGenre", {
        data: { id: target.genre.id, archived: !target.genre.archived },
      });

/**
 * カテゴリか内訳の名前を編集するダイアログの中身。
 */
const NameEditor = ({ editing, onClose }: { editing: Editing; onClose: () => void }) => {
  const nameId = useId();
  const { title, field } = labelsOf(editing);
  const [name, setName] = useState(
    editing.kind === "category"
      ? editing.category.name
      : editing.kind === "genre"
        ? editing.genre.name
        : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = async (request: () => Promise<ActionResult>) => {
    setPending(true);
    setError(null);
    const result = await request();
    setPending(false);
    if (result.ok) onClose();
    else setError(actionErrorMessage(result.error));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form
        className={settings.EditorForm}
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => saveName(editing, name));
        }}
      >
        <div className={settings.field}>
          <Label htmlFor={nameId}>{field}</Label>
          <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        {error !== null && <ErrorMessage message={error} />}
        <div className={settings.actions}>
          <DialogClose render={<Button variant="outline" />}>やめる</DialogClose>
          <Button type="submit" disabled={pending}>
            保存
          </Button>
        </div>
      </form>
      {(editing.kind === "category" || editing.kind === "genre") && (
        <div className={settings.EditorSection}>
          <ArchiveButton
            archived={
              editing.kind === "category" ? editing.category.archived : editing.genre.archived
            }
            disabled={pending}
            onClick={() => void run(() => toggleArchived(editing))}
          />
          <p className={settings.note}>
            入力の候補に出なくなります。これまでの取引と集計はそのまま残ります
          </p>
        </div>
      )}
    </>
  );
};

/** 名前の横に出す、アーカイブ済みの印 */
const ArchivedMark = () => <span className={settings.badge}>アーカイブ済み</span>;

/**
 * カテゴリ 1 件のまとまり。支出のカテゴリは開くと内訳の一覧が出る。収入は内訳を持たないので開かない。
 */
const CategoryBlock = ({
  category,
  mode,
  index,
  count,
  moving,
  onEdit,
  onMoveCategory,
  onMoveGenre,
}: {
  category: Category;
  mode: Mode;
  index: number;
  count: number;
  moving: boolean;
  onEdit: (editing: Editing) => void;
  onMoveCategory: (offset: -1 | 1) => void;
  onMoveGenre: (id: number, offset: -1 | 1) => void;
}) => {
  const [open, setOpen] = useState(false);
  const activeGenres = category.genres.filter((genre) => !genre.archived).length;
  const expandable = mode === "payment";

  return (
    <li className={styles.CategoryBlock}>
      <div className={styles.categoryRow}>
        {expandable && (
          <button
            type="button"
            aria-label={`${category.name}の内訳を${open ? "閉じる" : "開く"}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={styles.expand}
          >
            <ChevronRight className={styles.chevron} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit({ kind: "category", category })}
          className={cn(styles.select, settings.RowTitle)}
        >
          <span className={settings.rowName}>{category.name}</span>
          {category.archived && <ArchivedMark />}
          {expandable && <span className={styles.count}>{activeGenres} 件</span>}
        </button>
        {!category.archived && (
          <MoveButtons
            name={category.name}
            index={index}
            count={count}
            disabled={moving}
            onMove={onMoveCategory}
          />
        )}
      </div>
      {expandable && open && (
        <div className={styles.genres}>
          <ul className={styles.genreList}>
            {category.genres.map((genre, genreIndex) => (
              <li key={genre.id} className={styles.genre}>
                <button
                  type="button"
                  onClick={() => onEdit({ kind: "genre", genre })}
                  className={cn(styles.genreSelect, settings.RowTitle)}
                >
                  <span className={settings.rowName}>{genre.name}</span>
                  {genre.archived && <ArchivedMark />}
                </button>
                {!genre.archived && (
                  <MoveButtons
                    name={genre.name}
                    index={genreIndex}
                    count={activeGenres}
                    disabled={moving}
                    onMove={(offset) => onMoveGenre(genre.id, offset)}
                  />
                )}
              </li>
            ))}
          </ul>
          {activeGenres === 0 && (
            <p className={styles.genresNote}>
              支出の入力では内訳を選ぶので、内訳を追加するまでこのカテゴリは選べません
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => onEdit({ kind: "newGenre", category })}>
            <Plus />
            内訳を追加
          </Button>
        </div>
      )}
    </li>
  );
};

/**
 * カテゴリの管理の画面。支出と収入のカテゴリと、支出の内訳を管理する。
 */
const CategoriesPage = ({ payment, income }: Props) => {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const runMove = async (request: () => Promise<ActionResult>) => {
    setMoving(true);
    setMoveError(null);
    const result = await request();
    setMoving(false);
    if (!result.ok) setMoveError(actionErrorMessage(result.error));
  };

  return (
    <div className={styles.CategoriesPage}>
      <div className={settings.Page}>
        <BackLink href="/settings">← 設定</BackLink>
        <PageTitle size="lg">カテゴリ</PageTitle>
        {moveError !== null && <ErrorMessage message={moveError} />}
      </div>
      {(["payment", "income"] as const).map((mode) => {
        const list = mode === "payment" ? payment : income;
        const count = list.filter((category) => !category.archived).length;
        return (
          <Section key={mode} label={MODE_LABELS[mode]}>
            {list.length === 0 ? (
              <p className={settings.Empty}>カテゴリはありません</p>
            ) : (
              <ul className={settings.List}>
                {list.map((category, index) => (
                  <CategoryBlock
                    key={category.id}
                    category={category}
                    mode={mode}
                    index={index}
                    count={count}
                    moving={moving}
                    onEdit={setEditing}
                    onMoveCategory={(offset) =>
                      void runMove(() =>
                        action("/settings/categories?moveCategory", {
                          data: { id: category.id, offset },
                        }),
                      )
                    }
                    onMoveGenre={(id, offset) =>
                      void runMove(() =>
                        action("/settings/categories?moveGenre", { data: { id, offset } }),
                      )
                    }
                  />
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              className={styles.AddCategory}
              onClick={() => setEditing({ kind: "newCategory", mode })}
            >
              <Plus />
              カテゴリを追加
            </Button>
          </Section>
        );
      })}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          {editing !== null && <NameEditor editing={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CategoriesPage;
