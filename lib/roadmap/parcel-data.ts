// 地番の筆のデータ（登記所備付地図データのベクトルタイル）の置き場所と版。
// 既定は data/parcel-source.json。最初は AMX プロジェクトが公開している全国版（2024年4月公開版）で、
// 最新版を Cloudflare R2 に置くワークフロー（.github/workflows/parcel-tiles.yml）が、置き終えたらこのファイルを書き換える。
// ビルド時の環境変数 NEXT_PUBLIC_PARCEL_PMTILES_URL / NEXT_PUBLIC_PARCEL_EDITION があれば、そちらを使う
import SOURCE from "./data/parcel-source.json";

export const PARCEL_DATA = {
  url: process.env.NEXT_PUBLIC_PARCEL_PMTILES_URL || SOURCE.url,
  /** 画面に出すデータの版 */
  edition: process.env.NEXT_PUBLIC_PARCEL_EDITION || SOURCE.edition,
  /** タイルのレイヤ名 */
  layer: "fude",
};

/** 利用規約どおりの出典と、加工したことの記載（共有の文面に添える） */
export const PARCEL_CREDIT = `出典：「登記所備付地図データ」（法務省）（https://front.geospatial.jp/moj-chizu-xml-readme/）を加工して作成（${PARCEL_DATA.edition}）。法務局の証明ではありません`;
