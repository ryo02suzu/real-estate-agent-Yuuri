// 市の一覧ページに並ぶ PDF などの図へのリンクを読み、図の差し替え（ファイル名の変更）を見つける。
// 週次の自動確認（lib/roadmap/sheet-watch.test.ts）から使う。

export type PageLink = { href: string; text: string };

/** 図のファイルとして扱う拡張子 */
const FILE_RE = /\.(pdf|png|jpe?g)$/i;

/** 一覧ページの HTML から、図のファイルへのリンク（絶対URL・#以降なし）とリンクの文字を取り出す */
export function extractFileLinks(html: string, baseUrl: string): PageLink[] {
  const out: PageLink[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    let href: string;
    try {
      href = new URL(decodeEntities(m[2]), baseUrl).href.replace(/^http:/, "https:").split("#")[0];
    } catch {
      continue;
    }
    if (!FILE_RE.test(new URL(href).pathname)) continue;
    out.push({ href, text: decodeEntities(m[3].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim() });
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/**
 * リンクの文字を比べられる形にそろえる。ファイルの大きさや「PDF」「別ウィンドウ」の注記は
 * 差し替えのたびに変わるので外す（「1 [PDFファイル／1.58MB]」→「1」）
 */
export function normalizeLinkText(text: string, loose = false): string {
  let t = text.normalize("NFKC");
  // 年度ごとに出し直す図（「令和8年度道路網図」→「令和9年度…」）も同じ図とみなすときは、日付・年度を外す
  if (loose)
    t = t
      .replace(/(令和|平成|昭和|R|H)\s*(\d+|元)\s*(年度?)?(\s*\d+\s*月)?(\s*\d+\s*日)?(時点|現在|改定|更新|版)?/gi, "")
      .replace(/\d{4}\s*(年度?|[./-])\s*(\d+\s*(月|[./-]))?\s*(\d+\s*日?)?(時点|現在|改定|更新|版)?/g, "");
  return t
    .replace(/[(（\[［【〔][^)）\]］】〕]*(pdf|ファイル|kb|mb|バイト|byte|別ウィンドウ|新しいウィンドウ|外部サイト)[^)）\]］】〕]*[)）\]］】〕]/gi, "")
    .replace(/(pdf|png|jpe?g)(形式|ファイル)?/gi, "")
    .replace(/[\s　・:：/／,，、。]+/g, "")
    .toLowerCase();
}

export type SheetUrl = { label: string; url: string };
export type Replacement = { label: string; from: string; to: string; text: string };

/**
 * 一覧ページから消えた図のURLについて、差し替え先を探す。
 * 前回のページ（snapshot: URL → リンクの文字）で同じ文字だったリンクが、今回は別のURLになっていれば差し替え。
 * 前回の記録が無いときは、図の名前（「A-12」「1」など）とリンクの文字が一致するものを探す。
 * 候補が1つに絞れたものだけを返し、それ以外は unresolved に入れる（人が確認する）。
 */
export function findReplacements(
  ours: SheetUrl[],
  onPage: PageLink[],
  snapshot: Record<string, string> = {},
): { replaced: Replacement[]; unresolved: SheetUrl[] } {
  const ourUrls = new Set(ours.map((o) => o.url));
  const present = new Set(onPage.map((l) => l.href));
  // 差し替え先になれるのは、まだ誰も使っていない、今回はじめて出てきたリンク
  const fresh = onPage.filter((l) => !ourUrls.has(l.href) && !(l.href in snapshot));
  const used = new Set<string>();
  const replaced: Replacement[] = [];
  const unresolved: SheetUrl[] = [];
  // 同じURLを複数の図が使う（北区の10枚綴りのPDFなど）ので、URLごとにまとめて扱う
  const byUrl = new Map<string, SheetUrl[]>();
  for (const o of ours) if (!present.has(o.url)) byUrl.set(o.url, [...(byUrl.get(o.url) ?? []), o]);
  for (const [url, sheets] of byUrl) {
    const ext = url.split(".").pop()!.toLowerCase();
    const before = url in snapshot ? snapshot[url] : sheets[0].label;
    // まず文字がそのまま一致するもの、無ければ日付・年度を外して一致するもの
    const match = (loose: boolean) => {
      const want = normalizeLinkText(before, loose);
      return want
        ? fresh.filter((l) => !used.has(l.href) && l.href.split(".").pop()!.toLowerCase() === ext && normalizeLinkText(l.text, loose) === want)
        : [];
    };
    const strict = match(false);
    const candidates = strict.length ? strict : match(true);
    if (candidates.length === 1) {
      used.add(candidates[0].href);
      replaced.push({ label: sheets.map((s) => s.label).join("・"), from: url, to: candidates[0].href, text: candidates[0].text });
    } else unresolved.push(...sheets);
  }
  return { replaced, unresolved };
}
