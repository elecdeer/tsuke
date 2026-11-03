/**
 * 地図から店舗を選ぶダイアログ。地図に出ている範囲の施設を OpenPOI API で探し、地図と一覧に出す。
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
  POI_SEARCH_LIMIT,
  poiKey,
  searchPoisInView,
  type LngLat,
  type Poi,
} from "@/web/openPoi";
import { adjustMapStyle, MAP_STYLE_URL } from "@/web/mapStyle";
import { cn } from "@/lib/utils";

type MapLibre = typeof import("maplibre-gl");

/** 現在地がわからないときに出す場所（東京駅） */
const FALLBACK_CENTER: LngLat = { lng: 139.7671, lat: 35.6812 };

/** 地図が止まってから探し始めるまでの時間（ms）。続けて動かしている間は探さない */
const SEARCH_DELAY = 300;

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
  | { type: "done" }
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
  /** 探すときに使うキーワード。入力の途中で地図を動かしても、確定するまでは前のもので探す */
  const appliedKeywordRef = useRef("");
  const [status, setStatus] = useState<Status>({ type: "locating" });
  /** 一覧は近い順に並べ、距離はこの点（探したときの地図の中心）から測る */
  const [result, setResult] = useState<{ origin: LngLat; pois: Poi[] }>({
    origin: FALLBACK_CENTER,
    pois: [],
  });
  const [selected, setSelected] = useState<Poi | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  /** 地図に今出ている範囲を探す */
  const searchView = async () => {
    const map = mapRef.current?.map;
    if (map === undefined) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ type: "searching" });
    const bounds = map.getBounds();
    const { lng, lat } = map.getCenter();
    const origin = { lng, lat };
    try {
      const pois = await searchPoisInView(
        appliedKeywordRef.current,
        {
          minLng: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLng: bounds.getEast(),
          maxLat: bounds.getNorth(),
        },
        origin,
        { signal: controller.signal },
      );
      pois.sort((a, b) => distance(origin, a.position) - distance(origin, b.position));
      setResult({ origin, pois });
      // 地図を少し動かしただけで選び直しにならないよう、範囲に残っていれば選んだままにする
      setSelected(
        (previous) => previous && (pois.find((poi) => poiKey(poi) === poiKey(previous)) ?? null),
      );
      setStatus({ type: "done" });
    } catch (error) {
      if (controller.signal.aborted) return;
      setResult({ origin, pois: [] });
      setSelected(null);
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

  /** 現在地へ地図を動かす。動かすと、そこに出ている範囲を探す */
  const moveToCurrentLocation = async () => {
    setStatus({ type: "locating" });
    const here = await locate();
    const current = mapRef.current;
    if (current === null) return;
    setLocationNote(here === null ? "現在地がわからないので、東京駅の周りを出しています" : null);
    current.map.jumpTo({ center: here ?? FALLBACK_CENTER, zoom: INITIAL_ZOOM });
    currentMarkerRef.current?.remove();
    currentMarkerRef.current =
      here === null
        ? null
        : new current.maplibre.Marker({
            element: createMarkerElement("現在地", { className: CURRENT_MARKER_CLASS }),
          })
            .setLngLat(here)
            .addTo(current.map);
  };

  /** キーワードを確定して探す */
  const submitKeyword = (event: FormEvent) => {
    event.preventDefault();
    appliedKeywordRef.current = keyword;
    void searchView();
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

  // 地図に出ている範囲と一覧がずれないよう、地図が止まるたびに探し直す
  useEffect(() => {
    const map = mapRef.current?.map;
    if (!ready || map === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMoveEnd = ({ originalEvent }: { originalEvent?: unknown }) => {
      // 人が動かしたら、もう東京駅の周りとは限らない
      if (originalEvent !== undefined) setLocationNote(null);
      clearTimeout(timer);
      timer = setTimeout(() => void searchView(), SEARCH_DELAY);
    };
    map.on("moveend", onMoveEnd);
    void moveToCurrentLocation();
    return () => {
      clearTimeout(timer);
      map.off("moveend", onMoveEnd);
    };
    // 地図ができたときに 1 度だけつなぐ
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

  // 地図で選んだ施設を一覧で見える所まで送る。一覧の施設は地図に出ているので、地図は動かさない
  useEffect(() => {
    if (selected === null) return;
    listRef.current
      ?.querySelector(`[data-poi-index="${result.pois.indexOf(selected)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, result]);

  const busy = status.type === "locating" || status.type === "searching";

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:grid-rows-[auto_minmax(0,1fr)]">
        <form className="flex gap-1.5 md:col-start-2 md:row-start-1" onSubmit={submitKeyword}>
          <Input
            type="search"
            aria-label="キーワード"
            placeholder="キーワード"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!ready}>
            <Search />
            探す
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="現在地へ移動する"
            disabled={!ready || busy}
            onClick={() => void moveToCurrentLocation()}
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
                {locationNote !== null && <p>{locationNote}</p>}
                <p>
                  {result.pois.length === 0
                    ? "見つかりませんでした。地図を動かすか、キーワードを変えて探してください"
                    : result.pois.length >= POI_SEARCH_LIMIT
                      ? `多いので ${result.pois.length} 件だけ出しています。地図を拡大すると絞り込めます`
                      : `${result.pois.length} 件。地図の印か一覧から選んでください`}
                </p>
              </>
            )}
          </div>
          {result.pois.length > 0 && (
            <ul ref={listRef} className="-mx-1 min-h-0 flex-1 overflow-y-auto">
              {result.pois.map((poi, index) => (
                <li key={poiKey(poi)}>
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
            地図に出ている範囲の店舗を地図と一覧に出します
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
