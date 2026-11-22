"use client";

// スマホのオープニング「富士の目覚め」（その日に最初に開いたときだけ。html の data-launch が film のとき。決めるのは
// components/app/launch-script.ts）。映像の上に、アプリが映画の横長の帯・山頂から昇る光の点・ロゴを描く（lib/app/opening-sp.ts。
// 映像の時刻に合わせるので、読み込みで映像が止まれば、帯もロゴも止まる）。音なし。画面に触れると飛ばせる（その指では下の
// ボタンを押さない）。最後は映像とロゴがホームへ溶ける。流れ始めない（読み込みが遅い・映像が読めない・低電力モードで自動で
// 流れない）ときは待たせず、すぐホームを出す。React が動く前は、app/globals.css の紺の幕が覆っている（data-film で外す）
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { arcMask, glintMask, sweepMask, type LogoFrame } from "@/lib/app/opening";
import { SP_OPENING, SP_OPENING_CREDIT, spBars, spLogoBox, spLogoFrame, spPoint, spRise } from "@/lib/app/opening-sp";

const LETTERS = ["l0", "l1", "l2", "l3", "l4", "l5", "l6"] as const;
const PARTS = ["star", "arc", "mountain", "wave", ...LETTERS, "gold"] as const;
type Part = (typeof PARTS)[number];

function mask(el: HTMLElement | null, m: string) {
  if (!el) return;
  el.style.maskImage = m;
  el.style.setProperty("-webkit-mask-image", m);
}

export function FilmIntro() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (document.documentElement.getAttribute("data-launch") === "film") queueMicrotask(() => setOn(true));
  }, []);
  if (!on) return null;
  return <Film />;
}

function Film() {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const rise = useRef<HTMLSpanElement>(null);
  const parts = useRef<Partial<Record<Part, HTMLImageElement | null>>>({});
  const [leaving, setLeaving] = useState<"" | "skip" | "end">("");
  const [started, setStarted] = useState(false);
  const [gone, setGone] = useState(false);
  const left = useRef(false);

  const leave = useCallback((how: "skip" | "end") => {
    if (left.current) return;
    left.current = true;
    setLeaving(how);
    // 消えていく間も、触れた指は幕が受け止める（見えていないボタンを押さない）
    window.setTimeout(
      () => {
        const html = document.documentElement;
        html.setAttribute("data-launch", "done");
        html.removeAttribute("data-film");
        setGone(true);
      },
      how === "end" ? SP_OPENING.fadeOut * 1000 : 380,
    );
  }, []);

  // React が動く前の紺の幕（app/globals.css）を外し、こちらが覆う
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-film", "on");
  }, []);

  // ロゴの箱：映像を画面いっぱいに置いたときの、富士の上の空（画面の大きさが変わったら置き直す）
  useLayoutEffect(() => {
    const place = () => {
      const b = spLogoBox(window.innerWidth, window.innerHeight);
      const el = box.current;
      if (el) {
        el.style.left = `${b.left}px`;
        el.style.top = `${b.top}px`;
        el.style.width = `${b.width}px`;
        el.style.height = `${b.height}px`;
      }
      // 後ろを落ち着かせる層は、画面の上からロゴの少し下まで（撮影のグラデーションのフィルターのように。丸い影にしない）
      if (backdrop.current) backdrop.current.style.height = `${b.top + b.height * 1.35}px`;
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, []);

  // 映像の時刻に合わせて、帯・光の点・ロゴを動かす（毎コマ、React を通さずに直接）
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const applyLogo = (f: LogoFrame) => {
      const p = parts.current;
      // スマホの空（太陽のまわり）は PC より明るいので、後ろを少し強めに落ち着かせる（白い文字を読みやすく）
      if (backdrop.current) backdrop.current.style.opacity = Math.min(1, f.backdrop * 4.6).toFixed(3);
      if (p.star) {
        p.star.style.opacity = String(f.star.opacity);
        p.star.style.filter = f.star.glow > 0.01 ? `brightness(${(1 + 0.7 * f.star.glow).toFixed(3)}) drop-shadow(0 0 ${(10 * f.star.glow).toFixed(1)}px rgba(255, 214, 150, ${(0.9 * f.star.glow).toFixed(3)}))` : "none";
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
        // 文字のふちに、ごく弱い影（明るい空の上でも読める）
        el.style.filter = `${f.letters[i].blur > 0.05 ? `blur(${(f.letters[i].blur * 0.6).toFixed(2)}px) ` : ""}drop-shadow(0 0 3px rgba(12, 18, 34, 0.45))`;
      });
      if (p.gold) {
        p.gold.style.opacity = f.glint.opacity.toFixed(3);
        mask(p.gold, glintMask(f.glint.at));
      }
    };
    let raf = 0;
    const tick = () => {
      const t = v.currentTime;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const bar = `${spBars(t, vw, vh).toFixed(1)}px`;
      if (top.current) top.current.style.height = bar;
      if (bottom.current) bottom.current.style.height = bar;
      const r = spRise(t);
      if (rise.current) {
        const pt = spPoint(vw, vh, r.x, r.y);
        rise.current.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px)`;
        rise.current.style.opacity = r.opacity.toFixed(3);
      }
      applyLogo(spLogoFrame(t));
      if (t >= SP_OPENING.duration - 0.05) leave("end");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [leave]);

  // 流し始める。流れ始めない（読み込みが遅い・映像が読めない・自動で流すのを断られた）ときは、すぐホームへ
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onPlaying = () => setStarted(true);
    const onError = () => leave("skip");
    const onEnded = () => leave("end");
    const lastSource = v.querySelector("source:last-of-type");
    v.addEventListener("playing", onPlaying);
    v.addEventListener("error", onError);
    lastSource?.addEventListener("error", onError);
    v.addEventListener("ended", onEnded);
    v.play().catch(() => leave("skip"));
    const timer = window.setTimeout(() => {
      if (v.currentTime < 0.05) leave("skip");
    }, SP_OPENING.startTimeout * 1000);
    // ほかのアプリへ移った（画面が隠れた）ら、戻ったときにはホームから
    const onHide = () => {
      if (document.visibilityState === "hidden") leave("skip");
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearTimeout(timer);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("error", onError);
      lastSource?.removeEventListener("error", onError);
      v.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [leave]);

  if (gone) return null;
  return (
    <div
      className="film"
      data-leaving={leaving || undefined}
      data-started={started ? "1" : undefined}
      onPointerDown={(e) => {
        e.preventDefault();
        leave("skip");
      }}
      role="presentation"
    >
      <video ref={video} className="film-video" muted playsInline autoPlay preload="auto" disablePictureInPicture disableRemotePlayback aria-hidden tabIndex={-1}>
        {SP_OPENING.sources.map((s) => (
          <source key={s.src} src={s.src} type={s.type} />
        ))}
      </video>
      <div ref={top} className="film-bar is-top" aria-hidden />
      <div ref={bottom} className="film-bar is-bottom" aria-hidden />
      <span ref={rise} className="film-rise" aria-hidden />
      <div ref={backdrop} className="film-backdrop" aria-hidden />
      <div ref={box} className="film-logo" aria-hidden>
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
      <p className="sr-only">MICHILU のオープニング映像です。画面に触れると飛ばせます。</p>
      <p className="film-credit" onPointerDown={(e) => e.stopPropagation()}>
        <a href={SP_OPENING_CREDIT.href} target="_blank" rel="noreferrer">
          {SP_OPENING_CREDIT.text}
        </a>
      </p>
      <button
        type="button"
        className="film-skip"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          leave("skip");
        }}
      >
        スキップ
      </button>
    </div>
  );
}
