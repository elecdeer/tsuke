/**
 * 地図から店舗を選ぶダイアログ。地図に出ている範囲か全国から施設を OpenPOI API で探し、地図と一覧に出す。
 */
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { LoaderCircle, LocateFixed, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
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
  boundsOfPois,
  distance,
  OPEN_POI_ATTRIBUTION_URL,
  POI_SEARCH_LIMIT,
  poiKey,
  searchPois,
  searchPoisInView,
  uniquePois,
  type LngLat,
  type Poi,
} from "@/web/openPoi";
import { poiKindColor, PoiKindIcon } from "@/web/components/PoiKindIcon";
import { adjustMapStyle, MAP_STYLE_URL } from "@/web/mapStyle";
import { cn } from "@/lib/utils";

type MapLibre = typeof import("maplibre-gl");

/** 現在地がわからないときに出す場所（東京駅） */
const FALLBACK_CENTER: LngLat = { lng: 139.7671, lat: 35.6812 };

/** 地図が止まってから探し始めるまでの時間（ms）。続けて動かしている間は探さない */
const SEARCH_DELAY = 300;

const INITIAL_ZOOM = 16;

const MARKER_LABEL_CLASS =
  "pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded-md bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground shadow-sm";

/**
 * 地図に置く印の土台を作る。
 */
const createMarkerRoot = (name: string) => {
  const element = document.createElement("button");
  element.type = "button";
  element.ariaLabel = name;
  element.className = "group hover:z-10 focus-visible:z-10";
  return element;
};

/**
 * 現在地の印の要素を作る。
 */
const createCurrentMarkerElement = () => {
  const element = createMarkerRoot("現在地");
  const dot = document.createElement("span");
  dot.className = "block size-3 rounded-full border-[3px] border-white bg-blue-600 shadow-sm";
  element.appendChild(dot);
  return element;
};

/**
 * 施設のピン。先が下を向いたしずく形で、中に種類のアイコンを出す。選ぶと大きくなり、縁が付いて名前が出る。
 */
const PoiPin = ({ poi, selected }: { poi: Poi; selected: boolean }) => (
  <>
    <span
      className={cn(
        // しずくの先は四角を回したぶん箱の外へ出るので、その分を余白で取り、先を土台の下端に合わせる
        "flex -rotate-45 items-center justify-center rounded-[50%_50%_50%_0] border border-white shadow-md",
        poiKindColor(poi.kind).pin,
        selected ? "mb-2 size-9 ring-2 ring-neutral-900" : "mb-[5px] size-6",
      )}
    >
      <PoiKindIcon
        kind={poi.kind}
        className={cn("rotate-45 text-white", selected ? "size-5" : "size-3.5")}
      />
    </span>
    <span
      className={cn(
        MARKER_LABEL_CLASS,
        !selected && "hidden group-hover:block group-focus-visible:block",
      )}
    >
      {poi.name}
    </span>
  </>
);

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

/** 探す範囲。view は地図に出ている範囲で、地図を動かすと探し直す。anywhere は全国で、地図を動かしても変わらない */
type SearchScope = "view" | "anywhere";

const SEARCH_SCOPES: { value: SearchScope; label: string }[] = [
  { value: "view", label: "地図内" },
  { value: "anywhere", label: "全国" },
];

