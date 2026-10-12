// 物件の地点の災害リスク（洪水・内水・高潮・津波・土砂災害）と地面の高さ。
// 国土交通省・国土地理院「ハザードマップポータルサイト」の重ねるハザードマップのタイル（PNG。z17 まで）を読み、
// 地点の画素の色を凡例の色に当てて区分を出す（公式サイトの以前の地点表示と同じく、凡例の色との近さで判定する）。
// 市区町村が水防法・土砂災害防止法に基づいて作るハザードマップではないので、重要事項説明には使えない。
// 画面では参考として出し、市区町村のハザードマップ（わがまちハザードマップの登録先）へ案内する
import { cityCode } from "./codes";

/** 地点を読むタイルのズーム（約 1m の画素。重ねるハザードマップのタイルは z17 まで） */
export const HAZARD_ZOOM = 17;

/** 重ねるハザードマップのオープンデータのタイル */
export const hazardTileUrl = (id: string) => `https://disaportaldata.gsi.go.jp/raster/${id}/{z}/{x}/{y}.png`;

export type HazardClass = {
  /** 凡例の色 */
  color: string;
  /** 「3〜5m」「特別警戒区域」 */
  label: string;
  /** スマホの1行や地図の凡例に使う短い名前 */
  short: string;
  /** 大きいほど危ない（近くの、より危ない区域を探すのに使う） */
  rank: number;
  /** 凡例で入れ子になっている細かい区分（〜0.3m・0.5〜1m など。市区町村によって分けている） */
  sub?: boolean;
};

export type HazardLayer = {
  /** タイルの置き場所（hazardTileUrl） */
  id: string;
  /** 凡例・行の見出し（土砂災害は種類ごと） */
  name: string;
  classes: HazardClass[];
  /** タイルがある最小のズーム */
  minzoom: number;
  /** 区域を丸の模様で描いている（家屋倒壊等氾濫想定区域の氾濫流）。画素が透明でも、上下左右を模様に囲まれていれば区域内 */
  pattern?: boolean;
};

export type HazardKind = "flood" | "naisui" | "takashio" | "tsunami" | "dosha" | "kaoku" | "keizoku";

/** 市区町村のハザードマップ（わがまちハザードマップの登録先）の種類 */
export type HazardMapKind = "flood" | "naisui" | "takashio" | "tsunami" | "dosha";

export type HazardInfo = {
  /** 「洪水（想定最大規模）」（共有の文面など、ほかの説明が無い所で使う） */
  label: string;
  /** 画面・印刷の表の見出し（「洪水」。想定最大規模であることは表の注記で） */
  name: string;
  /** 地図の道具のボタン・スマホの印（「洪水」） */
  short: string;
  /** 地図の凡例の見出し */
  legend: string;
  layers: HazardLayer[];
  /** 出典のデータの作成者等（ハザードマップポータルサイトのオープンデータの一覧のとおり） */
  author: string;
  /** その種類の市区町村のハザードマップ */
  map: HazardMapKind;
};

/** 浸水深の凡例（洪水・高潮・津波。内水は浅い区分の下限が 0.1m）。凡例の上から（深い順） */
function depthClasses(naisui = false): HazardClass[] {
  return [
    { color: "#dc7adc", label: "20m以上", short: "20m以上", rank: 8 },
    { color: "#f285c9", label: "10〜20m", short: "10〜20m", rank: 7 },
    { color: "#ff9191", label: "5〜10m", short: "5〜10m", rank: 6 },
    { color: "#ffb7b7", label: "3〜5m", short: "3〜5m", rank: 5 },
    { color: "#ffd8c0", label: "0.5〜3m", short: "0.5〜3m", rank: 4 },
    { color: "#f8e1a6", label: "0.5〜1m", short: "0.5〜1m", rank: 3, sub: true },
    { color: "#f7f5a9", label: naisui ? "0.1〜0.5m" : "0.5m未満", short: naisui ? "0.1〜0.5m" : "0.5m未満", rank: 2 },
    { color: "#ffffb3", label: naisui ? "0.1〜0.3m" : "0.3m未満", short: naisui ? "0.1〜0.3m" : "0.3m未満", rank: 1, sub: true },
  ];
}

