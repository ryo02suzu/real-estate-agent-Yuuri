"use client";

// PC の「3D」：Google の実写 3D タイル（Map Tiles API の Photorealistic 3D Tiles）で、物件のまわりを回して見る。
// 料金：Google は「ルートの要求」（root.json）1 回ごとに数える（1 回で 3 時間まで読める。月の上限は Google Cloud 側の見張り役
//       scripts/google-3d/ が決める）。ルートは 3D を開いたときに初めて要求し（ページを開いただけでは要求しない）、ページを開いている間は
//       同じセッション（この部品の中の 1 つの TilesRenderer）を使い回す。物件を変えても、物件のまわりへカメラを動かすだけ。
//       2 時間 55 分を過ぎたら、次に 3D を出すときに取り直す（lib/app/desk.ts の sessionUsable）。自動の取り直し（断られるたびにルートを
//       要求し直す）はしない（断られ続けると回数が増えるため）。
// 規約（Google Maps Platform 利用規約 3.2.3）：Google の 3D を出している間は、地理院の地図を同じ画面に出さない（呼ぶ側
//       components/desk/stage-3d.tsx と components/desktop-shell.tsx）。Google のロゴと、いま見えているタイルの出典を常に出す（credit）。
//       絵は保存しない（preserveDrawingBuffer なし。画像の書き出し・印刷・書類に入れない）。タイルは HTTP の Cache-Control のとおり
//       （ブラウザのキャッシュに任せ、自前では保存しない）。上に重ねるのは MICHILU のデータ（物件と隣の筆の線・札）だけ。
// 断られた（429 上限・403 鍵の制限）・読めない・時間切れのときは、呼ぶ側に知らせて代わりの 3D（地理院のデータの街の模型）にする。
import type * as T from "three";
import type { TilesRenderer as TilesRendererType } from "3d-tiles-renderer";
import { googleFailOf, sessionUsable, type GoogleFail, type GoogleLight } from "@/lib/app/desk";
import { ecefToEnuRows } from "@/lib/app/geo3d";
import type { XZ } from "@/lib/app/town-model";

type Three = typeof import("three");

/** Google の鍵（ビルドのときに埋め込まれる。ブラウザ用の鍵なので、Google Cloud でサイトと API を制限しておく） */
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY ?? "";
/** Google の 3D を使う設定があるか */
export const GOOGLE_3D_CONFIGURED = KEY !== "";
const ROOT = "https://tile.googleapis.com/v1/3dtiles/root.json";
const HOST = "tile.googleapis.com";
/** これだけ待っても 1 枚も見えなければあきらめる */
const FIRST_TILE_MS = 30_000;

/** 物件の筆と隣の筆（原点＝調べた地点からのメートル。東が x、南が z。lib/app/scene-lots.ts の形） */
export type GoogleOverlay = { target: [XZ, XZ][]; fills: XZ[][]; neighbors: [XZ, XZ][] };
/** 3D に重ねる札（at は原点からのメートル。東が x、南が z） */
export type GoogleLabel = { key: string; title: string; sub?: string; at: XZ; kind: "lot" | "place"; color?: string };
/** 見えている所（px。キャンバスの端からの幅）。物件はこの中の真ん中に置く */
export type Frame = { left: number; right: number; top: number; bottom: number };
export type GoogleStatus = { loading: boolean; credit: string; tiles: number };

export type GoogleView = {
  attach(host: HTMLElement, labelHost: HTMLElement): void;
  detach(): void;
  /** 物件の場所（緯度・経度）。最初は飛ばずにそこへ置き、2 回目からは滑らかに移る。dist はカメラから物件までの距離（m） */
  setTarget(lat: number, lng: number, dist: number): void;
  setLight(l: GoogleLight): void;
  setOverlay(o: GoogleOverlay | null): void;
  setLabels(labels: GoogleLabel[]): void;
  setFrame(f: Frame): void;
  setReduced(on: boolean): void;
  zoomBy(f: number): void;
  rotateBy(rad: number): void;
  tiltBy(rad: number): void;
  panBy(dx: number, dy: number): void;
  northUp(): void;
  recenter(): void;
  status(): GoogleStatus;
  onStatus(cb: (s: GoogleStatus) => void): () => void;
};