/** 探し終えたときに出す案内 */
const statusMessage = (scope: SearchScope, keyword: string, count: number): string => {
  if (scope === "anywhere") {
    if (keyword.trim() === "") return "全国から探すには、キーワードを入れてください";
    if (count === 0) return "全国で見つかりませんでした。キーワードを変えて探してください";
    if (count >= POI_SEARCH_LIMIT) {
      return `全国から ${count} 件だけ出しています。近くの店は「地図内」で探せます`;
    }
    return `全国から ${count} 件。地図を動かしても一覧は変わりません`;
  }
  if (count === 0) return "見つかりませんでした。地図を動かすか、キーワードを変えて探してください";
  if (count >= POI_SEARCH_LIMIT) {
    return `多いので ${count} 件だけ出しています。地図を拡大すると絞り込めます`;
  }
  return `${count} 件。地図の印か一覧から選んでください`;
};

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
  const [scope, setScope] = useState<SearchScope>("view");
  /** 地図のイベントから今の範囲を読むためのもの */
  const scopeRef = useRef<SearchScope>("view");
  const [status, setStatus] = useState<Status>({ type: "locating" });
  /** 一覧は近い順に並べ、距離はこの点（探したときの地図の中心）から測る */
  const [result, setResult] = useState<{ origin: LngLat; pois: Poi[] }>({
    origin: FALLBACK_CENTER,
    pois: [],
  });
  const [selected, setSelected] = useState<Poi | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  /** 今の範囲とキーワードで探す */
  const search = async () => {
    const map = mapRef.current?.map;
    if (map === undefined) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { lng, lat } = map.getCenter();
    const origin = { lng, lat };
    const anywhere = scopeRef.current === "anywhere";
    // キーワードなしで全国を探しても、選べないほどの施設から適当に返るだけになる
    if (anywhere && appliedKeywordRef.current.trim() === "") {
      setResult({ origin, pois: [] });
      setSelected(null);
      setStatus({ type: "done" });
      return;
    }
    setStatus({ type: "searching" });
    const bounds = map.getBounds();
    try {
      const pois = anywhere
        ? uniquePois(
            await searchPois(appliedKeywordRef.current, null, { signal: controller.signal }),
          )
        : await searchPoisInView(
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
      // 全国から探した結果は地図の外にあるので、地図のほうを結果に合わせる
      const found = anywhere ? boundsOfPois(pois) : null;
      if (found !== null) {
        map.fitBounds(
          [
            [found.minLng, found.minLat],
            [found.maxLng, found.maxLat],
          ],
          { padding: 48, maxZoom: INITIAL_ZOOM, duration: 0 },
        );
      }
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

  /** 探す範囲を切り替える */
  const applyScope = (next: SearchScope) => {
    scopeRef.current = next;
    setScope(next);
    if (next === "anywhere") setLocationNote(null);
  };

  /** 現在地へ地図を動かす。動かすと、そこに出ている範囲を探す */
  const moveToCurrentLocation = async () => {
    applyScope("view");
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
            element: createCurrentMarkerElement(),
          })
            .setLngLat(here)
            .addTo(current.map);
  };

  /** キーワードを確定して探す */
  const submitKeyword = (event: FormEvent) => {
    event.preventDefault();
    appliedKeywordRef.current = keyword;
    void search();
  };

  /** 探す範囲を切り替えて、入力中のキーワードで探す */
  const changeScope = (next: SearchScope) => {
    if (next === scope) return;
    applyScope(next);
    appliedKeywordRef.current = keyword;
    void search();
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
      timer = setTimeout(() => {
        if (scopeRef.current === "view") void search();
      }, SEARCH_DELAY);
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

  // 印の中身は React で描くので、土台の要素を先に作っておく
  const pinRoots = useMemo(
    () =>
      result.pois.map((poi) => {
        const element = createMarkerRoot(poi.name);
        element.addEventListener("click", () => setSelected(poi));
        return { poi, element };
      }),
    [result],
  );

  // 施設の印を置き直す
  useEffect(() => {
    const current = mapRef.current;
    if (!ready || current === null) return;
    const markers = pinRoots.map(({ poi, element }) =>
      new current.maplibre.Marker({ element, anchor: "bottom" })
        .setLngLat(poi.position)
        .addTo(current.map),
    );
    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [ready, pinRoots]);

  // 選んだ施設の印を、重なったほかの印より手前に出す
  useEffect(() => {
    for (const { poi, element } of pinRoots) element.classList.toggle("z-20", poi === selected);
  }, [pinRoots, selected]);

  // 地図で選んだ施設を一覧で見える所まで送る。地図内の結果は地図に出ているので、全国のときだけ地図を動かす
  useEffect(() => {
    if (selected === null) return;
    const map = mapRef.current?.map;
    if (scopeRef.current === "anywhere" && map !== undefined) {
      map.easeTo({ center: selected.position, zoom: Math.max(map.getZoom(), INITIAL_ZOOM) });
    }
    listRef.current
      ?.querySelector(`[data-poi-index="${result.pois.indexOf(selected)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, result]);

  const busy = status.type === "locating" || status.type === "searching";

  return (
    <>
      {pinRoots.map(({ poi, element }) =>
        createPortal(<PoiPin poi={poi} selected={poi === selected} />, element, poiKey(poi)),
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:grid-rows-[auto_minmax(0,1fr)]">
        <form
          className="flex flex-col gap-1.5 md:col-start-2 md:row-start-1"
          onSubmit={submitKeyword}
        >
          <div className="flex gap-1.5">
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
              aria-label="現在地の周りを地図内で探す"
              disabled={!ready || busy}
              onClick={() => void moveToCurrentLocation()}
            >
              <LocateFixed />
            </Button>
          </div>
          <div className="flex gap-1">
            {SEARCH_SCOPES.map(({ value, label }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={scope === value ? "secondary" : "ghost"}
                aria-pressed={scope === value}
                onClick={() => changeScope(value)}
              >
                {label}
              </Button>
            ))}
          </div>
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
                <p>{statusMessage(scope, appliedKeywordRef.current, result.pois.length)}</p>
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
                      "flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-muted",
                      poi === selected && "bg-muted",
                    )}
                    onClick={() => setSelected(poi)}
                  >
                    <PoiKindIcon
                      kind={poi.kind}
                      className={cn("size-4 shrink-0", poiKindColor(poi.kind).text)}
                    />
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
