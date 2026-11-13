// 学校区（小学校区・中学校区）のタイルの置き場所と版。既定は data/school-source.json（アプリと同じサイトに置いたファイル）。
// タイルは scripts/school-districts/build.py で作る（.github/workflows/school-districts.yml が新しい年のデータが出たら作り直す）
import { cityCode } from "./codes";
import SOURCE from "./data/school-source.json";

export const SCHOOL_DATA = {
  /** 「/data/…」のようにサイト内のパスのときは、開いているサイトのファイルを読む */
  url: process.env.NEXT_PUBLIC_SCHOOL_PMTILES_URL || SOURCE.url,
  /** 画面に出すデータの版（「令和5年度（2023年度）」） */
  edition: SOURCE.edition,
  layer: "sd",
};

/** 読みに行く URL（サイト内のパスは、開いているサイトの URL にする） */
export function schoolUrl(): string {
  const { url } = SCHOOL_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

/** 出典（CC BY 4.0 のとおり、加工したことを書く。共有・印刷の文面に使う） */
export const SCHOOL_CREDIT = `出典：「国土数値情報（小学校区データ・中学校区データ・学校データ）」（国土交通省、https://nlftp.mlit.go.jp/ksj/）を加工して作成（${SCHOOL_DATA.edition}）`;

/** 学校区の種類（es 小学校区・jh 中学校区） */
export type SchoolKey = "es" | "jh";

const COVERED: Record<SchoolKey, Set<string>> = { es: new Set(SOURCE.covered.es.split(" ")), jh: new Set(SOURCE.covered.jh.split(" ")) };
const EXCLUDED: Record<SchoolKey, Set<string>> = {
  es: new Set(SOURCE.excludedBy.es.map((c) => c.slice(0, 5))),
  jh: new Set(SOURCE.excludedBy.jh.map((c) => c.slice(0, 5))),
};

/**
 * その市区町村（地点の muniCd。政令市は区のコードでもよい）に、その種類の学校区のデータが無いわけ。
 * terms：国のデータにはあるが、利用条件（商用利用・再配布など）で入れていない。absent：国のデータに無い。データがあれば null
 */
export function schoolGap(muniCd: string, key: SchoolKey): "terms" | "absent" | null {
  const c = cityCode(muniCd);
  if (COVERED[key].has(c)) return null;
  return EXCLUDED[key].has(c) ? "terms" : "absent";
}

/** 市区町村の通学区域を探すリンク（データの無い市区町村で、教育委員会のページを探す。住所は送らず、市区町村の名前だけ） */
export const schoolSearchUrl = (city: string) => `https://www.google.com/search?q=${encodeURIComponent(`${city} 通学区域 教育委員会`)}`;
