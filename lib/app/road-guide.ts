// スマホの「道路」タブに出す、地図の開き方（何が開くか・開いたあとの道順）。文は PC の地図ボタンと同じ（lib/roadmap/link-texts.ts）。
// 市のページ（入口）を開く地図は、開いたあとにどこを押すかが分からないと使えないので、ボタンのすぐ下とくわしい話のシートに出す
import { linkTexts } from "../roadmap/link-texts";
import type { ResolvedLink } from "../roadmap/municipalities";

/** 入口しか開けない地図で、開き方の文が無いとき：スマホの結果の上にある「住所をコピー」を使う */
export const PHONE_COPY_HINT = "上の「住所をコピー」を押して、地図の住所検索に貼り付けてください。";

export type GuideItem = {
  /** 地図の名前 */
  label: string;
  url: string;
  /** 何が開くか（物件の場所・地図の入口・物件が載っている図） */
  what: string;
  /** 開いたあとの道順・注意 */
  tip: string;
};

/** 地図ごとの開き方。物件の場所がそのまま開いて、開いたあとの操作が要らない地図は入れない */
export function roadGuide(links: ResolvedLink[]): GuideItem[] {
  return links.flatMap((l) => {
    const { sub, tip } = linkTexts(l, false, PHONE_COPY_HINT);
    return tip ? [{ label: l.label, url: l.url, what: sub, tip }] : [];
  });
}

/**
 * 「地図の色と幅員のくわしい話」のシートの、見出し・地図のデータを読めないときの一文・下の注意。
 * 道路種別の地図（MICHILU から開けるもの）が無い市町村（非公開・調査中・区域外。市道の参考の地図だけの市も）に、
 * 「市町村の地図を開いて確認」「地図に色の無い道は…」と言わない（開ける地図が無いので、窓口で確かめる）
 */
export function roadSheetTexts(links: ResolvedLink[], name: string): { heading: string; unread: string; lead: string } {
  const hasTypeMap = links.some((l) => l.kind !== "public_road");
  const hasGuide = roadGuide(links).length > 0;
  return {
    heading: hasGuide ? `${name}の地図の開き方と注意` : `${name}の道路の調べ方の注意`,
    unread: hasTypeMap
      ? "この市町村は、地図の道路の種別を MICHILU で読めません。道路のタブから市町村の地図を開いて確認してください。"
      : "この市町村は、MICHILU から開ける道路種別の地図がありません。道路の種別は、道路のタブの問い合わせ先（窓口）で確かめてください。",
    lead: hasTypeMap
      ? "地図に色の無い道は載っていません。前面道路と幅員は、地図と現地で確かめ、最終確認は窓口で行ってください。"
      : "前面道路の種別と幅員は、現地と窓口で確かめてください。",
  };
}
