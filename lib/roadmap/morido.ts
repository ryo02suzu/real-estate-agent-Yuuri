// 盛土規制法（宅地造成及び特定盛土等規制法）の規制区域。国土数値情報の宅地造成等工事規制区域・特定盛土等規制区域データ
// （scripts/morido/build.py。z14 のタイル）から、物件の地点を含む区域の区分・指定した都県市・告示番号・施行日を出す。
// 国のデータは概略の位置で法的図書ではなく、重要事項説明の根拠には使えない（国土数値情報の注意事項）ので、参考として出し、
// 区域を指定した都県・市（盛土規制法の担当課）の資料で確かめるよう添える
import SOURCE from "./data/morido-source.json";
import type { LngLat, Polygon } from "./parcel";
import { wagmap } from "./vendors";
import { inPolygon } from "./zoning";

/** 規制区域のタイルのズーム（z14 だけ） */
export const MORIDO_ZOOM = 14;

export type MoridoKind = "宅地造成等工事規制区域" | "特定盛土等規制区域";

export type MoridoArea = {
  kind: MoridoKind;
  /** 市区町村コード */
  city: string;
  /** 市区町村名（「横浜市鶴見区」） */
  cityName?: string;
  /** 指定した地方公共団体の区分（A 都道府県・B 指定都市・C 中核市） */
  level?: "A" | "B" | "C";
  /** 告示番号（「神奈川県告示第212号」） */
  notice?: string;
  /** 規制を始めた日（「2025-04-01」） */
  since?: string;
  polygons: Polygon[];
};

/** タイル (x, y)（z14）の区域。タイルが無ければ null（データの無い所） */
export type MoridoSource = { tile(x: number, y: number): Promise<MoridoArea[] | null> };

/**
 * 地点の盛土規制法の区域。area が無ければ国のデータでは区域外。authority は区域を指定した（確かめる先の）都県・市、
 * link はその区域の地図・資料（地図は地点で開く。確かめた URL のある都県・市だけ）
 */
export type Morido = { area?: Omit<MoridoArea, "polygons">; authority: string; link?: { label: string; url: string } };

export const MORIDO_DATA = { url: process.env.NEXT_PUBLIC_MORIDO_PMTILES_URL || SOURCE.url, asOf: SOURCE.asOf, layer: "md" };

/** 出典のデータ名と、そのデータの案内ページ（画面ではデータ名をリンクにする） */
export const MORIDO_SOURCE = {
  name: "国土数値情報（宅地造成等工事規制区域・特定盛土等規制区域データ）",
  url: `https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A56-${SOURCE.year}.html`,
};

/** 出典（CC BY 4.0 のとおり、加工したことを書く。共有・印刷・下書きの文面に使う） */
export const MORIDO_CREDIT = `出典：「${MORIDO_SOURCE.name}」（国土交通省、https://nlftp.mlit.go.jp/ksj/）を加工して作成（${SOURCE.asOf}時点）`;

/** 国のデータの注意事項（重要事項説明の根拠には使えない） */
export function moridoCaution(authority: string): string {
  return `国のデータ（${SOURCE.asOf}時点）の概略の区域で、法的図書ではありません。重要事項説明には${authority}（盛土規制法の担当課）の資料で確かめてください`;
}

const PREFS: Record<string, string> = { "08": "茨城県", "09": "栃木県", "10": "群馬県", "11": "埼玉県", "12": "千葉県", "13": "東京都", "14": "神奈川県" };
/** 区域を自ら指定する市（指定都市・中核市）の市区町村コード → 市の名前 */
const CITIES = SOURCE.cities as Record<string, string>;

/** 市区町村コードの地点で、区域を指定する（確かめる先の）都県・市 */
export function moridoAuthority(city: string): string {
  return CITIES[city] ?? PREFS[city.slice(0, 2)] ?? "都道府県";
}

function tileOf(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [Math.floor(((lng + 180) / 360) * n), Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n)];
}

/**
 * 地点の盛土規制法の区域。city は物件の市区町村コード（区域外のときの確かめ先）。関東1都6県の外は null。
 * 区域の無い所にはタイルが無い（水戸市のように、データの時点でまだ区域を指定していない市など）
 */
