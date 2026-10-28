"use client";

// 帯の街を、撮影から作った本物の 3D（Google の実写 3D タイル Photorealistic 3D Tiles）で描く。
// 帯と同じカメラ（lib/app/geo3d.ts の CITY_CAMERA。焼き込みと同じ）で画面の外のキャンバスに 1 回だけ描き、
// 色（α は街の被覆）・距離・面の向きの 3 枚の絵にして、帯の合成（components/app/sky-canvas.tsx）に渡す。描き終えたら 3D は捨てる。
//  料金：Google の 3D タイルは、読み込みの始め（ルートの要求）1 回ごとに数える（1 回で 3 時間まで使える。月 1,000 回まで無料）。
//        ページを開いたときに 1 回だけ読み、ページの中（ホームと下のメニューのページ）では同じ絵を使い回す。1 日の回数の上限は
//        Google Cloud の設定で決める（docs/features.md）。上限に達した日は今までの街のまま
//  規約：絵は保存しない（端末にも残さない。このページを開いている間のメモリの中だけ）。表示している間は Google Maps のロゴと
//        出典を出す（components/app/sky.tsx の CityCredit）。空・明かり・東京タワーの照明は MICHILU が描いたもの
//  鍵（NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY。Vercel の環境変数）が無い・上限・読めない・データ節約の設定・WebGL が無いときは、
//  今までの街（PLATEAU から焼いた層）のまま。#city3d=off で今までの街、#city3d=plateau で検証用に港区の PLATEAU の 3D タイル
import { CITY_CAMERA, DIST_MAX, ecefToEnuRows, vfovOf, viewDir } from "@/lib/app/geo3d";

/** 3D の街の絵（上の行から並べた RGBA。描いたキャンバスと同じ大きさ） */
export type City3D = {
  w: number;
  h: number;
  /** 色。α は街の被覆、色は α を掛けたまま（縁のなめらかさを保つ） */
  color: Uint8Array;
  /** 距離（m）を 0〜400km の 24 ビットで RGB に（lib/app/geo3d.ts の encodeDist と同じ） */
  dist: Uint8Array;
  /** 面の向き（カメラの ENU）を ×0.5+0.5 で RGB に */
  normal: Uint8Array;
  source: City3DSource;
  /** 出典の文字（Google はいま見えているタイルの著作権表示をまとめたもの） */
  credit: string;
};

export type City3DSource = "google" | "plateau";
type State = { status: "idle" | "loading" | "ready" | "failed"; result: City3D | null; key: string };

/** 状態が変わったら window に出すイベント */
export const CITY3D_EVENT = "michilu:city3d";

/** Google の鍵（ビルドのときに埋め込まれる。ブラウザ用の鍵なので、Google Cloud でサイトと API を制限しておく） */
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAP_TILES_KEY ?? "";
/** Google の 3D の街を使う設定があるか（データの出典の画面で、Google の規約のリンクを出す） */
export const GOOGLE_CITY_CONFIGURED = GOOGLE_KEY !== "";
/**
 * 検証用：港区の PLATEAU（2025 年度・LOD2・質感なし）の 3D タイル。国土交通省 Project PLATEAU（CC BY 4.0）。
 * 鍵が無くても、位置・距離・面の向き・合成を確かめられる（質感つきは粗い段階が無く、帯の広さだと 2GB 近くになるので使わない）
 */
const PLATEAU_MINATO =
  "https://assets.cms.plateau.reearth.io/assets/c7/1aabcb-eb54-4cfe-9b75-3a6458c9d29e/13103_minato-ku_pref_2025_citygml_1_op_bldg_3dtiles_13103_minato-ku_lod2_no_texture/tileset.json";

/** 細かさ：タイルの誤差が画面で何画素までなら粗いまま使うか（小さいほど細かく、読み込みが増える） */
const ERROR_TARGET = 8;
/** 読み込みを待つ長さ（これを過ぎて 9 割も読めていなければあきらめる）。検証用の PLATEAU は形が重い（約 300MB）ので長く */
const TIMEOUT_MS = { google: 45_000, plateau: 300_000 } as const;

let state: State = { status: "idle", result: null, key: "" };
const emit = () => typeof window !== "undefined" && window.dispatchEvent(new Event(CITY3D_EVENT));