/** 土砂災害警戒区域等の凡例（特別警戒区域・警戒区域、それぞれ指定済みと指定予定） */
function doshaClasses([red, redPlan, yellow, yellowPlan]: [string, string, string, string]): HazardClass[] {
  return [
    { color: red, label: "特別警戒区域", short: "特別警戒", rank: 4 },
    { color: redPlan, label: "特別警戒区域（指定予定）", short: "特別警戒(予定)", rank: 3, sub: true },
    { color: yellow, label: "警戒区域", short: "警戒", rank: 2 },
    { color: yellowPlan, label: "警戒区域（指定予定）", short: "警戒(予定)", rank: 1, sub: true },
  ];
}

const FLOOD_AUTHOR = "国土交通省 各地方整備局等・都道府県";

export const HAZARDS: Record<HazardKind, HazardInfo> = {
  flood: {
    label: "洪水（想定最大規模）",
    name: "洪水",
    short: "洪水",
    legend: "洪水の浸水深（想定最大規模）",
    layers: [{ id: "01_flood_l2_shinsuishin_data", name: "洪水浸水想定区域（想定最大規模）", classes: depthClasses(), minzoom: 2 }],
    author: FLOOD_AUTHOR,
    map: "flood",
  },
  naisui: {
    label: "内水（雨水出水）",
    name: "内水（雨水出水）",
    short: "内水",
    legend: "内水の浸水深",
    layers: [{ id: "02_naisui_data", name: "内水（雨水出水）浸水想定区域", classes: depthClasses(true), minzoom: 2 }],
    author: "市町村（流域下水道・一部事務組合を含む）",
    map: "naisui",
  },
  takashio: {
    label: "高潮（想定最大規模）",
    name: "高潮",
    short: "高潮",
    legend: "高潮の浸水深（想定最大規模）",
    layers: [{ id: "03_hightide_l2_shinsuishin_data", name: "高潮浸水想定区域（想定最大規模）", classes: depthClasses(), minzoom: 2 }],
    author: "都道府県",
    map: "takashio",
  },
  tsunami: {
    label: "津波（想定最大規模）",
    name: "津波",
    short: "津波",
    legend: "津波の浸水深（想定最大規模）",
    layers: [{ id: "04_tsunami_newlegend_data", name: "津波浸水想定（想定最大規模）", classes: depthClasses(), minzoom: 2 }],
    author: "都道府県",
    map: "tsunami",
  },
  dosha: {
    label: "土砂災害警戒区域等",
    name: "土砂災害",
    short: "土砂",
    legend: "土砂災害警戒区域等",
    layers: [
      { id: "05_kyukeishakeikaikuiki", name: "急傾斜地の崩壊", classes: doshaClasses(["#fa2800", "#fb5333", "#fae600", "#fbeb33"]), minzoom: 2 },
      { id: "05_dosekiryukeikaikuiki", name: "土石流", classes: doshaClasses(["#a50021", "#b7334d", "#e6c832", "#ebd35b"]), minzoom: 2 },
      { id: "05_jisuberikeikaikuiki", name: "地すべり", classes: doshaClasses(["#b40028", "#c33353", "#ff9900", "#ffad33"]), minzoom: 2 },
    ],
    author: "「国土数値情報（土砂災害警戒区域）」（国土交通省）をもとに国土地理院が加工",
    map: "dosha",
  },
  kaoku: {
    label: "家屋倒壊等氾濫想定区域",
    name: "家屋倒壊等",
    short: "家屋倒壊",
    legend: "家屋倒壊等氾濫想定区域",
    layers: [
      {
        id: "01_flood_l2_kaokutoukai_hanran_data",
        name: "氾濫流",
        classes: [{ color: "#ff0000", label: "氾濫流", short: "氾濫流", rank: 1 }],
        minzoom: 4,
        pattern: true,
      },
      {
        id: "01_flood_l2_kaokutoukai_kagan_data",
        name: "河岸侵食",
        classes: [{ color: "#ff0000", label: "河岸侵食", short: "河岸侵食", rank: 1 }],
        minzoom: 4,
      },
    ],
    author: FLOOD_AUTHOR,
    map: "flood",
  },
  keizoku: {
    label: "浸水継続時間（洪水・想定最大規模）",
    name: "浸水継続時間",
    short: "浸水継続",
    legend: "浸水継続時間（洪水・想定最大規模）",
    layers: [
      {
        id: "01_flood_l2_keizoku_data",
        name: "浸水継続時間（想定最大規模）",
        classes: [
          { color: "#600060", label: "4週間以上", short: "4週間以上", rank: 7, sub: true },
          { color: "#b40068", label: "2週間以上", short: "2週間以上", rank: 6 },
          { color: "#ff2800", label: "1週間〜2週間未満", short: "1〜2週間", rank: 5 },
          { color: "#ff9900", label: "3日〜1週間未満", short: "3日〜1週間", rank: 4 },
          { color: "#faf500", label: "1日〜3日未満", short: "1〜3日", rank: 3 },
          { color: "#0041ff", label: "12時間〜1日未満", short: "12時間〜1日", rank: 2 },
          { color: "#a0d2ff", label: "12時間未満", short: "12時間未満", rank: 1 },
        ],
        minzoom: 2,
      },
    ],
    author: FLOOD_AUTHOR,
    map: "flood",
  },
};

