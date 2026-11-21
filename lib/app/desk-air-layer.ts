// PC のホームの「空気の層」（雲と影）を地図の上に置いて動かす（PC の地図＝skin "desk" だけ。スマホの地図には使わない）。
// 決まりごと（時間帯の濃さ・高さの差・晴れていく様子・通り抜ける様子）は lib/app/desk-air.ts。絵は Blender で描いたもの。
//  - 置き場所：地図の絵（canvas）の上、地図の道具（拡大・縮小・出典）と吹き出しの下（押せない・読み上げない）。
//  - 重くしない：地図を毎コマ描き直させない。地図が動いたときだけ、層の位置と大きさ（transform）と濃さを変える。風で流れる動き・
//    晴れていく動き・通り抜ける動きは Web Animations で、ブラウザの合成だけで動く（JavaScript は毎コマ動かない）。
//    流さない間は止め、見えない間は隠す。
//  - 層：下から、地面の影・積雲・巻雲、いちばん上にオープニングから晴れていくときの白い幕。どれも絵をくり返して敷いた板を、
//    1 周期ぶん東へずらす動きのくり返しで流す（影と積雲は同じ速さ・同じ時刻で、いつも重なる）
import type { Map as MapLibreMap } from "maplibre-gl";
import type { DeskTod } from "./desk";
import {
  AIR_DRIFT,
  AIR_FADE_MS,
  AIR_LOOK,
  AIR_PASS_MS,
  AIR_REVEAL_MS,
  AIR_TILE,
  airImages,
  airPass,
  airPlaneLook,
  airPlaneTransform,
  airReveal,
  airRunning,
  type AirIntro,
} from "./desk-air";
import type { HomeImageKey } from "./desk-home";

type Kind = "shadow" | "cumulus" | "cirrus";
const KINDS: Kind[] = ["shadow", "cumulus", "cirrus"];
/** 晴れていくときの大きさの分の、板のふちの余り（地図の画素） */
const MARGIN = 64;
/** 風で流れる 1 段（地図の画素）。段と段の間は何も変わらないので、ブラウザは描き直さなくてよい（ズーム 5 で 0.25 画素。段は見えない） */
const AIR_STEP = 0.25;
/** オープニングの最後の白（lib/app/opening.ts の OPENING.endColor と同じ） */
const END_WHITE = "#f3f1ec";
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

type Plane = {
  kind: Kind;
  /** 画面に合わせる（検索して降りるときに、画面の真ん中を中心に大きくなって消える） */
  pass: HTMLDivElement;
  /** 地図に合わせる（位置・大きさ・近づいて消える濃さ） */
  outer: HTMLDivElement;
  /** 風で流れる板 */
  drift: HTMLDivElement;
  /** 時間帯の絵（2 枚を溶かして替える） */
  slots: HTMLDivElement[];
  anim?: Animation;
};

export type DeskAir = {
  /** 上の帯の時間帯（変わったら、その時間帯の絵を読んで溶かして替える） */
  setTod(tod: DeskTod): void;
  /** 動きを出すか（false：流さない・高さの差を付けない・溶かさない・通り抜けない） */
  setMotion(motion: boolean): void;
  /** 物件を見ているか（見ている間は流さない） */
  setProperty(on: boolean): void;
  /** オープニングとのつなぎ */
  setIntro(intro: AirIntro): void;
  /** 検索して降り始めた（雲を通り抜ける） */
  pass(): void;
};

const AIRS = new WeakMap<MapLibreMap, DeskAir>();

/** 検索して降り始めたときに、空気の層の雲を通り抜けさせる（lib/app/desk-cinema.ts の flyToProperty から） */
export function deskAirPass(map: MapLibreMap): void {
  AIRS.get(map)?.pass();
}

function div(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const d = document.createElement("div");
  Object.assign(d.style, style);
  return d;
}

/** 絵を読み、描ける形にしておく（読み終えてから板に貼る。貼ったときに止まらないように） */
function decode(url: string): Promise<void> {
  const im = new Image();
  im.decoding = "async";
  im.src = url;
  return im.decode();
}