/** いま使う 3D の街（無ければ null）。#city3d=off / plateau で切り替える */
export function city3dSource(): City3DSource | null {
  if (typeof location === "undefined") return null;
  const m = location.hash.match(/(?:^#|&)city3d=(off|plateau|google)(?:&|$)/);
  if (m?.[1] === "off") return null;
  if (m?.[1] === "plateau") return "plateau";
  if (!GOOGLE_KEY) return null;
  // データ節約の設定（iPhone の「省データモード」など）では読まない（数十 MB になることがある）
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return null;
  return "google";
}

export function city3dState(): Readonly<State> {
  return state;
}

/**
 * 3D の街を w×h の絵にする（まだなら始める。同じ大きさ・同じ出どころなら 1 回だけ）。終わったら CITY3D_EVENT。
 * 呼ぶのは帯が見えていて、焼いた街がそろってから（components/app/sky-canvas.tsx）
 */
export function requestCity3D(w: number, h: number): void {
  const source = city3dSource();
  if (!source) return;
  const key = `${source}|${w}x${h}`;
  if (state.key === key && state.status !== "idle") return;
  // 大きさが変わっても（画面を回したなど）、読み直さない（ルートの要求を増やさない）。最初の大きさの絵を引き伸ばして使う
  if (state.status === "loading" || state.status === "ready") return;
  state = { status: "loading", result: null, key };
  emit();
  render3D(source, w, h).then(
    (result) => {
      state = { status: "ready", result, key };
      emit();
    },
    (err: unknown) => {
      console.warn("3D の街を描けませんでした（今までの街のまま）:", err instanceof Error ? err.message : err);
      state = { status: "failed", result: null, key };
      emit();
    },
  );
}

/** 3D タイルを画面の外で描き、色・距離・面の向きを読み出す。three.js と 3D タイルの部品は、ここで初めて読み込む */
async function render3D(source: City3DSource, w: number, h: number): Promise<City3D> {
  const [THREE, { TilesRenderer }, { GLTFExtensionsPlugin, GoogleCloudAuthPlugin }, { DRACOLoader }] = await Promise.all([
    import("three"),
    import("3d-tiles-renderer"),
    import("3d-tiles-renderer/plugins"),
    import("three/addons/loaders/DRACOLoader.js"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const cam = CITY_CAMERA;
  const camera = new THREE.PerspectiveCamera(vfovOf(cam.hfov, cam.aspect), w / h, 3, DIST_MAX);
  camera.up.set(0, 0, 1);
  camera.position.set(0, 0, 0);
  const d = viewDir(cam.heading, cam.pitch);
  camera.lookAt(d[0], d[1], d[2]);
  camera.updateMatrixWorld(true);

  const scene = new THREE.Scene();
  const draco = new DRACOLoader().setDecoderPath(`/draco/${THREE.REVISION}/`);
  const tiles = source === "google" ? new TilesRenderer() : new TilesRenderer(PLATEAU_MINATO);
  if (source === "google") tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: GOOGLE_KEY, autoRefreshToken: false, useRecommendedSettings: false }));
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  tiles.errorTarget = ERROR_TARGET;
  // カメラは動かないので、見えているタイルだけを読む（隣のタイルを先読みしない。読み込み中に粗いタイルを出さない）
  tiles.loadSiblings = false;
  tiles.displayActiveTiles = false;
  // タイルは ECEF。カメラを原点にした ENU に置く（大きな座標のまま GPU に送らない）
  tiles.group.matrixAutoUpdate = false;
  tiles.group.matrix.set(...(ecefToEnuRows(cam.lat, cam.lon, cam.h) as Parameters<typeof tiles.group.matrix.set>));
  tiles.group.updateMatrixWorld(true);
  scene.add(tiles.group);
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);

  // 撮影した色のまま描く（光を当て直さない。時刻の光は帯の合成で）。斜めから見る地面がにじまないよう異方性のフィルタ
  const aniso = renderer.capabilities.getMaxAnisotropy();
  tiles.addEventListener("load-model", ({ scene: model }) => {
    model.traverse((o) => {
      const mesh = o as InstanceType<typeof THREE.Mesh>;
      if (!mesh.isMesh) return;
      const old = mesh.material as InstanceType<typeof THREE.MeshStandardMaterial>;
      const map = old.map ?? null;
      if (map) map.anisotropy = aniso;
      // 質感の無い面（検証用の PLATEAU）は中くらいの灰色に（真っ白だと昼は白く飛んで光の当たり方が見えない）
      mesh.material = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : 0x8a8a8a });
      old.dispose();
    });
  });

  let rootError: unknown = null;
  tiles.addEventListener("load-error", ({ tile, error }) => {
    if (!tile || tile === tiles.root) rootError = error ?? new Error("ルートを読めません");
  });
  let settled = false;
  tiles.addEventListener("tiles-load-start", () => (settled = false));
  tiles.addEventListener("tiles-load-end", () => (settled = true));

  const dispose = () => {
    tiles.dispose();
    draco.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const t0 = performance.now();
      let stable = 0;
      // 読み込みの間は描かない（どのタイルが要るかは update だけで決まる。描くのは読み終えた最後の 1 回）
      const step = () => {
        tiles.update();
        if (rootError) return reject(rootError instanceof Error ? rootError : new Error(String(rootError)));
        // 読み込みが止まり、全部読めた状態が 3 コマ続いたら終わり（カメラは動かないので、それ以上は読まない）
        if (settled && tiles.loadProgress >= 1 && tiles.visibleTiles.size > 0) {
          if (++stable >= 3) return resolve();
        } else stable = 0;
        if (performance.now() - t0 > TIMEOUT_MS[source]) {
          return tiles.visibleTiles.size > 0 && tiles.loadProgress >= 0.9 ? resolve() : reject(new Error(`時間切れ（${Math.round(tiles.loadProgress * 100)}%）`));
        }
        setTimeout(step, 50);
      };
      step();
    });
    // 読み込みの記録（タイルの数・置き場が満杯で断ったタイル・使ったメモリ）
    // （stats と cachedBytes は型に書かれていないので、形を決めて読む）
    const refused = (tiles as unknown as { stats: { refused: number } }).stats.refused;
    const bytes = (tiles.lruCache as unknown as { cachedBytes: number }).cachedBytes;
    console.info(`3D の街（${source}）：表示 ${tiles.visibleTiles.size} 枚・断った ${refused} 枚・${Math.round(bytes / 1048576)}MB`);
    // 色：画面の外のキャンバスにそのまま描いた絵（sRGB。縁はなめらか）
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const color = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, color);
    // 距離と面の向き：同じ場面を、値を書き出す材質で描き直す（縁をぼかさない）
    const target = new THREE.WebGLRenderTarget(w, h, { samples: 0, depthBuffer: true });
    const pass = (mode: number) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uMode: { value: mode }, uViewToWorld: { value: new THREE.Matrix3().setFromMatrix4(camera.matrixWorld) } },
        vertexShader: PASS_VERT,
        fragmentShader: PASS_FRAG,
      });
      scene.overrideMaterial = mat;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      const out = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(target, 0, 0, w, h, out);
      scene.overrideMaterial = null;
      mat.dispose();
      return out;
    };
    const dist = pass(0);
    const normal = pass(1);
    target.dispose();
    const credits = tiles
      .getAttributions()
      .filter((a) => a.type === "string" && typeof a.value === "string" && a.value)
      .map((a) => a.value as string);
    return {
      w,
      h,
      color: flipRows(color, w, h),
      dist: flipRows(dist, w, h),
      normal: flipRows(normal, w, h),
      source,
      credit: source === "google" ? credits.join("; ") : "国土交通省 Project PLATEAU（港区 2025・検証用）",
    };
  } finally {
    dispose();
  }
}