/** 地図の道具・画面に並べる順 */
export const HAZARD_KINDS: HazardKind[] = ["flood", "naisui", "takashio", "tsunami", "dosha", "kaoku", "keizoku"];

/** すべてのレイヤ（地図のタイルの元） */
export const HAZARD_LAYERS: HazardLayer[] = HAZARD_KINDS.flatMap((k) => HAZARDS[k].layers);

// ---- タイルを読む ----

/** 256×256 の RGBA（ブラウザでは canvas の getImageData） */
export type TileImage = { width: number; height: number; data: ArrayLike<number> };
/** URL のタイルを読む。無い（404）ときは null。通信の失敗は例外 */
export type TileFetcher = (url: string) => Promise<TileImage | null>;

const tileUrl = (template: string, z: number, x: number, y: number) =>
  template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

/** 緯度経度 → ズーム z の世界全体の画素の位置（小数） */
export function worldPixel(lat: number, lng: number, z: number): [number, number] {
  const n = 256 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

/** 1画素の大きさ（m） */
export const metersPerPixel = (lat: number, z: number) => (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** z);

/** 地点のまわり (2r+1)×(2r+1) 画素の RGBA。タイルの境目をまたぐときは隣のタイルも読む（無いタイルは透明） */
export type PixelWindow = { r: number; size: number; data: Uint8ClampedArray; /** 読めたタイルの数（0 ならどのタイルも無かった） */ tiles: number };

export async function readWindow(template: string, z: number, px: number, py: number, r: number, fetchTile: TileFetcher): Promise<PixelWindow> {
  const size = 2 * r + 1;
  const x0 = Math.floor(px) - r;
  const y0 = Math.floor(py) - r;
  const data = new Uint8ClampedArray(size * size * 4);
  const jobs: Promise<number>[] = [];
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + size - 1) / 256); ty++) {
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + size - 1) / 256); tx++) {
      jobs.push(
        fetchTile(tileUrl(template, z, tx, ty)).then((img) => {
          if (!img) return 0;
          for (let y = Math.max(y0, ty * 256); y < Math.min(y0 + size, ty * 256 + 256); y++) {
            for (let x = Math.max(x0, tx * 256); x < Math.min(x0 + size, tx * 256 + 256); x++) {
              const from = ((y - ty * 256) * img.width + (x - tx * 256)) * 4;
              const to = ((y - y0) * size + (x - x0)) * 4;
              for (let c = 0; c < 4; c++) data[to + c] = img.data[from + c];
            }
          }
          return 1;
        }),
      );
    }
  }
  const tiles = (await Promise.all(jobs)).reduce((a, b) => a + b, 0);
  return { r, size, data, tiles };
}

// ---- 色を凡例に当てる ----

/** これより透明な画素は塗られていないとみなす（土砂災害の区域の縁はにじんでいる。河岸侵食は半透明の 127 で塗っている） */
const MIN_ALPHA = 100;
/** 凡例の色とこれ以上離れた色は当てない（RGB の距離） */
const MAX_COLOR_DIST = 40;

