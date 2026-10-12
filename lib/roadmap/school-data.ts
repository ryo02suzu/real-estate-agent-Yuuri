// 学校区（小学校区・中学校区）のタイルの置き場所と版。既定は data/school-source.json（アプリと同じサイトに置いたファイル）。
// タイルは scripts/school-districts/build.py で作る（.github/workflows/school-districts.yml が新しい年のデータが出たら作り直す）
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
