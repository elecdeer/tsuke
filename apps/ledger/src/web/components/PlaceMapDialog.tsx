/**
 * 地図から店舗を選ぶダイアログ。現在地の周りの施設を OpenPOI API で探し、地図と一覧に出す。
 */
import "leaflet/dist/leaflet.css";
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";
import { LoaderCircle, LocateFixed, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  distance,
  OPEN_POI_ATTRIBUTION_URL,
  searchPois,
  type LngLat,
  type Poi,
  type PoiArea,
} from "@/web/openPoi";
import { cn } from "@/lib/utils";

type Leaflet = typeof import("leaflet");

/** 現在地がわからないときに出す場所（東京駅） */
const FALLBACK_CENTER: LngLat = { lng: 139.7671, lat: 35.6812 };

/** 開いたときに探す、現在地からの半径（m） */
const NEARBY_RADIUS = 300;

const INITIAL_ZOOM = 17;

/**
 * 施設の印。色は Leaflet が SVG の属性に書くと CSS 変数が効かないので、テーマに合わせてクラスで付ける
 */
const MARKER_STYLE = {
  radius: 7,
  weight: 2,
  fillOpacity: 1,
  className: "fill-muted-foreground stroke-background",
};
const SELECTED_MARKER_STYLE = {
  ...MARKER_STYLE,
  radius: 10,
  className: "fill-primary stroke-background",
};
const CURRENT_MARKER_STYLE = {
  ...MARKER_STYLE,
  radius: 6,
  weight: 3,
  className: "fill-blue-600 stroke-white",
};

const formatDistance = (meters: number) =>
  meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;

const toLatLng = ({ lng, lat }: LngLat): [number, number] => [lat, lng];

/** 現在地を取る。取れないとき（許可されない・対応していない）は null */
const locate = () =>
  new Promise<LngLat | null>((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lng: coords.longitude, lat: coords.latitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });

type Status =
  | { type: "locating" }
  | { type: "searching" }
  | { type: "done"; note?: string }
  | { type: "error"; message: string };

/**
 * ダイアログの中身。開いている間だけ置き、Leaflet はブラウザで開いたときに読み込む。
 */