const RGB = new Map<string, [number, number, number]>();
const rgbOf = (hex: string): [number, number, number] => {
  let v = RGB.get(hex);
  if (!v) RGB.set(hex, (v = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]));
  return v;
};

/** 画素の色に最も近い凡例の区分の番号。塗られていない・凡例に無い色は -1 */
export function classify(r: number, g: number, b: number, a: number, classes: HazardClass[]): number {
  if (a < MIN_ALPHA) return -1;
  let best = -1;
  let bestD = MAX_COLOR_DIST * MAX_COLOR_DIST + 1;
  classes.forEach((c, i) => {
    const [cr, cg, cb] = rgbOf(c.color);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** 地点の区分と、地点より危ない区分の近いもの（画素の距離） */
export type WindowResult = { at?: number; near?: { index: number; px: number } };

/** 区域の近くとみなす距離（画素。z17 で約 10m） */
export const NEAR_PX = 10;
/** 地点を読む範囲（画素）。氾濫流の丸の模様（直径 16 画素ほど）に囲まれているかを見るので広め */
export const WINDOW_PX = 24;

export function analyzeWindow(win: PixelWindow, layer: HazardLayer): WindowResult {
  const { r, size, data } = win;
  const cls = new Int16Array(size * size);
  for (let i = 0; i < size * size; i++) cls[i] = classify(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3], layer.classes);
  const at = (x: number, y: number) => cls[(r + y) * size + (r + x)];
  let here = at(0, 0);
  if (here < 0 && data[(r * size + r) * 4 + 3] >= MIN_ALPHA) {
    // 塗られているが凡例に無い色（区分の境目のにじみ）：まわり 3×3 で多い区分
    const count = new Map<number, number>();
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (at(x, y) >= 0) count.set(at(x, y), (count.get(at(x, y)) ?? 0) + 1);
    here = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  }
  if (here < 0 && layer.pattern) {
    // 丸の模様の中（透明）：上下左右のどちらへ進んでも模様に当たれば、区域の中
    const hit = ([dx, dy]: [number, number]) => {
      for (let s = 1; s <= r; s++) if (at(dx * s, dy * s) >= 0) return at(dx * s, dy * s);
      return -1;
    };
    const rays = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]).map(hit);
    if (rays.every((c) => c >= 0)) here = rays[0];
  }
  const rank = here >= 0 ? layer.classes[here].rank : 0;
  let near: WindowResult["near"];
  for (let y = -NEAR_PX; y <= NEAR_PX; y++) {
    for (let x = -NEAR_PX; x <= NEAR_PX; x++) {
      const c = at(x, y);
      if (c < 0 || layer.classes[c].rank <= rank) continue;
      const d = Math.hypot(x, y);
      if (d <= NEAR_PX && (!near || d < near.px)) near = { index: c, px: d };
    }
  }
  return { ...(here >= 0 ? { at: here } : {}), ...(near ? { near } : {}) };
}

// ---- 地点の災害リスク ----

export type LayerHit = {
  layer: HazardLayer;
  /** 地点の区分（区域外なら無し） */
  at?: HazardClass;
  /** 地点より危ない区分が近く（約10m以内）にあるとき、その区分と距離（m） */
  near?: { cls: HazardClass; distance: number };
};

export type KindReport =
  | {
      status: "ok";
      hits: LayerHit[];
      /** 国のデータがこの辺り（約40km四方）に無い（内水だけ調べる。市区町村が国にデータを出していない） */
      noData?: boolean;
    }
  | { status: "error" };

export type HazardReport = Partial<Record<HazardKind, KindReport>>;

/** 内水のデータが辺りにあるかを見るズーム（z10 のタイルは約 40km 四方） */
const REGION_ZOOM = 10;

