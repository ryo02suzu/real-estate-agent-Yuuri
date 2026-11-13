"use client";

// 下のメニューの4ページ（検索＝ホーム・お気に入り・履歴・書類・出力）の上の帯。どのページも同じ位置・大きさのロゴ（マーク＋MICHILU）と
// 右上のメニュー（≡）にそろえ、ページを切り替えてもロゴは動かない（4ページで1つのアプリに見えるように）。
// その下はページの名前：英字の小見出し（ロゴの字と同じ Jost）・大きな見出し・件数（Jost の数字。開くと 0 から数え上がる）。
// ホームは名前の代わりに「不動産の現場に、すぐ使える情報を。」。どちらも同じ場所・同じ高さ（50pt）なので、ページを切り替えても
// 検索欄の位置は変わらない。開いたときの動き（線が伸び・英字が締まり・見出しが下から現れる）は app/globals.css の .pt-*。
// ページを切り替えるつながる動き（components/app/mobile-app.tsx の tabTo）では、data-vt-tab の名前（app-brand・page-title）で
// ロゴは止めたまま、前のページの名前だけが上へ抜けて入れ替わる
import { Menu } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PhoneImg } from "./frame";
import { HIT, LIGHT_GLASS, SHADOW } from "./home";
import { reducedMotion } from "./tokens";

/** 英字（ロゴの MICHILU と同じ書体） */
const LATIN = "var(--font-jost), sans-serif";

/**
 * 右上のメニュー（≡）。まだ見ていないお知らせがあれば赤い印。data-menu-button は、開いたメニューがこのボタンの所から広がるための目印
 * （components/app/app-menu.tsx）
 */
export function MenuButton({ onMenu, unread }: { onMenu: () => void; unread: boolean }) {
  return (
    <button onClick={onMenu} data-menu-button aria-label={unread ? "メニュー（新しいお知らせがあります）" : "メニュー"} className="press relative flex shrink-0 items-center justify-center rounded-full" style={{ ...LIGHT_GLASS, width: 46, height: 46, minWidth: HIT, minHeight: HIT }}>
      <Menu size={22} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
      {unread && <span className="absolute rounded-full border-2 border-white bg-[#f0263a]" style={{ right: 2, top: 2, width: 11, height: 11 }} />}
    </button>
  );
}

/**
 * 上の帯：ロゴ（マーク＋MICHILU。ホームと同じ位置・大きさ）と右上のメニュー。
 * logoClass はロゴだけに付ける動き（ホームの起動の受け渡し・履歴のスクロールで薄れる）
 */
