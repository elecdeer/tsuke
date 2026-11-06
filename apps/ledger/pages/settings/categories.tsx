import { action, Link } from "@void/react";
import { ChevronRight, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { type ActionResult, actionErrorMessage } from "@/web/actionError";
import { ArchiveButton } from "@/web/components/ArchiveButton";
import { ErrorMessage } from "@/web/components/ErrorMessage";
import { MoveButtons } from "@/web/components/MoveButtons";
import { Section } from "@/web/components/Section";
import type { Props } from "./categories.server";

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
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => saveName(editing, name));
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>{field}</Label>
          <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        {error !== null && <ErrorMessage message={error} />}
        <div className="flex justify-end gap-2">
          <DialogClose render={<Button variant="outline" />}>やめる</DialogClose>
          <Button type="submit" disabled={pending}>
            保存
          </Button>
        </div>
      </form>
      {(editing.kind === "category" || editing.kind === "genre") && (
        <div className="flex flex-col gap-1 border-t pt-4">
          <ArchiveButton
            archived={
              editing.kind === "category" ? editing.category.archived : editing.genre.archived
            }
            disabled={pending}
            onClick={() => void run(() => toggleArchived(editing))}
          />
          <p className="text-xs text-muted-foreground">
            入力の候補に出なくなります。これまでの取引と集計はそのまま残ります
          </p>
        </div>
      )}
    </>
  );
};

/** 名前の横に出す、アーカイブ済みの印 */
const ArchivedMark = () => (
  <span className="shrink-0 text-xs text-muted-foreground">アーカイブ済み</span>
);

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
    <li className="border-b">
      <div className="flex items-center gap-2">
        {expandable && (
          <button
            type="button"
            aria-label={`${category.name}の内訳を${open ? "閉じる" : "開く"}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:bg-muted/60"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit({ kind: "category", category })}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2.5 text-left hover:bg-muted/60"
        >
          <span className="truncate">{category.name}</span>
          {category.archived && <ArchivedMark />}
          {expandable && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {activeGenres} 件
            </span>
          )}
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
        <div className="pb-2 pl-9 text-sm">
          <ul>
            {category.genres.map((genre, genreIndex) => (
              <li key={genre.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onEdit({ kind: "genre", genre })}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-left hover:bg-muted/60"
                >
                  <span className="truncate">{genre.name}</span>
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
            <p className="py-1.5 text-xs text-muted-foreground">
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
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-6">
        <Link
          href="/settings"
          className="self-start text-xs text-muted-foreground hover:text-foreground"
        >
          ← 設定
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">カテゴリ</h1>
        {moveError !== null && <ErrorMessage message={moveError} />}
      </div>
      {(["payment", "income"] as const).map((mode) => {
        const list = mode === "payment" ? payment : income;
        const count = list.filter((category) => !category.archived).length;
        return (
          <Section key={mode} label={MODE_LABELS[mode]}>
            {list.length === 0 ? (
              <p className="border-t border-foreground py-6 text-sm text-muted-foreground">
                カテゴリはありません
              </p>
            ) : (
              <ul className="border-t border-foreground">
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
              className="mt-3"
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
