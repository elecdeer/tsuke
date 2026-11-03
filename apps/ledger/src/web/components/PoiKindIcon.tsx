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

/** 色の組。ピンの地の色と、一覧のアイコンの色。一覧は暗いテーマでも読めるよう少し明るくする */
type KindColor = { pin: string; text: string };

const FOOD: KindColor = { pin: "bg-orange-600", text: "text-orange-500" };
const SHOPPING: KindColor = { pin: "bg-blue-600", text: "text-blue-500" };
const LODGING: KindColor = { pin: "bg-fuchsia-600", text: "text-fuchsia-500" };
const TOURISM: KindColor = { pin: "bg-teal-600", text: "text-teal-500" };
const MEDICAL: KindColor = { pin: "bg-red-600", text: "text-red-500" };
const EDUCATION: KindColor = { pin: "bg-violet-600", text: "text-violet-500" };
const FINANCE: KindColor = { pin: "bg-emerald-700", text: "text-emerald-500" };
const TRANSIT: KindColor = { pin: "bg-indigo-600", text: "text-indigo-500" };
const OTHER: KindColor = { pin: "bg-slate-600", text: "text-slate-500" };

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
 * 施設の種類に合う色（ピンの地の色と、一覧のアイコンの色の Tailwind のクラス）を返す。
 */
export const poiKindColor = (kind: string): KindColor => poiKindOf(kind).color;

/**
 * 施設の種類のアイコンを描く。
 */
export const PoiKindIcon = ({ kind, className }: { kind: string; className?: string }) =>
  createElement(poiKindIcon(kind), { className, "aria-hidden": true });
