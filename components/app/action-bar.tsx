"use client";

// 下の操作バー：物件の画面で、いま見ているタブに合わせた操作を、下のメニューのすぐ上に浮かせる（主役は1つ、脇役は多くて2つ）。
// スクロール中は薄くなり、止まると戻る。文字を入れている間と、ほかのページを見ている間は隠れる。
// 幅393pt の絵の寸法で描き、画面の幅に合わせて拡大・縮小する（置き場は拡大・縮小する枠の外なので、ここで合わせる）
import { ChevronRight, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { ART_W, ZOOM } from "./frame";
import { NAVY } from "./ui";

export type BarAction = {
  /** 空なら印だけ（title を読み上げに使う） */
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  /** 外のページ（公式道路図など） */
  href?: string;
  /** 押した状態（★など） */
  pressed?: boolean;
  /** 読み上げ用の名前（label が空のとき） */
  title?: string;
};

const PRIMARY_BG = `linear-gradient(135deg,#1b4280 0%,${NAVY} 60%,#0a2248 100%)`;

export function ActionBar({ primary, secondary = [], hidden = false, dim = false }: { primary?: BarAction; secondary?: BarAction[]; hidden?: boolean; dim?: boolean }) {
  if (!primary && secondary.length === 0) return null;
  const primaryCls = "press flex h-[44px] min-w-0 flex-1 items-center justify-center gap-[7px] rounded-full font-semibold leading-none text-white";
  return (
    <div className="action-bar pointer-events-none absolute inset-x-0 bottom-0 flex justify-center" data-hidden={hidden ? "1" : "0"} data-dim={dim ? "1" : "0"} aria-hidden={hidden}>
      <div className="pointer-events-auto relative" style={{ width: ART_W, zoom: ZOOM }}>
        <div
          className="mx-[16px] mb-[10px] flex items-center gap-[6px] rounded-full p-[6px] shadow-[0_10px_28px_rgba(15,35,70,0.22)]"
          style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(14px) saturate(1.4)", WebkitBackdropFilter: "blur(14px) saturate(1.4)", border: "1px solid rgba(255,255,255,0.85)" }}
        >
          {primary &&
            (primary.href ? (
              <a href={primary.href} target="_blank" rel="noreferrer" className={primaryCls} style={{ fontSize: 15, background: PRIMARY_BG }}>
                {primary.icon}
                <span className="truncate">{primary.label}</span>
                <ExternalLink size={15} strokeWidth={2} absoluteStrokeWidth className="shrink-0 opacity-85" />
              </a>
            ) : (
              <button onClick={primary.onClick} className={primaryCls} style={{ fontSize: 15, background: PRIMARY_BG }}>
                {primary.icon}
                <span className="truncate">{primary.label}</span>
                <ChevronRight size={16} strokeWidth={2} absoluteStrokeWidth className="shrink-0 opacity-85" />
              </button>
            ))}
          {secondary.slice(0, 2).map((a) => (
            <button
              key={a.title ?? a.label}
              onClick={a.onClick}
              aria-label={a.title ?? a.label}
              aria-pressed={a.pressed}
              className={`press flex h-[44px] shrink-0 items-center justify-center gap-[5px] rounded-full font-semibold leading-none ${a.label ? "px-[13px]" : "w-[44px]"}`}
              style={{ fontSize: 13, color: NAVY, background: a.pressed ? "#fff3dc" : "rgba(19,54,100,0.06)" }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
