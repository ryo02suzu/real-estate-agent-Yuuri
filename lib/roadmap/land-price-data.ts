// 地価公示・地価調査のタイルの置き場所と版。既定は data/land-price-source.json（アプリと同じサイトに置いたファイル）。
// タイルは scripts/land-price/build.py で作る（.github/workflows/land-price.yml が新しい年のデータが出たら作り直す）
import SOURCE from "./data/land-price-source.json";

export const LAND_PRICE_DATA = {
  /** 「/data/…」のようにサイト内のパスのときは、開いているサイトのファイルを読む */
  url: process.env.NEXT_PUBLIC_LAND_PRICE_PMTILES_URL || SOURCE.url,
  /** 画面に出すデータの版（「地価公示 令和8年（2026年1月1日時点）・地価調査 令和8年（2026年7月1日時点）」） */
  edition: SOURCE.edition,
  /** 物件のまわりを調べるレイヤ（z13 だけ。属性を全部持つ）と、引いた地図の点のレイヤ（z8〜12） */
  layer: "lp",
  smallLayer: "pt",
};

/** 読みに行く URL（サイト内のパスは、開いているサイトの URL にする） */
export function landPriceUrl(): string {
  const { url } = LAND_PRICE_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

/** 出典（CC BY 4.0 のとおり、加工したことを書く。共有・印刷の文面に使う） */
export const LAND_PRICE_CREDIT = `出典：「国土数値情報（地価公示データ・都道府県地価調査データ）」（国土交通省、https://nlftp.mlit.go.jp/ksj/）を加工して作成（${LAND_PRICE_DATA.edition}）`;
