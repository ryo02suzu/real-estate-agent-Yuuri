"use client";

// 時間連動の空（ホームの帯・各ページの帯）。天体の計算は lib/app/sun.ts、CSS 変数は lib/app/sky-vars.ts。
// ここは描く側：写真4枚（昼・夕方・薄暮・夜）の重ね、地平線の光、各ページの帯の空の色、スクロールで縮む帯の仕組み。
// 太陽本体は、写真のカメラの向き・画角が設定されるまで描かない（--sun-in が 1 のときだけ）
import { useEffect, type CSSProperties, type ReactNode, type RefObject } from "react";
import { applySky } from "@/lib/app/sky-vars";
import { PhoneImg } from "./frame";
import { PAGE } from "./tokens";

/** 空を入れ直したときに知らせる（時刻・電池の帯の色を合わせる。components/app/mobile-app.tsx） */
export const SKY_EVENT = "michilu:sky";

/** 1分ごと（分の頭）・バックグラウンドから戻ったとき・#t= が変わったときに空を入れ直す。スマホの画面の根元で1回呼ぶ */
export function useSkyClock() {
  useEffect(() => {
    const tick = () => {
      applySky();
      dispatchEvent(new Event(SKY_EVENT));
    };
    tick();
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          tick();
          schedule();
        },
        60_000 - (Date.now() % 60_000) + 50,
      );
    };
    schedule();
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    addEventListener("hashchange", tick);
    addEventListener("pageshow", tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      removeEventListener("hashchange", tick);
      removeEventListener("pageshow", tick);
    };
  }, []);
}

/** 今の時刻・電池の帯の色（空の上端）。まだ入っていなければ null */
export function skyTop(): string | null {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--sky-top").trim();
  return v || null;
}

/**
 * スクロールで帯を縮める。根元の要素に --scroll（px）と data-compact（しきい値を越えたら "1"）を付ける。
 * 写真は .shrink-photo（半分の速さで上へ）、見出しは .shrink-title（薄れる）、上に残るバーは .compact-bar（app/globals.css）。
 * スクロールする要素は、根元から見て最も近い [data-scroller]
 */
export function useShrink(root: RefObject<HTMLElement | null>, threshold: number) {
  useEffect(() => {
    const el = root.current;
    const scroller = el?.closest<HTMLElement>("[data-scroller]");
    if (!el || !scroller) return;
    let compact = false;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const y = Math.max(0, scroller.scrollTop);
      // 小刻みに出たり消えたりしないよう、出すときと戻すときで 24px の差をつける
      const next = compact ? y > threshold - 24 : y > threshold;
      const changed = next !== compact;
      compact = next;
      writeShrink(el, Math.min(y, 400), changed ? compact : null);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      writeShrink(el, null, false);
    };
  }, [root, threshold]);
}

/** 根元の要素に --scroll と data-compact を書く（null の --scroll は外す。compact が null なら変えない） */
function writeShrink(el: HTMLElement, scroll: number | null, compact: boolean | null) {
  if (scroll === null) el.style.removeProperty("--scroll");
  else el.style.setProperty("--scroll", String(scroll));
  if (compact === true) el.dataset.compact = "1";
  else if (compact === false) delete el.dataset.compact;
}

const PHOTOS = ["day", "golden", "twilight", "night"] as const;

/**
 * ホームの帯の写真（幅393×高さ275pt の切り抜き。public/home/sky）。4枚を重ね、不透明度を空の変数で混ぜる。
 * その上に地平線の光（空のマスクの中だけ）と、カメラ設定後だけの太陽本体
 */
export function SkyPhotos() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {PHOTOS.map((k) => (
        <PhoneImg
          key={k}
          src={`/home/sky/${k}@2x.webp`}
          srcSet={`/home/sky/${k}@2x.webp 2x, /home/sky/${k}@3x.webp 3x`}
          alt=""
          width={786}
          height={550}
          draggable={false}
          className="sky-layer absolute inset-0 h-full w-full object-cover"
          style={{ opacity: `var(--sky-${k}, ${k === "day" ? 1 : 0})` }}
        />
      ))}
      {/* 太陽本体（カメラの向き・画角を設定したときだけ。建物の後ろに隠れるよう、空のマスクの中だけに描く） */}
      <div className="sky-layer absolute inset-0" style={{ opacity: "var(--sun-in, 0)", ...SKY_MASK }}>
        <div
          className="absolute rounded-full"
          style={{
            left: "calc(var(--sun-x, 0.5) * 100%)",
            top: "calc(var(--sun-y, 0.5) * 100%)",
            width: 18,
            height: 18,
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, #fffdf2 0%, #ffe9b0 45%, rgba(255,220,150,0) 72%)",
            boxShadow: "0 0 24px 10px rgba(255,214,140,0.55), 0 0 80px 40px rgba(255,190,110,0.25)",
          }}
        />
      </div>
      {/* 地平線の光（太陽が地平線の近くのときに強い。空のマスクの中だけ） */}
      <div
        className="sky-layer absolute inset-0"
        style={{
          opacity: "calc(var(--sky-glow-a, 0) * 0.55)",
          background: "radial-gradient(75% 42% at 50% 58%, var(--sky-glow, #ffb278) 0%, rgba(255,180,120,0) 70%)",
          mixBlendMode: "screen",
          ...SKY_MASK,
        }}
      />
    </div>
  );
}

