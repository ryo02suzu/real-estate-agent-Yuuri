// 物件の画面の「街の模型」（スマホ）。three.js（使うときだけ読む）で、調べた土地のまわり約280mの建物・道路・水と、筆の線・調べた土地の
// 光る輪郭を描く。材料は lib/app/town-model.ts（国土地理院の最適化ベクトルタイル）と lib/app/scene-lots.ts（筆・用途地域の形）。
// 空と光は時間帯（昼・夕方・夜。lib/app/sun.ts の dayPart）と今の太陽の向き。夜は窓と街灯が灯る。
// タブで見せ方が変わる：概要（全体）・道路（前の道路に光が流れる）・法令（用途地域の色を地面に）・ハザード（ハザードマップの色を地面に、
// 想定の深さの水と目盛り）・周辺（駅への光の道・施設の印）・相場（地価の地点への光の道と柱）。
// 着いたとき：上から降りて、建物が土地に近い順に建ち上がり、土地の輪郭が描かれる。指で横になぞると回り、2本指で寄る。2回たたくと元の向き。
// 土地を押すと光の輪。材料は届いた順に足す（建物・筆の線・用途地域・施設の印を、そのたびに作り直さない）。
// 描くのは動いているときだけ。着いたあとのゆっくりした回転と光の揺らぎは、触ってから 20 秒で止める（電池のため）。
// 動きの演出がオフ・動きを減らす設定では、着地・回転・光の流れをしない。札（HTML）は模型の点に合わせて重ね、見出しやシートに重なれば隠す
import type * as T from "three";
import type { SceneFill, SceneShape } from "@/lib/app/scene-lots";
import type { TownModel, XZ } from "@/lib/app/town-model";

type Three = typeof import("three");

export type SceneTab = "basic" | "road" | "law" | "hazard" | "around" | "price";
export type ScenePart = "day" | "evening" | "night";
/** 建物・道路・水と、調べた土地（無ければ地点だけ）。front は土地に接する道路（town.roads の番号） */
export type SceneBase = { town: TownModel; target: SceneShape | null; center: XZ; front: number[] };
/** まわりの筆（neighbor は隣の土地。key は隣の土地の「地番区域|登記の地番」で、たたいて選ぶときに使う） */
export type SceneLot = SceneShape & { neighbor: boolean; key?: string };
export type SceneZone = { fill: SceneFill; color: string };
export type ScenePin = { at: XZ; color: string; tabs: SceneTab[]; size?: number };
/** 駅といちばん近い地価の地点（光の道）、施設の印、地価の柱（高さは m） */
export type SceneMarks = { station: XZ | null; price: XZ | null; pins: ScenePin[]; bars: { at: XZ; height: number }[] };
/** 模型に重ねる札。tabs は出すタブ（"all" はいつも、"nb" は隣の土地を出しているとき） */
export type SceneLabel = { key: string; title: string; sub?: string; color?: string; at: [number, number, number]; tabs: SceneTab[] | "all" | "nb"; kind?: "lot" | "nb" | "big" };
/** 画面の四角（px） */
export type ScreenRect = { l: number; t: number; r: number; b: number };
/**
 * 画面の割り付け（px。模型の箱の左上から）。centerY は土地を置く高さ、sheetTop はシートの上の端（札はこれより下に出さない）、
 * topLimit は上のボタンの下、avoid は見出しの字の行ごとの四角（札を重ねない）、cover はシートが模型を覆った割合（0〜1）
 */
export type SceneLayout = { centerY: number; sheetTop: number; topLimit: number; avoid: ScreenRect[]; cover: number };

export type PropertyScene = {
  setBase(base: SceneBase): void;
  setLots(lots: SceneLot[]): void;
  setZones(zones: SceneZone[]): void;
  setMarks(marks: SceneMarks): void;
  setLabels(labels: SceneLabel[]): void;
  setTab(tab: SceneTab): void;
  setPart(part: ScenePart): void;
  /** 今の太陽（度。方位は北0°の時計回り） */
  setSun(sun: { az: number; alt: number }): void;
  setMotion(on: boolean): void;
  setNeighbors(on: boolean): void;
  /** 選んだ隣の土地（SceneLot の key）。模型では濃い金色に塗り、札にチェックを付ける */
  setPicked(keys: string[]): void;
  /** ハザードの種類を変えた：地面に敷く絵（無ければ消す）と、水の高さ（m。0 で水なし） */
  setHazard(image: HTMLCanvasElement | null, bounds: { x0: number; z0: number; x1: number; z1: number } | null, depth: number): void;
  setLayout(l: SceneLayout): void;
  setVisible(v: boolean): void;
  resize(): void;
  pointerDown(e: PointerEvent): void;
  pointerMove(e: PointerEvent): void;
  pointerUp(e: PointerEvent): void;
  pointerCancel(e: PointerEvent): void;
  /**
   * 直前に土地をたたいたか（たたいた印は1回で消える）。物件の画面は、たたいた後の click でこれを見て地番の画面を開く
   * （pointerup で開くと、すぐ後の click が開いた画面の外側に当たって閉じてしまうため）
   */
  takeLotTap(): boolean;
  /** 直前に隣の土地をたたいたか（隣の土地を出しているときだけ。たたいた印は1回で消える）。たたいた土地の key */
  takeNeighborTap(): string | null;
  /** 2本指のトラックパッド（ctrl＋ホイール）で寄る */
  wheel(e: WheelEvent): void;
  dispose(): void;
};

/** 時間帯ごとの光と色（白い建物の模型の見え方。夜は窓と街灯） */
const THEMES: Record<
  ScenePart,
  { fog: string; fogNear: number; fogFar: number; hemiSky: string; hemiGround: string; hemi: number; sun: string; sunI: number; ground: string; road: string; walls: string; roof: string; water: string; lot: string; lotA: number; win: number; lamps: number; glow: number; gold: string; add: boolean; flow: string; route: string }
