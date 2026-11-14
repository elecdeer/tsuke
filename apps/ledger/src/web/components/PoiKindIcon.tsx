/**
 * 施設の種類ごとのアイコン。種類は OpenPOI API の正規化カテゴリ（category）の語彙に合わせる。
 */
import {
  Banknote,
  BedDouble,
  Beer,
  Camera,
  Coffee,
  Croissant,
  GraduationCap,
  Hamburger,
  Hospital,
  Landmark,
  MapPin,
  ShoppingBag,
  ShoppingBasket,
  Store,
  TrainFront,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import styles from "./PoiKindIcon.module.css";

/**
 * 色のまとまり。ピンの地の色と一覧のアイコンの色は、PoiKindIcon.module.css でまとまりごとに決める
 */
type KindColor =
  | "food"
  | "shopping"
  | "lodging"
  | "tourism"
  | "medical"
  | "education"
  | "finance"
  | "transit"
  | "other";

const FOOD: KindColor = "food";
const SHOPPING: KindColor = "shopping";
const LODGING: KindColor = "lodging";
const TOURISM: KindColor = "tourism";
const MEDICAL: KindColor = "medical";
const EDUCATION: KindColor = "education";
const FINANCE: KindColor = "finance";
const TRANSIT: KindColor = "transit";
const OTHER: KindColor = "other";

/**
 * 種類ごとの見た目。色はアイコンより遠くから見分けられるので、飲食・買い物のような大きなまとまりで分ける
 */
const POI_KINDS: Readonly<Record<string, { icon: LucideIcon; color: KindColor }>> = {
  restaurant: { icon: UtensilsCrossed, color: FOOD },
  cafe: { icon: Coffee, color: FOOD },
  fast_food: { icon: Hamburger, color: FOOD },
  bakery: { icon: Croissant, color: FOOD },
  bar_izakaya: { icon: Beer, color: FOOD },
  grocery: { icon: ShoppingBasket, color: SHOPPING },
  convenience_store: { icon: Store, color: SHOPPING },
  retail_other: { icon: ShoppingBag, color: SHOPPING },
  lodging: { icon: BedDouble, color: LODGING },
  tourism: { icon: Camera, color: TOURISM },
  medical: { icon: Hospital, color: MEDICAL },
  education: { icon: GraduationCap, color: EDUCATION },
  public_facility: { icon: Landmark, color: OTHER },
  finance: { icon: Banknote, color: FINANCE },
  service_other: { icon: Wrench, color: OTHER },
  station: { icon: TrainFront, color: TRANSIT },
};

/** 種類がわからない施設（unknown や未知の値）の見た目 */
const UNKNOWN_KIND = { icon: MapPin, color: OTHER };

const poiKindOf = (kind: string) =>
  Object.hasOwn(POI_KINDS, kind) ? POI_KINDS[kind] : UNKNOWN_KIND;

/**
 * 施設の種類に合うアイコンを返す。
 */
export const poiKindIcon = (kind: string): LucideIcon => poiKindOf(kind).icon;

/**
 * 施設の種類に合う色のまとまりを返す。
 */
export const poiKindColor = (kind: string): KindColor => poiKindOf(kind).color;

/**
 * 施設の種類の色を、要素の中で CSS の変数（--poi-pin・--poi-text）として使えるようにする props。
 */
export const poiColorProps = (kind: string) => ({
  className: styles.PoiColor,
  "data-poi-color": poiKindColor(kind),
});

/**
 * 施設の種類のアイコンを描く。
 */
export const PoiKindIcon = ({ kind, className }: { kind: string; className?: string }) =>
  createElement(poiKindIcon(kind), { className, "aria-hidden": true });
