// 建物（PLATEAU）のタイルの置き場所と版。既定は data/building-source.json。
// タイルを Cloudflare R2 に置くワークフロー（.github/workflows/building-tiles.yml）が、置き終えたらこのファイルを書き換える。
// url が空のあいだは、建物の機能を出さない。ビルド時の環境変数 NEXT_PUBLIC_BUILDING_PMTILES_URL / NEXT_PUBLIC_BUILDING_EDITION があれば、そちらを使う
import SOURCE from "./data/building-source.json";

export const BUILDING_DATA = {
  /** 「/data/…」のようにサイト内のパスのときは、開いているサイトのファイルを読む */
  url: process.env.NEXT_PUBLIC_BUILDING_PMTILES_URL || SOURCE.url,
  /** 画面に出すデータの時点（「2026年10月時点」） */
  edition: process.env.NEXT_PUBLIC_BUILDING_EDITION || SOURCE.edition,
  /** タイルのレイヤ名 */
  layer: "b",
};

/** 建物のデータがあるか（無ければ建物の機能を出さない） */
export const hasBuildings = () => !!BUILDING_DATA.url;

/** PLATEAU の建物がある市区町村（国土地理院の muniCd。政令市は区）。一覧が無ければ（試しに作ったタイルなど）、どこでもあるとみなす */
const CODES = new Set<string>((SOURCE as { codes?: string[] }).codes ?? []);

/** その市区町村に PLATEAU の建物のデータがあるか */
export function buildingsCover(muniCodes: string[]): boolean {
  if (!hasBuildings()) return false;
  return CODES.size === 0 || muniCodes.some((c) => CODES.has(c));
}

/** 読みに行く URL（サイト内のパスは、開いているサイトの URL にする） */
export function buildingUrl(): string {
  const { url } = BUILDING_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

/** 出典（公共データ利用規約のとおり、加工したことを書く。共有・印刷の文面に使う） */
export const BUILDING_CREDIT = `出典：「3D都市モデル（Project PLATEAU）」（国土交通省、https://www.mlit.go.jp/plateau/）を加工して作成${
  BUILDING_DATA.edition ? `（${BUILDING_DATA.edition}）` : ""
}。都市計画基礎調査などをもとにした参考情報で、登記・建築確認の内容とは異なることがあります`;