type Session = { view: GoogleView & { dispose(): void }; createdAt: number };
let session: Session | null = null;
let failed: GoogleFail | null = null;
const failListeners = new Set<(f: GoogleFail) => void>();

/** このページで Google の 3D を出せなくなったわけ（出せていれば null） */
export function googleFailed(): GoogleFail | null {
  return failed;
}

function fail(f: GoogleFail) {
  if (failed) return;
  failed = f;
  console.warn(`Google の 3D を使えません（${f}）。代わりの 3D にします`);
  for (const cb of failListeners) cb(f);
  // 読み込みを止めて捨てる（このページではもう要求しない）
  session?.view.dispose();
  session = null;
}

/** 出せなくなったら知らせる */
export function onGoogleFail(cb: (f: GoogleFail) => void): () => void {
  failListeners.add(cb);
  return () => failListeners.delete(cb);
}

/**
 * 3D を出すときに呼ぶ。いまのセッションが使えればそれを、無い・古ければ作る（ここで初めてルートを要求する）。
 * 鍵が無い・もう断られたときは null
 */
export async function acquireGoogle3D(): Promise<GoogleView | null> {
  if (!GOOGLE_3D_CONFIGURED) {
    failed ??= "nokey";
    return null;
  }
  if (failed) return null;
  if (session && sessionUsable(session.createdAt, Date.now())) return session.view;
  session?.view.dispose();
  session = null;
  const view = await createView();
  if (!view) {
    fail("webgl");
    return null;
  }
  if (failed) {
    view.dispose();
    return null;
  }
  session = { view, createdAt: Date.now() };
  return view;
}

/** いまのセッションの作った時刻（取り直しの見張りに使う。無ければ 0） */
export function sessionCreatedAt(): number {
  return session?.createdAt ?? 0;
}

/** ルートの JSON から、セッションの印（タイルの URL の session=）を探す */
function sessionOf(json: unknown): string | null {
  const stack: unknown[] = [(json as { root?: unknown })?.root];
  while (stack.length) {
    const t = stack.pop() as { content?: { uri?: string }; children?: unknown[] } | undefined;
    if (!t) continue;
    const uri = t.content?.uri;
    if (uri && uri.includes("session=")) return new URLSearchParams(uri.split("?")[1] ?? "").get("session");
    if (Array.isArray(t.children)) stack.push(...t.children);
  }
  return null;
}

/**
 * Google のタイルを読む部品（3d-tiles-renderer の plugin）。鍵とセッションの印を付けて読み、断られたら状態を知らせる。
 * 見えているタイルの出典（asset.copyright）を数え、多い順に並べる（Google の決まり）
 */
