import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { action, Link } from "@void/react";
import { GitMerge, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@tsuke/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@tsuke/ui/components/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tsuke/ui/components/dialog";
import { Input } from "@tsuke/ui/components/input";
import { Label } from "@tsuke/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@tsuke/ui/components/native-select";
import { SelectTriggerText, selectTriggerStyleProps } from "@tsuke/ui/components/select";
import { Textarea } from "@tsuke/ui/components/textarea";
import { monthOf } from "@/ledger/dates";
import { type ActionResult, actionErrorMessage } from "@/web/actionError";
import { ErrorMessage } from "@tsuke/ui/patterns/ErrorMessage";
import {
  filterPlaces,
  isPlaceSort,
  parseAliases,
  PLACE_SORT_LABELS,
  PLACE_SORTS,
  type PlaceSort,
  sortPlaces,
} from "@/web/placeList";
import { transactionsHref } from "@/web/transactionsHref";
import type { Props } from "./places.server";
import { BackLink } from "@/web/components/BackLink";
import { FormField } from "@tsuke/ui/patterns/FormField";
import { PageTitle } from "@tsuke/ui/patterns/PageTitle";
import styles from "./places.module.css";
import settings from "./settings.module.css";

type Place = Props["places"][number];

/**
 * 取り消せない操作を確かめるダイアログ。
 */
const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<ActionResult>;
}) => {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    const result = await onConfirm();
    setPending(false);
    if (!result.ok) setError(actionErrorMessage(result.error));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error !== null && <ErrorMessage message={error} />}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>やめる</DialogClose>
          <Button variant="destructive" disabled={pending} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * 統合先の店舗を選ぶ combobox。自分自身は候補に出さない。
 */
