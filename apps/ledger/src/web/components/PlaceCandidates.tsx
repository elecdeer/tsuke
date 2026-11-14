/**
 * 新しい店舗を入れたときに、同じ店舗の候補とチェーンの入力を出す。
 *
 * 候補は押されるまで反映しない。押さなければ、入れた名前のまま新しい店舗になる。
 */
import { LoaderCircle, MapPin, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@tsuke/ui/components/button";
import { Input } from "@tsuke/ui/components/input";
import type { PlaceDetail } from "@/ledger/placeDetail";
import { OPEN_POI_ATTRIBUTION_URL, poiKey, suggestPois, uniquePois, type Poi } from "@/web/openPoi";
import {
  placeDetailFor,
  similarPlaces,
  suggestQueries,
  type PlaceMasters,
} from "@/web/placeMatching";
import styles from "./PlaceCandidates.module.css";

type Lookup =
  | { type: "searching" }
  | { type: "done"; pois: Poi[] }
  /** 候補がなくても店舗は登録できるので、止めずに知らせるだけにする */
  | { type: "error" };

const CandidateButton = ({
  name,
  note,
  onClick,
}: {
  name: string;
  note: string;
  onClick: () => void;
}) => (
  <button type="button" className={styles.CandidateButton} onClick={onClick}>
    <span className={styles.name}>{name}</span>
    {note !== "" && <span className={styles.note}>{note}</span>}
  </button>
);

/**
 * OpenPOI で同じ名前の施設を探す。名前が変わったら、前の名前の結果は捨てて探し直す。
 */
const usePoiLookup = (name: string, enabled: boolean): Lookup => {
  const [finished, setFinished] = useState<{ name: string; lookup: Lookup } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    suggestPois(suggestQueries(name), { signal: controller.signal })
      .then((pois) => setFinished({ name, lookup: { type: "done", pois: uniquePois(pois) } }))
      .catch(() => {
        if (!controller.signal.aborted) setFinished({ name, lookup: { type: "error" } });
      });
    return () => controller.abort();
  }, [name, enabled]);
  return finished?.name === name ? finished.lookup : { type: "searching" };
};

/**
 * 新しい店舗の候補とチェーンの入力欄。
 */
export const PlaceCandidates = ({
  name,
  detail,
  masters,
  onChange,
}: {
  name: string;
  detail: PlaceDetail;
  masters: PlaceMasters;
  onChange: (name: string, detail: PlaceDetail | null) => void;
}) => {
  const chainId = useId();
  const chainListId = useId();
  const lookup = usePoiLookup(name, detail.poi === null);
  const similar = similarPlaces(name, masters.placeNames);
  const pois = lookup.type === "done" ? lookup.pois : [];

  return (
    <div className={styles.PlaceCandidates}>
      <p className={styles.hint}>新しい店舗として登録します。同じ店舗があれば選んでください</p>

      {similar.length > 0 && (
        <section aria-label="登録済みの似た店舗" className={styles.group}>
          <h3 className={styles.groupTitle}>登録済みの似た店舗</h3>
          <ul>
            {similar.map((placeName) => (
              <li key={placeName}>
                <CandidateButton
                  name={placeName}
                  note=""
                  onClick={() => onChange(placeName, null)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.poi === null ? (
        <section aria-label="OpenPOI の候補" aria-live="polite" className={styles.group}>
          <h3 className={styles.groupTitle}>OpenPOI の候補</h3>
          {lookup.type === "searching" && (
            <p className={styles.status}>
              <LoaderCircle className={styles.spinner} aria-hidden="true" />
              探しています
            </p>
          )}
          {lookup.type === "error" && (
            <p className={styles.status}>候補を取得できませんでした。このまま登録できます</p>
          )}
          {lookup.type === "done" && pois.length === 0 && (
            <p className={styles.status}>見つかりませんでした。地図からも探せます</p>
          )}
          <ul>
            {pois.map((poi) => (
              <li key={poiKey(poi)}>
                <CandidateButton
                  name={poi.name}
                  note={poi.address}
                  onClick={() => onChange(poi.name, placeDetailFor(poi.name, masters, poi))}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className={styles.poi}>
          <MapPin className={styles.poiIcon} aria-hidden="true" />
          <span className={styles.poiAddress}>{detail.poi.address || "住所の情報なし"}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="OpenPOI の施設を外す"
            onClick={() => onChange(name, { ...detail, poi: null })}
          >
            <X />
          </Button>
        </p>
      )}

      <div className={styles.chain}>
        <label htmlFor={chainId} className={styles.chainLabel}>
          チェーン（支店をまとめて見るときの名前）
        </label>
        <Input
          id={chainId}
          list={chainListId}
          placeholder="なし"
          value={detail.chain}
          onChange={(event) => onChange(name, { ...detail, chain: event.target.value })}
        />
        <datalist id={chainListId}>
          {masters.chainNames.map((chain) => (
            <option key={chain} value={chain}>
              {chain}
            </option>
          ))}
        </datalist>
      </div>

      <p className={styles.attribution}>
        候補の出典:{" "}
        <a
          href={OPEN_POI_ATTRIBUTION_URL}
          target="_blank"
          rel="noreferrer"
          className={styles.attributionLink}
        >
          OpenPOI API
        </a>
      </p>
    </div>
  );
};
