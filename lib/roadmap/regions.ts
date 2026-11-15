// 対応している地方と都道府県。ここだけを見て、地方を足せるようにする（スクリプト側は scripts/regions.py が同じ JSON を読む）
import REGIONS_JSON from "./data/regions.json";

export type RegionKey = keyof typeof REGIONS_JSON;
/**
 * osm：OpenStreetMap の切り出しの配布元での地方の名前（近畿は Geofabrik では kansai）。無ければ地方の鍵と同じ。
 * preparing：準備中（国のデータを作って確かめている途中）。データを作るスクリプトは準備中の地方も作るが、アプリは対応エリアに入れない
 */
export type Region = { name: string; prefs: Record<string, string>; bounds: [[number, number], [number, number]]; osm?: string; preparing?: boolean };

/** 準備中の地方も入れた全部（データを作るスクリプトと同じ範囲。データの形を確かめるテストに使う） */
export const ALL_REGIONS = REGIONS_JSON as unknown as Record<RegionKey, Region>;
/** 準備中の地方も入れた全部の都道府県コード（2桁）→ 名前 */
export const ALL_PREF_NAMES: Record<string, string> = Object.assign({}, ...Object.values(ALL_REGIONS).map((r) => r.prefs));

/** 対応している地方の順（候補の並びや一覧の順に使う）。準備中の地方は入れない */
export const REGION_ORDER = (Object.keys(ALL_REGIONS) as RegionKey[]).filter((k) => !ALL_REGIONS[k].preparing);
/** 対応している地方（準備中の地方の鍵は入っていない。REGION_ORDER の鍵で引く） */
export const REGIONS = Object.fromEntries(REGION_ORDER.map((k) => [k, ALL_REGIONS[k]])) as Record<RegionKey, Region>;

/** その地方に対応しているか（準備中の地方は false）。市町村の一覧（municipalities.ts）が、準備中の地方の市町村を入れないのに使う */
export function isOpenRegion(k: RegionKey): boolean {
  return REGION_ORDER.includes(k);
}

/** 都道府県コード（2桁）→ 名前。対応している都道府県だけ */
export const PREF_NAMES: Record<string, string> = Object.assign({}, ...REGION_ORDER.map((k) => REGIONS[k].prefs));

/** 都道府県コード（2桁）→ 地方 */
export function regionOfPref(pref: string): RegionKey | undefined {
  return REGION_ORDER.find((k) => pref in REGIONS[k].prefs);
}

/** 市区町村コード（5桁）→ 地方。対応していなければ undefined */
export function regionOfMuni(muniCd: string): RegionKey | undefined {
  return regionOfPref(muniCd.slice(0, 2));
}

/** 対応している都道府県か（市区町村コードの頭2桁で） */
export function isSupportedPref(code: string): boolean {
  return code.slice(0, 2) in PREF_NAMES;
}

/** 住所の先頭が対応している都道府県か */
export const PREF_NAME_RE = new RegExp(`^(${Object.values(PREF_NAMES).join("|")})`);

/** 対応している地方をすべて含む範囲 [[西, 南], [東, 北]] */
export const SUPPORTED_BOUNDS: [[number, number], [number, number]] = REGION_ORDER.reduce(
  (b, k) => {
    const [[w, s], [e, n]] = REGIONS[k].bounds;
    return [
      [Math.min(b[0][0], w), Math.min(b[0][1], s)],
      [Math.max(b[1][0], e), Math.max(b[1][1], n)],
    ];
  },
  [
    [180, 90],
    [-180, -90],
  ] as [[number, number], [number, number]],
);

/** 地方の都道府県の数え方（「1都6県」「2府5県」「9県」）。名前の最後の字（都・道・府・県）で数える */
function prefCount(prefs: Record<string, string>): string {
  const names = Object.values(prefs);
  return ["都", "道", "府", "県"]
    .map((u) => [u, names.filter((n) => n.endsWith(u)).length] as const)
    .filter(([, n]) => n > 0)
    .map(([u, n]) => `${n}${u}`)
    .join("");
}

/** 全部の都道府県（47）に対応しているか */
const NATIONWIDE = Object.keys(PREF_NAMES).length === 47;

/** 「関東1都6県・中部9県・東北6県・近畿2府5県」のような対応エリアの言い方。全部の都道府県に対応したら「全国47都道府県」 */
export const AREA_LABEL = NATIONWIDE ? "全国47都道府県" : REGION_ORDER.map((k) => `${REGIONS[k].name}${prefCount(REGIONS[k].prefs)}`).join("・");

/** 地方の名前だけの短い言い方（例「関東・中部」。PC のホームの小さな枠に入れる）。全部の都道府県に対応したら「全国」 */
export const AREA_SHORT = NATIONWIDE ? "全国" : REGION_ORDER.map((k) => REGIONS[k].name).join("・");