export async function moridoAt(lat: number, lng: number, city: string, source: MoridoSource): Promise<Morido | null> {
  if (!PREFS[city.slice(0, 2)]) return null;
  const areas = (await source.tile(...tileOf(lat, lng, MORIDO_ZOOM))) ?? [];
  const p: LngLat = [lng, lat];
  // 重なっていれば、特定盛土等規制区域より宅地造成等工事規制区域（規制が細かい方）を先に
  const rank = (a: MoridoArea) => (a.kind === "宅地造成等工事規制区域" ? 0 : 1);
  const hit = areas.filter((a) => a.polygons.some((poly) => inPolygon(p, poly))).sort((a, b) => rank(a) - rank(b))[0];
  if (!hit) {
    const authority = moridoAuthority(city);
    return { authority, link: moridoLink(authority, lat, lng) };
  }
  const { polygons, ...area } = hit;
  void polygons;
  const authority = area.level === "A" || !area.level ? PREFS[area.city.slice(0, 2)] ?? moridoAuthority(area.city) : moridoAuthority(area.city);
  return { area, authority, link: moridoLink(authority, lat, lng) };
}

// ---- 画面に出す文字 ----

/** 「2025-04-01」→「2025年4月1日」 */
export function moridoDate(d?: string): string | undefined {
  const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : d;
}

/** 画面の短い注意（「国のデータ（2025年7月18日時点）の概略の区域。重要事項説明には横浜市の資料で確認」） */
export function moridoNote(authority: string): string {
  return `国のデータ（${SOURCE.asOf}時点）の概略の区域。重要事項説明には${authority}の資料で確認`;
}

/** 区域の1行（「宅地造成等工事規制区域」「区域外（国のデータ）」） */
export function moridoValue(m: Morido): string {
  return m.area ? m.area.kind : "区域外（国のデータ）";
}

/** 区域の補足（「神奈川県が指定（神奈川県告示第212号・2025年4月1日から）」） */
export function moridoDetail(m: Morido): string {
  if (!m.area) return `${SOURCE.asOf}時点の国のデータでは区域に入っていません。区域の指定は${m.authority}が行います`;
  const extra = moridoNotice(m);
  return `${m.authority}が指定${extra ? `（${extra}）` : ""}`;
}

/** 告示と規制を始めた日（「横浜市告示第113号・2025年4月1日から」）。告示番号には指定した都県・市の名前が入っている */
export function moridoNotice(m: Morido): string {
  return m.area ? [m.area.notice, m.area.since && `${moridoDate(m.area.since)}から`].filter(Boolean).join("・") : "";
}

/** 区域を指定した都県・市の区域の地図・資料（地図は物件の場所で開く）。確かめた URL だけ */
const LINKS: Record<string, string | ((lat: number, lng: number) => string)> = {
  東京都: wagmap("tokyo_tokeizu", 4, { scale: 2500 }),
  茨城県: wagmap("ibaraki", 114, { scale: 5000 }),
  群馬県: wagmap("pref-gunma", 7800, { scale: 5000 }),
  埼玉県: "https://www.pref.saitama.lg.jp/a1102/morido/kisotyousa_kiseikuiki.html",
  栃木県: "https://www.pref.tochigi.lg.jp/h08/morido/kiseikuiki.html",
  千葉県: "https://www.pref.chiba.lg.jp/takuchi/press/2025/moridokiseikaisi.html",
  神奈川県: "https://www.pref.kanagawa.jp/docs/jy2/morido/moridokiseikuiki_gaiyou.html",
  横浜市: "https://www.city.yokohama.lg.jp/business/bunyabetsu/kenchiku/takuchi/morido/moridokuiki.html",
  相模原市: "https://www.city.sagamihara.kanagawa.jp/shisei/1026823/machitsukuri/kaihatsu/1029495.html",
  千葉市: "https://www.city.chiba.jp/faq/toshi/kenchiku/takuchi/3203.html",
  船橋市: "https://www.city.funabashi.lg.jp/jigyou/kenchiku_kaihatsu/002/115990.html",
  柏市: "https://www.city.kashiwa.lg.jp/takuchi/shiseijoho/keikaku/shigoto/kaihatsu/tochi/morido.html",
  八王子市: "https://www.city.hachioji.tokyo.jp/jigyosha/005/10103/p032291.html",
  宇都宮市: "https://www.city.utsunomiya.lg.jp/kurashi/machi/kenchiku/takuchi/1036279.html",
};

/** 都県・市の区域の地図・資料。無ければ undefined（担当課で確かめる） */
export function moridoLink(authority: string, lat: number, lng: number): { label: string; url: string } | undefined {
  const l = LINKS[authority];
  if (!l) return undefined;
  return { label: typeof l === "string" ? `${authority}の盛土規制法の区域` : `${authority}の盛土規制法の地図`, url: typeof l === "string" ? l : l(lat, lng) };
}

/** 共有・印刷の1行（「宅地造成等工事規制区域（神奈川県が指定・参考）」） */
export function moridoLine(m: Morido): string {
  return m.area ? `${m.area.kind}（${m.authority}が指定・参考）` : `区域外（${SOURCE.asOf}時点の国のデータ・参考）`;
}
