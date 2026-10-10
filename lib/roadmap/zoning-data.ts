// 都市計画（用途地域など）のタイルの置き場所と版。既定は data/zoning-source.json（アプリと同じサイトに置いたファイル）。
// タイルは scripts/zoning-tiles/build.py で作る（.github/workflows/zoning-tiles.yml が毎年作り直す）
import SOURCE from "./data/zoning-source.json";

export const ZONING_DATA = {
  /** 「/data/…」のようにサイト内のパスのときは、開いているサイトのファイルを読む */
  url: process.env.NEXT_PUBLIC_ZONING_PMTILES_URL || SOURCE.url,
  /** 画面に出すデータの版 */
  edition: process.env.NEXT_PUBLIC_ZONING_EDITION || SOURCE.edition,
};

/** 読みに行く URL（サイト内のパスは、開いているサイトの URL にする） */
export function zoningUrl(): string {
  const { url } = ZONING_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

/** 出典（国土交通省の利用条件どおり、参考情報であることも添える。共有の文面に使う） */
export const ZONING_CREDIT = `出典：都市計画決定GISデータ（国土交通省）（https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html）を加工して作成（${ZONING_DATA.edition}）。参考情報で、実際の都市計画の範囲と異なることがあります`;