/** 空のマスク（空が白＝見える。建物は見えない） */
const SKY_MASK: CSSProperties = {
  maskImage: "url(/home/sky/sky-mask.png)",
  WebkitMaskImage: "url(/home/sky/sky-mask.png)",
  maskSize: "100% 100%",
  WebkitMaskSize: "100% 100%",
};

export type WashVariant = "sky" | "warm" | "paper" | "blue";

/**
 * 各ページの帯の背景（写真が届くまで）。空の色（上端→中ほど→地平線）は時間とともに変わる。
 * sky：履歴（東京のスカイラインの影つき）、warm：お気に入り（少し暖かく）、paper：書類・出力（図面風の格子と差し込む光）、
 * blue：その他（ブルーのグラデーション）。下は見出しが読めるよう少し暗くする
 */
export function SkyWash({ variant }: { variant: WashVariant }) {
  const sky = "linear-gradient(180deg, var(--sky-top, #7bb9e8) 0%, var(--sky-mid, #b0d7ef) 55%, var(--sky-horizon, #bfccda) 100%)";
  const skyline = (
    <div
      aria-hidden
      className="absolute inset-x-0 bottom-0"
      style={{
        height: 70,
        background: "rgba(15, 35, 70, calc(0.16 + var(--sky-nightness, 0) * 0.5))",
        maskImage: "url(/home/sky/skyline.png)",
        WebkitMaskImage: "url(/home/sky/skyline.png)",
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
      }}
    />
  );
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="sky-layer absolute inset-0" style={{ background: sky }} />
      {variant === "warm" && <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(255,214,170,0.18) 0%, rgba(255,200,150,0.28) 100%)" }} />}
      {variant === "paper" && (
        <>
          <div className="absolute inset-0" style={{ background: "rgba(236, 242, 249, calc(0.55 - var(--sky-nightness, 0) * 0.35))" }} />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "linear-gradient(rgba(19,54,100,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(19,54,100,0.12) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              opacity: "calc(1 - var(--sky-nightness, 0) * 0.5)",
            }}
          />
          <div className="sky-layer absolute inset-0" style={{ background: "radial-gradient(70% 90% at calc(var(--sky-light-x, 30) * 1%) 0%, var(--sky-hl, #fff) 0%, rgba(255,255,255,0) 70%)", opacity: 0.6 }} />
        </>
      )}
      {variant === "blue" && (
        <>
          <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, rgba(19,54,100,0.35) 0%, rgba(19,54,100,0) 50%, rgba(61,123,255,0.25) 100%)" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(55% 70% at 85% 20%, rgba(34,193,238,0.35) 0%, rgba(34,193,238,0) 70%), radial-gradient(60% 60% at 10% 100%, rgba(110,140,255,0.35) 0%, rgba(110,140,255,0) 70%)" }} />
        </>
      )}
      {(variant === "sky" || variant === "warm") && skyline}
      {/* 見出しが読めるよう、下を少し暗く */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,25,50,0.06) 0%, rgba(10,25,50,0) 30%, rgba(10,25,50,0.16) 55%, rgba(10,25,50,0.62) 100%)" }} />
    </div>
  );
}

/** 帯の下端を、ページの地の色へ溶かす */
export function BottomFade({ height = 40 }: { height?: number }) {
  return <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height, background: `linear-gradient(180deg, rgba(243,246,251,0) 0%, ${PAGE} 100%)` }} />;
}

/**
 * スクロールしたときに上に残るバー（高さ 56pt）。根元に data-compact="1" が付いたら下りてくる。
 * 置く場所は、スクロールする中身のいちばん上（sticky）
 */
export function CompactBar({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none sticky top-0 z-20 h-0">
      <div className="compact-bar pointer-events-auto flex items-center gap-[8px] px-[12px]" style={{ height: 56, background: "rgba(243,246,251,0.86)", backdropFilter: "blur(14px) saturate(1.4)", WebkitBackdropFilter: "blur(14px) saturate(1.4)", boxShadow: "0 1px 0 rgba(20,45,85,0.08)" }}>
        {children}
      </div>
    </div>
  );
}