export function BrandBar({ onMenu, unread, logoClass = "" }: { onMenu: () => void; unread: boolean; logoClass?: string }) {
  return (
    <div data-vt-tab="app-brand" className="relative flex items-start justify-between" style={{ padding: "16px 18px 0 20px" }}>
      <PhoneImg src="/home/logo-mark-white.webp" alt="MICHILU" width={802} height={159} draggable={false} className={`block ${logoClass}`} style={{ height: 30, width: "auto", marginTop: 6, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
      <MenuButton onMenu={onMenu} unread={unread} />
    </div>
  );
}

/**
 * 数え上がる件数（開いたときは 0 から、件数が変わったときは前の数から、0.6 秒ほどで）。動きを減らす設定では、そのまま出す。
 * 数は requestAnimationFrame の中で入れる（描くたびに数を変えない）
 */
export function useCountUp(target: number, from0: boolean): number {
  const [n, setN] = useState(() => (from0 && !reducedMotion() ? 0 : target));
  const shown = useRef(n);
  useEffect(() => {
    const start = shown.current;
    if (start === target) return;
    let frame = 0;
    if (reducedMotion()) {
      frame = requestAnimationFrame(() => {
        shown.current = target;
        setN(target);
      });
      return () => cancelAnimationFrame(frame);
    }
    // 少し遅れて数え始める（見出しが現れてから）。差が大きいほど少し長く
    const wait = start === 0 ? 160 : 0;
    const ms = Math.min(760, 420 + Math.abs(target - start) * 4);
    let t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t + wait;
      const p = Math.min(1, Math.max(0, (t - t0) / ms));
      const e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (target - start) * e);
      shown.current = v;
      setN(v);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return n;
}

/** 件数（Jost の数字と「件」。読み上げは最後の数だけ） */
function Count({ value, from0 }: { value: number; from0: boolean }) {
  const n = useCountUp(value, from0);
  return (
    <p className="pt-count shrink-0 whitespace-nowrap" style={{ textShadow: SHADOW }}>
      <span aria-hidden style={{ fontFamily: LATIN, fontSize: 22, fontWeight: 400, lineHeight: "34px", fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>
        {n}
      </span>
      <span aria-hidden style={{ fontSize: 12, marginLeft: 3, color: "rgba(255,255,255,0.82)" }}>
        件
      </span>
      <span className="sr-only">{value}件</span>
    </p>
  );
}

/**
 * ページの名前：細い線と英字の小見出し、大きな見出し、件数（count。0 件のときは出さない）。
 * intro は開いたときの動き（線が伸び・英字が締まり・見出しが下から現れ・件数が数え上がる）を付けるか
 * （ホームの最近の検索から行がつながってくる動き・物件から戻ったときは付けない）
 */
export function PageTitle({ en, ja, count, intro = true, className = "", style }: { en: string; ja: string; count?: number; intro?: boolean; className?: string; style?: CSSProperties }) {
  // 動きを付けるかは置いたときに決める（つながる動きが終わって intro が変わっても、あとから動き出さない）
  const [anim] = useState(intro);
  return (
    <div data-vt-tab="page-title" className={`relative ${anim ? "pt-in" : ""} ${className}`} style={{ margin: "14px 20px 0", height: 50, ...style }}>
      <p aria-hidden className="flex items-center" style={{ gap: 8, height: 14 }}>
        <span className="pt-rule block shrink-0" style={{ width: 18, height: 1, background: "rgba(255,255,255,0.72)", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
        <span className="pt-en block whitespace-nowrap" style={{ fontFamily: LATIN, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.34em", lineHeight: "14px", color: "rgba(255,255,255,0.84)", textShadow: SHADOW }}>
          {en}
        </span>
      </p>
      <div className="flex items-baseline" style={{ gap: 12, marginTop: 2 }}>
        {/* 見出しは下の線から現れる（箱の外は見せない。字の影の分だけ下を空ける） */}
        <h1 className="pt-mask min-w-0 overflow-hidden" style={{ paddingBottom: 2, marginBottom: -2 }}>
          <span className="pt-ja block truncate font-bold" style={{ fontSize: 28, lineHeight: "34px", letterSpacing: "0.08em", textShadow: SHADOW }}>
            {ja}
          </span>
        </h1>
        {count !== undefined && count > 0 && <Count value={count} from0={anim} />}
      </div>
    </div>
  );
}

/**
 * ホームのひとこと（「不動産の現場に、／すぐ使える情報を。」）。ページの名前と同じ場所・高さ。
 * intro のときは1行ずつ下から現れる（ほかのページから戻ったとき・開いたとき）
 */
export function HomeLead({ intro }: { intro: boolean }) {
  const [anim] = useState(intro);
  return (
    <div data-vt-tab="page-title" className={`relative ${anim ? "pt-in" : ""}`} style={{ margin: "14px 20px 0", height: 50 }}>
      <p className="font-medium" style={{ fontSize: 15.5, lineHeight: 1.6, letterSpacing: 1.6, textShadow: SHADOW }}>
        <span className="pt-mask block overflow-hidden">
          <span className="pt-ja block">不動産の現場に、</span>
        </span>
        <span className="pt-mask block overflow-hidden">
          <span className="pt-ja pt-ja2 block">すぐ使える情報を。</span>
        </span>
      </p>
    </div>
  );
}
