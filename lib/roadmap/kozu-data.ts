// 公図（任意座標系の登記所備付地図データ）を、道路縁に合わせて推定の位置に置いた筆のタイルの置き場所と版。既定は data/kozu-source.json。
// タイルは scripts/kozu-tiles/kozu.py で市区町村ごとに作り、ワークフロー（.github/workflows/kozu-tiles.yml）が R2 に置いてこのファイルを書き換える。
// url が空のあいだは推定の筆を出さない。ビルド時の環境変数 NEXT_PUBLIC_KOZU_PMTILES_URL / NEXT_PUBLIC_KOZU_EDITION があれば、そちらを使う
import SOURCE from "./data/kozu-source.json";
import { PARCEL_CREDIT, PARCEL_DATA, PARCEL_SOURCE } from "./parcel-data";

export const KOZU_DATA = {
  /** 「/data/…」のようにサイト内のパスのときは、開いているサイトのファイルを読む */
  url: process.env.NEXT_PUBLIC_KOZU_PMTILES_URL || SOURCE.url,
  /** 画面に出すデータの版（「2026年公開版」） */
  edition: process.env.NEXT_PUBLIC_KOZU_EDITION || SOURCE.edition,
  /** タイルのレイヤ名（地番の筆のタイルと同じ属性：地番区域・地番） */
  layer: "kozu",
};

/** 推定の筆のデータがあるか */
export const hasKozu = () => !!KOZU_DATA.url;

/** 読みに行く URL（サイト内のパスは、開いているサイトの URL にする） */
export function kozuUrl(): string {
  const { url } = KOZU_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

/** 出典（登記所備付地図データの利用規約と、位置合わせに使った基盤地図情報） */
export const KOZU_CREDIT = `公図（任意座標）の筆は、「登記所備付地図データ」（法務省）を、国土地理院の基盤地図情報（道路縁）に合わせて MICHILU が推定の位置に置いたもの${
  KOZU_DATA.edition ? `（${KOZU_DATA.edition}）` : ""
}。数mずれることがあり、法務局の証明ではありません`;

/**
 * 筆の出典を1つの文にする（「筆の出典：…を加工して作成（版）。公図（任意座標）の筆は…で、数mずれることがあります。どちらも法務局の証明ではありません」）。
 * estimated：公図から推定した筆も出したとき。推定の筆の版は、登記所備付地図データの版と違うときだけ書く
 */
export function parcelCreditLine(estimated: boolean): string {
  if (!estimated) return `筆の${PARCEL_CREDIT}`;
  const edition = KOZU_DATA.edition && KOZU_DATA.edition !== PARCEL_DATA.edition ? `（${KOZU_DATA.edition}）` : "";
  return `筆の${PARCEL_SOURCE}。公図（任意座標）の筆は、国土地理院の基盤地図情報（道路縁）に合わせて MICHILU が推定の位置に置いたもの${edition}で、数mずれることがあります。どちらも法務局の証明ではありません`;
}
