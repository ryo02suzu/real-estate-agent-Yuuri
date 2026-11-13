"use client";

// 見つからない画面・履歴などで共通の小さな部品（物件の画面のすりガラスの部品は components/app/g-ui.tsx）。白い角丸のカード、端末の標準の字、
// iPhone の大きさの段階（章の見出し17pt太字、値16pt中太字、行の名前15pt中太字、説明13pt、小さな字12〜11pt）。
// 寸法は幅393ptの値（1px = 1pt。画面の幅に合わせて拡大・縮小する）
import { ChevronRight, ExternalLink } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { NAVY } from "./ui";

export const HEAD = "#0f1b33";
export const TEXT = "#162033";
export const LIGHT = "#66728a";
export const LINK = "#1f5fbf";
export const WARN = "#8a4f3a";
export const FAINT = "#8a95a6";
export const RED = "#e0322f";
/** 白い角丸のカード */
export const CARD = "rounded-[18px] bg-white shadow-[0_4px_14px_rgba(20,45,85,0.08)]";
/** すりガラス（後ろの写真を少しぼかして白く透かす。縁は白く光らせる） */
export const GLASS: CSSProperties = {
  background: "rgba(255,255,255,0.46)",
  backdropFilter: "blur(10px) saturate(1.5)",
  WebkitBackdropFilter: "blur(10px) saturate(1.5)",
  border: "1px solid rgba(255,255,255,0.8)",
};
/** 見出しの左の印 */
const ACCENT = "linear-gradient(180deg,#3d7bff 0%,#22c1ee 100%)";

export const yen = (v: number) => Math.round(v).toLocaleString("ja-JP");

/** 短い円の書き方：「9.9万円」「1,038万円」「1.2億円」 */
export function manYen(v: number): string {
  if (v >= 1e8) return `${(Math.round(v / 1e7) / 10).toFixed(1)}億円`;
  if (v >= 1e5) return `${Math.round(v / 1e4).toLocaleString("ja-JP")}万円`;
  return `${(v / 1e4).toFixed(1)}万円`;
}

/** 「東京都渋谷区神南一丁目19-11」→「渋谷区神南一丁目19-11」（都道府県を外す） */
export function shortAddress(a: string): string {
  return a.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, "");
}

/** 画面に出す住所：都道府県を外し、全角の数字・記号を半角に（「１９番１１号」→「19番11号」）。コピーする文には使わない */
export function displayAddress(a: string): string {
  return shortAddress(a.normalize("NFKC"));
}

/** 写真の帯の上端の色（NO IMAGE の札の上の色に薄い影が重なった色）。時刻・電池の帯をこの色にする */
export const BAND_TOP = "#bec7d2";

/** 章の見出し（左に青い印）と右の「もっと見る ›」 */
export function Head({ title, note, more = "もっと見る", onMore, className = "" }: { title: string; note?: string; more?: string; onMore?: () => void; className?: string }) {
  return (
    <div className={`flex h-[32px] items-center justify-between ${className}`}>
      <div className="flex min-w-0 items-center gap-[8px]">
        <span aria-hidden className="shrink-0 rounded-full" style={{ width: 3.5, height: 15, background: ACCENT }} />
        <h2 className="shrink-0 font-bold leading-none" style={{ fontSize: 17, color: HEAD }}>
          {title}
        </h2>
        {note && (
          <span className="truncate leading-none" style={{ fontSize: 12, color: LIGHT }}>
            {note}
          </span>
        )}
      </div>
      {onMore && (
        <button onClick={onMore} className="-mr-[6px] flex h-[40px] shrink-0 items-center px-[6px] active:opacity-60" style={{ fontSize: 14, color: LINK }}>
          {more}
          <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth />
        </button>
      )}
    </div>
  );
}

/** 一覧の1行（丸いアイコン・名前・説明・右の値）。押せる行は右に ›、外のページに行く行は ↗ */
export function Row({ icon, iconBg = "#eef3fa", title, sub, right, rightColor = TEXT, onClick, href, minH = 56, line = true }: { icon?: ReactNode; iconBg?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; rightColor?: string; onClick?: () => void; href?: string; minH?: number; line?: boolean }) {
  const body = (
    <>
      {icon && (
        <span className="flex shrink-0 items-center justify-center rounded-full" style={{ width: 36, height: 36, background: iconBg }}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 15, color: TEXT }}>
          {title}
        </span>
        {sub && (
          <span className="mt-[1px] block truncate leading-[1.35]" style={{ fontSize: 12.5, color: LIGHT }}>
            {sub}
          </span>
        )}
      </span>
      {right && (
        <span className="shrink-0 whitespace-nowrap text-right font-semibold leading-none" style={{ fontSize: 13, color: rightColor }}>
          {right}
        </span>
      )}
      {href ? <ExternalLink size={16} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" /> : onClick ? <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" /> : null}
    </>
  );
  const cls = `flex w-full items-center gap-[12px] px-[12px] py-[8px] text-left ${line ? "border-t border-[#eef2f6] first:border-t-0" : ""}`;
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={`${cls} active:bg-[#f5f8fc]`} style={{ minHeight: minH }}>
        {body}
      </a>
    );
  return onClick ? (
    <button onClick={onClick} className={`${cls} active:bg-[#f5f8fc]`} style={{ minHeight: minH }}>
      {body}
    </button>
  ) : (
    <div className={cls} style={{ minHeight: minH }}>
      {body}
    </div>
  );
}

/** 紺の大きなボタン */
export function Primary({ children, onClick, href, icon, className = "" }: { children: ReactNode; onClick?: () => void; href?: string; icon?: ReactNode; className?: string }) {
  const cls = `press flex h-[48px] w-full items-center justify-center gap-[8px] rounded-[14px] font-semibold leading-none text-white shadow-[0_8px_20px_rgba(15,47,95,0.22)] ${className}`;
  const style: CSSProperties = { fontSize: 16, background: `linear-gradient(135deg,#1b4280 0%,${NAVY} 60%,#0a2248 100%)` };
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>
      {icon}
      {children}
      <ExternalLink size={16} strokeWidth={2} absoluteStrokeWidth className="opacity-80" />
    </a>
  ) : (
    <button onClick={onClick} className={cls} style={style}>
      {icon}
      {children}
      <ChevronRight size={18} strokeWidth={2} absoluteStrokeWidth />
    </button>
  );
}

/** 薄い注記（出典など） */
export function Note({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`leading-[1.5] ${className}`} style={{ fontSize: 11, color: FAINT }}>
      {children}
    </p>
  );
}

/** 読み込み中・読めなかった・データなしを分けて言う */
export function pendingText(status: string, none = "データなし"): string {
  return status === "loading" ? "確認中…" : status === "error" ? "読み込めず" : none;
}