> = {
  day: { fog: "#dbe5f0", fogNear: 420, fogFar: 1700, hemiSky: "#eaf2ff", hemiGround: "#8e9bb0", hemi: 0.52, sun: "#fff4e2", sunI: 0.95, ground: "#cdd5de", road: "#f2f4f7", walls: "#f5f6f8", roof: "#e8ecf1", water: "#7aa6d2", lot: "#3b4a66", lotA: 0.2, win: 0, lamps: 0, glow: 0.62, gold: "#e9a320", add: false, flow: "#ec9512", route: "#2a78e4" },
  evening: { fog: "#e3ae8f", fogNear: 330, fogFar: 1400, hemiSky: "#ffd6b8", hemiGround: "#5a5272", hemi: 0.5, sun: "#ffb072", sunI: 1.2, ground: "#c6b0a8", road: "#e3cbbd", walls: "#f2e3d8", roof: "#e1ccc0", water: "#9b7b8e", lot: "#fff0de", lotA: 0.24, win: 0.5, lamps: 0.55, glow: 0.8, gold: "#ffc65a", add: true, flow: "#ffe0a6", route: "#9fd0ff" },
  night: { fog: "#111c36", fogNear: 280, fogFar: 1250, hemiSky: "#5a6fa3", hemiGround: "#090c16", hemi: 0.26, sun: "#a7bdf5", sunI: 0.3, ground: "#1b2335", road: "#2b3a56", walls: "#b9c4da", roof: "#9aa6bf", water: "#14223f", lot: "#ffd98a", lotA: 0.24, win: 1.3, lamps: 1, glow: 1.05, gold: "#ffd27a", add: true, flow: "#ffe0a6", route: "#9fd0ff" },
};
/** 空の色（上・中・地平線）。地平線はかすみ（fog）の色とそろえる */
export const SKY: Record<ScenePart, [string, string, string]> = {
  day: ["#4a7fc6", "#9fc0e6", "#dbe5f0"],
  evening: ["#283a69", "#a96c76", "#e3ae8f"],
  night: ["#03060f", "#091431", "#111c36"],
};
/** 上の字を読みやすくする影の色と濃さ（物件の画面の上の端） */
export const SHADE = { rgb: [6, 12, 26] as const, alpha: 0.6 };
/** 時刻・電池の帯の色（空の上の色に影を重ねた色） */
export function sceneTop(part: ScenePart): string {
  const h = SKY[part][0];
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const m = c.map((v, i) => Math.round(v * (1 - SHADE.alpha) + SHADE.rgb[i] * SHADE.alpha));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 点（x, z）が輪の中か */
function inRing(x: number, z: number, ring: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const E = {
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  out5: (t: number) => 1 - Math.pow(1 - t, 5),
};
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 着いたあとのゆっくりした動きを続ける時間（ms。触るたびに延びる） */
const AMBIENT_MS = 20_000;
/** 寄れる範囲（m） */
const MIN_DIST = 45;
const MAX_DIST = 1400;

type Tween = { start: number; dur: number; e: (t: number) => number; update: (t: number) => void; done?: () => void };
type Cam = { tx: number; ty: number; tz: number; dist: number; polar: number; azim: number };
type Preset = { t: [number, number, number]; dist: number; polar: number; azim: number };
type Fade = "front" | "zone" | "flood" | "gauge" | "nb" | "route" | "pins" | "bars" | "haz" | "lots";

/** 使い終わったら捨てる物の袋（作り直す部品ごと） */
class Bag {
  items: { dispose(): void }[] = [];
  keep<D extends { dispose(): void }>(d: D): D {
    this.items.push(d);
    return d;
  }
  dispose() {
    for (const d of this.items) d.dispose();
    this.items = [];
  }
}

/** 模型を作る（WebGL が使えなければ null） */
export async function createPropertyScene(host: HTMLElement, labelHost: HTMLElement, opts: { reduced: boolean }): Promise<PropertyScene | null> {
  const THREE: Three = await import("three");
  let renderer: T.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const REDUCE = opts.reduced;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;opacity:0;transition:opacity .6s ease";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 400, 1600);
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 6000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  const big = renderer.capabilities.maxTextureSize >= 8192 && Math.min(innerWidth, innerHeight) > 600;
  sun.shadow.mapSize.set(big ? 4096 : 2048, big ? 4096 : 2048);
  Object.assign(sun.shadow.camera, { left: -310, right: 310, top: 310, bottom: -310, near: 10, far: 1600 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(hemi, sun, sun.target);

  const U = { rise: { value: 0 }, time: { value: 0 } };
  const shared = new Bag();
  const col = (h: string) => new THREE.Color(h);

  // ---- 小さな道具
  const canvasTex = (bag: Bag, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!, w, h);
    const t = bag.keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const radialTex = (stops: [number, string][]) =>
    canvasTex(shared, 128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (const [o, c] of stops) gr.addColorStop(o, c);
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
  const shapeOf = (f: SceneFill) => {
    const s = new THREE.Shape(f.outer.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const h of f.holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    return s;
  };
  const flat = (bag: Bag, geo: T.BufferGeometry, mat: T.Material, y: number) => {
    const m = new THREE.Mesh(bag.keep(geo), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  };
  const riseMat = <M extends T.Material>(bag: Bag, m: M): M => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRise = U.rise;
      sh.vertexShader =
        "attribute float aDelay;\nuniform float uRise;\n" +
        sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nfloat rk = clamp((uRise * 1.7 - aDelay) / 0.7, 0.0, 1.0);\nrk = 1.0 - pow(1.0 - rk, 3.0);\ntransformed.y *= max(rk, 0.003);");
    };
    return bag.keep(m);
  };
  /** 線を幅のある帯にする（上向きの面。u は長さ方向の m/7） */
  const ribbon = (bag: Bag, lines: { line: XZ[]; width: number }[], y: number, ext: boolean) => {
    const pos: number[] = [];
    const uv: number[] = [];
    for (const { line, width: w } of lines) {
      let acc = 0;
      for (let i = 0; i < line.length - 1; i++) {
        let [x0, z0] = line[i];
        let [x1, z1] = line[i + 1];
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        if (len < 0.01) continue;
        const ux = dx / len;
        const uz = dz / len;
        const nx = (-uz * w) / 2;
        const nz = (ux * w) / 2;
        if (ext) {
          x0 -= ux * w * 0.4;
          z0 -= uz * w * 0.4;
          x1 += ux * w * 0.4;
          z1 += uz * w * 0.4;
        }
        pos.push(x0 + nx, y, z0 + nz, x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz, x0 + nx, y, z0 + nz, x1 - nx, y, z1 - nz, x0 - nx, y, z0 - nz);
        const u0 = acc / 7;
        const u1 = (acc + len) / 7;
        uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
        acc += len;
      }
    }
    const g = bag.keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const flowMat = (bag: Bag, color: string) =>
    bag.keep(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: U.time, uA: { value: 0 }, uCol: { value: col(color) }, uAdd: { value: 1 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        // 暗い時間は足し合わせて光らせ（uAdd 1）、昼は普通に重ねる（白い道路の上でも見えるように）
        fragmentShader:
          "uniform float uTime; uniform float uA; uniform vec3 uCol; uniform float uAdd; varying vec2 vUv; void main(){ float edge = 1.0 - abs(vUv.y - 0.5) * 2.0; float flow = pow(fract(vUv.x * 0.5 - uTime * 0.35), 5.0); float a = (0.24 + 0.6 * flow) * smoothstep(0.0, 0.55, edge) * uA; gl_FragColor = uAdd > 0.5 ? vec4(uCol * a, a) : vec4(uCol, min(1.0, a * 1.35)); }",
      }),
    );
  const lineGeo = (bag: Bag, arr: number[]) => {
    const x = bag.keep(new THREE.BufferGeometry());
    x.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    return x;
  };

  // ---- 動かない部品（地面と光の点の絵、壁の窓）
  const gg = shared.keep(new THREE.RingGeometry(0.2, 1800, 160, 40));
  const gc: number[] = [];
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const r = Math.hypot(gp.getX(i), gp.getY(i));
    const f = r < 280 ? 1 : r > 760 ? 0.82 : lerp(1, 0.82, (r - 280) / 480);
    gc.push(f, f, f);
  }
  gg.setAttribute("color", new THREE.Float32BufferAttribute(gc, 3));
  const groundMat = shared.keep(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 }));
  const ground = new THREE.Mesh(gg, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const dotTex = radialTex([
    [0, "rgba(255,248,225,1)"],
    [0.22, "rgba(255,214,120,.85)"],
    [0.5, "rgba(255,190,80,.22)"],
    [1, "rgba(255,180,60,0)"],
  ]);
  const pinTex = radialTex([
    [0, "rgba(255,255,255,1)"],
    [0.18, "rgba(255,255,255,.95)"],
    [0.26, "rgba(255,255,255,.35)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const lampTex = radialTex([
    [0, "rgba(255,236,190,1)"],
    [0.16, "rgba(255,210,140,.7)"],
    [0.45, "rgba(255,170,90,.12)"],
    [1, "rgba(255,160,80,0)"],
  ]);
  const across = canvasTex(shared, 4, 64, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.5, "rgba(255,255,255,1)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
  });
  const upTex = canvasTex(shared, 4, 128, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.7, "rgba(255,255,255,0.3)");
    gr.addColorStop(1, "rgba(255,255,255,0.8)");
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
  });
  const N = 16;
  const CELL = 32;
  const wr = rng(5);
  const lit: number[] = [];
  for (let i = 0; i < N * N; i++) lit.push(wr());
  const wallMap = canvasTex(shared, N * CELL, N * CELL, (c) => {
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, N * CELL, N * CELL);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = i * CELL;
        const y = j * CELL;
        c.fillStyle = "rgba(30,45,70,0.06)";
        c.fillRect(x, y + CELL - 2, CELL, 2);
        c.fillStyle = "#bcc6d4";
        c.fillRect(x + 9, y + 8, 14, 13);
        c.fillStyle = "rgba(255,255,255,0.55)";
        c.fillRect(x + 9, y + 8, 14, 2);
      }
  });
  const wallEmit = canvasTex(shared, N * CELL, N * CELL, (c) => {
    c.fillStyle = "#000";
    c.fillRect(0, 0, N * CELL, N * CELL);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const v = lit[j * N + i];
        if (v > 0.44) continue;
        c.fillStyle = v < 0.3 ? "#ffd38c" : v < 0.4 ? "#fff1d6" : "#cfe2ff";
        c.globalAlpha = 0.55 + (v % 0.1) * 4.5;
        c.fillRect(i * CELL + 9, j * CELL + 8, 14, 13);
        c.globalAlpha = 1;
      }
  });
  for (const t of [wallMap, wallEmit]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  // ---- 材料ごとの部品（届くたびに作り直す）
  const groups = { base: new THREE.Group(), lots: new THREE.Group(), zones: new THREE.Group(), marks: new THREE.Group() };
  const bags = { base: new Bag(), lots: new Bag(), zones: new Bag(), marks: new Bag() };
  scene.add(groups.base, groups.lots, groups.zones, groups.marks);
  const M: {
    road?: T.MeshStandardMaterial;
    water?: T.MeshStandardMaterial;
    wall?: T.MeshStandardMaterial;
    roof?: T.MeshStandardMaterial;
    lamp?: T.PointsMaterial;
    front?: T.ShaderMaterial;
    line?: T.MeshBasicMaterial;
    glow?: T.MeshBasicMaterial;
    fill?: T.MeshBasicMaterial;
    curtain?: T.MeshBasicMaterial;
    dot?: T.SpriteMaterial;
    pulse?: T.MeshBasicMaterial;
    spot?: T.MeshBasicMaterial;
    flood?: T.MeshStandardMaterial;
    haz?: T.MeshBasicMaterial;
    lot?: T.LineBasicMaterial;
    nb?: T.LineBasicMaterial;
    nbFill?: T.MeshBasicMaterial;
    nbPick?: T.MeshBasicMaterial;
    route?: T.ShaderMaterial;
    priceRoute?: T.ShaderMaterial;
    bar?: T.MeshBasicMaterial;
  } = {};
  let zoneMats: T.MeshBasicMaterial[] = [];
  let pinMats: { m: T.SpriteMaterial; tabs: SceneTab[] }[] = [];
  const parts: { line?: T.Mesh; glow?: T.Mesh; fill?: T.Group; curtain?: T.Mesh; pulse?: T.Mesh; flood?: T.Mesh; gauge?: T.Group; haz?: T.Mesh; bldg: T.Mesh[]; edgeCount: number; center: T.Vector3 } = { bldg: [], edgeCount: 0, center: new THREE.Vector3() };
  // 隣の土地（たたいて選ぶ）：形と面。選んだ土地の key
  let nbLots: { key: string; fills: SceneShape["fills"]; meshes: T.Mesh[] }[] = [];
  let picked = new Set<string>();
  let base: SceneBase | null = null;
  let marks: SceneMarks | null = null;
  const presets: Partial<Record<SceneTab | "intro" | "nb", Preset>> = {};
  type Lbl = { key: string; el: HTMLDivElement; pos: T.Vector3; tabs: SceneLabel["tabs"]; on: boolean; sig: string; w: number; h: number; box?: ScreenRect };
  let labels: Lbl[] = [];

  // ---- 状態
  const cam: Cam = { tx: 0, ty: 0, tz: 0, dist: 1300, polar: 0.03, azim: 0.42 };
  let tab: SceneTab = "basic";
  let part: ScenePart = "day";
  let motion = true;
  let nbOn = false;
  let floodDepth = 0;
  let arrived = false;
  let started = false;
  let visible = true;
  let layout: SceneLayout = { centerY: 0, sheetTop: 99999, topLimit: 60, avoid: [], cover: 0 };
  let W = 1;
  let H = 1;
  let sunDir = { az: 160, alt: 40 };
  let touched = false;
  let ambientUntil = 0;
  const fade: Record<Fade, number> = { front: 0, zone: 0, flood: 0, gauge: 0, nb: 0, route: 0, pins: 0, bars: 0, haz: 0, lots: 0 };
  const cur: Record<string, number | T.Color> = {};
  const tweens = new Set<Tween>();
  const fadeTw: Partial<Record<Fade, Tween>> = {};
  let camTween: Tween | null = null;
  const still = () => REDUCE || !motion;

  const tween = (o: { dur: number; delay?: number; ease?: (t: number) => number; update: (t: number) => void; done?: () => void }) => {
    const quick = still();
    const tw: Tween = { start: performance.now() + (quick ? 0 : (o.delay ?? 0)), dur: quick ? 0 : o.dur, e: o.ease ?? E.inOut, update: o.update, done: o.done };
    if (tw.dur === 0) {
      tw.update(1);
      tw.done?.();
      invalidate();
      return tw;
    }
    tweens.add(tw);
    kick();
    return tw;
  };
  const fadeTo = (k: Fade, v: number, dur = 800, delay = 0, ease = E.out) => {
    const old = fadeTw[k];
    if (old) tweens.delete(old);
    const s = fade[k];
    fadeTw[k] = tween({ dur, delay, ease, update: (t) => (fade[k] = lerp(s, v, t)) });
  };
  const wake = () => {
    ambientUntil = performance.now() + AMBIENT_MS;
    kick();
  };

  // ---- 建物・道路・水・調べた土地
  function setBase(b: SceneBase) {
    base = b;
    const g = groups.base;
    g.clear();
    bags.base.dispose();
    const bag = bags.base;
    const { town } = b;

    // 水
    M.water = bag.keep(new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.25, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    for (const w of town.water) {
      const m = flat(bag, new THREE.ShapeGeometry(shapeOf({ outer: w, holes: [] })), M.water, 0.012);
      m.receiveShadow = true;
      g.add(m);
    }
    // 道路と、前の道路に流れる光
    M.road = bag.keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const roads = new THREE.Mesh(ribbon(bag, town.roads, 0.03, true), M.road);
    roads.receiveShadow = true;
    g.add(roads);
    M.front = flowMat(bag, "#ffe0a6");
    const front = new THREE.Mesh(
      ribbon(
        bag,
        b.front.map((i) => ({ line: town.roads[i].line, width: town.roads[i].width + 1 })),
        0.08,
        false,
      ),
      M.front,
    );
    front.renderOrder = 3;
    g.add(front);
    // 街灯（道路に沿って 26m ごと、左右交互）
    const lamp: number[] = [];
    const lr = rng(11);
    for (const r of town.roads) {
      let carry = lr() * 20;
      for (let i = 0; i < r.line.length - 1; i++) {
        const [x0, z0] = r.line[i];
        const [x1, z1] = r.line[i + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 0.01) continue;
        const off = r.width / 2 + 0.6;
        const nx = -(z1 - z0) / len;
        const nz = (x1 - x0) / len;
        let d = carry;
        for (; d < len; d += 26) {
          const t = d / len;
          const side = lamp.length % 2 ? 1 : -1;
          const x = lerp(x0, x1, t) + nx * off * side;
          const z = lerp(z0, z1, t) + nz * off * side;
          if (Math.hypot(x, z) < 300) lamp.push(x, 5.2, z);
        }
        carry = d - len;
      }
    }
    M.lamp = bag.keep(new THREE.PointsMaterial({ size: 8, sizeAttenuation: true, map: lampTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const lamps = new THREE.Points(lineGeo(bag, lamp), M.lamp);
    lamps.renderOrder = 4;
    g.add(lamps);

    // 建物（壁と屋根。土地に近い建物から建ち上がる）
    const wp: number[] = [];
    const wn: number[] = [];
    const wu: number[] = [];
    const wc: number[] = [];
    const wd: number[] = [];
    const rp: number[] = [];
    const rn: number[] = [];
    const rc: number[] = [];
    const rd: number[] = [];
    const br = rng(7);
    const [ox, oz] = b.center;
    for (const bd of town.buildings) {
      let r = bd.ring;
      if (r.length < 3) continue;
      let area = 0;
      for (let i = 0; i < r.length; i++) area += r[i][0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * r[i][1];
      if (area > 0) r = r.slice().reverse();
      const h = bd.height;
      let cx = 0;
      let cz = 0;
      for (const [x, z] of r) {
        cx += x;
        cz += z;
      }
      cx /= r.length;
      cz /= r.length;
      const dl = clamp(Math.hypot(cx - ox, cz - oz) / 300, 0, 1);
      const tone = 0.9 + br() * 0.1;
      const warm = br() < 0.28;
      const c = warm ? [tone, tone * 0.965, tone * 0.92] : [tone * 0.975, tone * 0.985, tone];
      const uo = Math.floor(br() * N) / N;
      const vo = Math.floor(br() * N) / N;
      let per = 0;
      for (let i = 0; i < r.length; i++) {
        const [x0, z0] = r[i];
        const [x1, z1] = r[(i + 1) % r.length];
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        if (len < 0.05) continue;
        const nx = -dz / len;
        const nz = dx / len;
        const u0 = uo + per / (3.2 * N);
        const u1 = uo + (per + len) / (3.2 * N);
        const v1 = vo + h / (3.0 * N);
        wp.push(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, 0, z0, x1, h, z1, x0, h, z0);
        wu.push(u0, vo, u1, vo, u1, v1, u0, vo, u1, v1, u0, v1);
        for (let k = 0; k < 6; k++) {
          wn.push(nx, 0, nz);
          wc.push(c[0], c[1], c[2]);
          wd.push(dl);
        }
        per += len;
      }
      const tris = THREE.ShapeUtils.triangulateShape(
        r.map(([x, z]) => new THREE.Vector2(x, z)),
        [],
      );
      for (const t of tris) {
        const a = t[0];
        let bb = t[1];
        let cc = t[2];
        const A = r[a];
        const B = r[bb];
        const C = r[cc];
        if ((B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]) < 0) [bb, cc] = [cc, bb];
        for (const k of [a, bb, cc]) {
          rp.push(r[k][0], h, r[k][1]);
          rn.push(0, 1, 0);
          rc.push(c[0] * 0.97, c[1] * 0.97, c[2] * 0.97);
          rd.push(dl);
        }
      }
    }
    const geo = (p: number[], n: number[], c: number[], d: number[], u?: number[]) => {
      const x = bag.keep(new THREE.BufferGeometry());
      x.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      x.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
      if (u) x.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
      x.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
      x.setAttribute("aDelay", new THREE.Float32BufferAttribute(d, 1));
      return x;
    };
    M.wall = riseMat(bag, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: wallMap, emissive: new THREE.Color(0xffd08a), emissiveMap: wallEmit, emissiveIntensity: 0, roughness: 0.9, metalness: 0 }));
    M.roof = riseMat(bag, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0 }));
    const depth = riseMat(bag, new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
    parts.bldg = [];
    if (wp.length) {
      const walls = new THREE.Mesh(geo(wp, wn, wc, wd, wu), M.wall);
      walls.castShadow = walls.receiveShadow = true;
      walls.customDepthMaterial = depth;
      g.add(walls);
      parts.bldg.push(walls);
    }
    if (rp.length) {
      const roofs = new THREE.Mesh(geo(rp, rn, rc, rd), M.roof);
      roofs.castShadow = roofs.receiveShadow = true;
      roofs.customDepthMaterial = depth;
      g.add(roofs);
      parts.bldg.push(roofs);
    }

    // 調べた土地：細い光る輪郭・やわらかいにじみ・薄い面・低い光の幕・角の点・押したときの光の輪
    parts.center.set(ox, 0, oz);
    parts.line = parts.glow = parts.fill = parts.curtain = parts.pulse = undefined;
    parts.edgeCount = 0;
    M.line = M.glow = M.fill = M.curtain = M.dot = undefined;
    const tg = b.target;
    if (tg && tg.edges.length) {
      const segs = tg.edges.map(([a, c]) => {
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const k = Math.max(1, Math.ceil(len / 0.5));
        const out: XZ[] = [];
        for (let i = 0; i <= k; i++) out.push([lerp(a[0], c[0], i / k), lerp(a[1], c[1], i / k)]);
        return out;
      });
      const band = (w: number, y: number) => {
        const pos: number[] = [];
        const uv: number[] = [];
        for (const pts of segs)
          for (let i = 0; i < pts.length - 1; i++) {
            const [x0, z0] = pts[i];
            const [x1, z1] = pts[i + 1];
            const dx = x1 - x0;
            const dz = z1 - z0;
            const len = Math.hypot(dx, dz) || 1;
            const nx = ((-dz / len) * w) / 2;
            const nz = ((dx / len) * w) / 2;
            const ex = (dx / len) * w * 0.5;
            const ez = (dz / len) * w * 0.5;
            const ax = x0 - ex;
            const az = z0 - ez;
            const bx = x1 + ex;
            const bz = z1 + ez;
            pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
            uv.push(0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1);
          }
        const x = bag.keep(new THREE.BufferGeometry());
        x.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        x.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        return x;
      };
      parts.edgeCount = segs.reduce((s, p) => s + (p.length - 1), 0) * 6;
      M.line = bag.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      parts.line = new THREE.Mesh(band(0.45, 0.16), M.line);
      parts.line.renderOrder = 6;
      M.glow = bag.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, map: across, transparent: true, opacity: 0.4, depthWrite: false }));
      parts.glow = new THREE.Mesh(band(3, 0.14), M.glow);
      parts.glow.renderOrder = 5;
      M.fill = bag.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      parts.fill = new THREE.Group();
      for (const f of tg.fills) parts.fill.add(flat(bag, new THREE.ShapeGeometry(shapeOf(f)), M.fill, 0.12));
      const cp: number[] = [];
      const cu: number[] = [];
      for (const [a, c] of tg.edges) {
        cp.push(a[0], 0, a[1], c[0], 0, c[1], c[0], 1, c[1], a[0], 0, a[1], c[0], 1, c[1], a[0], 1, a[1]);
        cu.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
      const cg = bag.keep(new THREE.BufferGeometry());
      cg.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
      cg.setAttribute("uv", new THREE.Float32BufferAttribute(cu, 2));
      M.curtain = bag.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, map: upTex, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide }));
      parts.curtain = new THREE.Mesh(cg, M.curtain);
      parts.curtain.renderOrder = 7;
      M.dot = bag.keep(new THREE.SpriteMaterial({ map: dotTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      const corners = new THREE.Group();
      for (const [x, z] of tg.corners) {
        const s = new THREE.Sprite(M.dot);
        s.position.set(x, 0.5, z);
        s.scale.set(1.5, 1.5, 1);
        corners.add(s);
      }
      g.add(parts.line, parts.glow, parts.fill, parts.curtain, corners);
    }
    // 土地（筆）が無いときは、地点に小さな金色の輪を置く
    if (!parts.line) {
      M.spot = bag.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
      const spot = flat(bag, new THREE.RingGeometry(3, 4.4, 64), M.spot, 0.22);
      spot.position.x = ox;
      spot.position.z = oz;
      spot.renderOrder = 8;
      g.add(spot);
    } else M.spot = undefined;
    M.pulse = bag.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    parts.pulse = flat(bag, new THREE.RingGeometry(0.95, 1, 128), M.pulse, 0.2);
    parts.pulse.position.x = ox;
    parts.pulse.position.z = oz;
    parts.pulse.renderOrder = 8;
    g.add(parts.pulse);

    // ハザード：地面に敷く絵と、想定の深さの水と、目盛りの柱
    const hazMap = M.haz?.map ?? null;
    const hazPlane = parts.haz;
    M.haz = bag.keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, map: hazMap }));
    parts.haz = new THREE.Mesh(bag.keep(new THREE.PlaneGeometry(1, 1)), M.haz);
    parts.haz.rotation.x = -Math.PI / 2;
    parts.haz.position.y = 0.045;
    if (hazPlane) {
      parts.haz.position.x = hazPlane.position.x;
      parts.haz.position.z = hazPlane.position.z;
      parts.haz.scale.copy(hazPlane.scale);
    }
    parts.haz.renderOrder = 2;
    parts.haz.visible = false;
    // 想定の深さの水は、調べた土地の形（土地が無ければ地点のまわり8m）だけに入れる（深さは場所で違うので、まわりには敷かない）
    M.flood = bag.keep(new THREE.MeshStandardMaterial({ color: col("#4a95dc"), transparent: true, opacity: 0, roughness: 0.15, metalness: 0, depthWrite: false, side: THREE.DoubleSide }));
    const floodShapes = tg && tg.fills.length ? tg.fills.map((f) => shapeOf(f)) : [new THREE.Shape(Array.from({ length: 33 }, (_, i) => new THREE.Vector2(ox + 8 * Math.cos((i / 32) * Math.PI * 2), -(oz + 8 * Math.sin((i / 32) * Math.PI * 2)))))];
    // 底は地面とハザードの色の少し上（地面と重なってちらつかないように）
    parts.flood = flat(bag, new THREE.ExtrudeGeometry(floodShapes, { depth: 1, bevelEnabled: false }), M.flood, 0.09);
    parts.flood.renderOrder = 9;
    parts.flood.visible = false;
    const gauge = new THREE.Group();
    let gx = ox;
    let gz = oz;
    if (tg) {
      let best = -Infinity;
      for (const f of tg.fills)
        for (const [x, z] of f.outer)
          if (x + z > best) {
            best = x + z;
            gx = x;
            gz = z;
          }
    }
    gauge.position.set(gx + 1.5, 0, gz + 1.5);
    const poleMat = bag.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    const pole = new THREE.Mesh(bag.keep(new THREE.BoxGeometry(0.2, 10.6, 0.2)), poleMat);
    pole.position.y = 5.3;
    gauge.add(pole);
    const tickBig = bag.keep(new THREE.BoxGeometry(1.1, 0.06, 0.06));
    const tickSmall = bag.keep(new THREE.BoxGeometry(0.6, 0.06, 0.06));
    for (let m = 1; m <= 10; m++) {
      const t = new THREE.Mesh(m % 5 ? tickSmall : tickBig, poleMat);
      t.position.set(0.28, m, 0);
      gauge.add(t);
    }
    gauge.scale.y = 0.001;
    gauge.visible = false;
    parts.gauge = gauge;
    g.add(parts.haz, parts.flood, gauge);

    updatePresets();
    applyTheme(part, false);
    if (!started) arrive();
    else reveal();
  }

  // ---- まわりの筆（細い線）と隣の土地
  function setLots(lots: SceneLot[]) {
    const g = groups.lots;
    g.clear();
    bags.lots.dispose();
    const bag = bags.lots;
    const lp: number[] = [];
    const np: number[] = [];
    M.nbFill = bag.keep(new THREE.MeshBasicMaterial({ color: col("#ffd27a"), transparent: true, opacity: 0, depthWrite: false }));
    M.nbPick = bag.keep(new THREE.MeshBasicMaterial({ color: col("#ffd36b"), transparent: true, opacity: 0, depthWrite: false }));
    const byKey = new Map<string, { key: string; fills: SceneShape["fills"]; meshes: T.Mesh[] }>();
    for (const lot of lots) {
      const arr = lot.neighbor ? np : lp;
      for (const [a, b] of lot.edges) arr.push(a[0], 0.07, a[1], b[0], 0.07, b[1]);
      if (!lot.neighbor) continue;
      // 同じ地番の区画（二重地番など）は1つの土地として選ぶ
      const k = lot.key ?? "";
      const nb = byKey.get(k) ?? { key: k, fills: [], meshes: [] };
      byKey.set(k, nb);
      for (const f of lot.fills) {
        const m = flat(bag, new THREE.ShapeGeometry(shapeOf(f)), picked.has(k) ? M.nbPick : M.nbFill, 0.06);
        g.add(m);
        nb.fills.push(f);
        nb.meshes.push(m);
      }
    }
    nbLots = [...byKey.values()].filter((n) => n.key);
    // 隣の土地が届いたら、隣の土地を見る向き・距離を決め直す（出しているときは、自分で動かしていなければ合わせ直す）
    updatePresets();
    if (arrived && !touched && nbOn && tab === "basic") applyPreset("nb", true, 1200);
    M.lot = bag.keep(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    M.nb = bag.keep(new THREE.LineBasicMaterial({ color: col("#ffd27a"), transparent: true, opacity: 0, depthWrite: false }));
    g.add(new THREE.LineSegments(lineGeo(bag, lp), M.lot), new THREE.LineSegments(lineGeo(bag, np), M.nb));
    fade.lots = 0;
    fadeTo("lots", 1, 900, arrived ? 0 : 1600);
    applyTheme(part, false);
  }

  // ---- 用途地域の色
  function setZones(zones: SceneZone[]) {
    const g = groups.zones;
    g.clear();
    bags.zones.dispose();
    const bag = bags.zones;
    zoneMats = [];
    for (const z of zones) {
      const mat = bag.keep(new THREE.MeshBasicMaterial({ color: col(z.color), transparent: true, opacity: fade.zone, depthWrite: false }));
      zoneMats.push(mat);
      const m = flat(bag, new THREE.ShapeGeometry(shapeOf(z.fill)), mat, 0.05);
      m.renderOrder = 2;
      g.add(m);
    }
    invalidate();
  }

  // ---- 駅・地価の地点への光の道、施設の印、地価の柱
  function setMarks(mk: SceneMarks) {
    marks = mk;
    const g = groups.marks;
    g.clear();
    bags.marks.dispose();
    const bag = bags.marks;
    const c0 = parts.center;
    M.route = flowMat(bag, "#9fd0ff");
    M.priceRoute = flowMat(bag, "#ffe0a6");
    const toward = (to: XZ | null, mat: T.ShaderMaterial, stop: number) => {
      if (!to) return;
      const dx = to[0] - c0.x;
      const dz = to[1] - c0.z;
      const len = Math.hypot(dx, dz);
      if (len < 30) return;
      const ux = dx / len;
      const uz = dz / len;
      const end = Math.min(len - 4, stop);
      const line: XZ[] = [
        [c0.x + ux * 12, c0.z + uz * 12],
        [c0.x + ux * end, c0.z + uz * end],
      ];
      const m = new THREE.Mesh(ribbon(bag, [{ line, width: 2.6 }], 0.2, false), mat);
      m.renderOrder = 6;
      g.add(m);
    };
    toward(mk.station, M.route, 260);
    toward(mk.price, M.priceRoute, 2000);
    pinMats = [];
    for (const p of mk.pins) {
      // 屋根の上に浮かせ、建物に隠れないようにする（地図の印と同じ）
      const mat = bag.keep(new THREE.SpriteMaterial({ map: pinTex, color: col(p.color), transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
      pinMats.push({ m: mat, tabs: p.tabs });
      const s = new THREE.Sprite(mat);
      s.position.set(p.at[0], 10, p.at[1]);
      const size = p.size ?? 12;
      s.scale.set(size, size, 1);
      s.renderOrder = 10;
      g.add(s);
    }
    M.bar = bag.keep(new THREE.MeshBasicMaterial({ color: col("#ffd27a"), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const barGeo = bag.keep(new THREE.CylinderGeometry(1.4, 1.4, 1, 20));
    for (const b of mk.bars) {
      const m = new THREE.Mesh(barGeo, M.bar);
      m.position.set(b.at[0], b.height / 2, b.at[1]);
      m.scale.y = Math.max(0.1, b.height);
      g.add(m);
    }
    applyTheme(part, false);
    const before = JSON.stringify(presets[tab] ?? null);
    updatePresets();
    // 駅・地価の地点が後から届いたら、見ているタブの向きを合わせ直す（自分で動かしたあとは動かさない）
    if (arrived && !touched && (tab === "around" || tab === "price") && JSON.stringify(presets[tab] ?? null) !== before) applyPreset(tab, true, 1600);
    invalidate();
  }

  // ---- 隣の土地の札：選んだ土地はチェック付きの金色（幅が変わるので測り直す）
  function markPicked(l: Lbl) {
    if (!l.key.startsWith("nb:")) return;
    const on = picked.has(l.key.slice(3));
    if (l.el.classList.contains("pv-pick") === on) return;
    l.el.classList.toggle("pv-pick", on);
    l.w = 0;
  }

  // ---- 札（同じ key の札は使い回す。消えた札は外す。字は textContent で入れる）
  function setLabels(list: SceneLabel[]) {
    const old = new Map(labels.map((l) => [l.key, l]));
    const next: Lbl[] = [];
    for (const s of list) {
      const sig = JSON.stringify([s.title, s.sub, s.color, s.kind]);
      let l = old.get(s.key);
      if (l) old.delete(s.key);
      else {
        const el = document.createElement("div");
        el.className = "pv-lbl off";
        labelHost.appendChild(el);
        l = { key: s.key, el, pos: new THREE.Vector3(), tabs: s.tabs, on: false, sig: "", w: 0, h: 0 };
      }
      if (l.sig !== sig) {
        l.sig = sig;
        l.el.className = `pv-lbl${l.on ? "" : " off"}${s.kind ? ` pv-${s.kind}` : ""}`;
        const chip = document.createElement("span");
        chip.className = "pv-chip";
        if (s.color || s.kind === "lot") {
          const dot = document.createElement("i");
          if (s.color) dot.style.background = s.color;
          chip.appendChild(dot);
        }
        const b = document.createElement("b");
        b.textContent = s.title;
        chip.appendChild(b);
        if (s.sub) {
          const sm = document.createElement("small");
          sm.textContent = s.sub;
          chip.appendChild(sm);
        }
        l.el.replaceChildren(chip);
        l.w = 0;
      }
      markPicked(l);
      l.pos.set(s.at[0], s.at[1], s.at[2]);
      l.tabs = s.tabs;
      next.push(l);
    }
    for (const l of old.values()) l.el.remove();
    labels = next;
    invalidate();
  }

  // ---- カメラの置き方（タブごと）。前の道路があれば、その側から土地を見る
  function updatePresets() {
    if (!base) return;
    const c = parts.center;
    const town = base.town;
    let fx = c.x;
    let fz = c.z + 12;
    let faz = 0.42;
    if (base.front.length) {
      let sx = 0;
      let sz = 0;
      let n = 0;
      for (const i of base.front)
        for (const [x, z] of town.roads[i].line)
          if (Math.hypot(x - c.x, z - c.z) < 40) {
            sx += x;
            sz += z;
            n++;
          }
      if (n) {
        fx = sx / n;
        fz = sz / n;
        faz = Math.atan2(fx - c.x, fz - c.z) + 0.3;
      }
    }
    const st = marks?.station ?? null;
    const pr = marks?.price ?? null;
    /**
     * 駅・地価の地点を見るときは、土地を真ん中に置いたまま、その地点への線が画面の右上へ斜めに伸びる向きにする
     * （縦長の画面に収まり、見出しの字の多い左上を避ける）。shift は土地からその向きへずらす量（m）
     */
    const toward = (to: XZ, shift: number, dist: number, polar: number, turn = 0.6): Preset => {
      const d = Math.hypot(to[0] - c.x, to[1] - c.z) || 1;
      const ux = (to[0] - c.x) / d;
      const uz = (to[1] - c.z) / d;
      const s = Math.min(d * 0.3, shift);
      return { t: [c.x + ux * s, 0, c.z + uz * s], dist, polar, azim: Math.atan2(ux, uz) + turn + Math.PI };
    };
    // 隣の土地を見るとき：調べた土地と隣の筆がみな入る距離。縦長の画面は横が狭いので、横の幅で決める（上から見下ろして、
    // 札が縦にも散らばるようにする）。大きな隣の筆（畑・道路の筆など）で遠くなりすぎないよう、70m までで決める
    let reach = 0;
    for (const n of nbLots) for (const f of n.fills) for (const [x, z] of f.outer) reach = Math.max(reach, Math.hypot(x - c.x, z - c.z));
    for (const f of base.target?.fills ?? []) for (const [x, z] of f.outer) reach = Math.max(reach, Math.hypot(x - c.x, z - c.z));
    const halfW = Math.tan((camera.fov * Math.PI) / 360) * (W / H);
    const nbDist = clamp((clamp(reach, 18, 70) + 5) / Math.max(0.06, halfW), 110, 560);
    const next: Record<SceneTab | "intro" | "nb", Preset> = {
      intro: { t: [c.x, 0, c.z], dist: 1300, polar: 0.03, azim: faz },
      basic: { t: [c.x, 0, c.z], dist: 250, polar: 0.92, azim: faz },
      nb: { t: [c.x, 0, c.z], dist: nbDist, polar: 0.5, azim: faz },
      road: { t: [lerp(c.x, fx, 0.8), 0, lerp(c.z, fz, 0.8)], dist: base.front.length ? 118 : 150, polar: 1.0, azim: faz },
      law: { t: [c.x, 0, c.z], dist: 430, polar: 0.62, azim: faz - 0.2 },
      hazard: { t: [c.x, 3, c.z], dist: 165, polar: 1.12, azim: faz + 0.5 },
      around: st ? toward(st, 40, 560, 0.9) : { t: [c.x, 0, c.z], dist: 560, polar: 0.85, azim: faz },
      price: pr ? toward(pr, 50, 600, 0.95, 0.5) : { t: [c.x, 0, c.z], dist: 420, polar: 0.85, azim: faz },
    };
    Object.assign(presets, next);
  }

  // ---- 着地（上から降りて、建物が建ち、輪郭が描かれる）。2回目からは輪郭だけ描き直す
  function arrive() {
    started = true;
    arrived = false;
    U.rise.value = 0;
    parts.line?.geometry.setDrawRange(0, 0);
    parts.glow?.geometry.setDrawRange(0, 0);
    if (parts.curtain) parts.curtain.scale.y = 0.001;
    if (M.fill) M.fill.opacity = 0;
    if (M.dot) M.dot.opacity = 0;
    canvas.style.opacity = "1";
    applyPreset("intro", false);
    applyPreset(nbOn && tab === "basic" ? "nb" : tab, true, 2600);
    tween({ dur: 1900, delay: 400, ease: E.out, update: (t) => (U.rise.value = t) });
    drawOutline(1300);
    sceneForTab(tab, true);
  }
  function reveal() {
    U.rise.value = 1;
    parts.line?.geometry.setDrawRange(0, 0);
    parts.glow?.geometry.setDrawRange(0, 0);
    if (parts.curtain) parts.curtain.scale.y = 0.001;
    drawOutline(0);
    sceneForTab(tab, true);
    if (!touched) applyPreset(nbOn && tab === "basic" ? "nb" : tab, true, 1200);
  }
  function drawOutline(delay: number) {
    tween({
      dur: 1100,
      delay,
      ease: E.inOut,
      update: (t) => {
        const n = Math.floor((t * parts.edgeCount) / 6) * 6;
        parts.line?.geometry.setDrawRange(0, n);
        parts.glow?.geometry.setDrawRange(0, n);
      },
    });
    tween({
      dur: 900,
      delay: delay + 900,
      ease: E.out,
      update: (t) => {
        if (parts.curtain) parts.curtain.scale.y = Math.max(0.001, t * 3);
        if (M.fill) M.fill.opacity = t * 0.12;
        if (M.dot) M.dot.opacity = t * 0.8;
      },
      done: () => {
        arrived = true;
        wake();
      },
    });
    if (!still()) pulse(delay + 950);
  }
  function pulse(delay = 0) {
    if (!parts.pulse || !M.pulse || still()) return;
    const p = parts.pulse;
    const m = M.pulse;
    tween({
      dur: 1600,
      delay,
      ease: E.out5,
      update: (t) => {
        p.scale.setScalar(6 + t * 60);
        m.opacity = (1 - t) * 0.55;
      },
    });
  }

  // ---- カメラ
  let drag: { x: number; y: number; az: number; po: number; t: number; vx: number; id: number } | null = null;
  let pinch: { d: number; dist: number } | null = null;
  let tap: { x: number; y: number; t: number } | null = null;
  let lastTap = 0;
  let lotTapAt = 0;
  let nbTap: { key: string; at: number } | null = null;
  const ptrs = new Map<number, { x: number; y: number }>();
  let inertia = 0;
  let idleAt = performance.now();
  function applyPreset(name: SceneTab | "intro" | "nb", animate = true, dur = 1400) {
    const p = presets[name];
    if (!p) return;
    const from = { ...cam };
    let az = p.azim;
    while (az - from.azim > Math.PI) az -= 2 * Math.PI;
    while (az - from.azim < -Math.PI) az += 2 * Math.PI;
    const to: Cam = { tx: p.t[0], ty: p.t[1], tz: p.t[2], dist: p.dist, polar: p.polar, azim: az };
    if (camTween) tweens.delete(camTween);
    camTween = null;
    if (!animate || still()) {
      Object.assign(cam, to);
      invalidate();
      return;
    }
    camTween = tween({
      dur,
      ease: E.inOut,
      update: (t) => {
        cam.tx = lerp(from.tx, to.tx, t);
        cam.ty = lerp(from.ty, to.ty, t);
        cam.tz = lerp(from.tz, to.tz, t);
        cam.dist = Math.exp(lerp(Math.log(from.dist), Math.log(to.dist), t));
        cam.polar = lerp(from.polar, to.polar, t);
        cam.azim = lerp(from.azim, to.azim, t);
      },
      done: () => (camTween = null),
    });
  }
  function placeCamera() {
    const sp = Math.sin(cam.polar);
    camera.position.set(cam.tx + cam.dist * sp * Math.sin(cam.azim), cam.ty + cam.dist * Math.cos(cam.polar), cam.tz + cam.dist * sp * Math.cos(cam.azim));
    camera.up.set(0, 1, 0);
    if (cam.polar < 0.06) camera.up.set(-Math.sin(cam.azim), 0, -Math.cos(cam.azim));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }
  /** 土地を画面の centerY の高さに置く（カメラの向きはそのまま、写す範囲だけずらす） */
  function setView() {
    const y = layout.centerY || H * 0.42;
    camera.setViewOffset(W, H, 0, H / 2 - y, W, H);
    camera.updateProjectionMatrix();
  }

  // ---- 時間帯
  function applyTheme(name: ScenePart, animate: boolean) {
    part = name;
    const t = THEMES[name];
    const s = name === "night" ? { alt: 42, az: 60 } : name === "evening" ? { alt: clamp(sunDir.alt, 6, 14), az: sunDir.alt > -2 ? sunDir.az : 250 } : { alt: clamp(sunDir.alt, 28, 55), az: sunDir.alt > 10 ? sunDir.az : 160 };
    const to: Record<string, number | T.Color> = {
      fog: col(t.fog),
      hemiSky: col(t.hemiSky),
      hemiGround: col(t.hemiGround),
      sun: col(t.sun),
      ground: col(t.ground),
      road: col(t.road),
      walls: col(t.walls),
      roof: col(t.roof),
      water: col(t.water),
      lot: col(t.lot),
      gold: col(t.gold),
      flow: col(t.flow),
      route: col(t.route),
      hemi: t.hemi,
      sunI: t.sunI,
      win: t.win,
      lamps: t.lamps,
      glow: t.glow,
      lotA: t.lotA,
      fogNear: t.fogNear,
      fogFar: t.fogFar,
      alt: s.alt,
      az: s.az,
    };
    // 光の重ね方：暗い時間は足し合わせて光らせる、昼は普通に重ねる（明るい地面で白くとばないように）
    const blend = t.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    for (const m of [M.glow, M.fill, M.curtain, M.pulse, M.nbFill, M.dot, M.bar, M.front, M.route, M.priceRoute])
      if (m && m.blending !== blend) {
        m.blending = blend;
        m.needsUpdate = true;
      }
    for (const m of [M.front, M.route, M.priceRoute]) if (m) m.uniforms.uAdd.value = t.add ? 1 : 0;
    const from = Object.keys(cur).length ? Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, typeof v === "number" ? v : v.clone()])) : null;
    const apply = (k: number) => {
      for (const key of Object.keys(to)) {
        const a = from?.[key];
        const b = to[key];
        cur[key] = typeof b === "number" ? (typeof a === "number" ? lerp(a, b, k) : b) : a && typeof a !== "number" ? a.clone().lerp(b, k) : b.clone();
      }
      const c = (k: string) => cur[k] as T.Color;
      const n = (k: string) => cur[k] as number;
      const fog = scene.fog as T.Fog;
      fog.color.copy(c("fog"));
      fog.near = n("fogNear");
      fog.far = n("fogFar");
      hemi.color.copy(c("hemiSky"));
      hemi.groundColor.copy(c("hemiGround"));
      hemi.intensity = n("hemi") * Math.PI;
      sun.color.copy(c("sun"));
      sun.intensity = n("sunI") * Math.PI;
      const a = (n("alt") * Math.PI) / 180;
      const z = (n("az") * Math.PI) / 180;
      sun.position.set(Math.sin(z) * Math.cos(a) * 700 + parts.center.x, Math.sin(a) * 700, -Math.cos(z) * Math.cos(a) * 700 + parts.center.z);
      sun.target.position.copy(parts.center);
      groundMat.color.copy(c("ground"));
      M.road?.color.copy(c("road"));
      M.wall?.color.copy(c("walls"));
      M.roof?.color.copy(c("roof"));
      M.water?.color.copy(c("water"));
      if (M.wall) M.wall.emissiveIntensity = n("win");
      M.lot?.color.copy(c("lot"));
      for (const m of [M.line, M.glow, M.fill, M.curtain, M.pulse, M.spot]) m?.color.copy(c("gold"));
      M.bar?.color.copy(c("gold"));
      for (const m of [M.front, M.priceRoute]) (m?.uniforms.uCol.value as T.Color | undefined)?.copy(c("flow"));
      (M.route?.uniforms.uCol.value as T.Color | undefined)?.copy(c("route"));
      if (M.lamp) M.lamp.opacity = n("lamps");
      invalidate();
    };
    if (!animate || !from) apply(1);
    else tween({ dur: 1300, ease: E.inOut, update: apply });
  }

  // ---- タブごとの見せ方
  function sceneForTab(name: SceneTab, initial = false) {
    tab = name;
    fadeTo("front", name === "road" ? 1 : 0);
    fadeTo("zone", name === "law" ? 0.42 : 0);
    fadeTo("route", name === "around" ? 1 : 0);
    fadeTo("pins", 1);
    fadeTo("bars", name === "price" ? 0.5 : 0);
    fadeTo("nb", name === "basic" && nbOn ? 1 : 0);
    fadeTo("haz", name === "hazard" && M.haz?.map ? 0.78 : 0);
    if (name === "hazard" && floodDepth > 0.2) {
      fadeTo("gauge", 1, 900);
      fadeTo("flood", 1, 2400, 300, E.inOut);
    } else {
      fadeTo("gauge", 0, 600);
      fadeTo("flood", 0, 700);
    }
    if (!initial) {
      touched = false;
      applyPreset(name === "basic" && nbOn ? "nb" : name, true, name === "around" || name === "price" ? 1800 : 1400);
    }
    idleAt = performance.now();
    wake();
  }
  function applyFades() {
    if (M.front) M.front.uniforms.uA.value = fade.front;
    for (const m of zoneMats) m.opacity = fade.zone;
    for (const p of pinMats) p.m.opacity = p.tabs.includes(tab) ? fade.pins : 0;
    if (M.route) M.route.uniforms.uA.value = fade.route;
    if (M.priceRoute) M.priceRoute.uniforms.uA.value = fade.bars * 2;
    if (M.bar) M.bar.opacity = fade.bars;
    if (M.lot) M.lot.opacity = fade.lots * ((cur.lotA as number) ?? 0.2) * (1 - fade.zone * 0.5);
    if (M.nb) M.nb.opacity = fade.lots * fade.nb * 0.9;
    if (M.nbFill) M.nbFill.opacity = fade.lots * fade.nb * 0.12;
    if (M.nbPick) M.nbPick.opacity = fade.lots * fade.nb * 0.42;
    if (M.haz) M.haz.opacity = fade.haz;
    if (parts.haz) parts.haz.visible = fade.haz > 0.002 && !!M.haz?.map;
    if (parts.flood && M.flood) {
      parts.flood.scale.z = Math.max(0.001, fade.flood * floodDepth);
      M.flood.opacity = Math.min(0.42, fade.flood * 0.6);
      parts.flood.visible = fade.flood > 0.002;
    }
    if (parts.gauge) {
      parts.gauge.scale.y = Math.max(0.001, fade.gauge);
      parts.gauge.visible = fade.gauge > 0.002;
    }
  }

  // ---- 札（並びの順に置き、先に置いた札・見出しの字・上のボタン・シートに重なる札は隠す）
  const v3 = new THREE.Vector3();
  function placeLabels() {
    const placed: ScreenRect[] = [...layout.avoid];
    const hit = (p: ScreenRect, q: ScreenRect) => p.l < q.r && p.r > q.l && p.t < q.b && p.b > q.t;
    for (const l of labels) {
      const want = arrived && (l.tabs === "all" || (l.tabs === "nb" ? nbOn && tab === "basic" && fade.nb > 0.5 : l.tabs.includes(tab)));
      let vis = want && layout.cover < 0.6;
      if (vis) {
        v3.copy(l.pos).project(camera);
        const x = ((v3.x + 1) / 2) * W;
        const y = ((1 - v3.y) / 2) * H;
        if (!l.w) {
          l.w = l.el.offsetWidth;
          l.h = l.el.offsetHeight;
        }
        // 端からはみ出す札は、端の内側へずらす（点が画面の外なら隠す）
        const cx = clamp(x, l.w / 2 + 8, W - l.w / 2 - 8);
        const box = { l: cx - l.w / 2 - 3, t: y - l.h - 3, r: cx + l.w / 2 + 3, b: y + 3 };
        if (v3.z > 1 || x < 0 || x > W || box.t < layout.topLimit || box.b > layout.sheetTop - 4) vis = false;
        else if (placed.some((p) => hit(box, p))) vis = false;
        else {
          placed.push(box);
          l.box = box;
          l.el.style.transform = `translate3d(${cx.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`;
        }
      }
      if (!vis) l.box = undefined;
      if (vis !== l.on) {
        l.on = vis;
        l.el.classList.toggle("off", !vis);
      }
    }
  }

  // ---- 描く（動いている間だけ）
  let dirty = true;
  let running = false;
  let odd = false;
  let last = performance.now();
  let disposed = false;
  function invalidate() {
    dirty = true;
    kick();
  }
  function kick() {
    if (running || disposed || !visible) return;
    running = true;
    requestAnimationFrame(loop);
  }
  function loop(t: number) {
    running = false;
    if (disposed) return;
    const dt = Math.min(64, t - last);
    last = t;
    for (const tw of [...tweens]) {
      if (t < tw.start) continue;
      const k = clamp((t - tw.start) / tw.dur, 0, 1);
      tw.update(tw.e(k));
      if (k >= 1) {
        tweens.delete(tw);
        tw.done?.();
      }
    }
    const active = tweens.size > 0 || !!drag || !!pinch || Math.abs(inertia) > 0.00005;
    // 着いたあとのゆっくりした動き（光の揺らぎ・流れ・回転）は、触ってから AMBIENT_MS の間だけ
    const ambient = !still() && arrived && layout.cover < 0.95 && t < ambientUntil;
    if (ambient) {
      U.time.value = t / 1000;
      if (!active && t - idleAt > 4500) cam.azim += dt * 0.00004;
      const k = 0.5 + 0.5 * Math.sin(t / 1100);
      if (M.glow) M.glow.opacity = (0.3 + 0.18 * k) * ((cur.glow as number) ?? 1);
      if (M.fill) M.fill.opacity = 0.09 + 0.04 * k;
    }
    if (Math.abs(inertia) > 0.00005 && !drag) {
      cam.azim += inertia * dt * 0.06;
      inertia *= 0.94;
    }
    odd = !odd;
    if (dirty || active || (ambient && odd)) {
      applyFades();
      placeCamera();
      renderer.render(scene, camera);
      placeLabels();
      dirty = false;
    }
    if (visible && (active || ambient || dirty)) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  // 描く場所が消えた・戻った（iPhone で裏に回ったあとなど）。部品は three.js が作り直すので、描き直すだけ
  const onLost = (e: Event) => e.preventDefault();
  const onRestored = () => invalidate();
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  const ray = new THREE.Raycaster();
  const tapPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const tapAt = new THREE.Vector3();
  const nbShown = () => nbOn && tab === "basic" && fade.nb > 0.5;
  /** 点が塗る面の中か（穴は外） */
  const inFill = ([x, z]: XZ, f: SceneShape["fills"][number]) => inRing(x, z, f.outer) && !f.holes.some((h) => inRing(x, z, h));
  /**
   * たたいた所：調べた土地（"lot"）か、隣の土地（その key。隣の土地を出しているときだけ）か。札を押したらその土地。
   * 建物を押したら、その建物の足もとの土地（建物の向こうの地面ではなく）
   */
  function tapTarget(e: PointerEvent): string | null {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    for (const l of labels) {
      if (!l.on || !l.box || sx < l.box.l || sx > l.box.r || sy < l.box.t || sy > l.box.b) continue;
      if (l.key === "lot") return parts.fill ? "lot" : null;
      if (l.key.startsWith("nb:") && nbShown()) return l.key.slice(3);
    }
    ray.setFromCamera(new THREE.Vector2((sx / r.width) * 2 - 1, -(sy / r.height) * 2 + 1), camera);
    const b = parts.bldg.length ? ray.intersectObjects(parts.bldg, false)[0] : undefined;
    const p = b ? b.point : ray.ray.intersectPlane(tapPlane, tapAt);
    if (!p) return null;
    const at: XZ = [p.x, p.z];
    if (parts.fill && base?.target?.fills.some((f) => inFill(at, f))) return "lot";
    if (nbShown()) for (const n of nbLots) if (n.fills.some((f) => inFill(at, f))) return n.key;
    return null;
  }
  const endPointer = (e: PointerEvent, cancelled: boolean) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && ptrs.size === 0) {
      inertia = still() || cancelled ? 0 : clamp(drag.vx, -0.004, 0.004) * 16;
      drag = null;
    }
    if (!cancelled && tap && performance.now() - tap.t < 350) {
      const now = performance.now();
      if (now - lastTap < 320) {
        // 2回たたいた：そのタブの元の向きへ
        touched = false;
        applyPreset(nbOn && tab === "basic" ? "nb" : tab, true, 900);
        lastTap = 0;
      } else {
        lastTap = now;
        const hit = tapTarget(e);
        if (hit === "lot") {
          pulse();
          lotTapAt = now;
        } else if (hit) nbTap = { key: hit, at: now };
      }
    }
    tap = null;
    wake();
    invalidate();
  };

  // ---- 外から呼ぶ
  const api: PropertyScene = {
    setBase,
    setLots,
    setZones,
    setMarks,
    setLabels,
    setTab: (t) => {
      if (t !== tab) sceneForTab(t);
    },
    setPart: (p) => {
      if (p !== part || !Object.keys(cur).length) applyTheme(p, Object.keys(cur).length > 0);
    },
    setSun: (s) => {
      sunDir = s;
      if (Object.keys(cur).length) applyTheme(part, false);
    },
    setMotion: (on) => {
      motion = on;
      wake();
      invalidate();
    },
    setNeighbors: (on) => {
      if (on === nbOn) return;
      nbOn = on;
      if (tab === "basic") sceneForTab("basic");
    },
    setHazard: (image, bounds, depth) => {
      floodDepth = depth;
      if (M.haz) {
        M.haz.map?.dispose();
        M.haz.map = null;
        if (image && bounds && parts.haz) {
          const tex = new THREE.CanvasTexture(image);
          tex.colorSpace = THREE.SRGBColorSpace;
          M.haz.map = tex;
          parts.haz.scale.set(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0, 1);
          parts.haz.position.x = (bounds.x0 + bounds.x1) / 2;
          parts.haz.position.z = (bounds.z0 + bounds.z1) / 2;
        }
        M.haz.needsUpdate = true;
      }
      if (tab === "hazard") sceneForTab("hazard", true);
      invalidate();
    },
    setLayout: (l) => {
      const moved = l.centerY !== layout.centerY;
      layout = l;
      if (moved) setView();
      invalidate();
    },
    setVisible: (v) => {
      visible = v;
      if (v) invalidate();
    },
    resize: () => {
      const r = host.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      setView();
      invalidate();
    },
    pointerDown: (e) => {
      if (!arrived) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) {
        drag = { x: e.clientX, y: e.clientY, az: cam.azim, po: cam.polar, t: performance.now(), vx: 0, id: e.pointerId };
        tap = { x: e.clientX, y: e.clientY, t: performance.now() };
      }
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.dist };
        drag = null;
        tap = null;
      }
      if (camTween) {
        tweens.delete(camTween);
        camTween = null;
      }
      inertia = 0;
      idleAt = performance.now();
      wake();
    },
    pointerMove: (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        cam.dist = clamp(pinch.dist * (pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))), MIN_DIST, MAX_DIST);
        touched = true;
      } else if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        const t = performance.now();
        const az = drag.az - dx * 0.0062;
        drag.vx = (az - cam.azim) / Math.max(1, t - drag.t);
        drag.t = t;
        cam.azim = az;
        // 指は横だけ（縦は画面のスクロール）。マウスは縦で傾きも変える
        if (e.pointerType === "mouse") cam.polar = clamp(drag.po - dy * 0.004, 0.25, 1.32);
        if (tap && Math.hypot(dx, dy) > 8) tap = null;
        if (Math.abs(dx) > 4) touched = true;
      }
      idleAt = performance.now();
      invalidate();
    },
    pointerUp: (e) => endPointer(e, false),
    pointerCancel: (e) => endPointer(e, true),
    takeLotTap: () => {
      const hit = performance.now() - lotTapAt < 800;
      lotTapAt = 0;
      return hit;
    },
    takeNeighborTap: () => {
      const key = nbTap && performance.now() - nbTap.at < 800 ? nbTap.key : null;
      nbTap = null;
      return key;
    },
    setPicked: (keys) => {
      picked = new Set(keys);
      if (M.nbPick && M.nbFill) for (const n of nbLots) for (const m of n.meshes) m.material = picked.has(n.key) ? M.nbPick : M.nbFill;
      for (const l of labels) markPicked(l);
      invalidate();
    },
    wheel: (e) => {
      if (!arrived) return;
      if (camTween) {
        tweens.delete(camTween);
        camTween = null;
      }
      cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.01), MIN_DIST, MAX_DIST);
      touched = true;
      idleAt = performance.now();
      wake();
      invalidate();
    },
    dispose: () => {
      disposed = true;
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      for (const l of labels) l.el.remove();
      labels = [];
      for (const b of Object.values(bags)) b.dispose();
      shared.dispose();
      M.haz?.map?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
  api.resize();
  return api;
}
