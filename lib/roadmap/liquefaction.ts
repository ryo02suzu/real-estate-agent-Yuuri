// 液状化の発生傾向。国土交通省都市局「地形区分に基づく液状化の発生傾向図」（不動産情報ライブラリの API。250m メッシュ）から、
// 物件の地点のメッシュの区分と微地形を出す。地形から見た相対的な傾向で、地震の揺れの強さや、その土地の盛土・埋立ての有無は見ていない
// （国の注意書きのとおり、画面でも添える）。データは 2次メッシュ（約10km）ごとの JSON（scripts/reinfolib/build.py の liq）
import { mesh250 } from "./mesh";
import { browserJson, cachedJson, NATIONAL_DATA, nationalUrl, type JsonLoader } from "./reinfolib";

/** 発生傾向の区分（国のデータの区分。1 がいちばん液状化しやすい。6 は河川・湖沼などで評価しない） */
export const LIQ_LEVELS: Record<number, string> = {
  1: "非常に液状化しやすい",
  2: "液状化しやすい",
  3: "やや液状化しやすい",
  4: "やや液状化しにくい",
  5: "液状化しにくい",
  6: "評価対象外",
};

/** 区分の強さ（画面の色分けの目安） */
export type LiqTone = "high" | "mid" | "low" | "none";
export const liqTone = (level: number): LiqTone => (level <= 2 ? "high" : level === 3 ? "mid" : level <= 5 ? "low" : "none");

export type Liquefaction = {
  /** 区分（1〜6） */
  level: number;
  /** 「液状化しやすい」 */
  label: string;
  tone: LiqTone;
  /** 微地形区分（「三角州・海岸低地」） */
  landform: string;
  landformCode: number;
  /** 250m メッシュのコード */
  mesh: string;
};

/** 2次メッシュのファイル：250m メッシュのコードの下4桁 → [区分, 微地形区分のコード] */
export type LiqFile = { m: Record<string, [number, number]> };

const LANDFORMS = (NATIONAL_DATA.liq?.landforms ?? {}) as Record<string, string>;
const LEVELS = (NATIONAL_DATA.liq?.levels ?? {}) as Record<string, string>;

const load = cachedJson(browserJson);

/**
 * 地点の液状化の発生傾向。データが無い（取り込み前・関東の外・海の上）ときは null。
 * 河川・湖沼のメッシュは「評価対象外」（level 6）
 */
export async function liquefactionAt(lat: number, lng: number, loader: JsonLoader = load): Promise<Liquefaction | null> {
  const mesh = mesh250(lat, lng);
  const url = mesh && nationalUrl("liq", `liq/${mesh.slice(0, 6)}.json`);
  if (!mesh || !url) return null;
  const file = (await loader(url)) as LiqFile | null;
  const v = file?.m?.[mesh.slice(6)];
  if (!v) return null;
  const [level, landformCode] = v;
  return {
    level,
    label: LEVELS[String(level)] || LIQ_LEVELS[level] || `区分${level}`,
    tone: liqTone(level),
    landform: LANDFORMS[String(landformCode)] ?? "",
    landformCode,
    mesh,
  };
}

/** 「液状化しやすい（三角州・海岸低地）」 */
export function liquefactionText(l: Liquefaction): string {
  return l.landform ? `${l.label}（${l.landform}）` : l.label;
}

/** 国の注意書き（国土交通省都市局の案内から） */
export const LIQ_CAUTIONS = [
  "地形から見た液状化の起きやすさの相対的な目安で、地震の揺れの強さや特定の地震は想定していません",
  "埋立地・盛土・谷を埋めた土地などは、この図で傾向が弱くても液状化することがあります",
  "250m 四方で多い地形の区分なので、敷地ごとの地盤は地盤調査や都道府県・市区町村の液状化マップで確かめてください",
];

export const LIQ_CREDIT =
  "出典：国土交通省 不動産情報ライブラリ（国土交通省都市局「地形区分に基づく液状化の発生傾向図」。若松・松岡（2020）の地形・地盤分類250mメッシュマップによる）を加工して作成";
