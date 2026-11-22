"use client";

// PC のオープニング映像（PC の画面だけ。スマホでは出さない）。映像の上に、アプリがロゴを描く（lib/app/opening.ts の logoFrame。
// 映像の時刻に合わせるので、読み込みで映像が止まればロゴも止まる）。音なし。画面を押す・キーを押すと飛ばせる。
// 最後は映像の白い雲（END の色）から、ホームへ溶けて変わる。流れ始めないとき（読み込みが遅い・映像が読めない）は流さない。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { arcMask, glintMask, logoBox, logoFrame, OPENING, OPENING_CREDIT, sweepMask, type LogoFrame } from "@/lib/app/opening";

const LETTERS = ["l0", "l1", "l2", "l3", "l4", "l5", "l6"] as const;
const PARTS = ["star", "arc", "mountain", "wave", ...LETTERS, "gold"] as const;
type Part = (typeof PARTS)[number];

function mask(el: HTMLElement | null, m: string) {
  if (!el) return;
  el.style.maskImage = m;
  el.style.setProperty("-webkit-mask-image", m);
}

export function DeskOpening({
  onDone,
  onLeave,
}: {
  onDone: () => void;
  /** 消え始めたとき（end：最後の白い雲に溶けて終わる・skip：飛ばした）。ホームの空気の層が、白い雲から晴れていくのに使う */
  onLeave?: (how: "skip" | "end") => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const parts = useRef<Partial<Record<Part, HTMLImageElement | null>>>({});
  const [leaving, setLeaving] = useState<"" | "skip" | "end">("");
  const [started, setStarted] = useState(false);
  const left = useRef(false);
  // 親が描き直すたびに onDone が新しくなっても、流し始め・時刻合わせをやり直さないように（いつも最新を呼ぶ）
  const done = useRef(onDone);
  const leaveCb = useRef(onLeave);
  useEffect(() => {
    done.current = onDone;
    leaveCb.current = onLeave;
  }, [onDone, onLeave]);

  const leave = useCallback((how: "skip" | "end") => {
    if (left.current) return;
    left.current = true;
    setLeaving(how);
    leaveCb.current?.(how);
    window.setTimeout(() => done.current(), how === "end" ? 1150 : 520);
  }, []);

  // ロゴの箱：映像を画面いっぱいに置いたときの、朝日の右の空（画面の大きさが変わったら置き直す）
  useLayoutEffect(() => {
    const place = () => {
      const b = logoBox(window.innerWidth, window.innerHeight);
      for (const el of [box.current, backdrop.current]) {
        if (!el) continue;
        el.style.left = `${b.left}px`;
        el.style.top = `${b.top}px`;
        el.style.width = `${b.width}px`;
        el.style.height = `${b.height}px`;
      }
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, []);

  // 映像の時刻に合わせてロゴを動かす（毎コマ、React を通さずに直接）
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const apply = (f: LogoFrame) => {
      const p = parts.current;
      if (box.current) box.current.style.opacity = String(f.all);
      if (backdrop.current) backdrop.current.style.opacity = String(f.backdrop);
      if (p.star) {
        p.star.style.opacity = String(f.star.opacity);
        p.star.style.filter = f.star.glow > 0.01 ? `brightness(${(1 + 0.7 * f.star.glow).toFixed(3)}) drop-shadow(0 0 ${(14 * f.star.glow).toFixed(1)}px rgba(255, 214, 150, ${(0.9 * f.star.glow).toFixed(3)}))` : "none";
      }
      if (p.arc) {
        p.arc.style.opacity = f.arc.on ? "1" : "0";
        mask(p.arc, arcMask(f.arc.from, f.arc.to));
      }
      if (p.mountain) {
        p.mountain.style.opacity = "1";
        mask(p.mountain, sweepMask(f.mountain));
      }
      if (p.wave) {
        p.wave.style.opacity = "1";
        mask(p.wave, sweepMask(f.wave));
      }
      LETTERS.forEach((k, i) => {
        const el = p[k];
        if (!el) return;
        el.style.opacity = f.letters[i].opacity.toFixed(3);
        el.style.filter = f.letters[i].blur > 0.05 ? `blur(${f.letters[i].blur.toFixed(2)}px)` : "none";
      });
      if (p.gold) {
        p.gold.style.opacity = f.glint.opacity.toFixed(3);
        mask(p.gold, glintMask(f.glint.at));
      }
    };
    let raf = 0;
    const tick = () => {
      apply(logoFrame(v.currentTime));
      if (v.currentTime >= OPENING.duration - 0.05) leave("end");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [leave]);

  // 流し始める。流れ始めない（読み込みが遅い・映像が読めない・自動で流すのを断られた）ときは流さない
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onPlaying = () => setStarted(true);
    const onError = () => leave("skip");
    const onEnded = () => leave("end");
    // 映像が読めないとき：<source> がどれも読めなければ、最後の <source> に error が来る
    const lastSource = v.querySelector("source:last-of-type");
    v.addEventListener("playing", onPlaying);
    v.addEventListener("error", onError);
    lastSource?.addEventListener("error", onError);
    v.addEventListener("ended", onEnded);
    v.play().catch(() => leave("skip"));
    const timer = window.setTimeout(() => {
      if (v.currentTime < 0.05) leave("skip");
    }, OPENING.startTimeout * 1000);
    return () => {
      clearTimeout(timer);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("error", onError);
      lastSource?.removeEventListener("error", onError);
      v.removeEventListener("ended", onEnded);
    };
  }, [leave]);

  // キーを押すと飛ばす（押したキーは使わない。続けて押せばいつもどおり）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      leave("skip");
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, [leave]);

  return (
    <div
      className="desk-opening"
      data-leaving={leaving || undefined}
      data-started={started ? "1" : undefined}
      style={{ "--opening-end": OPENING.endColor } as React.CSSProperties}
      onPointerDown={(e) => {
        if (e.button === 0) leave("skip");
      }}
      role="presentation"
    >
      <video ref={video} className="desk-opening-video" muted playsInline autoPlay preload="auto" disablePictureInPicture disableRemotePlayback aria-hidden tabIndex={-1}>
        {OPENING.sources.map((s) => (
          <source key={s.src} src={s.src} type={s.type} media={s.media} />
        ))}
      </video>
      <div ref={backdrop} className="desk-opening-backdrop" aria-hidden />
      <div ref={box} className="desk-opening-logo" aria-hidden>
        {PARTS.map((k) => (
          // eslint-disable-next-line @next/next/no-img-element -- 部品を同じ場所に重ね、毎コマ mask と濃さを変える（next/image は使わない）
          <img
            key={k}
            ref={(el) => {
              parts.current[k] = el;
            }}
            src={`/opening/logo/${k}.webp`}
            alt=""
            className={k === "gold" ? "is-glint" : undefined}
            draggable={false}
            decoding="async"
          />
        ))}
      </div>
      <p className="sr-only">MICHILU のオープニング映像です。画面を押すか、キーを押すと飛ばせます。</p>
      <button
        type="button"
        className="desk-opening-skip"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => leave("skip")}
      >
        スキップ
      </button>
      <p className="desk-opening-credit" onPointerDown={(e) => e.stopPropagation()}>
        <a href={OPENING_CREDIT.href} target="_blank" rel="noreferrer">
          {OPENING_CREDIT.text}
        </a>
        <span>{OPENING_CREDIT.sub}</span>
      </p>
    </div>
  );
}
