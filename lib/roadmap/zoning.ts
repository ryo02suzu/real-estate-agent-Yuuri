// 物件の地点にかかる都市計画（用途地域・建ぺい率・容積率・防火地域・高度地区など）。
// 国土交通省「都市計画決定GISデータ」をタイルにしたもの（scripts/zoning-tiles/build.py）を読み、地点を含む区域を拾う。
// データは「概ねの位置」で、市によっては古い・欠けているので、画面では参考として出し、最終確認は市の窓口・都市計画図で行う
import { tileOf, type LngLat, type Polygon } from "./parcel";

/** 地点の判定に使うタイルのズーム（約 0.3m の精度） */
export const ZONING_ZOOM = 15;

export type ZoningLayer =
  | "youto"
  | "senbiki"
  | "tokei"
  | "jyuntoshi"
  | "bouka"
  | "koudoti"
  | "koudori"
  | "chikukei"
  | "tkbt"
  | "fuuchichiku"
  | "tochiku"
  | "douro"
  | "kouen"
  | "ritteki"
  | "tokuteiyouto"
  | "tokuryoku"
  | "tokureiyouseki"
  | "kousoujyukyo"
  | "tokuteibou"
  | "toshisaisei"
  | "rekifuu"
  | "ryokukachiiki"
  | "soubou";

export type ZoningFeature = {
  layer: ZoningLayer;
  props: { name?: string; code?: number; far?: number; bcr?: number };
  /** 面（区域）のときは多角形、線（都市計画道路）のときは折れ線 */
  geometry: () => { polygons: Polygon[]; lines: LngLat[][] };
};

export type ZoningSource = { tile(x: number, y: number): Promise<ZoningFeature[] | null> };

/** 市区町村ごとのデータの有無（1 あり、0 データなし、-1 その都市計画は決まっていない）と時点（data/zoning-status.json） */
export type ZoningStatus = { city: string; asOf: string | null; note?: string; layers: Partial<Record<ZoningLayer, 1 | 0 | -1>> };

export type Youto = { name: string; code: number; far?: number; bcr?: number };

export type Zoning = {
  /** 地点の用途地域（データの重なりで2つ出ることもある） */
  youto: Youto[];
  /** 地点から BORDER_M 以内にある、別の用途地域（境目が近い） */
  youtoNear: (Youto & { distance: number })[];
  /** 市街化区域・市街化調整区域（区域区分の無い都市計画区域は undefined） */
  senbiki?: string;
  /** 都市計画区域の中か */
  tokei: boolean;
  /** 準都市計画区域の中か */
  jyuntoshi: boolean;
  /** 防火地域・準防火地域 */
  bouka?: string;
  /** 高度地区（種類・高さの数値はデータに無い） */
  koudoti: boolean;
  /** そのほかの地区・区域（地区計画など）。label は種類、name は名前 */
  others: { layer: ZoningLayer; label: string; name?: string }[];
  /** 都市計画道路の中心線までの距離（ROAD_M 以内のときだけ） */
  road?: number;
};

/** 用途地域の境目がこれより近いと「境目が近い」と出す（データは概ねの位置なので広めに見る） */
export const BORDER_M = 15;
/** 都市計画道路の中心線がこれより近いと出す（計画幅員はデータに無い。幅の広い道路でも半分が 20m 前後） */
export const ROAD_M = 30;

/** 地区・区域の種類の名前（画面に出す順） */
export const OTHER_LABELS: [ZoningLayer, string][] = [
  ["chikukei", "地区計画"],
  ["koudori", "高度利用地区"],
  ["tkbt", "特別用途地区"],
  ["tokuteiyouto", "特定用途制限地域"],
  ["fuuchichiku", "風致地区"],
  ["tokuryoku", "特別緑地保全地区"],
  ["rekifuu", "歴史的風土保存地区"],
  ["ryokukachiiki", "緑化地域"],
  ["tokureiyouseki", "特例容積率適用地区"],
  ["kousoujyukyo", "高層住居誘導地区"],
  ["tokuteibou", "特定防災街区整備地区"],
  ["toshisaisei", "都市再生特別地区"],
  ["soubou", "航空機騒音障害防止地区"],
  ["tochiku", "土地区画整理事業"],
  ["kouen", "都市計画公園"],
  ["ritteki", "立地適正化計画"],
];

