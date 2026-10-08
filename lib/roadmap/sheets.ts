// PDFの分割図（図郭）で公開している市の「物件がどの図に載っているか」を求める。
// 図ごとの位置は前もって求めておく（docs/pdf-sheets.md）。求め方は2通り：
//  - 索引図の座標と緯度経度の対応（M）を地名から求め、図の中心を索引図の座標で持つ（桐生市）
//  - 図そのものを地理院地図と画像で照合し、図ごとに範囲を持つ（M は x=経度, y=-緯度 の恒等変換）

export type SheetIndex = {
  /** (x, y, 1) → (lat, lng) の変換行列（3行×2列）。x, y は索引図PDF上の座標 */
  M: [[number, number], [number, number], [number, number]];
  /** 図1枚の、索引図上での幅と高さ */
  w: number;
  h: number;
  /**
   * PDF を直接開けず、地図システムで図を開いてもらう市の手順（{label} は図の名前に置き換える）。
   * このときの URL は、その図の中心で開く地図システムの URL
   */
  howto?: string;
  /** [図の名前, PDFのURL, 中心x, 中心y, 幅, 高さ]。幅・高さが無ければ w, h を使う */
  cells: ([string, string, number, number] | [string, string, number, number, number, number])[];
  /**
   * 地区ごとの図（範囲が大きく重なる）の市：図の名前 → その図が受け持つ町名（前方一致）。
   * 物件の町名で図を選ぶ（習志野市）。町名が当たらなければ位置で選ぶ
   */
  towns?: Record<string, string[]>;
};

export type SheetHit = {
  label: string;
  url: string;
  /** 物件が図のどのあたりか（「左上」「中央」など） */
  where: string;
  /** 図の範囲 [北端の緯度, 西端の経度, 南端の緯度, 東端の経度]。図と同じ範囲の地図を描くのに使う */
  bounds: [number, number, number, number];
  /** 地図システムで図を開いてもらう市の手順（SheetIndex.howto） */
  howto?: string;
  /** 物件が図の端に近いとき、隣の図 */
  neighbor?: { label: string; url: string };
  /** 市全体で1枚の図（西東京市など）。画面では「図 ○○」ではなく「市全体の図」と呼ぶ */
  whole?: true;
};

/** 画面での図の呼び方。後ろに「と同じ範囲」などを続ける（「図 06-22 と…」「市全体の図と…」） */
export function sheetName(s: SheetHit): string {
  return s.whole ? "市全体の図" : `図 ${s.label} `;
}

/** 緯度経度 → 索引図の座標（M の逆変換） */
function toIndex(ix: SheetIndex, lat: number, lng: number): [number, number] {
  const [[a, d], [b, e], [c, f]] = ix.M; // lat = a x + b y + c, lng = d x + e y + f
  const det = a * e - b * d;
  const la = lat - c;
  const lo = lng - f;
  return [(e * la - b * lo) / det, (a * lo - d * la) / det];
}

/** 図の四隅を緯度経度にして、それを囲む範囲 [北, 西, 南, 東] */
function boundsOf(ix: SheetIndex, [cx, cy, w, h]: readonly [number, number, number, number]): SheetHit["bounds"] {
  const [[a, d], [b, e], [c, f]] = ix.M;
  const corners = [-0.5, 0.5].flatMap((su) => [-0.5, 0.5].map((sv) => [cx + su * w, cy + sv * h]));
  const lats = corners.map(([x, y]) => a * x + b * y + c);
  const lngs = corners.map(([x, y]) => d * x + e * y + f);
  return [Math.max(...lats), Math.min(...lngs), Math.min(...lats), Math.max(...lngs)];
}

const H = ["左", "中央", "右"];
const V = ["上", "中央", "下"];

function where(fx: number, fy: number): string {
  const h = H[Math.min(2, Math.floor(fx * 3))];
  const v = V[Math.min(2, Math.floor(fy * 3))];
  if (h === "中央" && v === "中央") return "中央";
  if (h === "中央") return `${v}の方`;
  if (v === "中央") return `${h}の方`;
  return `${h}${v}`;
}

/** 町名の「ヶ」「ケ」の表記ゆれをそろえる（「袖ケ浦」と「袖ヶ浦」） */
const normTown = (t: string) => t.replace(/[ヶヵ]/g, "ケ").replace(/\s/g, "");

/** 物件の位置が載っている図。どの図にも入らなければ（図の無い区域）undefined */
export function findSheet(ix: SheetIndex, lat: number, lng: number, town?: string): SheetHit | undefined {
  const [x, y] = toIndex(ix, lat, lng);
  // 図の中心からのずれ（図の大きさで割った値。±0.5 以内ならその図の中）
  const scored = ix.cells.map(([label, url, cx, cy, w = ix.w, h = ix.h]) => ({ label, url, u: (x - cx) / w, v: (y - cy) / h, cell: [cx, cy, w, h] as const }));
  let within = scored.filter((s) => Math.abs(s.u) <= 0.5 && Math.abs(s.v) <= 0.5);
  // 地区ごとの図は、町名でその地区の図に絞る（その地区の図なら端でも隣の図は出さない）
  let byTown = false;
  if (ix.towns && town) {
    const t = normTown(town);
    const hits = within.filter((s) => ix.towns![s.label]?.some((p) => t.startsWith(normTown(p))));
    if (hits.length) [within, byTown] = [hits, true];
  }
  // 図どうしが重なる（のりしろがある）ときは、物件が中心寄りにある図を選ぶ
  const m = (s: (typeof scored)[number]) => Math.max(Math.abs(s.u), Math.abs(s.v));
  const inside = within.sort((a, b) => m(a) - m(b))[0];
  if (!inside) return undefined;
  const hit: SheetHit = { label: inside.label, url: inside.url, where: where(inside.u + 0.5, inside.v + 0.5), bounds: boundsOf(ix, inside.cell) };
  if (ix.howto) hit.howto = ix.howto.replaceAll("{label}", inside.label);
  if (ix.cells.length === 1) hit.whole = true;
  // 端から図の1割以内なら、そちら側の隣の図も出す（索引図の位置合わせの誤差を見込む）
  const edge = 0.4;
  if (!byTown && (Math.abs(inside.u) > edge || Math.abs(inside.v) > edge)) {
    const su = Math.abs(inside.u) > edge ? Math.sign(inside.u) : 0;
    const sv = Math.abs(inside.v) > edge ? Math.sign(inside.v) : 0;
    const n =
      within.find((s) => s !== inside) ?? scored.find((s) => s !== inside && Math.abs(s.u - inside.u + su) < 0.3 && Math.abs(s.v - inside.v + sv) < 0.3);
    if (n) hit.neighbor = { label: n.label, url: n.url };
  }
  return hit;
}