const mercY = (lat: number) => (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2;
const tiled: Partial<CSSStyleDeclaration> = {
  backgroundRepeat: "repeat",
  // 絵は 1 周期の大きさにのばす（影・厚い雲は半分の細かさで描いてある）
  backgroundSize: `${AIR_TILE}px ${AIR_TILE}px`,
  // 板の左上は絵の 1 周期と余りの分だけ外にあるので、模様の位置を合わせる（影と雲がいつも同じ所で重なる）
  backgroundPosition: `${MARGIN}px ${MARGIN}px`,
};

export function addDeskAir(map: MapLibreMap, init: { tod: DeskTod; motion: boolean; property: boolean; intro: AirIntro }): DeskAir {
  const had = AIRS.get(map);
  if (had) return had;
  const container = map.getContainer();
  const root = div({ position: "absolute", inset: "0", overflow: "hidden", pointerEvents: "none", contain: "strict", visibility: "hidden" });
  root.className = "desk-air";
  root.setAttribute("aria-hidden", "true");
  // 地図の道具（拡大・縮小・出典）と吹き出しより下に置く
  container.insertBefore(root, container.querySelector(".maplibregl-control-container"));

  let motion = init.motion;
  let property = init.property;
  // 地図ができたときに、もう晴れ始めていたら（地図の読み込みが遅かった）、ふだんどおり
  let intro: AirIntro = init.intro === "hold" ? "hold" : "none";
  let dead = false;
  let visible = false;
  let running: boolean | null = null;
  let size = { w: 0, h: 0 };

  const planes = {} as Record<Kind, Plane>;
  for (const kind of KINDS) {
    const pass = div({ position: "absolute", inset: "0" });
    const outer = div({ position: "absolute", left: "0", top: "0", transformOrigin: "0 0", willChange: "transform, opacity" });
    const drift = div({ position: "absolute", left: `${-AIR_TILE - MARGIN}px`, top: `${-MARGIN}px` });
    const slots = [0, 1].map(() => div({ position: "absolute", inset: "0", display: "none", opacity: "0", ...tiled }));
    drift.append(...slots);
    outer.append(drift);
    pass.append(outer);
    root.append(pass);
    planes[kind] = { kind, pass, outer, drift, slots };
  }
  // オープニングから晴れていくところ：積雲の板の中の厚い雲 2 枚（ふだんの雲と同じ所に雲の真ん中がある）と、白い幕
  const decks = [0, 1].map(() => {
    const d = div({ position: "absolute", inset: "0", display: "none", ...tiled });
    planes.cumulus.drift.append(d);
    return d;
  });
  const fill = div({ position: "absolute", inset: "0", display: "none", background: END_WHITE });
  root.append(fill);
  let decksReady = false;
  let revealAnims: Animation[] = [];
  let passAnims: Animation[] = [];

  /** 板の大きさ：画面に 1 周期と余りを足す（地図はズーム 5 より引かないので、地図の 1 画素は画面の 1 画素より小さくならない） */
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === size.w && h === size.h) return;
    size = { w, h };
    for (const k of KINDS) {
      planes[k].drift.style.width = `${2 * AIR_TILE + w + 2 * MARGIN}px`;
      planes[k].drift.style.height = `${AIR_TILE + h + 2 * MARGIN}px`;
    }
  };

  /** 地図に合わせて置く（地図が動いたときだけ） */
  const place = () => {
    if (dead) return;
    const c = map.getCenter();
    const z = map.getZoom();
    const p0 = map.project(c);
    const cx = (c.lng + 180) / 360;
    const cy = mercY(c.lat);
    let any = false;
    for (const k of KINDS) {
      const pl = planes[k];
      const look = airPlaneLook(k, z, motion);
      const on = look.opacity > 0.002;
      any ||= on;
      pl.outer.style.visibility = on ? "" : "hidden";
      if (!on) continue;
      const t = airPlaneTransform({ cx, cy, zoom: z, px: p0.x, py: p0.y, m: look.m });
      pl.outer.style.transform = `translate3d(${t.x.toFixed(2)}px,${t.y.toFixed(2)}px,0) scale(${t.scale.toFixed(5)})`;
      pl.outer.style.opacity = look.opacity.toFixed(3);
    }
    visible = any;
    root.style.visibility = any || intro !== "none" ? "" : "hidden";
    // 通り抜けたあと（もう見えない）は、次にホームへ戻ったときのために元に戻す
    if (!any && passAnims.length) {
      for (const a of passAnims) a.cancel();
      passAnims = [];
    }
    sync();
  };

  /** 流すか止めるか（変わったときだけ） */
  const sync = () => {
    const run = airRunning({ motion, hidden: document.visibilityState === "hidden", property, intro, visible });
    if (run === running) return;
    running = run;
    if (run) ensureDrift();
    for (const k of KINDS) {
      const a = planes[k].anim;
      if (!a) continue;
      if (run) a.play();
      else a.pause();
    }
  };

  /** 風で流れる動き（動きを出す設定で、初めて流すときに作る。影と積雲は同じ時刻で動かす） */
  const ensureDrift = () => {
    if (planes.cumulus.anim || typeof planes.cumulus.drift.animate !== "function") return;
    // 1 周期を、とても小さな段（AIR_STEP 画素）で進める。1 コマごとに 0.05 画素ずつ動かすと、毎コマ画面を合成し直すことになる
    const make = (k: Kind) =>
      (planes[k].anim = planes[k].drift.animate([{ transform: "translate3d(0px,0,0)" }, { transform: `translate3d(${AIR_TILE}px,0,0)` }], {
        duration: (AIR_TILE / (k === "cirrus" ? AIR_DRIFT.cirrus : AIR_DRIFT.cumulus)) * 1000,
        iterations: Infinity,
        easing: `steps(${Math.round(AIR_TILE / AIR_STEP)}, end)`,
      }));
    const cu = make("cumulus");
    const sh = make("shadow");
    make("cirrus");
    // 影と積雲は同じ時刻から（いつも重なる）
    if (cu.startTime != null) sh.startTime = cu.startTime;
  };

  // ---- 時間帯の絵（溶かして替える。溶かしている途中に選び直したら、溶かし終えてから次へ）
  let active = 0;
  let shown: HomeImageKey | null = null;
  let want: DeskTod = init.tod;
  let busy = false;

  const pump = () => {
    if (dead || busy) return;
    const img = airImages(want);
    if (img.key === shown) return;
    busy = true;
    const key = img.key;
    const look = AIR_LOOK[key];
    // 影の無い時間帯（夜）は影の絵を読まない
    const url = (k: Kind) => (k === "shadow" ? (look.shadow > 0 ? img.shadow : "") : img[k]);
    Promise.all(KINDS.map(url).filter(Boolean).map(decode))
      .then(() => {
        if (dead) return;
        const first = shown === null;
        const next = first ? active : 1 - active;
        const ms = motion ? AIR_FADE_MS : 0;
        for (const k of KINDS) {
          const s = planes[k].slots[next];
          s.style.transition = "none";
          s.style.opacity = "0";
          s.style.display = url(k) ? "block" : "none";
          s.style.backgroundImage = url(k) ? `url("${url(k)}")` : "";
        }
        // 出したばかりの板は、透明な状態を一度確定させてから溶かす（でないと、すぐ出てしまう）
        void root.offsetWidth;
        const tr = ms ? `opacity ${ms}ms ${EASE}` : "none";
        for (const k of KINDS) {
          const pl = planes[k];
          pl.slots[next].style.transition = tr;
          pl.slots[next].style.opacity = String(look[k]);
          if (!first) {
            pl.slots[active].style.transition = tr;
            pl.slots[active].style.opacity = "0";
          }
        }
        const done = () => {
          if (dead) return;
          if (!first) {
            // 前の絵を外す（覚えている分を空け、合成する板も減らす）
            for (const k of KINDS) {
              planes[k].slots[active].style.backgroundImage = "";
              planes[k].slots[active].style.display = "none";
            }
            active = next;
          }
          shown = key;
          busy = false;
          pump();
        };
        if (ms) window.setTimeout(done, ms + 50);
        else done();
      })
      .catch(() => {
        // 読めなかったら今のまま（次に時間帯が変わったときに、また読む）
        busy = false;
      });
  };

  // ---- オープニングとのつなぎ
  const loadDecks = () => {
    const img = airImages(want);
    const urls = [img.deckA, img.deckB];
    return Promise.all(urls.map(decode)).then(() => {
      decksReady = true;
      decks.forEach((d, i) => (d.style.backgroundImage = `url("${urls[i]}")`));
    });
  };

  const hideIntro = () => {
    for (const a of revealAnims) a.cancel();
    revealAnims = [];
    fill.style.display = "none";
    for (const d of decks) {
      d.style.display = "none";
      d.style.backgroundImage = "";
    }
    decksReady = false;
  };

  /** 画面の上の中心の点（雲の真下）の、積雲の板の中の位置（厚い雲を大きくする中心） */
  const deckOrigin = (): string => {
    const c = map.getCenter();
    const p0 = map.project(c);
    const look = airPlaneLook("cumulus", map.getZoom(), motion);
    const t = airPlaneTransform({ cx: (c.lng + 180) / 360, cy: mercY(c.lat), zoom: map.getZoom(), px: p0.x, py: p0.y, m: look.m });
    const a = planes.cumulus.anim;
    const period = (AIR_TILE / AIR_DRIFT.cumulus) * 1000;
    const d = a && typeof a.currentTime === "number" ? Math.floor(((a.currentTime % period) / period) * (AIR_TILE / AIR_STEP)) * AIR_STEP : 0;
    const x = (p0.x - t.x) / t.scale + AIR_TILE + MARGIN - d;
    const y = (p0.y - t.y) / t.scale + MARGIN;
    return `${x.toFixed(1)}px ${y.toFixed(1)}px`;
  };

  const hold = () => {
    fill.style.display = "block";
    fill.style.opacity = "1";
    const s = airReveal(0);
    void loadDecks()
      .then(() => {
        if (dead || intro !== "hold") return;
        const origin = deckOrigin();
        decks.forEach((d, i) => {
          d.style.display = "block";
          d.style.transformOrigin = origin;
          d.style.transform = `scale(${i ? s.scaleB : s.scaleA})`;
          d.style.opacity = "1";
        });
      })
      .catch(() => {
        // 厚い雲が読めなくても、白い幕だけで晴れていく
      });
  };

  const reveal = () => {
    // 0.1 秒ごとの様子を、なめらかにつなぐ（ブラウザの合成で動く）
    const steps = Math.round(AIR_REVEAL_MS / 100);
    const at = Array.from({ length: steps + 1 }, (_, i) => airReveal((i / steps) * (AIR_REVEAL_MS / 1000)));
    const opts: KeyframeAnimationOptions = { duration: AIR_REVEAL_MS, fill: "forwards" };
    revealAnims = [fill.animate(at.map((f) => ({ opacity: f.fill })), opts)];
    if (decksReady) {
      const origin = deckOrigin();
      decks.forEach((d, i) => {
        d.style.transformOrigin = origin;
        revealAnims.push(d.animate(at.map((f) => ({ opacity: i ? f.deckB : f.deckA, transform: `scale(${(i ? f.scaleB : f.scaleA).toFixed(4)})` })), opts));
      });
    }
    revealAnims[0].onfinish = () => {
      if (dead) return;
      intro = "none";
      hideIntro();
      place();
    };
  };

  const api: DeskAir = {
    setTod(tod) {
      want = tod;
      pump();
    },
    setMotion(m) {
      if (m === motion) return;
      motion = m;
      place();
    },
    setProperty(on) {
      if (on === property) return;
      property = on;
      sync();
    },
    setIntro(next) {
      if (next === "reveal" && intro === "hold") {
        intro = "reveal";
        reveal();
        place();
        return;
      }
      if (next === "none" && intro !== "none") {
        intro = "none";
        hideIntro();
        place();
      }
    },
    pass() {
      // 雲が見えているときだけ（動きを減らす設定では、検索しても短く寄るだけなので、ここへは来ない）
      if (!motion || !visible || dead || typeof root.animate !== "function") return;
      for (const a of passAnims) a.cancel();
      const p0 = map.project(map.getCenter());
      const steps = 13;
      passAnims = (["cumulus", "cirrus"] as const).map((k) => {
        const el = planes[k].pass;
        el.style.transformOrigin = `${p0.x.toFixed(1)}px ${p0.y.toFixed(1)}px`;
        const frames = Array.from({ length: steps + 1 }, (_, i) => airPass(k, ((i / steps) * AIR_PASS_MS) / 1000)).map((f) => ({
          transform: `scale(${f.scale.toFixed(4)})`,
          opacity: f.opacity,
        }));
        return el.animate(frames, { duration: AIR_PASS_MS, fill: "forwards" });
      });
    },
  };

  const onVisibility = () => sync();
  const onResize = () => {
    resize();
    place();
  };
  map.on("move", place);
  map.on("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  map.once("remove", () => {
    dead = true;
    map.off("move", place);
    map.off("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    for (const k of KINDS) planes[k].anim?.cancel();
    for (const a of [...revealAnims, ...passAnims]) a.cancel();
    root.remove();
  });

  resize();
  if (intro === "hold") hold();
  place();
  pump();
  AIRS.set(map, api);
  return api;
}