/** 地点の都市計画。地点のタイル（z15）だけを読む。データが無い地域は null */
export async function zoningAt(lat: number, lng: number, source: ZoningSource): Promise<Zoning | null> {
  const [x, y] = tileOf(lat, lng, ZONING_ZOOM);
  const features = await source.tile(x, y);
  if (!features) return null;
  return zoningFrom(features, [lng, lat]);
}

/** タイルの地物から、地点にかかる都市計画をまとめる */
export function zoningFrom(features: ZoningFeature[], p: LngLat): Zoning {
  const z: Zoning = { youto: [], youtoNear: [], tokei: false, jyuntoshi: false, koudoti: false, others: [] };
  const seen = new Set<string>();
  for (const f of features) {
    const { polygons, lines } = f.geometry();
    if (f.layer === "douro") {
      const d = Math.min(...lines.map((l) => distToLine(p, l)));
      if (d <= ROAD_M && (z.road === undefined || d < z.road)) z.road = d;
      continue;
    }
    if (polygons.length === 0) continue;
    const inside = polygons.some((poly) => inPolygon(p, poly));
    if (f.layer === "youto") {
      const y: Youto = { name: f.props.name ?? "用途地域", code: f.props.code ?? 0, far: f.props.far, bcr: f.props.bcr };
      if (inside) {
        if (!z.youto.some((o) => sameYouto(o, y))) z.youto.push(y);
      } else {
        const d = Math.min(...polygons.map((poly) => distToRings(p, poly)));
        const near = z.youtoNear.find((o) => sameYouto(o, y));
        if (d <= BORDER_M && (!near || d < near.distance)) {
          if (near) near.distance = d;
          else z.youtoNear.push({ ...y, distance: d });
        }
      }
      continue;
    }
    if (!inside) continue;
    switch (f.layer) {
      case "tokei":
        z.tokei = true;
        break;
      case "jyuntoshi":
        z.jyuntoshi = true;
        break;
      case "senbiki":
        // 市街化区域と調整区域が重なるデータでは市街化区域を優先しない（調整区域のほうが厳しいので両方は出さず、調整区域を出す）
        if (!z.senbiki || f.props.name === "市街化調整区域") z.senbiki = f.props.name;
        break;
      case "bouka":
        if (!z.bouka || f.props.name === "防火地域") z.bouka = f.props.name;
        break;
      case "koudoti":
        z.koudoti = true;
        break;
      default: {
        const label = OTHER_LABELS.find(([l]) => l === f.layer)?.[1] ?? f.layer;
        const name = f.layer === "ritteki" ? f.props.name : f.props.name && f.props.name !== label ? f.props.name : undefined;
        const key = `${f.layer}|${name ?? ""}`;
        if (seen.has(key)) break;
        seen.add(key);
        // 立地適正化計画は「居住誘導区域」などの種類を名前として出す。計画区域そのもの（市全体のことが多い）は出さない
        if (f.layer === "ritteki" && (!name || name === "立地適正化計画区域")) break;
        z.others.push({ layer: f.layer, label, name });
      }
    }
  }
  // 地点の用途地域と同じものは「近い別の用途地域」から外す
  z.youtoNear = z.youtoNear.filter((n) => !z.youto.some((y) => sameYouto(y, n))).sort((a, b) => a.distance - b.distance);
  const order = new Map(OTHER_LABELS.map(([l], i) => [l, i]));
  z.others.sort((a, b) => (order.get(a.layer) ?? 99) - (order.get(b.layer) ?? 99));
  return z;
}

const sameYouto = (a: Youto, b: Youto) => a.code === b.code && a.name === b.name && a.far === b.far && a.bcr === b.bcr;

