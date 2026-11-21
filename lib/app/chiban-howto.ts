// 地番が確定しないとき（地図データにその場所の筆が無い・読めなかった・住所の地点の筆は参考）に出す「地番の確かめ方」。
// 地番の欄を空や「データなし」で終わらせず、その場で次の一手が分かるようにする。公式の手段だけを並べる（ほかの会社の地図は使わない）。
// 確かめた原本（2026-11-20）：
//  - 登記情報提供サービス よくある質問 No.195（2022-11-18 更新。https://qa.touki.or.jp/faq/show/195?site_domain=open）：
//    「地番検索サービス」のサービス提供エリア内では「住居番号（住居表示）」からおおよその地番を確認できることがある。
//    ログイン後の請求画面の「地番検索サービス」のボタンから使う。地番は登記済証・登記識別情報通知書・固定資産税の課税明細書でも確かめられる
//  - 登記情報提供サービス「初めての方はこちら」（https://www1.touki.or.jp/getting-started/）：有料のサービス。利用者の登録か一時利用
//  - 旭川地方法務局「地番を調べる方法はありますか」：管轄の法務局に電話して聞く（地番照会）
//  - 法務省「各法務局のホームページ」（https://houmukyoku.moj.go.jp/homu/static/kakukyoku_index.html）
// 地番検索サービスの料金と提供エリアの一覧は公式の案内で確かめられなかったので書かない（「提供エリアの中では」「有料のサービス」だけ）。法的な判断はしない
import type { ChibanzuLink } from "../roadmap/chibanzu";

export const TOUKI_URL = "https://www1.touki.or.jp/";
export const HOUMUKYOKU_URL = "https://houmukyoku.moj.go.jp/homu/static/kakukyoku_index.html";

export type ChibanStep = { title: string; text: string; link?: { label: string; url: string } };

/**
 * 地番の確かめ方。営業は物件の交渉の前に、まず自分で調べる（持ち主の書類はまだ見られない）ので、
 * 交渉の前に自分で調べられる順（市の地番図 → 登記情報提供サービスの地番検索サービス → 法務局への照会）に並べ、
 * 持ち主の書類は「交渉が始まってから」として最後に置く。市町村が地番図を公開していれば、それを先頭に並べる
 */
export function chibanHowto(chibanzu?: ChibanzuLink): ChibanStep[] {
  return [
    ...(chibanzu
      ? [{ title: chibanzu.name, text: "市町村が公開している地番の参考図で、場所から地番を見られます（登記の地番と違うことがあるので、謄本・公図で確認）。", link: { label: chibanzu.name, url: chibanzu.url } }]
      : []),
    {
      title: "登記情報提供サービスの「地番検索サービス」",
      text: "ログインしたあとの請求の画面の「地番検索サービス」で、住居表示の住所から、おおよその地番を確かめられることがあります（サービスの提供エリアの中）。登記情報提供サービスは有料で、利用者の登録か一時利用が要ります。",
      link: { label: "登記情報提供サービス", url: TOUKI_URL },
    },
    {
      title: "法務局に聞く（地番照会）",
      text: "物件の地域を受け持つ法務局に電話で聞くと、住所から地番を調べてもらえることがあります。公図で筆の場所が分かったら、地図でその土地を選ぶと、その筆で調べ直せます。",
      link: { label: "各法務局のホームページ", url: HOUMUKYOKU_URL },
    },
    {
      title: "持ち主の書類（交渉が始まってから）",
      text: "登記済証（権利証）・登記識別情報通知書・固定資産税の課税明細書に地番が書かれています。お客さまに見せてもらえれば、いちばん確かです。",
    },
  ];
}

/** 文面（書類・共有）用の1行ずつ（箇条書きの印は付けない。書類の箇条書き・共有の文面の側で付ける） */
export function chibanHowtoLines(chibanzu?: ChibanzuLink): string[] {
  return chibanHowto(chibanzu).map((s) => `${s.title}：${s.text}${s.link ? `（${s.link.url}）` : ""}`);
}
