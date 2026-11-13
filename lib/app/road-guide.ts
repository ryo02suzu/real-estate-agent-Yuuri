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