/** 読み出した絵は下の行から並ぶので、上の行からに並べ直す（ほかの層の絵と同じ向き） */
function flipRows(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(src.length);
  const row = w * 4;
  for (let y = 0; y < h; y++) out.set(src.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  return out;
}

/** 距離と面の向きを書き出す材質。対数の奥行き（色の絵と同じ）で、同じ面が手前に来る */
const PASS_VERT = `
varying vec3 vView;
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  vView=mv.xyz;
  gl_Position=projectionMatrix*mv;
  #include <logdepthbuf_vertex>
}`;
const PASS_FRAG = `
precision highp float;
uniform int uMode;
uniform mat3 uViewToWorld;
varying vec3 vView;
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  if(uMode==0){
    float q=floor(clamp(length(vView)/${DIST_MAX.toFixed(1)},0.0,1.0)*16777215.0+0.5);
    float r=floor(q/65536.0);float g=floor((q-r*65536.0)/256.0);float b=q-r*65536.0-g*256.0;
    gl_FragColor=vec4(r,g,b,255.0)/255.0;
  }else{
    vec3 n=normalize(cross(dFdx(vView),dFdy(vView)));
    if(dot(n,vView)>0.0)n=-n;
    gl_FragColor=vec4(normalize(uViewToWorld*n)*0.5+0.5,1.0);
  }
}`;
