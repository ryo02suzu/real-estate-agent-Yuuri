"use client";

// タブの中で共通の小さな部品：表の行、施設の種類ごとのアイコンと色、徒歩の目安の文字、読み込み中の文字
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
import type { ReactNode } from "react";
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

/** 徒歩の目安。道のりが分かれば「徒歩6分」、分からなければ「直線」 */
export function walkLabel(w: { routed: boolean; minutes: number }): string {
  return w.routed ? `徒歩${w.minutes}分` : "直線距離";
}

/** 道のり（分からなければ直線距離） */
export function wayMeters(w: Pick<PoiWalk, "routed" | "meters" | "straight">): number {
  return w.routed ? w.meters : w.straight;
}

/** 読み込み中などの薄い文字 */
export function Pending({ children = "確認中…" }: { children?: ReactNode }) {
  return <span className="font-normal text-[#8a95a6]">{children}</span>;
}

/** アイコン・名前・値の1行（表）。line=false で下の線を引かない */
export function InfoRow({
  icon,
  label,
  children,
  sub,
  line = true,
  labelW = 53.1,
  size = 6.67,
  labelSize = 6.29,
  onClick,
  minH = 17.9,
}: {
  icon: ReactNode;
  label: ReactNode;
  children: ReactNode;
  sub?: ReactNode;
  line?: boolean;
  labelW?: number;
  size?: number;
  labelSize?: number;
  onClick?: () => void;
  minH?: number;
}) {
  const body = (
    <>
      <span className="flex w-[16.8px] shrink-0 justify-start pt-[1px]">{icon}</span>
      <span className="shrink-0 leading-[1.35]" style={{ width: labelW, fontSize: labelSize, color: "#6b778a" }}>
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words leading-[1.35]" style={{ fontSize: size, color: "#1a2232" }}>
        {children}
        {sub && (
          <span className="block leading-[1.35]" style={{ fontSize: size - 0.6, color: "#6b7486" }}>
            {sub}
          </span>
        )}
      </span>
    </>
  );
  const cls = `flex w-full items-start py-[4px] text-left ${line ? "border-b-[0.6px] border-[#eef2f6]" : ""}`;
  return onClick ? (
    <button onClick={onClick} className={`${cls} active:bg-[#f7f9fd]`} style={{ minHeight: minH }}>
      {body}
    </button>
  ) : (
    <div className={cls} style={{ minHeight: minH }}>
      {body}
    </div>
  );
}