class GoogleAuth {
  name = "MICHILU_GOOGLE_AUTH";
  private session: string | null = null;
  private tiles: TilesRendererType | null = null;
  private counts = new Map<string, number>();
  private onVis = ({ tile, visible }: { tile: { engineData?: { metadata?: { asset?: { copyright?: string } } } }; visible: boolean }) => {
    const c = tile.engineData?.metadata?.asset?.copyright ?? "";
    for (const t of c.split(";").map((s) => s.trim()).filter(Boolean)) {
      const n = (this.counts.get(t) ?? 0) + (visible ? 1 : -1);
      if (n > 0) this.counts.set(t, n);
      else this.counts.delete(t);
    }
    this.onCredit();
  };
  constructor(
    private onError: (status: number, root: boolean) => void,
    private onOk: () => void,
    private onCredit: () => void,
  ) {}
  init(tiles: TilesRendererType) {
    this.tiles = tiles;
    tiles.addEventListener("tile-visibility-change", this.onVis as never);
  }
  credit(): string {
    return [...this.counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t)
      .join("; ");
  }
  async fetchData(url: string, options?: RequestInit): Promise<Response | unknown> {
    const u = new URL(url);
    if (u.host !== HOST) return fetch(u, options);
    u.searchParams.set("key", KEY);
    if (this.session && !u.searchParams.has("session")) u.searchParams.set("session", this.session);
    const root = u.pathname === "/v1/3dtiles/root.json";
    const res = await fetch(u, options);
    if (!res.ok) {
      this.onError(res.status, root);
      if (root) throw new Error(`Google の 3D のルートを読めません（${res.status}）`);
      return res;
    }
    this.onOk();
    if (!root) return res;
    const json: unknown = await res.json();
    this.session = sessionOf(json);
    return json;
  }
  dispose() {
    this.tiles?.removeEventListener("tile-visibility-change", this.onVis as never);
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;

/** カメラ（物件を見る位置）。az は物件から見たカメラの方位（北 0 の時計回り）、el は見下ろす角、dist は物件までの距離（m） */
type Cam = { tx: number; ty: number; tz: number; az: number; el: number; dist: number };

/** 光を写真に掛ける材質の差し込み（面の向きは、描く点の位置の変化から求める。タイルに面の向きが無くてもよい） */
function lightMaterial(THREE: Three, map: T.Texture | null, U: Record<string, { value: unknown }>): T.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : 0x9a9a9a });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = "varying vec3 vDeskView;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvDeskView = mvPosition.xyz;");
    sh.fragmentShader =
      "varying vec3 vDeskView;\nuniform vec3 uTint;\nuniform float uAmb;\nuniform float uSun;\nuniform vec3 uSunView;\n" +
      sh.fragmentShader.replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n{ vec3 nn = normalize(cross(dFdx(vDeskView), dFdy(vDeskView))); if (dot(nn, vDeskView) > 0.0) nn = -nn; float lit = uAmb + uSun * max(dot(nn, normalize(uSunView)), 0.0); diffuseColor.rgb *= uTint * lit; }",
      );
  };
  return m;
}

