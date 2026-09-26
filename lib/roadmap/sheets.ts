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
  /** [図の名前, PDFのURL, 中心x, 中心y, 幅, 高さ]。幅・高さが無ければ w, h を使う */
  cells: ([string, string, number, number] | [string, string, number, number, number, number])[];
};

export type SheetHit = {
  label: string;
  url: string;
  /** 物件が図のどのあたりか（「左上」「中央」など） */
  where: string;
  /** 物件が図の端に近いとき、隣の図 */
  neighbor?: { label: string; url: string };
};

/** 緯度経度 → 索引図の座標（M の逆変換） */
function toIndex(ix: SheetIndex, lat: number, lng: number): [number, number] {
  const [[a, d], [b, e], [c, f]] = ix.M; // lat = a x + b y + c, lng = d x + e y + f
  const det = a * e - b * d;
  const la = lat - c;
  const lo = lng - f;
  return [(e * la - b * lo) / det, (a * lo - d * la) / det];
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

/** 物件の位置が載っている図。どの図にも入らなければ（図の無い区域）undefined */
export function findSheet(ix: SheetIndex, lat: number, lng: number): SheetHit | undefined {
  const [x, y] = toIndex(ix, lat, lng);
  // 図の中心からのずれ（図の大きさで割った値。±0.5 以内ならその図の中）
  const scored = ix.cells.map(([label, url, cx, cy, w = ix.w, h = ix.h]) => ({ label, url, u: (x - cx) / w, v: (y - cy) / h }));
  const within = scored.filter((s) => Math.abs(s.u) <= 0.5 && Math.abs(s.v) <= 0.5);
  // 図どうしが重なる（のりしろがある）ときは、物件が中心寄りにある図を選ぶ
  const m = (s: (typeof scored)[number]) => Math.max(Math.abs(s.u), Math.abs(s.v));
  const inside = within.sort((a, b) => m(a) - m(b))[0];
  if (!inside) return undefined;
  const hit: SheetHit = { label: inside.label, url: inside.url, where: where(inside.u + 0.5, inside.v + 0.5) };
  // 端から図の1割以内なら、そちら側の隣の図も出す（索引図の位置合わせの誤差を見込む）
  const edge = 0.4;
  if (Math.abs(inside.u) > edge || Math.abs(inside.v) > edge) {
    const su = Math.abs(inside.u) > edge ? Math.sign(inside.u) : 0;
    const sv = Math.abs(inside.v) > edge ? Math.sign(inside.v) : 0;
    const n =
      within.find((s) => s !== inside) ?? scored.find((s) => s !== inside && Math.abs(s.u - inside.u + su) < 0.3 && Math.abs(s.v - inside.v + sv) < 0.3);
    if (n) hit.neighbor = { label: n.label, url: n.url };
  }
  return hit;
}
