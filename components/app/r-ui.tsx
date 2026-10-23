"use client";

// 物件の画面（6つのタブ）と、見つからない画面で共通の小さな部品。ホームと同じ見た目：白い角丸のカード、端末の標準の字、
// iPhone の大きさの段階（章の見出し17pt太字、値16pt中太字、行の名前15pt中太字、説明13pt、小さな字12〜11pt）。
// 寸法は幅393ptの値（1px = 1pt。画面の幅に合わせて拡大・縮小する）
import { ChevronRight, ExternalLink, ImageIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Tone } from "@/lib/app/hazard-level";
import { NAVY, TONE } from "./ui";

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

/** 写真が入る所（写真はあとで届く）。top で NO IMAGE の札を上に寄せる（下に字を重ねる帯のとき） */
export function NoImage({ className = "", style, label = "NO IMAGE", size = 11, top = false }: { className?: string; style?: CSSProperties; label?: string; size?: number; top?: boolean }) {
  return (
    <div className={`flex flex-col items-center overflow-hidden bg-[linear-gradient(160deg,#cfd8e3_0%,#a9b6c6_55%,#8d9bae_100%)] text-white ${top ? "justify-start pt-[8px]" : "justify-center"} ${className}`} style={style}>
      <ImageIcon size={Math.round(size * 1.8)} strokeWidth={1.6} absoluteStrokeWidth className="opacity-90" />
      <span className="mt-[3px] font-semibold leading-none opacity-90" style={{ fontSize: size, letterSpacing: "0.14em" }}>
        {label}
      </span>
    </div>
  );
}

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

/** 値の札（2列の表の1マス）：小さな名前・値・1行の補足。高さは決め打ち（1画面に収めるため）。押せるものは右上に › */
export function Cell({ label, value, sub, onClick, warn, height = 62 }: { label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void; warn?: boolean; height?: number }) {
  const body = (
    <>
      <span className="block truncate leading-none" style={{ fontSize: 11.5, color: LIGHT }}>
        {label}
      </span>
      <span className="mt-[4px] block truncate font-semibold leading-[1.25]" style={{ fontSize: 16, color: warn ? WARN : TEXT }}>
        {value}
      </span>
      {sub !== undefined && (
        <span className="mt-[2px] block truncate leading-none" style={{ fontSize: 11, color: LIGHT, minHeight: 11 }}>
          {sub}
        </span>
      )}
      {onClick && <ChevronRight size={14} strokeWidth={2} absoluteStrokeWidth color="#a3adbd" className="absolute right-[8px] top-[9px]" />}
    </>
  );
  const cls = "relative block min-w-0 overflow-hidden rounded-[14px] bg-white px-[12px] text-left shadow-[0_2px_8px_rgba(20,45,85,0.06)]";
  const style: CSSProperties = { height, paddingTop: 7, paddingBottom: 6 };
  return onClick ? (
    <button onClick={onClick} className={`${cls} w-full active:bg-[#f5f8fc]`} style={style}>
      {body}
    </button>
  ) : (
    <div className={cls} style={style}>
      {body}
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
  const cls = `flex h-[48px] w-full items-center justify-center gap-[8px] rounded-[14px] font-semibold leading-none text-white shadow-[0_8px_20px_rgba(15,47,95,0.22)] active:opacity-90 ${className}`;
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

/** 細い線の小さなボタン（白） */
export function Ghost({ children, onClick, href, icon, className = "" }: { children: ReactNode; onClick?: () => void; href?: string; icon?: ReactNode; className?: string }) {
  const cls = `flex h-[40px] items-center justify-center gap-[6px] rounded-full border border-[#cfd8e4] bg-white px-[14px] font-semibold leading-none active:bg-[#f2f5f9] ${className}`;
  const style: CSSProperties = { fontSize: 14, color: NAVY };
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>
      {icon}
      {children}
      <ExternalLink size={14} strokeWidth={1.8} absoluteStrokeWidth />
    </a>
  ) : (
    <button onClick={onClick} className={cls} style={style}>
      {icon}
      {children}
    </button>
  );
}

/** 区分の印（区域外=緑、注意=黄、高い=赤、データなし=灰、地図で確認=青） */
export function Badge({ tone, children, size = 12 }: { tone: Tone; children: ReactNode; size?: number }) {
  const t = TONE[tone];
  return (
    <span className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-[8px] font-bold leading-none" style={{ background: t.bg, color: t.fg, height: 24, fontSize: size }}>
      {children}
    </span>
  );
}

/** 3つ並べる小さな数字の札 */
export function Stat({ label, value, unit, note, bg = "#ffffff", small = false }: { label: string; value: string; unit?: string; note?: string; bg?: string; small?: boolean }) {
  return (
    <div className="min-w-0 rounded-[14px] px-[10px] py-[8px] shadow-[0_2px_8px_rgba(20,45,85,0.06)]" style={{ background: bg }}>
      <p className="truncate leading-none" style={{ fontSize: 11.5, color: LIGHT }}>
        {label}
      </p>
      <p className="mt-[6px] flex items-baseline truncate font-bold leading-none" style={{ fontSize: small ? 15 : 17, color: TEXT, height: 17 }}>
        {value}
        {unit && (
          <span className="ml-[2px] font-semibold" style={{ fontSize: 11 }}>
            {unit}
          </span>
        )}
      </p>
      <p className="mt-[5px] truncate leading-none" style={{ fontSize: 11, color: LIGHT, minHeight: 11 }}>
        {note}
      </p>
    </div>
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

/** 読み込み中・データなしの薄い字 */
export function Faint({ children = "確認中…" }: { children?: ReactNode }) {
  return (
    <span className="font-normal" style={{ color: FAINT }}>
      {children}
    </span>
  );
}

/** 読み込み中・読めなかった・データなしを分けて言う */
export function pendingText(status: string, none = "データなし"): string {
  return status === "loading" ? "確認中…" : status === "error" ? "読み込めず" : none;
}