const MergeTargetInput = ({
  id,
  value,
  places,
  onChange,
}: {
  id: string;
  value: Place | null;
  places: Place[];
  onChange: (value: Place | null) => void;
}) => {
  const { contains } = ComboboxPrimitive.useFilter();
  return (
    <Combobox
      items={places}
      value={value}
      onValueChange={onChange}
      isItemEqualToValue={(a: Place, b: Place) => a.id === b.id}
      itemToStringLabel={(place: Place) => place.name}
      filter={(place: Place, query: string) =>
        [place.name, ...place.aliases].some((text) => contains(text, query))
      }
    >
      <ComboboxTrigger id={id} {...selectTriggerStyleProps({ width: "full" })}>
        <SelectTriggerText placeholder={value === null}>
          {value?.name ?? "統合先を選ぶ"}
        </SelectTriggerText>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder="検索" />
        <ComboboxEmpty>店舗がありません</ComboboxEmpty>
        <ComboboxList>
          {(place: Place) => (
            <ComboboxItem key={place.id} value={place}>
              {place.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
};

/**
 * 利用回数と最終利用日の表示。
 */
const usageLabel = (place: Place): string =>
  place.lastUsedOn === null ? "未使用" : `${place.useCount}回・${place.lastUsedOn}`;

/**
 * 店舗 1 件を編集するダイアログの中身。名前・別名・ヒントの保存、統合、未使用の店舗の削除ができる。
 */
const PlaceEditor = ({
  place,
  places,
  onClose,
}: {
  place: Place;
  places: Place[];
  onClose: () => void;
}) => {
  const nameId = useId();
  const aliasesId = useId();
  const hintId = useId();
  const mergeId = useId();
  const [name, setName] = useState(place.name);
  const [aliases, setAliases] = useState(place.aliases.join("\n"));
  const [aiHint, setAiHint] = useState(place.aiHint ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<Place | null>(null);
  const [confirming, setConfirming] = useState<"merge" | "delete" | null>(null);

  const save = async () => {
    setPending(true);
    setError(null);
    const result = await action("/settings/places?update", {
      data: { id: place.id, name, aliases: parseAliases(aliases), aiHint },
    });
    setPending(false);
    if (result.ok) onClose();
    else setError(actionErrorMessage(result.error));
  };

  const merge = async (): Promise<ActionResult> => {
    if (mergeTarget === null) return { ok: true };
    const result = await action("/settings/places?merge", {
      data: { sourceId: place.id, targetId: mergeTarget.id },
    });
    if (result.ok) onClose();
    return result;
  };

  const remove = async (): Promise<ActionResult> => {
    const result = await action("/settings/places?delete", { data: { id: place.id } });
    if (result.ok) onClose();
    return result;
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>店舗の編集</DialogTitle>
        <DialogDescription>
          {place.lastUsedOn === null ? (
            usageLabel(place)
          ) : (
            <Link href={transactionsHref({ month: monthOf(place.lastUsedOn), placeId: place.id })}>
              {usageLabel(place)}
            </Link>
          )}
        </DialogDescription>
      </DialogHeader>
      <form
        className={settings.EditorForm}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={settings.field}>
          <Label htmlFor={nameId}>店舗名</Label>
          <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className={settings.field}>
          <Label htmlFor={aliasesId}>AI 読み取り用の別名</Label>
          <Textarea
            id={aliasesId}
            rows={3}
            value={aliases}
            placeholder={"AMAZON.CO.JP\nｱﾏｿﾞﾝ"}
            onChange={(event) => setAliases(event.target.value)}
          />
          <p className={settings.note}>
            レシートや明細での書かれ方を 1 行に 1 つ。読み取りのときにこの店舗として扱います
          </p>
        </div>
        <div className={settings.field}>
          <Label htmlFor={hintId}>AI 読み取り用のヒント</Label>
          <Textarea
            id={hintId}
            rows={2}
            value={aiHint}
            placeholder="例: 明細では親会社の名前で出る"
            onChange={(event) => setAiHint(event.target.value)}
          />
        </div>
        {error !== null && <ErrorMessage message={error} />}
        <div className={settings.actions}>
          <DialogClose render={<Button variant="outline" />}>やめる</DialogClose>
          <Button type="submit" disabled={pending}>
            保存
          </Button>
        </div>
      </form>
      <div className={settings.EditorSection}>
        <Label htmlFor={mergeId}>別の店舗に統合</Label>
        <div className={styles.MergeRow}>
          <MergeTargetInput
            id={mergeId}
            value={mergeTarget}
            places={places.filter((other) => other.id !== place.id)}
            onChange={setMergeTarget}
          />
          <Button
            variant="outline"
            disabled={mergeTarget === null}
            onClick={() => setConfirming("merge")}
          >
            <GitMerge />
            統合
          </Button>
        </div>
        <p className={settings.note}>
          取引を統合先へ移してこの店舗を消します。今の名前は統合先の別名に残ります
        </p>
      </div>
      {place.useCount === 0 && (
        <div className={settings.EditorSection}>
          <Button variant="ghost" tone="destructive" onClick={() => setConfirming("delete")}>
            <Trash2 />
            この店舗を削除
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming === "merge"}
        onOpenChange={(open) => setConfirming(open ? "merge" : null)}
        title={`「${mergeTarget?.name ?? ""}」に統合しますか？`}
        description={`「${place.name}」の取引 ${place.useCount} 件を移して、「${place.name}」を消します。元に戻せません。`}
        confirmLabel="統合する"
        onConfirm={merge}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        onOpenChange={(open) => setConfirming(open ? "delete" : null)}
        title={`「${place.name}」を削除しますか？`}
        description="取引のない店舗です。別名とヒントも消え、元に戻せません。"
        confirmLabel="削除する"
        onConfirm={remove}
      />
    </>
  );
};

/**
 * 店舗 1 件の行。押すと編集のダイアログを開く。
 */
const PlaceRow = ({ place, onSelect }: { place: Place; onSelect: () => void }) => {
  const notes = [
    ...(place.aliases.length > 0 ? [`別名 ${place.aliases.join("、")}`] : []),
    ...(place.aiHint !== null ? ["ヒントあり"] : []),
  ].join("・");
  return (
    <li className={styles.PlaceRow}>
      <button type="button" onClick={onSelect} className={styles.select}>
        <span className={styles.text}>
          <span className={settings.RowTitle}>
            <span className={settings.rowName}>{place.name}</span>
            {place.archived && <span className={settings.badge}>アーカイブ済み</span>}
          </span>
          {notes !== "" && <span className={settings.RowNote}>{notes}</span>}
        </span>
        <span className={styles.usage}>{usageLabel(place)}</span>
      </button>
    </li>
  );
};

/**
 * 登録されている店舗の管理の画面。店舗は数百件あるので、検索と並び替えで探す。
 */
const PlacesPage = ({ places }: Props) => {
  const searchId = useId();
  const sortId = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PlaceSort>("recent");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const visible = useMemo(
    () => sortPlaces(filterPlaces(places, query), sort),
    [places, query, sort],
  );
  // 統合や削除で消えた店舗は閉じる。保存した後も最新の値を見るよう、ID で持って引き直す
  const selected = places.find((place) => place.id === selectedId);

  return (
    <div className={settings.Page}>
      <BackLink href="/settings">← 設定</BackLink>
      <PageTitle size="lg">店舗</PageTitle>
      <div className={styles.Filters}>
        <FormField label="名前・別名で検索" htmlFor={searchId}>
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </FormField>
        <FormField label="並び順" htmlFor={sortId}>
          <NativeSelect
            id={sortId}
            value={sort}
            onChange={(event) => {
              const next = event.target.value;
              if (isPlaceSort(next)) setSort(next);
            }}
          >
            {PLACE_SORTS.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {PLACE_SORT_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <div className={styles.Results}>
        <p className={styles.count} aria-live="polite">
          {visible.length === places.length
            ? `${places.length} 件`
            : `${places.length} 件中 ${visible.length} 件`}
        </p>
        {visible.length === 0 ? (
          <p className={settings.Empty}>該当する店舗はありません</p>
        ) : (
          <ul className={settings.List}>
            {visible.map((place) => (
              <PlaceRow key={place.id} place={place} onSelect={() => setSelectedId(place.id)} />
            ))}
          </ul>
        )}
      </div>
      <Dialog
        open={selected !== undefined}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent>
          {selected !== undefined && (
            <PlaceEditor
              key={selected.id}
              place={selected}
              places={places}
              onClose={() => setSelectedId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlacesPage;