const PlaceMap = ({ onSelect }: { onSelect: (poi: Poi) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<{ L: Leaflet; map: LeafletMap; layer: LayerGroup } | null>(null);
  const currentMarkerRef = useRef<CircleMarker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [ready, setReady] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<Status>({ type: "locating" });
  /** 一覧は近い順に並べ、距離はこの点から測る（現在地の周りを探したときは現在地、範囲で探したときは地図の中心） */
  const [result, setResult] = useState<{ origin: LngLat; pois: Poi[] }>({
    origin: FALLBACK_CENTER,
    pois: [],
  });
  const [selected, setSelected] = useState<Poi | null>(null);

  const search = async (area: PoiArea, origin: LngLat, note?: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ type: "searching" });
    setSelected(null);
    try {
      const pois = await searchPois(keyword, area, { signal: controller.signal });
      pois.sort((a, b) => distance(origin, a.position) - distance(origin, b.position));
      setResult({ origin, pois });
      setStatus({ type: "done", note });
    } catch (error) {
      if (controller.signal.aborted) return;
      setResult({ origin, pois: [] });
      setStatus({
        type: "error",
        // 回数の上限を超えた応答には CORS のヘッダーが付かず、TypeError（通信の失敗）になる
        message:
          error instanceof TypeError
            ? "店舗を探せませんでした。少し待ってからもう一度試してください"
            : error instanceof Error
              ? error.message
              : "店舗を探せませんでした",
      });
    }
  };

  /** 現在地へ地図を動かし、その周りを探す */
  const searchNearby = async () => {
    setStatus({ type: "locating" });
    const here = await locate();
    const leaflet = leafletRef.current;
    if (leaflet === null) return;
    const center = here ?? FALLBACK_CENTER;
    leaflet.map.setView(toLatLng(center), INITIAL_ZOOM);
    currentMarkerRef.current?.remove();
    currentMarkerRef.current =
      here === null
        ? null
        : leaflet.L.circleMarker(toLatLng(here), CURRENT_MARKER_STYLE)
            .bindTooltip("現在地")
            .addTo(leaflet.map);
    await search(
      { center, radius: NEARBY_RADIUS },
      center,
      here === null ? "現在地がわからないので、東京駅の周りを出しています" : undefined,
    );
  };

  /** 地図に今出ている範囲を探す */
  const searchView = (event: FormEvent) => {
    event.preventDefault();
    const map = leafletRef.current?.map;
    if (map === undefined) return;
    const bounds = map.getBounds();
    const center = map.getCenter();
    void search(
      {
        bbox: {
          minLng: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLng: bounds.getEast(),
          maxLat: bounds.getNorth(),
        },
      },
      { lng: center.lng, lat: center.lat },
    );
  };

  // Leaflet は読み込むだけで window に触れるので、サーバーでの描画を避けてここで読み込む
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import("leaflet").then((L) => {
      const container = containerRef.current;
      if (disposed || container === null) return;
      const map = L.map(container, { zoomControl: false }).setView(
        toLatLng(FALLBACK_CENTER),
        INITIAL_ZOOM,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.attributionControl.addAttribution(
        `<a href="${OPEN_POI_ATTRIBUTION_URL}" target="_blank" rel="noreferrer">OpenPOI API</a>`,
      );
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      leafletRef.current = { L, map, layer };
      // ダイアログが開く動きの途中で作ると大きさを読み違えるので、大きさが変わるたびに測り直す
      const observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(container);
      cleanup = () => {
        observer.disconnect();
        map.remove();
        leafletRef.current = null;
      };
      setReady(true);
    });
    return () => {
      disposed = true;
      abortRef.current?.abort();
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (ready) void searchNearby();
    // 地図ができたときに 1 度だけ探す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 施設の印を置き直す。選んだ施設は大きく色を変える
  useEffect(() => {
    const leaflet = leafletRef.current;
    if (!ready || leaflet === null) return;
    leaflet.layer.clearLayers();
    for (const poi of result.pois) {
      const isSelected = poi === selected;
      leaflet.L.circleMarker(
        toLatLng(poi.position),
        isSelected ? SELECTED_MARKER_STYLE : MARKER_STYLE,
      )
        .bindTooltip(poi.name, { permanent: isSelected, direction: "top", offset: [0, -8] })
        .on("click", () => setSelected(poi))
        .addTo(leaflet.layer);
    }
  }, [ready, result, selected]);

  // 一覧で選んだ施設を地図の真ん中に出し、地図で選んだ施設を一覧で見える所まで送る
  useEffect(() => {
    if (selected === null) return;
    leafletRef.current?.map.panTo(toLatLng(selected.position));
    listRef.current
      ?.querySelector(`[data-poi-index="${result.pois.indexOf(selected)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, result]);

  const busy = status.type === "locating" || status.type === "searching";

  return (
    <>
      <form className="flex gap-1.5" onSubmit={searchView}>
        <Input
          type="search"
          aria-label="キーワード"
          placeholder="キーワード"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={!ready || busy}>
          <Search />
          この範囲で探す
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="現在地の周りを探す"
          disabled={!ready || busy}
          onClick={() => void searchNearby()}
        >
          <LocateFixed />
        </Button>
      </form>
      <div ref={containerRef} className="isolate h-[40dvh] min-h-48 w-full rounded-md border" />
      <div aria-live="polite" className="text-xs text-muted-foreground">
        {busy ? (
          <span className="flex items-center gap-1.5">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            {status.type === "locating" ? "現在地を調べています" : "探しています"}
          </span>
        ) : status.type === "error" ? (
          <span role="alert" className="text-destructive">
            {status.message}
          </span>
        ) : (
          <>
            {status.type === "done" && status.note !== undefined && <p>{status.note}</p>}
            <p>
              {result.pois.length === 0
                ? "見つかりませんでした。地図を動かすか、キーワードを変えて探してください"
                : `${result.pois.length} 件。地図の印か一覧から選んでください`}
            </p>
          </>
        )}
      </div>
      {result.pois.length > 0 && (
        <ul ref={listRef} className="-mx-1 min-h-0 flex-1 overflow-y-auto">
          {result.pois.map((poi, index) => (
            <li key={`${poi.name}:${poi.position.lng}:${poi.position.lat}`}>
              <button
                type="button"
                data-poi-index={index}
                aria-pressed={poi === selected}
                className={cn(
                  "flex w-full items-baseline gap-2 rounded-md px-1 py-1.5 text-left hover:bg-muted",
                  poi === selected && "bg-muted",
                )}
                onClick={() => setSelected(poi)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{poi.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[poi.kind, poi.address].filter((text) => text !== "").join("・")}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDistance(distance(result.origin, poi.position))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="-mx-4 -mb-4 flex items-center gap-2 rounded-b-xl border-t bg-muted/50 p-4">
        <span className="min-w-0 flex-1 truncate">
          {selected === null ? (
            <span className="text-muted-foreground">選んでいません</span>
          ) : (
            selected.name
          )}
        </span>
        <Button disabled={selected === null} onClick={() => selected && onSelect(selected)}>
          この店舗にする
        </Button>
      </div>
    </>
  );
};

/**
 * 地図から店舗を選ぶボタンとダイアログ。選んだ施設を渡す。
 */
export const PlaceMapDialog = ({ onSelect }: { onSelect: (poi: Poi) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="地図から店舗を選ぶ" />}
      >
        <MapPin />
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>地図から店舗を選ぶ</DialogTitle>
          <DialogDescription className="sr-only">
            現在地の周りの店舗を地図と一覧に出します
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PlaceMap
            onSelect={(poi) => {
              onSelect(poi);
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
