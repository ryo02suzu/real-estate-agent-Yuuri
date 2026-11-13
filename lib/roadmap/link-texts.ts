// 地図ボタンの説明（何が開くか）と、開いたあとの操作の手順。PC の地図ボタン（components/result-view.tsx の MapButton）と、
// スマホの「道路」タブ（lib/app/road-guide.ts）が同じ文を使う
import type { ResolvedLink } from "./municipalities";

/** 地図ボタンの説明（何が開くか）と、開いたあとの操作の手順 */
export function linkTexts(link: ResolvedLink, agree?: boolean, copyHint = "上の「住所コピー」を押し、地図の住所検索に貼り付けてください。"): { sub: string; tip?: string } {
  const sheet = link.sheet;
  const sub = sheet
    ? sheet.zip
      ? `物件の図面は ${sheet.label}（県のページの ZIP の中）`
      : sheet.howto
      ? `物件が載っている図（${sheet.label}）の場所で地図が開きます`
      : sheet.whole
        ? "市全体の図が開きます"
        : `物件が載っている図（${sheet.label}）が開きます`
    : link.pinpoint
      ? agree
        ? "利用規約に同意すると、物件の場所が開きます"
        : "物件の場所が開きます"
      : "地図の入口が開きます";
  // 開いたあとに操作が要る地図は、その手順を出す。入口しか開けない地図は住所の貼り付けを案内
  // 複数ページのPDF（北区など）はページを添える。iPhone ではページ指定が効かないことがある
  const page = sheet?.url.match(/#page=(\d+)/)?.[1];
  const tip = sheet
    ? sheet.howto
      ? `${sheet.howto}物件は図の${sheet.where}あたりです。`
      : `物件は図の${sheet.where}あたりです${page ? `（PDFの${page}ページ目）` : ""}。`
    : (link.tip ?? (link.pinpoint ? undefined : copyHint));
  return { sub, tip };
}