// 政令市はデータが市全体で1つ（区ごとではない）。区のコードから市のコードを引く
const DESIGNATED = ["11100", "12100", "14100", "14130", "14150"];

/** 市区町村（国土地理院の muniCd）のデータの有無と時点。データの一覧に無い市区町村は undefined */
export function statusFor(codes: string[], all: Record<string, ZoningStatus>): ZoningStatus | undefined {
  for (const c of codes) {
    if (all[c]) return all[c];
    const city = DESIGNATED.filter((d) => d.slice(0, 3) === c.slice(0, 3) && d <= c).pop();
    if (city && all[city]) return all[city];
  }
  return undefined;
}

export type ZoningRow = { label: string; value: string; sub?: string; warn?: boolean; color?: string };

/** 画面に出す行（区域・用途地域・建ぺい率と容積率・防火・高度地区・地区計画・そのほか・都市計画道路・用途地域の境目） */
export function zoningRows(z: Zoning, st: ZoningStatus | undefined): ZoningRow[] {
  const flag = (l: ZoningLayer) => (st ? st.layers[l] : 0);
  // 「指定なし」と言えるのは、その市のデータがあるときだけ。データが無ければ「データなし」
  const none = (l: ZoningLayer) => (flag(l) === 0 ? "データなし" : "指定なし");
  const rows: ZoningRow[] = [];
  const y = z.youto[0];

  let area: string;
  if (z.tokei) {
    if (z.senbiki) area = z.senbiki;
    else if (flag("senbiki") === -1) area = "都市計画区域（区域区分なし）";
    else area = "都市計画区域";
  } else if (z.jyuntoshi) area = "準都市計画区域";
  else area = st && flag("tokei") === 1 ? "都市計画区域外" : "データなし";
  rows.push({ label: "区域", value: area, warn: area === "市街化調整区域" });

  if (y) {
    rows.push({ label: "用途地域", value: z.youto.map((o) => o.name).join("／"), color: YOUTO_COLORS[y.code] });
    rows.push({
      label: "建ぺい率・容積率",
      value: y.bcr || y.far ? `${y.bcr ? `${y.bcr}%` : "―"} ・ ${y.far ? `${y.far}%` : "―"}` : "データなし",
      sub: "都市計画で定めた数値。角地の緩和や、前面道路の幅による容積率の制限は含みません",
    });
  } else if (z.tokei || z.jyuntoshi) {
    rows.push({
      label: "用途地域",
      value: z.senbiki === "市街化調整区域" ? "指定なし（市街化調整区域）" : none("youto"),
      sub: "建ぺい率・容積率は市の窓口で確認してください",
    });
  }

  if (z.tokei || z.jyuntoshi) {
    rows.push({ label: "防火・準防火", value: z.bouka ?? none("bouka") });
    rows.push({
      label: "高度地区",
      value: z.koudoti ? "指定あり" : none("koudoti"),
      sub: z.koudoti ? "種類と高さの制限はデータに無いため、市の都市計画図で確認してください" : undefined,
    });
    const plans = z.others.filter((o) => o.layer === "chikukei");
    rows.push({ label: "地区計画", value: plans.length ? plans.map((o) => o.name ?? "区域内").join("／") : none("chikukei"), warn: plans.length > 0 });
  }
  for (const o of z.others.filter((o) => o.layer !== "chikukei")) rows.push({ label: o.label, value: o.name ?? "区域内" });
  if (z.road !== undefined) {
    rows.push({
      label: "都市計画道路",
      value: `中心線まで約${Math.max(1, Math.round(z.road))}m`,
      sub: "整備済みの道路も含みます。計画線にかかるか・事業の予定は、市の窓口で確認してください",
      warn: true,
    });
  }
  const near = z.youtoNear[0];
  if (near) {
    const r = near.bcr || near.far ? `（${near.bcr ?? "―"}%・${near.far ?? "―"}%）` : "";
    rows.push({
      label: "用途地域の境目",
      value: `約${Math.max(1, Math.round(near.distance))}m先は${near.name}${r}`,
      sub: "敷地が2つの用途地域にまたがるときは、市の窓口で確認してください",
      warn: true,
      color: YOUTO_COLORS[near.code],
    });
  }
  return rows;
}

