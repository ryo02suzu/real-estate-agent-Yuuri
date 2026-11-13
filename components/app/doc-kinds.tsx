// 作れる書類の一覧（書類・出力のページ components/app/docs.tsx と、物件の画面の「レポートを作成」のシート
// components/app/app-sheets.tsx で同じ並び）。不動産会社の物件調査の流れ（机上で要点をつかむ → 役所・法務局で確かめる →
// 現地を見る → 書類にまとめる）に合わせて3つの組に分け、いちばん使う「要注意点と次にやること」は組の外で大きく出す。
// どれも参考の資料（法令上の判断はしない）
import { ClipboardCopy, Landmark, ListChecks, Mail, Map as MapIcon, Printer, ScrollText, type LucideIcon } from "lucide-react";

export type DocKind = "triage" | "inquiry" | "parcels" | "guide" | "memo" | "draft" | "copy";

export type DocDef = {
  kind: DocKind;
  Icon: LucideIcon;
  /** 書類・出力のタイルの名前（短く） */
  title: string;
  /** タイルの2行目（形・使う場面。タイルの幅に収まる 6〜7 文字まで） */
  short: string;
  /** レポートのシートの行の名前（何をするかまで） */
  action: string;
  /** レポートのシートの行の説明 */
  sub: string;
};

/** いちばん使う書類（横いっぱいの大きなボタン） */
export const MAIN_DOC: DocDef = {
  kind: "triage",
  Icon: ListChecks,
  title: "要注意点と次にやること",
  short: "問題になりそうな所と、確かめる窓口",
  action: "要注意点と次にやること",
  sub: "窓口ごとの確認事項をチェックしながら進められます",
};

/** 調査の流れの順の3つの組 */
export const DOC_GROUPS: { title: string; docs: DocDef[] }[] = [
  {
    title: "役所・法務局で",
    docs: [
      { kind: "inquiry", Icon: Mail, title: "窓口の照会文", short: "FAX・メール用", action: "道路種別の照会文をコピー", sub: "建築の担当課に FAX・メールで道路種別を聞くときの依頼文（所在地・聞くこと入り）" },
      { kind: "parcels", Icon: Landmark, title: "地番の一覧", short: "謄本・公図用", action: "謄本・公図用の地番をコピー", sub: "物件の筆と隣の筆の所在・地番を1筆ずつ（法務局の窓口・登記情報提供サービスに）" },
    ],
  },
  {
    title: "現地で",
    docs: [{ kind: "guide", Icon: MapIcon, title: "案内図", short: "A4・PDF", action: "案内図を印刷・PDF保存", sub: "物件の場所の地図（詳細図と広域図を A4 1枚に）" }],
  },
  {
    title: "書類にする",
    docs: [
      { kind: "memo", Icon: Printer, title: "調査メモ", short: "A4・PDF", action: "調査メモを印刷・PDF保存", sub: "道路・法令・ハザード・地番・地価・周辺環境と、要注意点・あなたの確認の記録を A4 に" },
      { kind: "draft", Icon: ScrollText, title: "重説の下書き", short: "物件概要つき", action: "重説・物件概要の下書き", sub: "重要事項説明書・販売図面の欄の順に、コピーして使える下書き" },
      { kind: "copy", Icon: ClipboardCopy, title: "結果の文面", short: "コピー・共有", action: "結果の文面をコピー・共有", sub: "メール・チャット・社内の報告にそのまま貼れる文（入れる項目を選べます）" },
    ],
  },
];

/** 組をほどいた並び（書類・出力のタイル。2行×3つ） */
export const DOCS: DocDef[] = DOC_GROUPS.flatMap((g) => g.docs);

export function docOf(kind: DocKind): DocDef {
  return kind === "triage" ? MAIN_DOC : (DOCS.find((d) => d.kind === kind) ?? MAIN_DOC);
}
