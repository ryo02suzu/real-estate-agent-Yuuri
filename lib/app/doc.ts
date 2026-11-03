// スマホの書類（結果の文面・地番の一覧など）の中身の形。同じ中身から、画面の見せ方（components/app/doc-view.tsx）と、
// コピー・共有する文（docText）の両方を作る。文は LINE・メール・社内のチャットに貼って読みやすい形にする：
// 見出しは「■」、章の間は1行あける、注意は「▲」、確かめる所は【要確認】、やることは「□」（済みは「☑」）、
// 小さな注は字下げした「※」（かっこで包むと、注の中のかっこと入れ子になって読みにくい）、細かい点は字下げした「・」、URL は本文に混ぜず、最後の「確認先のリンク」に番号でまとめる。数字は半角にそろえる

export type DocTone = "warn" | "check" | "ok";
export type DocLink = { label: string; url: string };

export type DocItem = {
  /** 左の見出し（「用途地域」）。無ければ箇条書き */
  label?: string;
  text: string;
  /** warn：注意（▲）、check：要確認、ok：確認済み */
  tone?: DocTone;
  /** やること（□）・済んだこと（☑） */
  box?: "todo" | "done";
  /** 小さな注（コピーした文では、次の行に字下げした「※」で添える） */
  note?: string;
  /** 下に並べる細かい点 */
  sub?: string[];
  /** 確かめる先の地図・ページ */
  link?: DocLink;
};

export type DocSection = { title: string; items: DocItem[]; lead?: string };

export type Doc = {
  /** 【】で囲む題（「物件調査の結果」） */
  title: string;
  /** 題の下の行（物件・調べた日など） */
  head: string[];
  sections: DocSection[];
  /** 最後に添える注意・出典（※から始める） */
  foot?: string[];
};

/**
 * 住所・地番の数字・英字・ハイフンを半角にそろえる（国土地理院・登記のデータには全角が混じる）。
 * 「：」「（）」「、」などの日本語の約物はそのまま（NFKC にすると半角の「:」「()」になってしまう）
 */
export const half = (s: string) => s.replace(/[０-９Ａ-Ｚａ-ｚ－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** 日本の書き方の日付（2026年11月3日） */
export function jaDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 筆の並び（「松戸市古ケ崎４丁目 3555-1」…）を、同じ所在ごとにまとめる（「松戸市古ケ崎4丁目 3555-1・3555-2・3556-2」）。
 * 所在と地番は最後の空白で分ける。所在の無い行はそのまま
 */
export function compactParcels(list: string[]): string[] {
  const groups = new Map<string, string[]>();
  const order: string[] = [];
  for (const raw of list) {
    const s = half(raw).trim();
    const at = s.lastIndexOf(" ");
    const key = at > 0 ? s.slice(0, at) : "";
    const no = at > 0 ? s.slice(at + 1) : s;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(no);
  }
  return order.map((k) => (k ? `${k} ${groups.get(k)!.join("・")}` : groups.get(k)!.join("・")));
}

/** コピー・共有する文 */
export function docText(doc: Doc): string {
  const out: string[] = [`【${doc.title}】`, ...doc.head];
  const links: DocLink[] = [];
  const ref = (l: DocLink) => {
    let i = links.findIndex((x) => x.url === l.url);
    if (i < 0) {
      links.push(l);
      i = links.length - 1;
    }
    return `［${i + 1}］`;
  };
  for (const s of doc.sections) {
    if (!s.items.length && !s.lead) continue;
    out.push("", `■ ${s.title}`);
    if (s.lead) out.push(s.lead);
    for (const it of s.items) {
      const mark = it.box === "done" ? "☑ " : it.box === "todo" ? "□ " : it.tone === "warn" ? "▲ " : "・";
      const tag = it.tone === "check" && !/要確認/.test(it.text) ? "【要確認】" : it.tone === "ok" ? "【確認済み】" : "";
      const body = it.label ? `${it.label}：${it.text}` : it.text;
      out.push(`${mark}${body}${tag}${it.link ? ` → ${ref(it.link)}` : ""}`);
      if (it.note) out.push(`　※${it.note}`);
      for (const x of it.sub ?? []) out.push(`　・${x}`);
    }
  }
  if (links.length) {
    out.push("", "■ 確認先のリンク");
    links.forEach((l, i) => out.push(`［${i + 1}］${l.label}`, `　${l.url}`));
  }
  if (doc.foot?.length) out.push("", ...doc.foot);
  return out.join("\n");
}

/** 文の長さの目安（画面に「n文字」と出す） */
export const docLength = (doc: Doc) => docText(doc).length;