/** スマホの1行に並べる短い印。用途地域（と数値）、注意が要るもの（計画道路・境目）、防火・高度地区・地区計画の順 */
export function zoningChips(z: Zoning): string[] {
  const y = z.youto[0];
  const chips: string[] = [];
  if (y) chips.push(`${youtoShort(y.name)}${y.bcr && y.far ? ` ${y.bcr}/${y.far}` : ""}`);
  else if (z.senbiki === "市街化調整区域") chips.push("調整区域");
  else if (!z.tokei && !z.jyuntoshi) chips.push("都市計画区域外");
  else chips.push("用途地域なし");
  if (z.road !== undefined) chips.push("計画道路");
  if (z.youtoNear.length) chips.push("境目注意");
  if (z.bouka) chips.push(z.bouka.replace(/地域$/, ""));
  if (z.koudoti) chips.push("高度地区");
  if (z.others.some((o) => o.layer === "chikukei")) chips.push("地区計画");
  return chips;
}

/** 「第一種低層住居専用地域」→「1種低層」のような短い名前（スマホの1行に収める） */
export function youtoShort(name: string): string {
  const n = name.normalize("NFKC").replace(/第1種/, "第一種").replace(/第2種/, "第二種");
  const m = n.match(/^第([一二])種(低層住居専用|中高層住居専用|住居)地域$/);
  if (m) return `${m[1] === "一" ? "1" : "2"}種${m[2] === "低層住居専用" ? "低層" : m[2] === "中高層住居専用" ? "中高層" : "住居"}`;
  return n.replace(/地域$/, "");
}

/** 「建ぺい率60%・容積率200%」。データに無ければ undefined */
export function ratioLabel(y: Youto): string | undefined {
  if (!y.bcr && !y.far) return undefined;
  return [y.bcr ? `建ぺい率${y.bcr}%` : "", y.far ? `容積率${y.far}%` : ""].filter(Boolean).join("・");
}

/** 用途地域の色（都市計画図で広く使われる配色。地図の塗り分けと画面の印に使う） */
export const YOUTO_COLORS: Record<number, string> = {
  1: "#00b37e",
  2: "#6bcf9b",
  3: "#9bd65c",
  4: "#d3e65a",
  5: "#f5e04c",
  6: "#f7c46c",
  7: "#f3a35b",
  8: "#a8c98a",
  9: "#f29fb8",
  10: "#ea5f73",
  11: "#b48bc9",
  12: "#9fc2e8",
  13: "#5b8fd1",
};

// ---- 幾何（経緯度のまま、地点のまわりだけをメートルに直して測る） ----

const M_PER_DEG_LAT = 110_950;

function inRing([x, y]: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 多角形（外周と穴）の中か */
export function inPolygon(p: LngLat, poly: Polygon): boolean {
  return poly.length > 0 && inRing(p, poly[0]) && !poly.slice(1).some((hole) => inRing(p, hole));
}

/** 地点から線分までの距離（m） */
function distToSegment(p: LngLat, a: LngLat, b: LngLat): number {
  const kx = M_PER_DEG_LAT * Math.cos((p[1] * Math.PI) / 180);
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * M_PER_DEG_LAT;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * M_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function distToLine(p: LngLat, line: LngLat[]): number {
  if (line.length === 1) return distToSegment(p, line[0], line[0]);
  let d = Infinity;
  for (let i = 0; i + 1 < line.length; i++) d = Math.min(d, distToSegment(p, line[i], line[i + 1]));
  return d;
}

/** 地点から多角形の縁（外周・穴）までの距離（m） */
export function distToRings(p: LngLat, poly: Polygon): number {
  return Math.min(...poly.map((ring) => distToLine(p, ring)));
}
