"use client";

// タブと詳しい画面で共通の小さな部品：施設の種類ごとのアイコンと色、距離の文字
import {
  Baby,
  BookOpen,
  Building2,
  Cross,
  Landmark,
  Mail,
  Pill,
  School,
  ShoppingBag,
  ShoppingCart,
  Stethoscope,
  Store,
  TrainFront,
  TreeDeciduous,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { PoiWalk } from "@/lib/roadmap/poi";

/** 施設の種類（周辺施設のタイルの番号。0 は駅、-1 は学区の小学校）→ アイコンと色 */
export const KIND_STYLE: Record<number, { Icon: LucideIcon; color: string }> = {
  0: { Icon: TrainFront, color: "#1f63f0" },
  [-1]: { Icon: School, color: "#1f63f0" },
  1: { Icon: ShoppingCart, color: "#f7802f" },
  2: { Icon: Store, color: "#10b07a" },
  3: { Icon: Pill, color: "#5b6df2" },
  4: { Icon: Cross, color: "#e8423f" },
  5: { Icon: Stethoscope, color: "#e8423f" },
  6: { Icon: TreeDeciduous, color: "#16b07a" },
  7: { Icon: Mail, color: "#e8423f" },
  8: { Icon: Landmark, color: "#1f63f0" },
  9: { Icon: Baby, color: "#f59a23" },
  10: { Icon: Building2, color: "#5a6888" },
  11: { Icon: BookOpen, color: "#1f63f0" },
  12: { Icon: ShoppingBag, color: "#d93f87" },
  13: { Icon: Utensils, color: "#f59a23" },
};

/** 「約480m」「約1.2km」 */
export function metersText(m: number): string {
  return m < 1000 ? `約${Math.max(10, Math.round(m / 10) * 10)}m` : `約${(Math.round(m / 100) / 10).toFixed(1)}km`;
}

/** 道のり（分からなければ直線距離） */
export function wayMeters(w: Pick<PoiWalk, "routed" | "meters" | "straight">): number {
  return w.routed ? w.meters : w.straight;
}
