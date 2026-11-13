// 町・大字より細かい区分（丁目・地割・号・字・区・部などの番号と、小字の名前）の照らし合わせ。
// 同じ大字の中には、同じ地番の土地が区分ごとにある（花巻市石鳥谷町好地の「第9地割 24番2」と「第16地割 24番2」、
// 鶴岡市羽黒町手向の「字手向 147番1」と「字羽黒山 147番1」、若狭町鳥浜の「10号 31番4」と「49号 31番4」）。
// 入れた住所に区分が書いてあるのに、区分の違う筆を「その土地」として出さないよう、入力と筆の地番区域を同じ形にして比べる。
// 比べられない（どちらかに書いていない・読み取れない）ときは「食い違い」とはしない。
import { newForm } from "./old-kanji";

/** 町より細かい区分。nums：数え方（「丁目」「地割」「号」「字」「区」「部」「番割」「番町」「番」「条」）ごとの番号、name：小字の名前（そろえた形） */
export type AddressSub = { nums: Record<string, number[]>; name: string };

const DIGIT: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const OLD_NUM: Record<string, string> = { 壱: "一", 弐: "二", 参: "三", 拾: "十" };

/** 漢数字のまとまり → 数（「十六」→16、「百一」→101。位の字が無ければ並べて読む：「二七」→27） */
export function kanjiNumber(run: string): number {
  if (!/[十百千]/.test(run)) return Number([...run].map((c) => DIGIT[c] ?? 0).join(""));
  let n = 0;
  let cur = 0;
  for (const ch of run) {
    if (ch === "千") {
      n += (cur || 1) * 1000;
      cur = 0;
    } else if (ch === "百") {
      n += (cur || 1) * 100;
      cur = 0;
    } else if (ch === "十") {
      n += (cur || 1) * 10;
      cur = 0;
    } else cur = DIGIT[ch] ?? 0;
  }
  return n + cur;
}

/**
 * 区分を比べるときの形：全角を半角に、空白を外す、旧字をいまの字に、壱弐参を一二三に、漢数字を数字に、ひらがなをカタカナに、
 * 「ヶ・ヵ・ガ」「ノ・之・乃」「ッ」を同じに。入力と地番区域の両方に同じ直しをかけるので、同じ名前は同じ形になる
 */
export function subNorm(s: string): string {
  return newForm(s.normalize("NFKC"))
    .replace(/\s/g, "")
    .replace(/[壱弐参拾]/g, (c) => OLD_NUM[c])
    .replace(/[〇一二三四五六七八九十百千]+/g, (run) => String(kanjiNumber(run)))
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[ヶヵガ]/g, "ケ")
    .replace(/[之乃]/g, "ノ")
    .replace(/ッ/g, "ツ");
}

/** 番号のついた区分（「第16地割」「3丁目」「2丁」「49号」「99字」「1区」「27部」「3番割」「1番町」「2番」「3条」） */
const NUMBERED = /第?(\d+)(丁目|丁|地割|号地|号|字|区|部|番割|番町|番|条)/g;

/** 区分の文字（「第16地割」「字杉ノ実」「49号村上」「3丁目字東」「ソ」）を、番号と名前に分ける。空なら null */
export function subParse(text: string): AddressSub | null {
  const s = subNorm(text);
  const nums: Record<string, number[]> = {};
  const names: string[] = [];
  let last = 0;
  const push = (seg: string) => {
    // 頭の「大字」「小字」「字」は名前ではない
    const name = seg.replace(/^(?:大字|小字|字)/, "");
    if (name) names.push(name);
  };
  for (const m of s.matchAll(NUMBERED)) {
    push(s.slice(last, m.index));
    const counter = m[2] === "丁" ? "丁目" : m[2];
    (nums[counter] ??= []).push(Number(m[1]));
    last = m.index + m[0].length;
  }
  push(s.slice(last));
  const name = names.join("");
  return name || Object.keys(nums).length ? { nums, name } : null;
}

/**
 * 2つの区分が食い違わないか。同じ数え方の番号が両方にあって違う、または、名前が両方にあって違うときだけ false。
 * 片方にしか書いていない区分は比べられないので通す
 */
export function subCompatible(a: AddressSub | null | undefined, b: AddressSub | null | undefined): boolean {
  if (!a || !b) return true;
  for (const [counter, xs] of Object.entries(a.nums)) {
    const ys = b.nums[counter];
    if (ys && (xs.length !== ys.length || xs.some((x, i) => x !== ys[i]))) return false;
  }
  return !a.name || !b.name || a.name === b.name;
}

/**
 * 入力の住所（地番を外した本体）から、見つかった町の名前より後ろに書かれていた区分を取り出す。
 * 「秋田県南秋田郡井川町浜井川字杉ノ実」＋町「浜井川」→ 名前「杉ノ実」。「花巻市石鳥谷町好地第16地割」＋「石鳥谷町好地」→ 地割 16。
 * 「若狭町鳥浜49号村上」＋「鳥浜」→ 号 49・名前「村上」。町の名前は市区町村（city）より後ろで探す（「千葉市中央区中央」の「中央」）。
 * 町が見つからない・後ろに何も無いときは null（照らし合わせない）
 */
export function addressSub(body: string, town: string, city = ""): AddressSub | null {
  const b = subNorm(body);
  const t = subNorm(town).replace(/^(?:大字|字)/, "");
  if (!t) return null;
  const c = subNorm(city);
  const ci = c ? b.indexOf(c) : -1;
  let from = ci >= 0 ? ci + c.length : 0;
  for (;;) {
    const i = b.indexOf(t, from);
    if (i < 0) return null;
    const rest = b.slice(i + t.length);
    // 市区町村の名前の中に当たった（「中央区中央」の初めの「中央」）なら、その後ろで探し直す
    if (/^[市区郡]/.test(rest)) {
      from = i + 1;
      continue;
    }
    // 町の名前のすぐ後ろの「町」「村」だけ（住所の「下奈良町」と正式な「下奈良」）は区分ではない。「町屋」「村中」のような小字は残す
    const sub = rest.replace(/^[町村](?=$|大字|小字|字|第?\d)/, "");
    return sub ? subParse(sub) : null;
  }
}

/**
 * 地番が見つからなかったとき、同じ地番が別の区分（小字・地割・号・丁目）にあったことの案内（lookup の parcelMiss.elsewhere）。
 * 別の土地なので当てていないことを言う。無ければ空
 */
export function elsewhereNote(labels: string[] | undefined): string {
  if (!labels?.length) return "";
  return `同じ地番は${labels.slice(0, 3).map((l) => `「${l}」`).join("")}${labels.length > 3 ? "など" : ""}にあります（入れた小字・地割などとは別の土地なので、出していません）。`;
}
