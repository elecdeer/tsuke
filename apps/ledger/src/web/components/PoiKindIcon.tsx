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

const POI_KIND_ICONS: Readonly<Record<string, LucideIcon>> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  fast_food: Hamburger,
  bakery: Croissant,
  bar_izakaya: Beer,
  grocery: ShoppingBasket,
  convenience_store: Store,
  retail_other: ShoppingBag,
  lodging: BedDouble,
  tourism: Camera,
  medical: Hospital,
  education: GraduationCap,
  public_facility: Landmark,
  finance: Banknote,
  service_other: Wrench,
  station: TrainFront,
};

/**
 * 施設の種類に合うアイコンを返す。種類がわからない施設（unknown や未知の値）はピンにする。
 */
export const poiKindIcon = (kind: string): LucideIcon =>
  Object.hasOwn(POI_KIND_ICONS, kind) ? POI_KIND_ICONS[kind] : MapPin;

/**
 * 施設の種類のアイコンを描く。
 */
export const PoiKindIcon = ({ kind, className }: { kind: string; className?: string }) =>
  createElement(poiKindIcon(kind), { className, "aria-hidden": true });
