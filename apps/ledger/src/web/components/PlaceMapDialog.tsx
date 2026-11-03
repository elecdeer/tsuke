/**
 * 地図から店舗を選ぶダイアログ。現在地の周りの施設を OpenPOI API で探し、地図と一覧に出す。
 */
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
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
import { adjustMapStyle, MAP_STYLE_URL } from "@/web/mapStyle";
import { cn } from "@/lib/utils";

type MapLibre = typeof import("maplibre-gl");

/** 現在地がわからないときに出す場所（東京駅） */
const FALLBACK_CENTER: LngLat = { lng: 139.7671, lat: 35.6812 };

/** 開いたときに探す、現在地からの半径（m） */
const NEARBY_RADIUS = 300;

const INITIAL_ZOOM = 16;

/** 施設の印の見た目 */
const MARKER_CLASS = "size-3.5 border-2 border-background bg-muted-foreground";
const SELECTED_MARKER_CLASS = "z-20 size-5 border-2 border-background bg-primary";
const CURRENT_MARKER_CLASS = "size-3 border-[3px] border-white bg-blue-600";

/**
 * 地図に置く印の要素を作る。名前は、選んでいるときは常に、それ以外は指しているときに出す。
 */
const createMarkerElement = (
  name: string,
  { className, showName = false }: { className: string; showName?: boolean },
) => {
  const element = document.createElement("button");
  element.type = "button";
  element.ariaLabel = name;
  element.className = cn("group rounded-full shadow-sm hover:z-10 focus-visible:z-10", className);
  const label = document.createElement("span");
  label.textContent = name;
  label.className = cn(
    "pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded-md bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground shadow-sm",
    !showName && "hidden group-hover:block group-focus-visible:block",
  );
  element.appendChild(label);
  return element;
};

const formatDistance = (meters: number) =>
  meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;

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
 * ダイアログの中身。開いている間だけ置き、MapLibre はブラウザで開いたときに読み込む。
 */
const PlaceMap = ({ onSelect }: { onSelect: (name: string) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ maplibre: MapLibre; map: MapLibreMap } | null>(null);
  const currentMarkerRef = useRef<Marker | null>(null);
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
    const current = mapRef.current;
    if (current === null) return;
    const center = here ?? FALLBACK_CENTER;
    current.map.jumpTo({ center, zoom: INITIAL_ZOOM });
    currentMarkerRef.current?.remove();
    currentMarkerRef.current =
      here === null
        ? null
        : new current.maplibre.Marker({
            element: createMarkerElement("現在地", { className: CURRENT_MARKER_CLASS }),
          })
            .setLngLat(here)
            .addTo(current.map);
    await search(
      { center, radius: NEARBY_RADIUS },
      center,
      here === null ? "現在地がわからないので、東京駅の周りを出しています" : undefined,
    );
  };

  /** 地図に今出ている範囲を探す */
  const searchView = (event: FormEvent) => {
    event.preventDefault();
    const map = mapRef.current?.map;
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

  // MapLibre は読み込むだけで window に触れるので、サーバーでの描画を避けてここで読み込む
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import("maplibre-gl").then((maplibre) => {
      const container = containerRef.current;
      if (disposed || container === null) return;
      // 既定では本体のファイルの隣から Worker を読むが、Vite でまとめると本体の場所が変わって読めなくなる
      maplibre.setWorkerUrl(mapWorkerUrl);
      const map = new maplibre.Map({
        container,
        style: MAP_STYLE_URL,
        transformStyle: adjustMapStyle,
        center: FALLBACK_CENTER,
        zoom: INITIAL_ZOOM,
        maxZoom: 19,
        attributionControl: false,
        // 店舗を探すのに傾きや回転はいらず、触れて向きが変わるとかえって迷う
        dragRotate: false,
        touchPitch: false,
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.addControl(
        new maplibre.AttributionControl({
          compact: false,
          customAttribution: `<a href="${OPEN_POI_ATTRIBUTION_URL}" target="_blank" rel="noreferrer">OpenPOI API</a>`,
        }),
        "bottom-right",
      );
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = { maplibre, map };
      // ダイアログが開く動きの途中で作ると大きさを読み違えるので、大きさが変わるたびに測り直す
      const observer = new ResizeObserver(() => map.resize());
      observer.observe(container);
      cleanup = () => {
        observer.disconnect();
        map.remove();
        mapRef.current = null;
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
    const current = mapRef.current;
    if (!ready || current === null) return;
    const markers = result.pois.map((poi) => {
      const isSelected = poi === selected;
      const element = createMarkerElement(poi.name, {
        className: isSelected ? SELECTED_MARKER_CLASS : MARKER_CLASS,
        showName: isSelected,
      });
      element.addEventListener("click", () => setSelected(poi));
      return new current.maplibre.Marker({ element }).setLngLat(poi.position).addTo(current.map);
    });
    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [ready, result, selected]);

  // 一覧で選んだ施設を地図の真ん中に出し、地図で選んだ施設を一覧で見える所まで送る
  useEffect(() => {
    if (selected === null) return;
    mapRef.current?.map.panTo(selected.position);
    listRef.current
      ?.querySelector(`[data-poi-index="${result.pois.indexOf(selected)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, result]);

  const busy = status.type === "locating" || status.type === "searching";

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:grid-rows-[auto_minmax(0,1fr)]">
        <form className="flex gap-1.5 md:col-start-2 md:row-start-1" onSubmit={searchView}>
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
        <div
          ref={containerRef}
          className="isolate min-h-0 w-full flex-3 rounded-md border md:col-start-1 md:row-span-2 md:row-start-1"
        />
        <div className="flex min-h-0 flex-2 flex-col gap-2 md:col-start-2 md:row-start-2">
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
        </div>
      </div>
      <div className="-mx-4 -mb-4 flex items-center gap-2 rounded-b-xl border-t bg-muted/50 p-4">
        <span className="min-w-0 flex-1 truncate">
          {selected === null ? (
            <span className="text-muted-foreground">選んでいません</span>
          ) : (
            selected.name
          )}
        </span>
        <Button disabled={selected === null} onClick={() => selected && onSelect(selected.name)}>
          この店舗にする
        </Button>
      </div>
    </>
  );
};

/**
 * 地図から店舗を選ぶボタンとダイアログ。選んだ施設の名前を店舗の名前として渡す。
 */
export const PlaceMapDialog = ({ onSelect }: { onSelect: (name: string) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="地図から店舗を選ぶ" />}
      >
        <MapPin />
      </DialogTrigger>
      <DialogContent className="flex h-[calc(100dvh-2rem)] flex-col sm:max-w-[min(calc(100%-2rem),72rem)] md:max-h-200">
        <DialogHeader>
          <DialogTitle>地図から店舗を選ぶ</DialogTitle>
          <DialogDescription className="sr-only">
            現在地の周りの店舗を地図と一覧に出します
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PlaceMap
            onSelect={(name) => {
              onSelect(name);
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