async function readKind(kind: HazardKind, lat: number, lng: number, fetchTile: TileFetcher): Promise<KindReport> {
  const [px, py] = worldPixel(lat, lng, HAZARD_ZOOM);
  const mpp = metersPerPixel(lat, HAZARD_ZOOM);
  try {
    let tiles = 0;
    const hits = await Promise.all(
      HAZARDS[kind].layers.map(async (layer): Promise<LayerHit> => {
        const win = await readWindow(hazardTileUrl(layer.id), HAZARD_ZOOM, px, py, WINDOW_PX, fetchTile);
        tiles += win.tiles;
        const { at, near } = analyzeWindow(win, layer);
        return {
          layer,
          ...(at !== undefined ? { at: layer.classes[at] } : {}),
          ...(near ? { near: { cls: layer.classes[near.index], distance: near.px * mpp } } : {}),
        };
      }),
    );
    if (kind === "naisui" && tiles === 0) {
      const [x, y] = worldPixel(lat, lng, REGION_ZOOM).map((v) => Math.floor(v / 256));
      const region = await fetchTile(tileUrl(hazardTileUrl(HAZARDS.naisui.layers[0].id), REGION_ZOOM, x, y));
      if (!region) return { status: "ok", hits, noData: true };
    }
    return { status: "ok", hits };
  } catch {
    return { status: "error" };
  }
}

/** 地点が洪水の浸水想定区域の中か、近いか（浸水継続時間・家屋倒壊等氾濫想定区域を読む目安） */
const floodNear = (r?: KindReport) => r?.status === "ok" && r.hits.some((h) => h.at || h.near);

/**
 * 地点の災害リスク。洪水・内水・高潮・津波・土砂災害を並べて読み、洪水の区域の中か近いときだけ、
 * 浸水継続時間と家屋倒壊等氾濫想定区域も読む（区域の外では意味が無く、読む量を減らす）
 */
export async function hazardAt(lat: number, lng: number, fetchTile: TileFetcher, kinds: HazardKind[] = HAZARD_KINDS): Promise<HazardReport> {
  const first = kinds.filter((k) => k !== "kaoku" && k !== "keizoku");
  const report: HazardReport = Object.fromEntries(await Promise.all(first.map(async (k) => [k, await readKind(k, lat, lng, fetchTile)] as const)));
  const flood = kinds.includes("flood") ? report.flood : undefined;
  const more = kinds.filter((k) => (k === "kaoku" || k === "keizoku") && (!flood || floodNear(flood)));
  Object.assign(report, Object.fromEntries(await Promise.all(more.map(async (k) => [k, await readKind(k, lat, lng, fetchTile)] as const))));
  return report;
}

// ---- 地面の高さ（標高） ----

/** 国土地理院の標高タイル（PNG）。精度の高い順に読み、無い（海・データの無い所）ときは次へ */
const DEM_SOURCES = [
  { id: "dem5a_png", z: 15, label: "5mメッシュ（航空レーザ測量）" },
  { id: "dem5b_png", z: 15, label: "5mメッシュ（写真測量）" },
  { id: "dem5c_png", z: 15, label: "5mメッシュ（写真測量）" },
  { id: "dem_png", z: 14, label: "10mメッシュ" },
] as const;

export type Elevation = { value: number; source: string };

/** 標高タイルの画素 → 標高（m）。データの無い画素は null（地理院タイルの仕様：0.01m 単位の 24bit、2^23 が無効値） */
export function demValue(r: number, g: number, b: number): number | null {
  const x = r * 65536 + g * 256 + b;
  if (x === 2 ** 23) return null;
  return Math.round((x < 2 ** 23 ? x : x - 2 ** 24)) / 100;
}

/** 地点の地面の高さ（標高）。どの標高タイルにも無ければ null */
export async function elevationAt(lat: number, lng: number, fetchTile: TileFetcher): Promise<Elevation | null> {
  for (const s of DEM_SOURCES) {
    const [px, py] = worldPixel(lat, lng, s.z);
    const img = await fetchTile(`https://cyberjapandata.gsi.go.jp/xyz/${s.id}/${s.z}/${Math.floor(px / 256)}/${Math.floor(py / 256)}.png`);
    if (!img) continue;
    const i = ((Math.floor(py) % 256) * img.width + (Math.floor(px) % 256)) * 4;
    const v = demValue(img.data[i], img.data[i + 1], img.data[i + 2]);
    if (v !== null) return { value: v, source: s.label };
  }
  return null;
}

