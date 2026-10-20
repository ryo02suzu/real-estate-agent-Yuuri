// 市町村がオープンデータで公開している地番参考図（固定資産税の地番図）の筆のタイルの置き場所と、市町村ごとの出典。
// タイルは scripts/sanko/build.py で作り、ワークフロー（.github/workflows/sanko-tiles.yml）が R2 に置いて data/sanko-source.json を書き換える。
// url が空のあいだは参考図の筆を出さない。ビルド時の環境変数 NEXT_PUBLIC_SANKO_PMTILES_URL があれば、そちらを使う。
// 法務省の地図データに公共座標の筆がある所は入っていない（重ならない）。公図（任意座標）しか無い所で、市町村の図の筆を出す
import SOURCE from "./data/sanko-source.json";

export const SANKO_DATA = {
  /** 「/data/…」のようにサイト内のパスのときは、開いているサイトのファイルを読む */
  url: process.env.NEXT_PUBLIC_SANKO_PMTILES_URL || SOURCE.url,
  /** タイルを作った日 */
  built: SOURCE.built,
  /** タイルのレイヤ名（地番の筆のタイルと同じ属性：地番区域・地番。m は市区町村コード） */
  layer: "sanko",
};

/** 参考図の筆のデータがあるか */
export const hasSanko = () => !!SANKO_DATA.url;

/** 読みに行く URL（サイト内のパスは、開いているサイトの URL にする） */
export function sankoUrl(): string {
  const { url } = SANKO_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

export type SankoCity = { name: string; credit: string; license: string; date: string; /** データの公開ページ */ page: string };

/** 市区町村コード → 参考図の市町村（名前・出典の名前・ライセンス・データの時点） */
export const SANKO_CITIES: Record<string, SankoCity> = Object.fromEntries(
  Object.entries(SOURCE.sources).map(([code, s]) => [code, { name: s.name, credit: s.credit, license: s.license, date: s.date, page: s.page }]),
);

/** 参考図のある市町村の名前（「小川町」。推定の筆の位置より参考図を使う） */
export const SANKO_CITY_NAMES = new Set(Object.values(SANKO_CITIES).map((c) => c.name));

/** 地番区域の市区町村の部分（「市川市」「比企郡小川町」）が、参考図のある市町村か（町村は郡の名前が前に付く） */
export function sankoCovers(city: string): boolean {
  if (SANKO_CITY_NAMES.has(city)) return true;
  const i = city.indexOf("郡");
  return i > 0 && SANKO_CITY_NAMES.has(city.slice(i + 1));
}

/** 参考図の筆に添える印 */
export const SANKO_MARK = "（地番参考図）";

/** 参考図の筆の注意（見出しや注記に添える） */
export const SANKO_NOTE = "市町村の課税用の参考図で、登記の地番・筆の形と違うことがあります";

/** 市町村の地番参考図の出典（ライセンス：公共データ利用規約第1.0版か CC BY 4.0。どちらも出典と加工した旨を書く） */
export function sankoSource(code: string): string {
  const c = SANKO_CITIES[code];
  return c ? `出典：${c.credit}（${c.license}・${c.date}）を加工して作成` : "出典：市町村の地番参考図（オープンデータ）を加工して作成";
}

/** 出典と、登記の地番・筆の形と違うことがあること（共有の文面・下書きに添える） */
export function sankoCredit(code: string): string {
  return `${sankoSource(code)}。${SANKO_NOTE}`;
}

/** 地図の出典（タイルに入っている市町村をまとめて） */
export const SANKO_ATTRIBUTION = `地番参考図：${Object.values(SANKO_CITIES)
  .map((c) => c.credit)
  .join("、")}（市町村のオープンデータ）を加工して作成`;
