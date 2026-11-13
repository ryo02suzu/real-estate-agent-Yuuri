"use client";

// 下の操作バー：物件の画面で、いま見ているタブに合わせた操作を、下のメニューのすぐ上に浮かせる（主役は1つ、脇役は多くて2つ）。
// 見た目はホーム・お気に入りと同じすりガラス：暗いすりガラスの帯の中に、少し明るいガラスに金色のアイコンの主役（書類・出力の大きな
// ボタンと同じ）と、丸い脇役（★・共有）。タブを変えると主役の字がふわっと入れ替わる。
// スクロール中は薄くなり、止まると戻る。文字を入れている間と、ほかのページを見ている間は隠れる。
// 幅393pt の絵の寸法で描き、画面の幅に合わせて拡大・縮小する（置き場は拡大・縮小する枠の外なので、ここで合わせる）
import { ChevronRight, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { ART_W, ZOOM } from "./frame";
import { DARK_GLASS } from "./home";

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

export function ActionBar({ primary, secondary = [], hidden = false, dim = false }: { primary?: BarAction; secondary?: BarAction[]; hidden?: boolean; dim?: boolean }) {
  if (!primary && secondary.length === 0) return null;
  const primaryCls = "docs-main press flex h-[46px] min-w-0 flex-1 items-center gap-[9px] rounded-full pl-[5px] pr-[12px] font-semibold leading-none text-white";
  const body = (p: BarAction, end: ReactNode) => (
    <>
      <span className="flex shrink-0 items-center justify-center rounded-full" style={{ width: 36, height: 36, background: "rgba(255,201,74,0.16)", border: "1px solid rgba(255,201,74,0.42)", boxShadow: "0 0 12px rgba(255,190,70,0.26)", color: "#ffd36b" }}>
        {p.icon}
      </span>
      {/* タブを変えたら字を入れ替える（key で作り直して、ふわっと出す） */}
      <span key={p.label} className="pv-swap min-w-0 flex-1 truncate">
        {p.label}
      </span>
      {end}
    </>
  );
  return (
    <div className="action-bar pointer-events-none absolute inset-x-0 bottom-0 flex justify-center" data-hidden={hidden ? "1" : "0"} data-dim={dim ? "1" : "0"} aria-hidden={hidden}>
      {/* 隠れている間（ほかのページ・文字を入れている間）は、指を受けない：下へ滑って下のメニューに重なるので、受けると見えないボタンが
          押される（下のメニューの「検索」の所でレポートのシートが開き、「履歴」の所で★が切り替わっていた） */}
      <div className={`relative ${hidden ? "pointer-events-none" : "pointer-events-auto"}`} style={{ width: ART_W, zoom: ZOOM }}>
        <div className="mx-[14px] mb-[10px] flex items-center gap-[6px] rounded-full p-[5px]" style={DARK_GLASS}>
          {primary &&
            (primary.href ? (
              <a href={primary.href} target="_blank" rel="noreferrer" className={primaryCls} style={{ fontSize: 15 }}>
                {body(primary, <ExternalLink size={15} strokeWidth={2} absoluteStrokeWidth className="shrink-0 opacity-75" />)}
              </a>
            ) : (
              <button onClick={primary.onClick} className={primaryCls} style={{ fontSize: 15 }}>
                {body(primary, <ChevronRight size={17} strokeWidth={2} absoluteStrokeWidth className="shrink-0 opacity-75" />)}
              </button>
            ))}
          {secondary.slice(0, 2).map((a) => (
            <button
              key={a.title ?? a.label}
              onClick={a.onClick}
              aria-label={a.title ?? a.label}
              aria-pressed={a.pressed}
              className={`press flex h-[46px] shrink-0 items-center justify-center gap-[5px] rounded-full font-semibold leading-none text-white transition-[background-color] active:bg-white/20 ${a.label ? "px-[14px]" : "w-[46px]"}`}
              style={{ fontSize: 13, background: a.pressed ? "rgba(255,201,74,0.18)" : "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)" }}
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