// ---- 画面・共有・印刷に出す文字 ----

export type HazardRow = {
  kind: HazardKind | "elevation";
  /** 共有の文面の見出し（「洪水（想定最大規模）」） */
  label: string;
  /** 画面・印刷の表の見出し（「洪水」） */
  name: string;
  value: string;
  sub?: string;
  color?: string;
  /** 注意が要る（区域の中・近い、浸水が深い、長い） */
  warn?: boolean;
};

const meters = (d: number) => `約${Math.max(1, Math.round(d))}m`;

/** 地点より危ない区域が近くにあるときの一言（「約6m先に急傾斜地の崩壊の特別警戒区域」「約6m先に0.5m未満の区域」） */
function nearText(hits: LayerHit[], withLayer: boolean): string | undefined {
  const n = hits.filter((h) => h.near).sort((a, b) => a.near!.distance - b.near!.distance)[0];
  if (!n?.near) return undefined;
  return `${meters(n.near.distance)}先に${withLayer ? `${n.layer.name}の` : ""}${n.near.cls.label}${/区域$/.test(n.near.cls.label) ? "" : "の区域"}`;
}

/**
 * 1つの種類の行。洪水の区域の外では浸水継続時間・家屋倒壊は出さない（読んでいない）。
 * inFlood：地点が洪水の浸水想定区域の中（浸水継続時間が無ければ、区域外ではなく「データなし」）
 */
function kindRow(kind: HazardKind, r: KindReport | undefined, inFlood = false): HazardRow | undefined {
  const info = HAZARDS[kind];
  const row = (x: Omit<HazardRow, "kind" | "label" | "name">): HazardRow => ({ kind, label: info.label, name: info.name, ...x });
  if (!r) return undefined;
  if (r.status === "error") return row({ value: "読み込めませんでした" });
  const at = r.hits.filter((h) => h.at);
  const near = nearText(r.hits, kind === "dosha");
  if (kind === "dosha") {
    if (!at.length) return row({ value: "区域外", sub: near, warn: !!near });
    const worst = [...at].sort((a, b) => b.at!.rank - a.at!.rank)[0];
    return row({
      value: at.map((h) => `${h.layer.name}の${h.at!.label}`).join("／"),
      sub: near ?? "区域の指定は都道府県の公表図・窓口で確認してください",
      color: worst.at!.color,
      warn: true,
    });
  }
  if (kind === "kaoku") {
    if (!at.length) return row({ value: "区域外", sub: near, warn: !!near });
    return row({ value: `区域内（${at.map((h) => h.at!.label).join("・")}）`, sub: "洪水のとき、家屋が倒壊・流失するおそれがある区域", color: "#ff0000", warn: true });
  }
  const hit = at[0]?.at;
  if (!hit) {
    if (r.noData) return row({ value: "国のデータなし", sub: "市区町村の内水ハザードマップで確認してください" });
    if (kind === "keizoku" && inFlood) return row({ value: "データなし", sub: "この地点の浸水継続時間は国のデータにありません" });
    return row({ value: "区域外", sub: near });
  }
  // 浸水深は 0.5m 以上（床上浸水のおそれ）、浸水継続時間は 3日以上で注意
  const warn = kind === "keizoku" ? hit.rank >= 4 : hit.rank >= 3;
  return row({ value: kind === "keizoku" ? hit.label : `浸水 ${hit.label}`, color: hit.color, warn });
}

/** 画面・共有・印刷に出す行（洪水・浸水継続時間・家屋倒壊・内水・高潮・津波・土砂災害・地面の高さ） */
export function hazardRows(report: HazardReport, elevation?: Elevation | null): HazardRow[] {
  const order: HazardKind[] = ["flood", "keizoku", "kaoku", "naisui", "takashio", "tsunami", "dosha"];
  const flood = report.flood;
  const inFlood = flood?.status === "ok" && flood.hits.some((h) => h.at);
  const rows = order.map((k) => kindRow(k, report[k], inFlood)).filter((r): r is HazardRow => !!r);
  if (elevation)
    rows.push({
      kind: "elevation",
      label: "地面の高さ（標高）",
      name: "地面の高さ",
      value: `約${elevation.value.toFixed(1)}m`,
      sub: elevation.value <= 0 ? `海面より低い土地です（国土地理院の標高・${elevation.source}）` : `国土地理院の標高（${elevation.source}）`,
      warn: elevation.value <= 0,
    });
  return rows;
}