async function createView(): Promise<(GoogleView & { dispose(): void }) | null> {
  const [THREE, { TilesRenderer }, { GLTFExtensionsPlugin }, { DRACOLoader }] = await Promise.all([
    import("three"),
    import("3d-tiles-renderer"),
    import("3d-tiles-renderer/plugins"),
    import("three/addons/loaders/DRACOLoader.js"),
  ]);
  let renderer: T.WebGLRenderer;
  try {
    // 絵は保存しない（preserveDrawingBuffer を付けない）。遠くの街まで重ならないよう、奥行きは対数で持つ
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;outline:none;touch-action:none";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "物件のまわりの 3D（Google）。矢印キーで回す・傾ける、＋と−で寄る・引く、Shift と矢印で動かす");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 160000);
  camera.up.set(0, 0, 1);

  // 光（時間帯）。どのタイルの材質も同じ値を見る
  const U = { uTint: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: 0.86 }, uSun: { value: 0.2 }, uSunView: { value: new THREE.Vector3(0, 0, 1) } };
  const sunWorld = new THREE.Vector3(0, -0.5, 0.8).normalize();

  const draco = new DRACOLoader().setDecoderPath(`/draco/${THREE.REVISION}/`);
  const tiles = new TilesRenderer(ROOT);
  let firstOk = false;
  let tileErrors = 0;
  let lastError = 0;
  const auth = new GoogleAuth(
    (status, root) => {
      if (root) return fail(googleFailOf(status));
      // タイルで断られた：回数の上限（429）か、続けて断られたら（セッション切れ・鍵の制限）あきらめる
      if (status === 429) return fail("quota");
      tileErrors++;
      lastError = status;
      if (!firstOk && tileErrors >= 4) fail(googleFailOf(status));
      else if (tileErrors >= 24) fail(googleFailOf(lastError));
    },
    () => {
      firstOk = true;
      tileErrors = Math.max(0, tileErrors - 1);
    },
    () => emitSoon(),
  );
  tiles.registerPlugin(auth);
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  // Google の実写 3D の目安の細かさ（Google の部品の推奨と同じ 20）
  tiles.errorTarget = 20;
  tiles.group.matrixAutoUpdate = false;
  scene.add(tiles.group);
  tiles.setCamera(camera);

  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tiles.addEventListener("load-model", ({ scene: model }) => {
    (model as T.Object3D).traverse((o) => {
      const mesh = o as T.Mesh;
      if (!mesh.isMesh) return;
      const old = mesh.material as T.MeshStandardMaterial;
      const map = old.map ?? null;
      if (map) map.anisotropy = aniso;
      mesh.material = lightMaterial(THREE, map, U);
      old.dispose();
    });
    wake();
  });
  tiles.addEventListener("dispose-model", ({ scene: model }) => {
    (model as T.Object3D).traverse((o) => {
      const mesh = o as T.Mesh;
      if (mesh.isMesh) (mesh.material as T.Material).dispose();
    });
  });
  tiles.addEventListener("load-error", ({ tile }) => {
    if (!tile) fail("failed");
  });
  tiles.addEventListener("needs-update", () => wake());
  tiles.addEventListener("tiles-load-end", () => {
    wake();
    measureGround();
  });

  // ---- 重ねるもの（MICHILU のデータ）：物件の筆の線と薄い面・低い光の幕、隣の筆の線
  const overlay = new THREE.Group();
  overlay.renderOrder = 10;
  scene.add(overlay);
  const gold = new THREE.Color("#f2b84b");
  const lineM = new THREE.LineBasicMaterial({ color: gold, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const nbM = new THREE.LineBasicMaterial({ color: new THREE.Color("#ffe3a6"), transparent: true, opacity: 0.7, depthTest: false, depthWrite: false });
  const fillM = new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const wallM = new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.26, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  let overlayData: GoogleOverlay | null = null;

  // ---- 状態
  let lat0 = NaN;
  let lng0 = NaN;
  /** 物件の地面の高さ（原点の楕円体高 0 からの m。タイルを読むたびに測り直す） */
  let ground = 40;
  let groundKnown = false;
  const cam: Cam = { tx: 0, ty: 0, tz: 40, az: 200 * DEG, el: 34 * DEG, dist: 260 };
  const goal: Cam = { ...cam };
  let homeDist = 260;
  let frame: Frame = { left: 0, right: 0, top: 0, bottom: 0 };
  let W = 1;
  let H = 1;
  let host: HTMLElement | null = null;
  let labelHost: HTMLElement | null = null;
  let labels: { l: GoogleLabel; el: HTMLDivElement; w: number; h: number }[] = [];
  let running = false;
  let dirty = true;
  let reduced = false;
  let disposed = false;
  let attachedAt = 0;
  const listeners = new Set<(s: GoogleStatus) => void>();
  let emitFrame = 0;
  const status = (): GoogleStatus => ({ loading: !firstOk || tiles.loadProgress < 1, credit: auth.credit(), tiles: tiles.visibleTiles.size });
  function emitSoon() {
    if (emitFrame) return;
    emitFrame = requestAnimationFrame(() => {
      emitFrame = 0;
      const s = status();
      for (const cb of listeners) cb(s);
    });
  }

  /** 調べた地点から見たメートル（東 x・北 y） */
  const enuOf = ([x, z]: XZ): [number, number] => [x, -z];

  function placeTiles() {
    tiles.group.matrix.set(...(ecefToEnuRows(lat0, lng0, 0) as Parameters<T.Matrix4["set"]>));
    tiles.group.matrixWorldNeedsUpdate = true;
    tiles.group.updateMatrixWorld(true);
  }

  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, 0, -1);
  const from = new THREE.Vector3();
  /**
   * 物件の地面の高さを測る（タイルの面に上から光を当てる）。建物の屋根に当たらないよう、筆の角とまわりの輪の点で測り、
   * 低い方から 4 分の 1 の高さを地面とする。まだ読めていなければ前の値のまま
   */
  function measureGround() {
    if (!Number.isFinite(lat0) || !tiles.root) return;
    const pts: [number, number][] = [];
    for (const [a] of (overlayData?.target ?? []).slice(0, 16)) pts.push(enuOf(a));
    for (let i = 0; i < 8; i++) pts.push([Math.cos((i * Math.PI) / 4) * 18, Math.sin((i * Math.PI) / 4) * 18]);
    const hs: number[] = [];
    ray.far = 20000;
    for (const [x, y] of pts) {
      ray.set(from.set(x, y, 9000), down);
      const hit = ray.intersectObject(tiles.group, true)[0];
      if (hit && Number.isFinite(hit.point.z)) hs.push(hit.point.z);
    }
    if (hs.length < 3) return;
    hs.sort((a, b) => a - b);
    const z = hs[Math.floor(hs.length / 4)];
    if (Math.abs(z - ground) < 0.4 && groundKnown) return;
    ground = z;
    groundKnown = true;
    goal.tz = z;
    if (reduced || !attachedAt) cam.tz = z;
    buildOverlay();
    wake();
  }

  function buildOverlay() {
    for (const c of [...overlay.children]) {
      overlay.remove(c);
      (c as T.Mesh).geometry?.dispose();
    }
    if (!overlayData) return;
    const z = ground + 0.6;
    const seg = (edges: [XZ, XZ][], dz: number) => {
      const arr: number[] = [];
      for (const [a, b] of edges) {
        const [ax, ay] = enuOf(a);
        const [bx, by] = enuOf(b);
        arr.push(ax, ay, dz, bx, by, dz);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      return g;
    };
    if (overlayData.neighbors.length) overlay.add(new THREE.LineSegments(seg(overlayData.neighbors, z), nbM));
    if (overlayData.target.length) {
      overlay.add(new THREE.LineSegments(seg(overlayData.target, z), lineM));
      overlay.add(new THREE.LineSegments(seg(overlayData.target, z + 0.5), lineM));
      // 低い光の幕（高さ 3m）
      const wall: number[] = [];
      for (const [a, b] of overlayData.target) {
        const [ax, ay] = enuOf(a);
        const [bx, by] = enuOf(b);
        wall.push(ax, ay, z, bx, by, z, bx, by, z + 3, ax, ay, z, bx, by, z + 3, ax, ay, z + 3);
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
      overlay.add(new THREE.Mesh(wg, wallM));
    }
    for (const ring of overlayData.fills) {
      if (ring.length < 3) continue;
      const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(...enuOf(p))));
      const g = new THREE.ShapeGeometry(shape);
      g.translate(0, 0, z - 0.2);
      overlay.add(new THREE.Mesh(g, fillM));
    }
    overlay.children.forEach((c) => (c.renderOrder = 10));
    wake();
  }

  // ---- カメラ
  function placeCamera() {
    const ce = Math.cos(cam.el);
    camera.position.set(cam.tx + cam.dist * ce * Math.sin(cam.az), cam.ty + cam.dist * ce * Math.cos(cam.az), cam.tz + cam.dist * Math.sin(cam.el));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.updateMatrixWorld();
  }
  function setView() {
    // 物件を、見えている所（左の列とカルテの間）の真ん中に置く
    const cx = (frame.left + (W - frame.right)) / 2;
    const cy = (frame.top + (H - frame.bottom)) / 2;
    camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  function resize() {
    if (!host) return;
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    renderer.setSize(W, H, false);
    setView();
    tiles.setResolutionFromRenderer(camera, renderer);
    for (const l of labels) l.w = l.h = 0;
    wake();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;

  // ---- 札
  const v3 = new THREE.Vector3();
  function placeLabels() {
    const placed: { l: number; t: number; r: number; b: number }[] = [];
    for (const it of labels) {
      const [x, y] = enuOf(it.l.at);
      v3.set(x, y, ground + (it.l.kind === "lot" ? 6 : 3)).project(camera);
      const sx = ((v3.x + 1) / 2) * W;
      const sy = ((1 - v3.y) / 2) * H;
      if (!it.w) {
        it.w = it.el.offsetWidth;
        it.h = it.el.offsetHeight;
      }
      const box = { l: sx - it.w / 2, t: sy - it.h - 6, r: sx + it.w / 2, b: sy };
      const inside = v3.z < 1 && sx > frame.left + 8 && sx < W - frame.right - 8 && box.t > frame.top + 4 && sy < H - frame.bottom - 4;
      const hit = placed.some((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t);
      const vis = inside && (!hit || it.l.kind === "lot");
      it.el.style.opacity = vis ? "1" : "0";
      if (vis) {
        placed.push(box);
        it.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-100%)`;
      }
    }
  }

  // ---- 描く（動いている間・読み込み中だけ）
  let last = 0;
  function loop(t: number) {
    if (disposed || !host) {
      running = false;
      return;
    }
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    // 目標へ滑らかに近づく（動きを減らす設定では、すぐ）
    const k = reduced ? 1 : 1 - Math.exp(-dt / 140);
    let moving = false;
    for (const key of ["tx", "ty", "tz", "az", "el", "dist"] as const) {
      const d = goal[key] - cam[key];
      if (Math.abs(d) > (key === "dist" ? 0.05 : key === "az" || key === "el" ? 0.0004 : 0.01)) {
        cam[key] += d * k;
        moving = true;
      } else cam[key] = goal[key];
    }
    placeCamera();
    tiles.update();
    // 太陽の向きを、カメラから見た向きにする（面の向きもカメラから見た向きで求めている）
    (U.uSunView.value as T.Vector3).copy(sunWorld).transformDirection(camera.matrixWorldInverse);
    renderer.render(scene, camera);
    placeLabels();
    const loading = tiles.loadProgress < 1 || !firstOk;
    if (attachedAt && !firstOk && performance.now() - attachedAt > FIRST_TILE_MS && tiles.visibleTiles.size === 0) fail("failed");
    if (moving || loading || dirty) {
      dirty = false;
      requestAnimationFrame(loop);
    } else {
      running = false;
      last = 0;
    }
    emitSoon();
  }
  function wake() {
    dirty = true;
    if (running || disposed || !host || document.visibilityState === "hidden") return;
    running = true;
    requestAnimationFrame(loop);
  }
  const onVisibility = () => wake();

  // ---- 操作（ドラッグで回す・Shift か右ドラッグで動かす・ホイールで寄る・キーボード）
  let drag: { x: number; y: number; pan: boolean; id: number } | null = null;
  const onDown = (e: PointerEvent) => {
    canvas.focus({ preventScroll: true });
    drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2, id: e.pointerId };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // 押さえ続けられなくても動かす
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.pan) api.panBy(dx, dy);
    else {
      goal.az -= dx * 0.005;
      goal.el = clamp(goal.el + dy * 0.004, 8 * DEG, 85 * DEG);
      cam.az = goal.az;
      cam.el = goal.el;
    }
    wake();
  };
  const onUp = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    goal.dist = clamp(goal.dist * Math.exp(e.deltaY * 0.0014), 40, 4000);
    wake();
  };
  const onKey = (e: KeyboardEvent) => {
    const step = 12 * DEG;
    if (e.shiftKey && e.key.startsWith("Arrow")) {
      const d = 60;
      if (e.key === "ArrowLeft") api.panBy(d, 0);
      else if (e.key === "ArrowRight") api.panBy(-d, 0);
      else if (e.key === "ArrowUp") api.panBy(0, d);
      else api.panBy(0, -d);
    } else if (e.key === "ArrowLeft") api.rotateBy(step);
    else if (e.key === "ArrowRight") api.rotateBy(-step);
    else if (e.key === "ArrowUp") api.tiltBy(6 * DEG);
    else if (e.key === "ArrowDown") api.tiltBy(-6 * DEG);
    else if (e.key === "+" || e.key === "=") api.zoomBy(0.75);
    else if (e.key === "-" || e.key === "_") api.zoomBy(1.33);
    else if (e.key === "0" || e.key === "Home") api.recenter();
    else return;
    e.preventDefault();
  };
  const onMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("contextmenu", onMenu);

  const api: GoogleView & { dispose(): void } = {
    attach(h, lh) {
      if (disposed) return;
      host = h;
      labelHost = lh;
      h.appendChild(canvas);
      for (const l of labels) lh.appendChild(l.el);
      ro?.observe(h);
      attachedAt = performance.now();
      document.addEventListener("visibilitychange", onVisibility);
      resize();
      wake();
    },
    detach() {
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.remove();
      for (const l of labels) l.el.remove();
      host = null;
      labelHost = null;
      attachedAt = 0;
    },
    setTarget(lat, lng, dist) {
      const first = !Number.isFinite(lat0);
      const same = lat === lat0 && lng === lng0;
      homeDist = dist;
      if (same) return;
      lat0 = lat;
      lng0 = lng;
      placeTiles();
      // 物件を変えた：同じセッションのまま、そこへカメラを置き直す（ルートは要求し直さない）
      groundKnown = false;
      Object.assign(goal, { tx: 0, ty: 0, az: 200 * DEG, el: 34 * DEG, dist });
      if (first || reduced) Object.assign(cam, goal);
      else Object.assign(cam, { ...goal, dist: Math.max(goal.dist, 600) });
      measureGround();
      wake();
    },
    setLight(l) {
      (U.uTint.value as T.Color).setRGB(l.tint[0], l.tint[1], l.tint[2]);
      U.uAmb.value = l.ambient;
      U.uSun.value = l.sun;
      const az = l.az * DEG;
      const alt = l.alt * DEG;
      sunWorld.set(Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)).normalize();
      wake();
    },
    setOverlay(o) {
      overlayData = o;
      buildOverlay();
      measureGround();
    },
    setLabels(next) {
      for (const l of labels) l.el.remove();
      labels = next.map((l) => {
        const el = document.createElement("div");
        el.className = `desk-3d-label${l.kind === "lot" ? " is-lot" : ""}`;
        el.style.opacity = "0";
        if (l.color) el.style.setProperty("--dot", l.color);
        const b = document.createElement("b");
        b.textContent = l.title;
        el.append(b);
        if (l.sub) {
          const s = document.createElement("span");
          s.textContent = l.sub;
          el.append(s);
        }
        labelHost?.appendChild(el);
        return { l, el, w: 0, h: 0 };
      });
      wake();
    },
    setFrame(f) {
      frame = f;
      setView();
      wake();
    },
    setReduced(on) {
      reduced = on;
    },
    zoomBy(f) {
      goal.dist = clamp(goal.dist * f, 40, 4000);
      wake();
    },
    rotateBy(rad) {
      goal.az += rad;
      wake();
    },
    tiltBy(rad) {
      goal.el = clamp(goal.el + rad, 8 * DEG, 85 * DEG);
      wake();
    },
    panBy(dx, dy) {
      // 地面をつかんで動かす向き（画面の右は地面の (−cos, sin)、画面の奥は (−sin, −cos)）
      const s = goal.dist * 0.0016;
      const rx = -Math.cos(goal.az);
      const ry = Math.sin(goal.az);
      const fx = -Math.sin(goal.az);
      const fy = -Math.cos(goal.az);
      const f = 1 / Math.max(0.35, Math.sin(goal.el));
      goal.tx += -rx * dx * s + fx * dy * s * f;
      goal.ty += -ry * dx * s + fy * dy * s * f;
      const r = Math.hypot(goal.tx, goal.ty);
      // 物件から 1.5km より先へは行かない
      if (r > 1500) {
        goal.tx *= 1500 / r;
        goal.ty *= 1500 / r;
      }
      cam.tx = goal.tx;
      cam.ty = goal.ty;
      wake();
    },
    northUp() {
      Object.assign(goal, { az: Math.round(goal.az / (2 * Math.PI)) * 2 * Math.PI + Math.PI, el: 80 * DEG });
      wake();
    },
    recenter() {
      Object.assign(goal, { tx: 0, ty: 0, tz: groundKnown ? ground : goal.tz, el: 34 * DEG, dist: homeDist });
      wake();
    },
    status,
    onStatus(cb) {
      listeners.add(cb);
      cb(status());
      return () => listeners.delete(cb);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      api.detach();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("contextmenu", onMenu);
      if (emitFrame) cancelAnimationFrame(emitFrame);
      for (const c of overlay.children) (c as T.Mesh).geometry?.dispose();
      for (const m of [lineM, nbM, fillM, wallM]) m.dispose();
      tiles.dispose();
      draco.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      listeners.clear();
    },
  };
  return api;
}