/** 表の注記（見出しを短くした分） */
export const HAZARD_TABLE_NOTE = "洪水・高潮・津波・浸水継続時間・家屋倒壊等は想定最大規模の想定";

/** 1行に並べる印。short は狭い所（背の低いスマホ）での言い方 */
export type HazardChip = { text: string; short?: string; warn: boolean; color?: string };

/** スマホの1行に並べる短い印（区域にかかるものだけ）。何も無ければ「国のデータで区域外」 */
export function hazardChips(report: HazardReport): HazardChip[] {
  const chips: HazardChip[] = [];
  for (const k of ["flood", "kaoku", "takashio", "tsunami", "naisui", "dosha"] as HazardKind[]) {
    const r = report[k];
    if (r?.status !== "ok") continue;
    const at = r.hits.filter((h) => h.at).sort((a, b) => b.at!.rank - a.at!.rank)[0]?.at;
    if (!at) continue;
    const info = HAZARDS[k];
    if (k === "kaoku") chips.push({ text: "家屋倒壊", warn: true, color: "#ff0000" });
    else if (k === "dosha") chips.push({ text: `土砂 ${at.short.replace(/\(予定\)$/, "")}`, warn: true, color: at.color });
    else chips.push({ text: `${info.short}${at.short}`, warn: at.rank >= 3, color: at.color });
  }
  if (!chips.length) chips.push({ text: "国のデータで区域外", short: "区域外", warn: false });
  return chips;
}

/** 地図をクリックした地点の一言（「洪水：浸水 3〜5m」） */
export function hazardPointLabel(kind: HazardKind, r: KindReport | undefined): string | undefined {
  const row = kindRow(kind, r);
  return row ? `${HAZARDS[kind].short}：${row.value}` : undefined;
}

// ---- 市区町村のハザードマップ ----

/** 市区町村ごとのハザードマップのページ（わがまちハザードマップの登録先。data/hazard-maps.json） */
export type HazardMaps = Partial<Record<HazardMapKind, string>>;
export type HazardMapIndex = { updated: string; maps: Record<string, HazardMaps> };

/** その市区町村のハザードマップのページ。政令市は市で1つ */
export function hazardMapsFor(codes: string[], index: HazardMapIndex): HazardMaps {
  for (const c of codes) {
    const m = index.maps[c] ?? index.maps[cityCode(c)];
    if (m) return m;
  }
  return {};
}

export const HAZARD_MAP_LABELS: Record<HazardMapKind, string> = { flood: "洪水", naisui: "内水", takashio: "高潮", tsunami: "津波", dosha: "土砂災害" };

/** 同じページにまとまっている種類をまとめる（「洪水・内水・土砂災害」→ 1つのページ） */
export function groupHazardMaps(maps: HazardMaps): { kinds: HazardMapKind[]; url: string }[] {
  const groups: { kinds: HazardMapKind[]; url: string }[] = [];
  for (const k of Object.keys(HAZARD_MAP_LABELS) as HazardMapKind[]) {
    const url = maps[k];
    if (!url) continue;
    const g = groups.find((x) => x.url === url);
    if (g) g.kinds.push(k);
    else groups.push({ kinds: [k], url });
  }
  return groups;
}

/** わがまちハザードマップ（国の一覧）で、その市区町村を開く */
export const wagamachiUrl = (muniCd: string) => `https://disaportal.gsi.go.jp/hazardmap/index.html?citycode=${cityCode(muniCd)}`;

/** 出典（公共データ利用規約のとおり、加工したことと、重要事項説明に使えないことも添える。共有・印刷の文面に使う） */
export const HAZARD_CREDIT =
  "出典：「ハザードマップポータルサイト」（国土交通省・国土地理院、https://disaportal.gsi.go.jp/）のデータを加工して作成。市区町村のハザードマップではないため、重要事項説明には使えません";
