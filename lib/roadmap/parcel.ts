// 地番から筆（登記上の土地の区画）の場所を探す。
// 法務省の登記所備付地図データをベクトルタイル（PMTiles、レイヤ fude、z16 で全件）にしたものを、
// 国土地理院で調べた町・大字の代表点のまわりから近い順に読み、地番区域と地番が一致する筆を探す。
// タイルの読み込みは ParcelSource に任せる（実物は parcel-tiles.ts、テストでは作り物を渡す）。
import { half } from "../app/doc";
import { kozuMisplaced, type KozuMisplaced, type KozuSet } from "./kozu-data";
import { SANKO_MARK } from "./sanko-data";
import { subCompatible, subNorm, subParse, type AddressSub } from "./parcel-sub";
import type { ParcelIndex } from "./parcel-index";
import { newForm } from "./old-kanji";

/** 筆を探すタイルのズーム（このズームのタイルに全ての筆が入っている） */
export const PARCEL_ZOOM = 16;

/** [経度, 緯度] */
export type LngLat = [number, number];
/** ポリゴン（外周と穴の輪の配列） */
export type Polygon = LngLat[][];

/**
 * 公図（任意座標）を道路縁に合わせて置いた、推定の位置の筆の確かさ（lib/roadmap/kozu-data.ts）。
 * "high"：道路縁によく合い、ほかの置き方とはっきり差がある（港北区で 9 割が 1.5m 以内）。"low"：それより確かさが低い（2〜5m ずれることが多い）
 */
export type Estimated = "high" | "low";

export type ParcelFeature = {
  /** 地番区域（「熊谷市_下奈良___」「川口市_青木_２丁目__」：市区町村_大字_丁目_小字） */
  kuiki: string;
  /** 地番（「391-3」。道路・水路は「道-199」「水-154」など） */
  chiban: string;
  /** 筆の形（必要になったときだけ作る） */
  polygons: () => Polygon[];
  /** 公図（任意座標）を道路縁に合わせて置いた、推定の位置の筆とその確かさ */
  estimated?: Estimated;
  /** 市町村の地番参考図の筆（その市区町村コード。lib/roadmap/sanko-data.ts） */
  sanko?: string;
};

export type ParcelSource = {
  /** z16 のタイル（x, y）の筆。タイルが無ければ null（地図データの無い地域） */
  tile(x: number, y: number): Promise<ParcelFeature[] | null>;
};

/** 筆の一部（タイルごとに切り分けられている。表示するときはタイルの範囲で切り抜く） */
export type ParcelPiece = { polygons: Polygon[]; tile: [number, number] };

export type Parcel = {
  kuiki: string;
  /** そろえた地番（「391-3」） */
  chiban: string;
  /** データのままの地番（地図の絞り込みに使う） */
  chibanRaw: string;
  /** 地番の後ろに印のある筆（二重地番など）で、同じ筆として合わせた区画の、データのままの地番（「51-3W1」「51-3W2」） */
  chibanRaws?: string[];
  pieces: ParcelPiece[];
  /** 筆の中の代表点（物件の場所として使う） */
  point: { lat: number; lng: number };
  /** 公図から推定した位置の筆（数mずれることがある）とその確かさ */
  estimated?: Estimated;
  /** 市町村の地番参考図の筆（その市区町村コード） */
  sanko?: string;
  /** 登記所の地図では筆界未定地の所の、地番参考図の筆 */
  undetermined?: boolean;
  /**
   * 同じデータの中で、この地点を含む地番のある筆がほかにもあるとき、その筆（地番区域と登記の地番）。
   * 正しい地図では筆は重ならないので、古い地図と新しい地図が両方入っている所などの、データでは決められない所（要確認）
   */
  overlaps?: { kuiki: string; chiban: string }[];
};

export type ParcelSearch =
  | {
      status: "found";
      parcel: Parcel;
      /** 同じ町に同じ地番の別の筆（小字違いなど）がいくつあったか */
      others: number;
      /** ほかの候補（同じ地番の別の筆）の地番区域と場所。近い順に最大 6 */
      alts?: { kuiki: string; point: { lat: number; lng: number } }[];
      /**
       * 入力に小字・地割などが書いてあるのに、地番区域にその区分が書かれておらず、同じ地番の筆がほかにもある。
       * どれが入力の土地かはデータから決められない（平川市碇ヶ関：小字ごとに同じ地番があるが、地番区域は大字だけ）
       */
      unverified?: true;
    }
  | {
      status: "not_found";
      /** 枝番違いなど、近い地番 */
      similar: string[];
      /** 同じ地番が、入れた小字・地割・丁目とは別の所にあった（その地番区域の名前。「字追回」「第9地割」）。別の土地なので当てない */
      elsewhere?: string[];
    }
  | { status: "no_map" };

/** 地番の「の」に当たる区切り（ハイフンのいろいろな書き方。「-」は文字クラスの最後に置く） */
const DASH = "[‐‑–—―−ー－-]";

/**
 * 入力の住所を読むときに、地番の頭として取り出す文字。茨城・千葉などには「甲35-1」「乙1906」「丙993」「丁1146-2」「番外24-753」「ｲ533」のように
 * 甲乙丙丁戊・イロハ・番外の付いた地番がふつうにある（取手市白山３丁目乙987番1 など。地価公示の所在にもそのまま書かれる）
 */
const LOT_PREFIX_INPUT = "(?:番外|[甲乙丙丁戊己庚辛壬癸]{1,2}|[ｲﾛﾊﾆﾎﾍﾄﾁﾘﾇﾙｦイロハニホヘトチリヌルヲ]|仮)";
/**
 * 地番の頭の十二支と「◯号」（愛媛県伊予市中山町中山の「子4-6」「寅4-5」「4号30」など）。登記の地番の一部だが、
 * 住所の文字では町名の終わりの字（「王子」「金子」など）と見分けられないので、入力を読むときは取り出さず、町が分かってから付ける（lotHead）
 */
const LOT_PREFIX_ETO = "(?:[子丑寅卯辰巳午未申酉戌亥]|\\d+号)";
/** 登記の地番（地図データの地番）の頭に付くことのある文字：入力で取り出す文字と、十二支・「◯号」 */
const LOT_PREFIX = `(?:番外|[甲乙丙丁戊己庚辛壬癸]{1,2}|[ｲﾛﾊﾆﾎﾍﾄﾁﾘﾇﾙｦイロハニホヘトチリヌルヲ]|${LOT_PREFIX_ETO}|仮)`;
const LOT_CHIBAN = new RegExp(`^${LOT_PREFIX}?-?\\d`);

/**
 * 地番のある筆（登記の土地）の地番か。数字で始まるもののほか、甲乙丙丁戊・イロハ・番外の付いたものも地番。
 * 「道-5」「水-154」「無地番-2」「長狭物不明-18」「筆界未定地-1」「白地-06095」「市道-15」などの地番の無い形は違う
 */
export const isLotChiban = (chiban: string): boolean => LOT_CHIBAN.test(chiban);

/**
 * 入力の末尾の地番を取り出す（「熊谷市下奈良391番地3」→ 本体「熊谷市下奈良」と地番「391-3」）。
 * 「1-2-3」「2番3号」のような住居表示は地番とみなさない。「地番」と書いてあれば explicit
 */
export function splitChiban(input: string): { body: string; chiban: string; explicit: boolean } | null {
  let s = input.normalize("NFKC").replace(/\s+/g, " ").trim();
  const explicit = /地番/.test(s);
  s = s.replace(/[(（]?\s*地番\s*[)）]?\s*[:：]?/g, " ").replace(/\s+/g, " ").trim();
  if (/号$/.test(s)) return null;
  // 地番の頭の甲乙丙・イロハ・番外（「白山3丁目乙987番1」）は地番の一部として取り出す
  const m = s.match(new RegExp(`^(.*?)(${LOT_PREFIX_INPUT}?)(\\d+)(?:\\s*(?:番地の?|番の?|の|${DASH})\\s*(\\d+))?\\s*(?:番地?)?$`));
  if (!m) return null;
  let body = m[1].trim();
  let head = m[2];
  // 名前が漢数字の「◯番」で終わる町・字。「番丁」（和歌山市「十番丁」・丸亀市「十番丁」・仙台市「東八番丁」・宇多津町「浜五番丁」）の丁は、
  // 地番の頭（甲乙丙丁の丁）ではなく町名の終わり。ほかの頭（会津坂下町「字市中二番甲3646番1」の甲）は地番の頭。どちらも住居表示ではない
  const kanjiBan = /[一二三四五六七八九十]番$/.test(body);
  if (head === "丁" && kanjiBan) {
    body += head;
    head = "";
  }
  // 丁目を「◯丁」と書く町（堺市「上野芝町3丁647番9」「浜寺船尾町西2丁158番5」。法務省の地番区域も「上野芝町」＋「三丁」）の丁は、
  // 地番の頭ではなく丁目の終わり
  if (head === "丁" && /\d$/.test(body)) {
    body += head;
    head = "";
  }
  // 前にも番号が続く（「1-2-3」「1丁目2番3」）のは住居表示
  if (!body || (!(head && kanjiBan) && new RegExp(`(\\d|${DASH}|番)$`).test(body))) return null;
  return { body, chiban: `${head}${m[3]}${m[4] ? `-${m[4]}` : ""}`, explicit };
}

/**
 * 住所として調べた文字を、地番で探す文字にする（住所の地点が道路・水路の上だったときの探し直し）。番地が地番の地域では
 * 「古ヶ崎4-3556-1」は「四丁目3556番1」なので、町に丁目があって（chome）丁目と書いていなければ、町の名前のすぐ後ろの番号を
 * 丁目にする。作れなければ undefined
 */
export function chibanQueryOf(query: string, chome: boolean): string | undefined {
  const q = query.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!q || /地番/.test(q)) return undefined;
  const m = chome && !/丁目/.test(q) ? q.match(new RegExp(`^(.*[^\\d${DASH.slice(1, -1)}])(\\d+)${DASH}(\\d+(?:${DASH}\\d+)?)$`)) : null;
  const out = m ? `地番 ${m[1]}${m[2]}丁目${m[3]}` : `地番 ${q}`;
  return splitChiban(out) ? out : undefined;
}

/** 地番をそろえる（「391番3」「391の3」「３９１－３」→「391-3」） */
export function normalizeChiban(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s/g, "")
    .replace(/番地?の?|の/g, "-")
    .replace(new RegExp(DASH, "g"), "-")
    .replace(/-$/, "");
}

const KANJI_DIGIT: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function kanjiToInt(k: string): number {
  let n = 0;
  let cur = 0;
  for (const ch of k) {
    if (ch === "十") {
      n += (cur || 1) * 10;
      cur = 0;
    } else cur = KANJI_DIGIT[ch] ?? 0;
  }
  return n + cur;
}

/**
 * 町の名前を照らし合わせるときだけそろえる字体。全国の地番の索引（1,856市区町村）の町名を国勢調査の町丁・字の名前と比べ、
 * 1字だけ違う組で、同じ字の書き方の違いだったもの（2026-11-16）：澤・沢（25町）、渕・淵（21）、の・之・ノ（21）、桧・檜（19）、
 * 薮・藪（18）、ッ・ツ（13）、が・ケ（12）、籠・篭（11）、曽・曾（8）、壺・壷（7）、舘・館（6）、瀧・滝（4）など。
 * 旧字（澤・濱・廣・櫻・冨・峯・﨑・嶋・條・藏・萬・眞）は newForm でそろえる。どちらの書き方もある字なので、照らし合わせの
 * 両方に同じ直しをかける（画面に出す名前と、国土地理院へ送る住所の直し newForm の表は変えない）
 */
const TOWN_VARIANT: Record<string, string> = {
  渕: "淵", 薮: "藪", 桧: "檜", 篭: "籠", 曾: "曽", 壷: "壺", 舘: "館", 瀧: "滝", 溪: "渓", 狹: "狭", 穗: "穂", 嶽: "岳",
  剱: "剣", 鍜: "鍛", 竃: "竈", 龍: "竜", 槇: "槙", 斉: "斎", ッ: "ツ", の: "ノ", 之: "ノ", 乃: "ノ", が: "ケ", ガ: "ケ",
};
const TOWN_VARIANT_RE = new RegExp(`[${Object.keys(TOWN_VARIANT).join("")}]`, "g");

/**
 * 町・大字の名前をそろえる（「大字」「字」を外す、「ヶ」と「ケ」、「二丁目」と「２丁目」、旧字・異体字（TOWN_VARIANT））。
 * 法務省の地図データの町名の誤り（上里町の「昆沙吐」。国土地理院と国勢調査は「毘沙吐」）と、「鍛治」（「鍛冶」の書き違い）もそろえる。
 * 「大字」「字」は名前の途中にあっても外す：法務省の地図の地番区域は、沖縄県では「平良字西里」「玉城字前川」、
 * 合併前の町の名前が付く所では「山内町大字三間坂」（武雄市）のように途中に「字」「大字」が入るが、国土地理院の住所は「平良西里」「山内町三間坂」
 */
export function townKey(s: string): string {
  return newForm(s.normalize("NFKC"))
    .replace(TOWN_VARIANT_RE, (c) => TOWN_VARIANT[c] ?? c)
    .replace(/昆沙吐/g, "毘沙吐")
    .replace(/鍛治/g, "鍛冶")
    .replace(/\s/g, "")
    .replace(/[ヶヵケ]/g, "ケ")
    .replace(/大字/g, "")
    .replace(/^字/, "")
    .replace(/(?<=\D)字(?=\D)/g, "")
    .replace(/([一二三四五六七八九十]+)丁目/g, (_, k: string) => `${kanjiToInt(k)}丁目`)
    // 地割・条・線の番号も数字に（国土地理院は番地まで当てると「大字南矢幅第十一地割８番地」「北一条西」と漢数字で返し、
    // 法務省の地番区域は「第１１地割」「北１条西」。そろえないと、地割の町の地番が「地図データが無い」になっていた）
    .replace(/([一二三四五六七八九十]+)(?=地割|条|線)/g, (k: string) => String(kanjiToInt(k)));
}

/**
 * 大字・丁目・小字の欄がどれも空の地番区域（町村全体が1つの地番区域。高知県奈半利町「安芸郡奈半利町____」の「乙3884」）。
 * 国土地理院の住所も町村まで（「高知県安芸郡奈半利町」）で、町の名前で照らし合わせられない
 */
export function townlessKuiki(kuiki: string): boolean {
  const [, oaza = "", chome = "", koaza = ""] = kuiki.split("_");
  return !oaza && !chome && !koaza;
}

/** 索引に、その市区町村の、大字の無い地番区域（townlessKuiki）があるか */
export function indexHasTownless(index: { k: Record<string, unknown> } | null | undefined, city: string): boolean {
  return !!index && !!city && Object.keys(index.k).some((k) => townlessKuiki(k) && cityMatches(kuikiParts(k).city, city));
}

const cityKey = (s: string) => s.normalize("NFKC").replace(/\s/g, "").replace(/[ヶヵケ]/g, "ケ");

/**
 * その地番区域が、入力の区分（丁目・地割・号・字・区・部などの番号と小字の名前。addressSub）と食い違わないか。
 * 地番区域に同じ数え方の番号・小字の名前が書かれていて、入力と違えば false（同じ地番の別の土地）。地番区域に書かれていない区分は
 * 照らし合わせられないので通す。小字の欄が町の名前の続きになっている所（豊明市「栄町」＋「上姥子」。住所の町が「栄町上姥子」）は、
 * 小字の欄まで町の名前として合っているので、区分としては比べない
 */
export function kuikiAllows(kuiki: string, sub: AddressSub | null | undefined, town = ""): boolean {
  if (!sub) return true;
  const [, oaza = "", chome = "", koaza = ""] = kuiki.split("_");
  const t = townKey(town);
  const inTown = !!koaza && !!t && (t === townKey(oaza + chome + koaza) || (/丁目/.test(koaza) && t === townKey(oaza + koaza)) || (!oaza && !chome && t === townKey(koaza)));
  if (inTown) return true;
  const a = subParse(chome);
  const b = subParse(koaza);
  const k: AddressSub = { nums: { ...(a?.nums ?? {}) }, name: `${a?.name ?? ""}${b?.name ?? ""}` };
  for (const [counter, ns] of Object.entries(b?.nums ?? {})) k.nums[counter] = [...(k.nums[counter] ?? []), ...ns];
  return subCompatible(sub, k);
}

/**
 * 地番区域に、入力の区分（addressSub）と比べられる情報があるか（小字の名前どうし、または同じ数え方の番号）。
 * 無ければ、その筆が入力の小字・地割の土地かどうかは確かめられていない
 */
export function kuikiHasSub(kuiki: string, sub: AddressSub): boolean {
  const [, , chome = "", koaza = ""] = kuiki.split("_");
  const a = subParse(chome);
  const b = subParse(koaza);
  const name = `${a?.name ?? ""}${b?.name ?? ""}`;
  if (sub.name && name) return true;
  return Object.keys(sub.nums).some((c) => a?.nums[c] || b?.nums[c]);
}

/** 地番区域の区分の名前（「字追回」「第9地割」「10号」「3丁目字東」。案内に出す） */
export function kuikiSubLabel(kuiki: string): string {
  const [, , chome = "", koaza = ""] = kuiki.split("_").map((s) => s.normalize("NFKC"));
  return `${chome}${koaza}`;
}

/**
 * 地番区域の丁目の番号（丁目の欄、小字の欄の「三丁目」、大字の欄の「白山町三丁目東」のどれか）。丁目の無い地番区域は null。
 * 小字の名前としての丁目（「字五丁目」）は丁目に数えない
 */
export function kuikiChome(kuiki: string): number | null {
  const [, oaza = "", chome = "", koaza = ""] = kuiki.split("_");
  for (const part of [chome, koaza, oaza]) {
    const s = subNorm(part);
    if (/^字/.test(s)) continue;
    const m = s.match(/(\d+)丁目/);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * 大字・丁目の欄が空で、小字の欄に町の名前が丁目まで入っている地番区域（陸別町「足寄郡陸別町___字陸別本通一丁目_」）で、
 * 小字の欄の名前が国土地理院の町（townKey でそろえた形。「陸別本通1丁目」）そのもので、その丁目が入力の丁目か。
 * kuikiChome は「字◯丁目」を小字の名前として丁目に数えないので、町の名前そのものの丁目はここで確かめる
 */
function koazaTownChome(kuiki: string, town: string, chome: number): boolean {
  const [, oaza = "", ch = "", koaza = ""] = kuiki.split("_");
  return !oaza && !ch && !!koaza && !!town && townKey(koaza) === town && town.endsWith(`${chome}丁目`);
}

/**
 * 町（大字）の地番区域に、小字の名前として書かれているもの（索引にある、同じ大字の地番区域の小字の名前。そろえた形）。
 * 入力の小字がこの中にあれば、その小字は地番区域の一部なので、小字の書かれていない地番区域の同じ地番は別の土地
 * （富山市大町には「字当後割」の地番区域があり、「大町字当後割17番1」を小字の無い「大町」の 17-1 に当てると 561m 先の別の土地だった。
 * 入力の小字が町の地番区域に無いとき（磐梯町大字磐梯の「字金上壇」など）は、小字の無い地番区域の筆が正しいことが多いので当てる）
 */
export function townNames(index: { k: Record<string, unknown> } | null | undefined, town: string): Set<string> {
  const out = new Set<string>();
  if (!index) return out;
  const base = townKey(town).replace(/\d+丁目$/, "");
  if (!base) return out;
  for (const kuiki of Object.keys(index.k)) {
    const [, oaza = "", chome = "", koaza = ""] = kuiki.split("_");
    if (townKey(oaza) !== base) continue;
    const name = `${subParse(chome)?.name ?? ""}${subParse(koaza)?.name ?? ""}`;
    if (name) out.add(name);
  }
  return out;
}

/**
 * 町（大字）の地番区域が、番号の区分（地割・号・字・区など。丁目は除く）で分かれているか：索引にある、同じ大字の地番区域の区分の数え方。
 * 入力にその数え方の番号があるのに、筆の地番区域に書かれていなければ、その筆は入力の土地ではない
 * （越前市横市町には「１字」「７字」の地番区域があり、「横市町10字四ノ縄1番4」を区分の無い地番区域の 1-4 に当てると 709m 先の別の土地だった）。
 * 小字の名前は、同じ大字の中で小字の書かれた地番区域と書かれていない地番区域に同じ土地が分かれて入っていることがある（磐梯町大字磐梯）ので、ここでは数えない
 */
export function townCounters(index: { k: Record<string, unknown> } | null | undefined, town: string): Set<string> {
  const out = new Set<string>();
  if (!index) return out;
  const base = townKey(town).replace(/\d+丁目$/, "");
  if (!base) return out;
  for (const kuiki of Object.keys(index.k)) {
    const [, oaza = "", chome = "", koaza = ""] = kuiki.split("_");
    if (townKey(oaza) !== base) continue;
    for (const part of [chome, koaza]) for (const c of Object.keys(subParse(part)?.nums ?? {})) if (c !== "丁目") out.add(c);
  }
  return out;
}

/** 地番区域を市区町村・町（大字＋丁目）・小字に分ける */
export function kuikiParts(kuiki: string): { city: string; town: string; koaza: string } {
  const [city = "", oaza = "", chome = "", koaza = ""] = kuiki.split("_");
  return { city: cityKey(city), town: townKey(oaza + chome), koaza };
}

/**
 * 地番区域の町の名前として合うもの（townKey でそろえた形）。法務省の地図データは市町村ごとに書き方が違う：
 * 大字＋丁目（川口市青木２丁目）のほか、小字の欄に町の続き（豊明市「栄町」＋「上姥子」、かほく市「白尾」＋「ハ」）や
 * 丁目（名古屋市の一部の区・安城市など「大字」＋「三丁目」）を入れる所、大字の欄が空で小字の欄だけの所（阿南町「字新野」）がある
 */
export function kuikiTowns(kuiki: string): string[] {
  const [, oaza = "", chome = "", koaza = ""] = kuiki.split("_");
  const out = new Set([townKey(oaza + chome)]);
  if (koaza) {
    out.add(townKey(oaza + chome + koaza));
    if (/丁目/.test(koaza)) out.add(townKey(oaza + koaza));
    if (!oaza && !chome) out.add(townKey(koaza));
  }
  out.delete("");
  return [...out];
}

/**
 * 国土地理院の住所の町（townKey でそろえた形）が、地番区域の町に当たるか。名前の候補（kuikiTowns）のどれかと同じか、
 * 丁目の書き方だけが違うもの：地番区域が大字だけで丁目に分かれていない所（住所の「二丁目」は地番の区域ではない）と、
 * 住所に丁目が無い入力（「青木217-8」）で地番区域が丁目に分かれている所
 */
export function townMatches(kuiki: string, town: string): boolean {
  if (!town) return false;
  const names = kuikiTowns(kuiki);
  if (names.includes(town)) return true;
  const [, oaza = "", chome = "", koaza = ""] = kuiki.split("_");
  const base = townKey(oaza);
  if (!base) return false;
  const chomeless = town.replace(/\d+丁目$/, "");
  // 地番区域が大字だけ（丁目も小字も無い）：住所の丁目を外して大字と比べる。小字のある地番区域（尾張旭市「桜ケ丘町」＋「西」）は
  // 住所の「桜ケ丘町一丁目」とは別の区域なので当てない（同じ地番の別の土地を出してしまう）
  if (!chome && !koaza && chomeless !== town && chomeless === base) return true;
  // 入力の住所に丁目が無い：地番区域の大字だけと比べる（同じ地番がほかの丁目にもあれば候補が増える）
  if (chomeless === town && (chome || /丁目/.test(koaza)) && town === base) return true;
  return false;
}

/** 法務省の地図データに残っている合併前の市町村の名前 → 今の市（地番区域の市区町村名を比べるときに読み替える） */
const OLD_CITY: Record<string, string> = {
  勢多郡富士見村: "前橋市",
  南埼玉郡白岡町: "白岡市",
  北埼玉郡北川辺町: "加須市",
  北埼玉郡騎西町: "加須市",
  北埼玉郡大利根町: "加須市",
  北葛飾郡栗橋町: "久喜市",
  下都賀郡岩舟町: "栃木市",
  山武郡大網白里町: "大網白里市",
};

/** 地番区域の市区町村（「西多摩郡瑞穂町」「北埼玉郡騎西町」）が、国土地理院の名前（「瑞穂町」「加須市」「さいたま市 見沼区」）と同じか */
export function cityMatches(kuikiCity: string, city: string): boolean {
  const k = cityKey(OLD_CITY[kuikiCity.normalize("NFKC").replace(/\s/g, "")] ?? kuikiCity);
  const c = cityKey(city);
  return !!c && (k === c || k.endsWith(c));
}

/** 国土地理院の住所（「埼玉県さいたま市見沼区大字南中丸」）から、市区町村より後ろの町の部分（番地は外す） */
export function townFromAddress(address: string, city: string): string {
  const a = address.normalize("NFKC").replace(/\s/g, "");
  const c = city.normalize("NFKC").replace(/\s/g, "");
  const i = c ? a.indexOf(c) : -1;
  const rest = i >= 0 ? a.slice(i + c.length) : a.replace(/^.+?[都道府県]/, "").replace(/^.+?郡/, "").replace(/^.+?[市区町村]/, "");
  // 番地・地番（数字から後ろ）を外す
  return rest.replace(/[0-9][0-9番地号の‐‑–—―−－-]*$/, "");
}

const LOT_HEAD = new RegExp(`^(${LOT_PREFIX})-?`);

/** 地番の頭の文字（甲乙丙・イロハ・番外・十二支・「◯号」）と、その後ろ（「乙987-1」→ ["乙", "987-1"]、「4号30」→ ["4号", "30"]） */
export function splitLotHead(chiban: string): [string, string] {
  const m = chiban.match(LOT_HEAD);
  return m ? [m[1], chiban.slice(m[0].length)] : ["", chiban];
}

/**
 * 地番の頭の字と町名の境目を、町（国土地理院の住所の町名）が分かってから決め直す。直さなくてよければ null。
 * ①「大田町大田ロ818番4」：国土地理院が地番の頭の「ロ」まで町名（大田町大田ロ）として返す。筆の地番区域は「大田町大田」で、地番が「ロ818-4」。
 *   索引にその町の地番区域が無く、頭の字を外した町の地番区域があれば、外した町で探す
 * ②「中山町中山子4番6」：地番の頭の十二支（子）や「4号」は、入力を読むときは町名の側に残る（町名の終わりの字と見分けられない）。
 *   町が「中山町中山」と分かり、入力がその町名のすぐ後ろに十二支1字か「◯号」だけを書いていれば、地番の頭にする（頭の無い同じ番号の別の筆を当てない）
 * ③「元寺町北ノ丁12番」（和歌山市）・「森字ナロ2521番7」（仁淀川町）：町名・小字の名前の終わりの字（丁・ロ）を、入力を読むときに地番の頭
 *   （甲乙丙丁の丁・イロハのロ）として取り出している。頭ごとに分けた索引で、その町にその頭の地番も、小字の欄がその字の地番区域も無く、
 *   頭の無い地番にその番号が入っていて、さらに国土地理院の町名がその字で終わる（町名の一部）か、入力でその字の前がカタカナ
 *   （カタカナの名前の終わり）か「字」（「太井字丁407番9」の小字「丁」）か、地番区域の小字の欄の名前と合う（「字鉄砲丁」）なら、
 *   頭を名前の側に戻して探す。前が漢字の「鷲原ロ140番」のような書き方は、本当の地番の頭のことが多い（データに無い所の頭の地番を、
 *   頭の無い別の筆と取り違えない）ので直さない
 */
/** 地番の索引に、その町（大字・丁目）の地番区域があるか */
export function indexHasTown(index: { k: Record<string, unknown> } | null | undefined, town: string): boolean {
  const t = townKey(town);
  return !!index && !!t && Object.keys(index.k).some((k) => townMatches(k, t));
}

export function lotHead(
  body: string,
  town: string,
  chiban: string,
  index: Pick<ParcelIndex, "k" | "h"> | null | undefined,
): { town: string; chiban: string; body: string } | null {
  const [head, rest] = splitLotHead(chiban);
  if (head && index && town.endsWith(head)) {
    const base = town.slice(0, -head.length);
    if (base && !indexHasTown(index, town) && indexHasTown(index, base)) return { town: base, chiban, body };
  }
  // ③ 名前の終わりの字（丁・カタカナ）を地番の頭として取り出していた。番外・仮は名前の終わりにならないので見ない
  if (head && head !== "番外" && head !== "仮" && index?.h && town) {
    const b = body.normalize("NFKC").replace(/\s/g, "");
    const t = townKey(town);
    const num = Number.parseInt(rest, 10);
    // その町に、この頭の地番（小字の欄がこの字の地番区域も）があるか・頭の無い地番にこの番号が入っているか・
    // 小字の欄の名前が、入力の名前の終わり（頭の字まで）と同じ地番区域があるか（「字鉄砲丁30番」と小字「鉄砲丁」）
    let headed = false;
    let headless = false;
    let koazaName = false;
    for (const [kuiki, entries] of Object.entries(index.k)) {
      if (!townMatches(kuiki, t)) continue;
      const koaza = kuikiParts(kuiki).koaza.normalize("NFKC").replace(/^字/, "");
      if (koaza === head) headed = true;
      else if (koaza.length > head.length && koaza.endsWith(head) && `${b}${head}`.endsWith(koaza)) koazaName = true;
      for (const [, , lo, hi, h = ""] of entries) {
        if (h === head) headed = true;
        else if (!h && lo <= num && num <= hi) headless = true;
      }
    }
    // 名前の終わりと分かる：国土地理院の町名がその字で終わる・前がカタカナ・前が「字」（「太井字丁407番9」の小字「丁」）・小字の欄の名前と合う
    const nameEnd = town.endsWith(head) || /[ァ-ヴー字]$/.test(b) || koazaName;
    if (nameEnd && !headed && headless) return { town, chiban: rest, body: `${b}${head}` };
  }
  if (!head && town) {
    const b = body.normalize("NFKC").replace(/\s/g, "");
    const i = b.lastIndexOf(town);
    const tail = i >= 0 ? b.slice(i + town.length) : "";
    if (new RegExp(`^${LOT_PREFIX_ETO}$`).test(tail)) return { town, chiban: `${tail}${chiban}`, body: b.slice(0, i + town.length) };
  }
  return null;
}

/** 地番の番号（枝番の前。頭の文字は外す） */
const baseNumber = (chiban: string) => Number.parseInt(splitLotHead(chiban)[1], 10);

/** 緯度経度 → z のタイル番号 */
export function tileOf(lat: number, lng: number, z = PARCEL_ZOOM): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
}

/** タイルの範囲 [西, 南, 東, 北] */
export function tileBounds(x: number, y: number, z = PARCEL_ZOOM): [number, number, number, number] {
  const n = 2 ** z;
  const lat = (t: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n))) * 180) / Math.PI;
  return [(x / n) * 360 - 180, lat(y + 1), ((x + 1) / n) * 360 - 180, lat(y)];
}

/**
 * 地番の筆を探す。町の代表点のタイルから始め、同じ町で地番の数字が近い筆の方へ広げていく（最大 maxTiles 枚）。
 * 代表点から3タイル（約1.5km）以内を読んでも同じ町の筆が1つも無ければ、地図データの無い地域とみなす。
 * 広い大字では、代表点のまわりに地図が無く、少し離れた所にだけ地図があることがある（熊谷市三ケ尻など）
 */
export async function searchParcel(
  q: {
    city: string;
    town: string;
    chiban: string;
    /** 入力の住所に書いてあった、町より細かい区分（丁目・地割・号・小字など。lib/roadmap/parcel-sub.ts の addressSub）。食い違う地番区域の筆は当てない */
    sub?: AddressSub | null;
    /**
     * 入力の住所で町の名前のすぐ後ろに書かれた丁目（lib/roadmap/parcel-sub.ts の typedChome）。あれば、その丁目の地番区域の筆だけを当てる
     * （丁目の無い地番区域・別の丁目の同じ地番は別の土地）。無ければ、同じ地番が丁目の無い地番区域にもあるとき、そちらを先にする
     */
    chome?: number | null;
  },
  start: { lat: number; lng: number },
  source: ParcelSource,
  {
    maxTiles = 40,
    radius = 4,
    batch = 4,
    index,
  }: {
    maxTiles?: number;
    radius?: number;
    batch?: number;
    /** 地番の索引（lib/roadmap/parcel-index.ts）。あれば、その町で番号が入っているタイルを先に開く */
    index?: Pick<ParcelIndex, "k" | "h"> | null;
  } = {},
): Promise<ParcelSearch> {
  const [sx, sy] = tileOf(start.lat, start.lng);
  const town = townKey(q.town);
  // 町の名前が無い（国土地理院の住所が町村まで）ときは、その市区町村の大字の無い地番区域（townlessKuiki）を町とする
  const inTown = (kuiki: string) => (town ? townMatches(kuiki, town) : townlessKuiki(kuiki) && cityMatches(kuikiParts(kuiki).city, q.city));
  const want = normalizeChiban(q.chiban);
  const wantBase = baseNumber(want);
  const [wantHead, wantRest] = splitLotHead(want);
  const seen = new Set<string>();
  const hits = new Map<string, ParcelPiece[]>();
  const raw = new Map<string, string>();
  // 地番区域ごとの、合わせた区画のデータのままの地番（二重地番の「51-3W1」「51-3W2」など）
  const raws = new Map<string, Set<string>>();
  const estimated = new Map<string, Estimated>();
  const sanko = new Map<string, string>();
  const rank = new Map<string, number>();
  const similar = new Set<string>();
  // 同じ地番が、入力の丁目・地割・小字とは別の地番区域にあった（別の土地。区分の名前。区分の付かない地番区域は空）
  const elsewhere = new Set<string>();
  // 町（大字）の地番区域が分かれている番号の区分（地割・号・字など）。入力にその番号があれば、書かれていない地番区域の筆は当てない
  const counters = townCounters(index, q.town);
  // 町の地番区域にある小字の名前。入力の小字がこの中にあれば、小字の書かれていない地番区域の筆は当てない
  const names = townNames(index, q.town);
  /** 入力の丁目・番号の区分が、その地番区域で確かめられるか（丁目が違う・丁目が無い、町が使う区分が書かれていなければ別の土地） */
  const strictOk = (kuiki: string): boolean => {
    if (q.chome != null && kuikiChome(kuiki) !== q.chome && !koazaTownChome(kuiki, town, q.chome)) return false;
    if (q.sub && (counters.size || names.size)) {
      const [, , chome = "", koaza = ""] = kuiki.split("_");
      const a = subParse(chome);
      const b = subParse(koaza);
      const have = new Set([...Object.keys(a?.nums ?? {}), ...Object.keys(b?.nums ?? {})]);
      for (const c of Object.keys(q.sub.nums)) if (c !== "丁目" && counters.has(c) && !have.has(c)) return false;
      if (q.sub.name && names.has(q.sub.name) && !(a?.name || b?.name)) return false;
    }
    return true;
  };
  // 見つけた筆の地番（小字の欄にイロハがある所では、頭のイロハを外した地番。筆の地番区域にイロハが入っている）
  const found = new Map<string, string>();
  let focus: [number, number] = [sx, sy];
  let closest = Number.POSITIVE_INFINITY;
  let townSeen = false;
  // 町の筆を見つけてから、地番の数字が近づかないまま読んだ回数（3回続いたら、この先には無いとみなす）
  let stale = 0;

  /**
   * 同じ地番区域・地番でも、つながっていない離れた区画は別の候補にする（市町村の地番参考図には、別の土地に同じ地番が付いた
   * 筆が同じ地番区域で入っていることがある。全部を1つの筆にまとめると、面積・位置・隣地が間違う）。
   * 候補の鍵は「地番区域」か「地番区域␀番号」。新しい区画は、隣り合うタイルに区画のある候補に入れ、2つ以上の候補をつなぐなら1つに合わせる
   */
  const groupOf = (kuiki: string, x: number, y: number): string => {
    const near: string[] = [];
    for (const [k, ps] of hits) if (groupKuiki(k) === kuiki && ps.some((p) => Math.abs(p.tile[0] - x) <= 1 && Math.abs(p.tile[1] - y) <= 1)) near.push(k);
    if (!near.length) {
      let n = 0;
      while (hits.has(n ? `${kuiki}\u0000${n}` : kuiki)) n++;
      return n ? `${kuiki}\u0000${n}` : kuiki;
    }
    const [first, ...rest] = near;
    for (const k of rest) {
      hits.set(first, [...hits.get(first)!, ...hits.get(k)!]);
      for (const c of raws.get(k) ?? []) raws.get(first)!.add(c);
      hits.delete(k);
      raws.delete(k);
      raw.delete(k);
      rank.delete(k);
      found.delete(k);
      estimated.delete(k);
      sanko.delete(k);
    }
    return first;
  };

  const visit = async (tiles: [number, number][]) => {
    const got = await Promise.all(tiles.map(([x, y]) => source.tile(x, y)));
    tiles.forEach(([x, y], i) => {
      seen.add(`${x},${y}`);
      for (const f of got[i] ?? []) {
        if (!inTown(f.kuiki)) continue;
        townSeen = true;
        // 地図データの「51-3W2」（同じ地番の土地の分かれた区画）も「51-3」として探す
        const c = registryChiban(normalizeChiban(f.chiban));
        const [head] = splitLotHead(c);
        // 「白尾ハ6番1」「美川中町ル18番4」：イロハが地番の頭ではなく、地番区域の小字の欄にある所（かほく市・白山市など）
        const kanaKoaza = !!wantHead && !head && kuikiParts(f.kuiki).koaza.normalize("NFKC") === wantHead;
        if (c === want || (kanaKoaza && c === wantRest)) {
          // 入力に丁目・地割・小字が書いてあって、筆の地番区域と食い違えば、同じ地番の別の土地（当てない）
          if (!kanaKoaza && (!kuikiAllows(f.kuiki, q.sub, q.town) || !strictOk(f.kuiki))) {
            if (elsewhere.size < 8) elsewhere.add(kuikiSubLabel(f.kuiki));
            continue;
          }
          const g = groupOf(f.kuiki, x, y);
          // 同じ筆が別のデータにもあれば（法務省の地図データ → 地番参考図 → 推定の位置の順に使う）、形を混ぜない
          const r = sourceRank(f);
          const had = rank.get(g);
          if (had !== undefined && had < r) continue;
          if (had !== undefined && had > r) {
            hits.delete(g);
            raws.delete(g);
            estimated.delete(g);
            sanko.delete(g);
          }
          rank.set(g, r);
          found.set(g, c);
          hits.set(g, [...(hits.get(g) ?? []), { polygons: f.polygons(), tile: [x, y] }]);
          raw.set(g, f.chiban);
          raws.set(g, (raws.get(g) ?? new Set<string>()).add(f.chiban));
          if (f.estimated) estimated.set(g, f.estimated);
          if (f.sanko) sanko.set(g, f.sanko);
          continue;
        }
        const b = baseNumber(c);
        if (Number.isNaN(b)) continue;
        // 似た地番の候補は、頭の文字が同じもの（「乙987-2」を探して「甲987-1」は出さない）
        // 入力の区分（丁目・地割・小字など）と食い違う地番区域の枝番は、別の土地なので候補にしない
        if (b === wantBase && (head === wantHead || kanaKoaza) && similar.size < 8 && (kanaKoaza || (kuikiAllows(f.kuiki, q.sub, q.town) && strictOk(f.kuiki))))
          similar.add(kanaKoaza ? `${wantHead}${c}` : c);
        // 地番の数字が近い筆のあたりを次に探す（地番は近い番号が近くに並ぶことが多い）
        if (Math.abs(b - wantBase) < closest) {
          closest = Math.abs(b - wantBase);
          focus = [x, y];
        }
      }
    });
  };

  // 索引があれば、同じ町（townMatches）の地番区域で、探す番号が入っているタイルを近い順に先に開く（最大 24 枚）。
  // 見つからなければ（索引に無い地番の書き方など）、下の今までの探し方に続ける（開いたタイルは読み直さない）
  // 索引で、同じ町の地番区域のうち探す番号が入っているタイル（近い順）
  const indexTiles: [number, number][] = [];
  if (index) {
    const num = Number.parseInt(wantRest, 10);
    if (!Number.isNaN(num)) {
      const tiles = indexTiles;
      const key = new Set<string>();
      // タイルごとの、探す番号の入る範囲の幅のいちばん狭いもの（狭いほど、その番号の筆がある見込みが高い）
      const width = new Map<string, number>();
      // 頭ごとに分けた索引（index.h）なら、探す地番の頭（「子39-2」の子）と同じ頭の範囲のタイルだけを開ける。同じ町に「甲39」「丁39」「子39」「39」が
      // 並ぶ所（伊予市中山町中山は番号 39 の入るタイルが 55 枚）で、近い 24 枚に入らない遠いタイルの筆も見つけるため。
      // 小字の欄にイロハがある地番区域（かほく市「白尾」＋「ハ」）の筆は頭が無いので、小字が探す頭と同じ地番区域は頭の無い範囲を使う
      const headOk = (kuiki: string, entryHead: string) =>
        !index.h || entryHead === wantHead || (!!wantHead && !entryHead && kuikiParts(kuiki).koaza.normalize("NFKC") === wantHead);
      const collect = (byHead: boolean) => {
        for (const [kuiki, entries] of Object.entries(index.k)) {
          if (!inTown(kuiki)) continue;
          for (const [x, y, lo, hi, entryHead = ""] of entries) {
            const k = `${x},${y}`;
            if (lo <= num && num <= hi && (!byHead || headOk(kuiki, entryHead))) {
              width.set(k, Math.min(width.get(k) ?? Number.POSITIVE_INFINITY, hi - lo));
              if (key.has(k)) continue;
              key.add(k);
              tiles.push([x, y]);
            }
          }
        }
      };
      collect(true);
      // 頭で絞って1枚も無ければ（頭の書き方の違いなど）、頭を見ずに番号だけで選ぶ
      if (!tiles.length) collect(false);
      tiles.sort((a, b) => (a[0] - sx) ** 2 + (a[1] - sy) ** 2 - ((b[0] - sx) ** 2 + (b[1] - sy) ** 2));
      for (let i = 0; i < Math.min(tiles.length, 24) && !hits.size; i += 8) await visit(tiles.slice(i, Math.min(i + 8, 24)));
      // 近い 24 枚に無ければ、残りのタイルを、番号の幅の狭い順（探す番号の筆がある見込みの高い順）に、合わせて 64 枚まで開く。
      // 広い大字で、探す番号の入るタイルが多い所（小海町大字小海は 4045 の入るタイルが 40 枚あり、筆は町の代表点から 2.6km 先で、
      // 近い 24 枚に入らず「見つからない」になっていた。2026-11-18 の全国の点検）
      if (!hits.size && tiles.length > 24) {
        const w = ([x, y]: [number, number]) => width.get(`${x},${y}`) ?? Number.POSITIVE_INFINITY;
        const rest = tiles.slice(24).sort((a, b) => w(a) - w(b)).slice(0, 40);
        for (let i = 0; i < rest.length && !hits.size; i += 8) await visit(rest.slice(i, i + 8));
      }
    }
  }

  while (seen.size < maxTiles && !hits.size) {
    const next: [number, number][] = [];
    for (let dx = -radius; dx <= radius; dx++)
      for (let dy = -radius; dy <= radius; dy++) if (!seen.has(`${sx + dx},${sy + dy}`)) next.push([sx + dx, sy + dy]);
    if (!next.length) break;
    const d = ([x, y]: [number, number]) => (x - focus[0]) ** 2 + (y - focus[1]) ** 2;
    next.sort((a, b) => d(a) - d(b));
    // 町の筆がまだ無ければ focus は代表点のまま。3タイル以内を読み終えたら打ち切る
    if (!townSeen && d(next[0]) > 9) return { status: "no_map" };
    const before = closest;
    await visit(next.slice(0, Math.min(batch, maxTiles - seen.size)));
    if (townSeen && !hits.size) {
      stale = closest < before ? 0 : stale + 1;
      if (stale >= 3) break;
    }
  }
  if (!hits.size)
    return townSeen ? { status: "not_found", similar: [...similar].sort(compareChiban), ...(elsewhere.size ? { elsewhere: [...elsewhere] } : {}) } : { status: "no_map" };

  // 入力に小字・地割などがあるのに、見つけた筆の地番区域にその区分が書かれていなければ、別の小字の同じ地番かもしれない。
  // 索引で番号の入っているタイルを最後まで（最大 24 枚）開いて、同じ地番の筆をすべて数える
  const checked = (k: string) => !q.sub || kuikiHasSub(groupKuiki(k), q.sub);
  if (q.sub && [...hits.keys()].some((k) => !checked(k))) {
    const rest = indexTiles.slice(0, 24).filter(([x, y]) => !seen.has(`${x},${y}`));
    for (let i = 0; i < rest.length; i += 8) await visit(rest.slice(i, i + 8));
  }

  // 同じ地番が複数の地番区域にあれば（小字違いなど）や、同じ地番区域でも離れた区画なら、市区町村が合うもの、
  // 次に入力の小字・地割などが地番区域と合うと確かめられたもの、次に（入力に丁目が無ければ）丁目の無い地番区域のもの、次に代表点に近いものを選ぶ。
  // 丁目の書かれていない住所は、丁目の無い地番区域の地番のことが多い（地価公示の所在「東金市田間字新町12番1」は丁目の無い「田間」の 12-1）
  const chomeless = (k: string) => Number(q.chome == null && kuikiChome(groupKuiki(k)) === null);
  const ranked = [...hits.entries()].sort(
    ([ka, pa], [kb, pb]) =>
      Number(cityMatches(kuikiParts(groupKuiki(kb)).city, q.city)) - Number(cityMatches(kuikiParts(groupKuiki(ka)).city, q.city)) ||
      (q.sub ? Number(checked(kb)) - Number(checked(ka)) : 0) ||
      chomeless(kb) - chomeless(ka) ||
      tileDist(pa, sx, sy) - tileDist(pb, sx, sy),
  );
  const [group, pieces] = ranked[0];
  const kuiki = groupKuiki(group);
  // 筆がタイルの端にかかっていれば、隣のタイルの続きも集める。地番の後ろに印のある筆（二重地番など）は、まわりのタイルの同じ筆の区画も
  for (let round = 0; round < 3; round++) {
    const marked = [...raws.get(group)!].some(hasPieceMark);
    const more = [...neighborsToComplete(pieces), ...(marked ? aroundTiles(pieces) : [])].filter(([x, y]) => !seen.has(`${x},${y}`));
    if (!more.length) break;
    const before = hits.get(group)!.length;
    await visit(more);
    pieces.push(...hits.get(group)!.slice(before));
  }
  return {
    status: "found",
    parcel: {
      kuiki,
      chiban: found.get(group) ?? want,
      chibanRaw: raw.get(group)!,
      ...(raws.get(group)!.size > 1 ? { chibanRaws: [...raws.get(group)!].sort(byPieceMark) } : {}),
      pieces,
      point: interiorPoint(pieces),
      ...(estimated.has(group) ? { estimated: estimated.get(group) } : {}),
      ...(sanko.has(group) ? { sanko: sanko.get(group) } : {}),
    },
    others: ranked.length - 1,
    ...(ranked.length > 1 ? { alts: ranked.slice(1, 7).map(([k, ps]) => ({ kuiki: groupKuiki(k), point: interiorPoint(ps) })) } : {}),
    ...(ranked.length > 1 && !checked(group) ? { unverified: true as const } : {}),
  };
}

/** 候補の鍵（「地番区域␀番号」）から地番区域 */
const groupKuiki = (key: string) => key.split("\u0000")[0];

/** 筆のデータの順（小さいほど先に使う）：法務省の地図データ、市町村の地番参考図、公図から推定した位置 */
const sourceRank = (f: ParcelFeature) => (f.sanko ? 1 : f.estimated ? 2 : 0);

/** 地点を含む筆（地図で選んだ地点の地番を出す）。地図データの無い地域や、筆の無い所なら null */
export async function parcelAt(lat: number, lng: number, source: ParcelSource): Promise<Parcel | null> {
  const [x, y] = tileOf(lat, lng);
  const p: LngLat = [lng, lat];
  const hits = ((await source.tile(x, y)) ?? [])
    .map((f) => ({ f, polygons: f.polygons() }))
    .filter(({ polygons }) => polygons.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h))));
  if (!hits.length) return null;
  // 同じデータの中で地番のある筆と、地番の無い形（「無地番-2」「長狭物不明-18」「道-5」など）が重なっていれば、地番のある筆を出す
  // （法務省の地図データには、地番の無い形がふつうの筆にかぶさって入っている所がある。福生市武蔵野台・羽村市神明台など）
  let hit = hits.find(({ f }) => sourceRank(f) === sourceRank(hits[0].f) && isLotChiban(f.chiban)) ?? hits[0];
  // 登記所の地図が筆界未定地の所に、市町村の地番参考図の地番の付いた筆があれば、そちらを出す（筆界未定地だったことも添える）
  const undetermined = /^筆界未定/.test(hit.f.chiban) && !hit.f.sanko && !hit.f.estimated;
  const ref = undetermined ? hits.find(({ f }) => f.sanko && isLotChiban(f.chiban)) : undefined;
  if (ref) hit = ref;
  const { f, polygons } = hit;
  // 同じデータの中で、この地点を含む地番のある筆がほかにもあれば候補にする（二重地番などの同じ筆の区画と、地番の無い形は除く）。
  // 正しい地図では筆は重ならないので、古い地図と新しい地図が両方入っている所など、データでは決められない所の印（要確認）
  const overlaps = isLotChiban(f.chiban)
    ? [
        ...new Map(
          hits
            .filter(({ f: g }) => g !== f && sourceRank(g) === sourceRank(f) && isLotChiban(g.chiban) && !(g.kuiki === f.kuiki && registryChiban(g.chiban) === registryChiban(f.chiban)))
            .map(({ f: g }) => [`${g.kuiki}|${registryChiban(g.chiban)}`, { kuiki: g.kuiki, chiban: registryChiban(g.chiban) }] as const),
        ).values(),
      ]
    : [];
  const pieces: ParcelPiece[] = [{ polygons, tile: [x, y] }];
  for (const [nx, ny] of neighborsToComplete(pieces))
    for (const g of (await source.tile(nx, ny)) ?? []) if (g.kuiki === f.kuiki && g.chiban === f.chiban) pieces.push({ polygons: g.polygons(), tile: [nx, ny] });
  const raws = hasPieceMark(f.chiban) ? await addSiblings(f, pieces, source) : [];
  return {
    kuiki: f.kuiki,
    chiban: normalizeChiban(f.chiban),
    chibanRaw: f.chiban,
    ...(raws.length > 1 ? { chibanRaws: raws } : {}),
    pieces,
    point: { lat, lng },
    ...(f.estimated ? { estimated: f.estimated } : {}),
    ...(f.sanko ? { sanko: f.sanko } : {}),
    ...(ref ? { undetermined: true } : {}),
    ...(overlaps.length ? { overlaps } : {}),
  };
}

/**
 * 地番の後ろに印のある筆（W・V・X）に、同じ筆の区画を足す（筆のまわりのタイルの中）。二重地番（W）は、つながっている区画だけ
 * （離れた所の同じ地番は別の土地のことがある）。めがね地番（V）・分属管理地番（X）は同じ地番の区画すべて。合わせた区画の地図データの地番を返す
 */
async function addSiblings(f: ParcelFeature, pieces: ParcelPiece[], source: ParcelSource): Promise<string[]> {
  const same = (g: ParcelFeature) => g.kuiki === f.kuiki && registryChiban(g.chiban) === registryChiban(f.chiban) && sourceRank(g) === sourceRank(f);
  const read = new Set<string>();
  const cand = new Map<string, ParcelPiece[]>();
  const gather = async (tiles: [number, number][]) => {
    for (const [x, y] of tiles) {
      if (read.has(`${x},${y}`)) continue;
      read.add(`${x},${y}`);
      for (const g of (await source.tile(x, y)) ?? []) if (g.chiban !== f.chiban && same(g)) cand.set(g.chiban, [...(cand.get(g.chiban) ?? []), { polygons: g.polygons(), tile: [x, y] }]);
    }
  };
  await gather(aroundTiles(pieces));
  const lat0 = pieces[0].polygons[0]?.[0]?.[0]?.[1] ?? 35;
  const rings = (ps: ParcelPiece[]) => ps.flatMap((p) => p.polygons.flat());
  const linked = /W\d+$/.test(f.chiban);
  const raws = [f.chiban];
  for (let grew = true; grew; ) {
    grew = false;
    for (const [raw, ps] of cand) {
      if (linked && !ringsWithin(rings(ps), rings(pieces), 0.5, lat0)) continue;
      pieces.push(...ps);
      raws.push(raw);
      cand.delete(raw);
      grew = true;
      // 足した区画が、まだ読んでいないタイルへ続いていれば読む
      await gather(neighborsToComplete(ps));
      const more = cand.get(raw);
      if (more) {
        pieces.push(...more);
        cand.delete(raw);
      }
    }
  }
  return raws.sort(byPieceMark);
}

/** 同じ地番の区画の並び（「51-3W1」「51-3W2」…「51-3W10」） */
const byPieceMark = (a: string, b: string) => a.localeCompare(b, "ja", { numeric: true });

/**
 * 画面での地番の呼び方。道路・水路など地番の無い所は「道路（地番なし）」など。
 * 地図データの「筆界未定地-1」「無地番-2」の後ろの番号はデータの中の通し番号で、登記の地番ではないので出さない。
 * 筆界未定地に含まれる地番がデータに書いてあれば（「筆界未定地(704+645-2)」）、それを添える
 */
export function chibanLabel(chiban: string): string {
  if (/^(?:道|市道|町道|村道|区道|県道|府道|都道|国道|里道|赤道|農道|林道)/.test(chiban)) return "道路（地番なし）";
  if (/^(?:水|河川)/.test(chiban)) return "水路（地番なし）";
  if (/^筆界未定/.test(chiban)) {
    const lots = (chiban.match(/\(([^)]*)\)/)?.[1] ?? "")
      .split("+")
      .map((s) => registryChiban(s.trim()))
      .filter(isLotChiban);
    return lots.length ? `筆界未定地（${lots.join("・")}）` : "筆界未定地";
  }
  if (/^無地番/.test(chiban)) return "無地番の土地";
  if (/^長狭物/.test(chiban)) return "道路・水路など（地番なし）";
  if (!isLotChiban(chiban.normalize("NFKC"))) return "地番の無い土地";
  return `地番 ${registryChiban(chiban)}`;
}

/**
 * 地図XML（法務省）で地番の後ろに付く印。二重地番「51-3W1」（同じ地番が地図に2つ以上ある。合筆や図面の分け方で1つの土地が
 * 分かれて描かれたものが多い）・めがね地番「100V1」（離れた土地を1筆として扱う）・分属管理地番「100X(1/2)」（1つの土地が
 * 図郭で分かれている）
 */
const PIECE_MARK = /(?:W\d+|V\d+|X\(\d+\/\d+\))$/;

/**
 * 登記の地番。地図データの地番の後ろの印（W・V・X）は登記の地番には付かないので外す
 * （謄本の請求・画面・コピーはこちら。地図の上で筆を選ぶときは元の地番のまま）
 */
export function registryChiban(chiban: string): string {
  return chiban.replace(PIECE_MARK, "");
}

/** 地図データの地番に、登記の地番には無い印（W・V・X）が付いているか */
export const hasPieceMark = (chiban: string) => PIECE_MARK.test(chiban);

/** 隣地がこれより多い筆は、道路など細長い土地か大きな土地とみなす（ふつうの宅地の隣地は多くても20筆ほど） */
export const ROADLIKE_NEIGHBORS = 30;

/**
 * 地点から決めた筆（住所の地点の筆・地図で選んだ地点の筆）が、物件の土地ではなさそうか：道路・水路（地番なし）か、
 * 隣地がとても多い筆（地番の付いた公道など）。住所の点は建物の入口や道路の側に置かれていることがあり、地図で選ぶときも
 * 数mずれると前の道路の筆に乗る。地番で探した筆と、利用者が「この筆で進める」を押した筆（accepted。大きな筆のとき）は物件の筆として扱う。
 * neighbors：隣の筆（登記の地番でまとめた数）
 */
export function roadLikeLot(lot: { kind: "chiban" | "picked" | "address"; chibanRaw: string; neighbors: number; accepted?: boolean }): "道路" | "水路" | "large" | undefined {
  if (lot.kind === "chiban") return undefined;
  if (/^道/.test(lot.chibanRaw)) return "道路";
  if (/^水/.test(lot.chibanRaw)) return "水路";
  return !lot.accepted && lot.neighbors >= ROADLIKE_NEIGHBORS ? "large" : undefined;
}

/** 地点から決めた筆の、地点の呼び方（「住所の地点の筆」「地図で選んだ地点の筆」と書き分ける） */
export const pointName = (picked: boolean | undefined): string => (picked ? "地図で選んだ地点" : "住所の地点");

/** 地図で選んだ地点の筆に添える注（結果の文面・下書き。選んだ地点が隣の筆に乗ることがあるので、要確認のわけを書く） */
export const PICKED_LOT_NOTE = "地図で選んだ地点の筆。公図で地番と形を確認";

/** 下書き・コピー・印刷に並べる隣地の数（道路や大きな筆は、まわりの何十筆にも接する） */
export const NEIGHBOR_LIST_MAX = 20;

/** 隣地の地番を「、」でつなぐ。多いときは先頭の max 筆と「ほかN筆」 */
export function neighborList(neighbors: string[], max = NEIGHBOR_LIST_MAX): string {
  if (neighbors.length <= max) return neighbors.join("、");
  return `${neighbors.slice(0, max).join("、")}、ほか${neighbors.length - max}筆（公図で確認）`;
}

/** 公図から推定した位置の筆に添える印 */
export function estimatedMark(p: { estimated?: Estimated }): string {
  return p.estimated === "low" ? "（推定・確度低）" : p.estimated ? "（推定）" : "";
}

/** 筆に添える印（公図から推定した位置の筆、市町村の地番参考図の筆。法務省の地図データの筆には付けない） */
export function parcelMark(p: { estimated?: Estimated; sanko?: string }): string {
  return p.sanko ? SANKO_MARK : estimatedMark(p);
}

/**
 * 30m 以上離れた別の場所に置かれていた割合の、文の頭（「1割弱は」「この地域（近畿）では約3%が」「地域によっては約3%が」）。
 * 確度の高い推定は、ふつうは数mのずれなので、取り違えの多かった地域ではその地域の名前を添える（area：その名前を書くか「この地域では」か）
 */
function misplacedHead(e: Estimated, m: KozuMisplaced, subject: string, area: boolean): string {
  if (m.varies) return `地域によっては${subject}${m.share}が`;
  if (e === "high" && m.area) return `${area ? `この地域（${m.area}）` : "この地域"}では${subject}${m.share}が`;
  return `${subject}${m.share}は`;
}

/**
 * 公図から推定した筆が、30m 以上離れた別の場所に置かれていた割合を言う句（国の地価の地点で測った結果。lib/roadmap/kozu-data.ts の kozuMisplaced）。
 * 「1割弱は30m以上離れた別の場所に置かれています」「この地域（近畿）では約3%が30m以上離れた別の場所に置かれています」。1% に満たなければ undefined。
 * codes：筆（物件）の市区町村コード（政令市は区のコード。いくつか渡してもよい）。無ければ、測った地域のうち一番多い割合で言う。
 * subject：割合の前に置く言葉（「確度の低い推定の」）
 */
export function estimatedMisplacedText(e: Estimated, codes?: string | readonly string[], subject = "", sets?: Record<string, KozuSet>): string | undefined {
  const m = kozuMisplaced(e, codes, sets);
  return m && `${misplacedHead(e, m, subject, true)}30m以上離れた別の場所に置かれています`;
}

/**
 * 公図から推定した位置の筆の、ずれの目安（見出しや注記に添える短い言い方）。「数mずれることあり」「確度が低く、5m前後（1割弱は30m以上）ずれることあり」。
 * 30m 以上の取り違えは、国の地価公示・地価調査の地点で測った割合（筆のまとまりごと。kozu-source.json の accuracy）で書く。
 * 2026-11-21 に測ると、関東の確度の高い推定（1,871地点）は 0.4%・確度の低い推定（718地点）は 7.5%、大阪府（確度の高い推定だけ・136地点）は 0。
 * codes：筆（物件）の市区町村コード。無ければ、測った地域のうち一番多い割合で言う
 */
export function estimatedNote(e: Estimated, codes?: string | readonly string[], sets?: Record<string, KozuSet>): string {
  const m = kozuMisplaced(e, codes, sets);
  const far = m ? `（${misplacedHead(e, m, "", false)}30m以上）` : "";
  return e === "low" ? `確度が低く、5m前後${far}ずれることあり` : `数m${far}ずれることあり`;
}

/** 画面の案内の文（物件の上の帯）。30m 以上の取り違えは、国の地価の地点で測った結果（estimatedNote と同じ）のとおりに書く */
export function estimatedSentence(e: Estimated, codes?: string | readonly string[], sets?: Record<string, KozuSet>): string {
  const base = e === "low" ? "5m前後" : "数m";
  const far = estimatedMisplacedText(e, codes, "", sets);
  return far ? `${base}ずれることがあり、${far}。` : `${base}ずれることがあります。`;
}

/**
 * 筆のカード（PC・スマホの「謄本・公図用の地番」）の注意の文。「…数mずれて隣の筆の地番になることがあります。」、
 * 取り違えが 1% 以上の地域・確度の低い推定は「…ことがあり、1割弱は30m以上離れた別の場所に置かれています（国の地価の地点で確かめた結果）。」
 */
export function estimatedCardNote(e: Estimated, codes?: string | readonly string[], sets?: Record<string, KozuSet>): string {
  const far = estimatedMisplacedText(e, codes, "", sets);
  const tail = far ? `り、${far}（国の地価の地点で確かめた結果）` : "ります";
  return e === "low"
    ? `この辺りの登記所の地図は公図（任意座標）です。公図の形を道路の縁に合わせて置いた推定の位置で、合わせ方の確かさが低いため、5m前後ずれて隣の筆の地番になっていることがあ${tail}。隣の筆も候補にして、謄本・公図で確かめてください。`
    : `この辺りの登記所の地図は公図（任意座標）です。公図の形を道路の縁に合わせて置いた推定の位置なので、数mずれて隣の筆の地番になることがあ${tail}。謄本・公図で確かめてください。`;
}

/** 地図の筆界の凡例の文（どの地域の筆か決めない。測った地域のうち一番多い割合で言う） */
export function estimatedLegend(sets?: Record<string, KozuSet>): string {
  const high = kozuMisplaced("high", undefined, sets);
  const low = kozuMisplaced("low", undefined, sets);
  const hi = high ? `${high.varies ? `地域によっては${high.share}が` : `${high.share}は`}30m以上。` : "";
  const lo = low ? `。${low.varies ? `地域によってはその${low.share}が` : `その${low.share}は`}30m以上` : "";
  return `点線は、公図（任意座標）の形を道路の縁に合わせて置いた推定の位置です。数m（${hi}薄い点線は5m前後${lo}）ずれることがあります。`;
}

/**
 * 地番区域を「熊谷市下奈良」「川口市青木2丁目」のように読める形に。法務省の地図データの全角の数字（「２丁目」「第１１地割」）は
 * 半角にする：同じ物件の所在が、画面では「１丁目」・コピーした文では「1丁目」と違って見えていた（地番の文字はどこでも半角の数字）
 */
export function kuikiLabel(kuiki: string): string {
  return half(kuiki.split("_").filter(Boolean).join(""));
}

/** 地番区域の名前。基準の地番区域と同じ市区町村なら、市区町村を外す（「青木2丁目」）。違う市区町村なら市区町村から */
export function kuikiLabelFrom(kuiki: string, base: string): string {
  const [city, ...rest] = kuiki.split("_");
  return city === base.split("_")[0] && rest.some(Boolean) ? half(rest.filter(Boolean).join("")) : kuikiLabel(kuiki);
}

/**
 * 選んだ筆の地番を「、」でつなぐ（謄本・公図の請求に貼る）。物件と同じ地番区域の筆は地番の数字だけ（「3555-1」）。
 * 違う地番区域の筆は、同じ数字の別の土地と取り違えないよう町の名前を付ける（「古ヶ崎三丁目 100-1」）。
 * 並びは、物件と同じ地番区域が先、あとは地番区域・地番の順。地番の後ろの印（W・V・X）は外し、同じ筆は1つに
 */
export function pickedChibanText(picked: readonly Neighbor[], baseKuiki: string): string {
  const seen = new Set<string>();
  const list: Neighbor[] = [];
  for (const n of picked) {
    const chiban = registryChiban(n.chiban);
    if (!isLotChiban(chiban) || seen.has(`${n.kuiki}|${chiban}`)) continue;
    seen.add(`${n.kuiki}|${chiban}`);
    list.push({ kuiki: n.kuiki, chiban });
  }
  const other = (n: Neighbor) => (n.kuiki === baseKuiki ? 0 : 1);
  return list
    .sort((a, b) => other(a) - other(b) || a.kuiki.localeCompare(b.kuiki) || compareChiban(a.chiban, b.chiban))
    .map((n) => (n.kuiki === baseKuiki ? n.chiban : `${kuikiLabelFrom(n.kuiki, baseKuiki)} ${n.chiban}`))
    .join("、");
}

/** 地番の並べ替え（「391」「391-1」「391-2」「391-10」の順） */
function compareChiban(a: string, b: string): number {
  const pa = a.split("-").map((v) => Number.parseInt(v, 10) || 0);
  const pb = b.split("-").map((v) => Number.parseInt(v, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? -1) !== (pb[i] ?? -1)) return (pa[i] ?? -1) - (pb[i] ?? -1);
  return 0;
}

const tileDist = (pieces: ParcelPiece[], sx: number, sy: number) => Math.min(...pieces.map(({ tile: [x, y] }) => (x - sx) ** 2 + (y - sy) ** 2));

/** 筆のあるタイルと、そのまわり8枚 */
function aroundTiles(pieces: ParcelPiece[]): [number, number][] {
  const out = new Map<string, [number, number]>();
  for (const { tile: [x, y] } of pieces) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.set(`${x + dx},${y + dy}`, [x + dx, y + dy]);
  return [...out.values()];
}

/** 筆の形がタイルの外（のりしろ）にはみ出している方向の、隣のタイル */
function neighborsToComplete(pieces: ParcelPiece[]): [number, number][] {
  const out = new Map<string, [number, number]>();
  for (const { polygons, tile: [x, y] } of pieces) {
    const [w, s, e, n] = tileBounds(x, y);
    for (const ring of polygons.flat())
      for (const [lng, lat] of ring) {
        const dx = lng < w ? -1 : lng > e ? 1 : 0;
        const dy = lat > n ? -1 : lat < s ? 1 : 0;
        if (dx || dy) out.set(`${x + dx},${y + dy}`, [x + dx, y + dy]);
      }
  }
  return [...out.values()];
}

/** 輪の面積（経緯度のまま。比べるだけなので単位は気にしない） */
function ringArea(ring: LngLat[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return Math.abs(a / 2);
}

function inRing([x, y]: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 筆の中に必ず入る代表点。いちばん大きい部分の重心、外れたら（L字の土地など）重心の高さで横に切った区間の真ん中 */
export function interiorPoint(pieces: ParcelPiece[]): { lat: number; lng: number } {
  const polygons = pieces.flatMap((p) => p.polygons);
  const outer = polygons.map((p) => p[0]).sort((a, b) => ringArea(b) - ringArea(a))[0];
  let cx = 0;
  let cy = 0;
  for (const [x, y] of outer) {
    cx += x;
    cy += y;
  }
  const c: LngLat = [cx / outer.length, cy / outer.length];
  if (inRing(c, outer)) return { lng: c[0], lat: c[1] };
  const xs: number[] = [];
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const [xi, yi] = outer[i];
    const [xj, yj] = outer[j];
    if (yi > c[1] !== yj > c[1]) xs.push(((xj - xi) * (c[1] - yi)) / (yj - yi) + xi);
  }
  xs.sort((a, b) => a - b);
  let best: [number, number] = [xs[0] ?? c[0], xs[1] ?? c[0]];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  return { lng: (best[0] + best[1]) / 2, lat: c[1] };
}

/** 隣の筆（境界が接している筆）。地番の無い道路・水路（「道-199」など）も含む */
export type Neighbor = { kuiki: string; chiban: string };

/**
 * 筆に接している筆（謄本・公図を取るときの隣地の地番）。筆のあるタイルの中で、境界どうしが tolerance（m）以内に近づく筆を集める。
 * 地番の順に返す（地番の無い道路・水路は最後）
 */
export async function adjacentParcels(target: Parcel, source: ParcelSource, toleranceM = 0.5): Promise<Neighbor[]> {
  const rings = target.pieces.flatMap((p) => p.polygons.flat());
  const lat0 = target.point.lat;
  const pad = [toleranceM / (111_320 * Math.cos((lat0 * Math.PI) / 180)), toleranceM / 110_950];
  const tb = bboxOf(rings);
  const near = (b: [number, number, number, number]) => b[0] <= tb[2] + pad[0] && b[2] >= tb[0] - pad[0] && b[1] <= tb[3] + pad[1] && b[3] >= tb[1] - pad[1];
  // 物件の筆（二重地番などで分かれた区画も）は隣地に入れない
  const seen = new Set((target.chibanRaws ?? [target.chibanRaw]).map((c) => `${target.kuiki}|${c}`));
  const out: Neighbor[] = [];
  const tiles = new Map(target.pieces.map((p) => [p.tile.join(","), p.tile]));
  for (const [x, y] of tiles.values()) {
    for (const f of (await source.tile(x, y)) ?? []) {
      const key = `${f.kuiki}|${f.chiban}`;
      if (seen.has(key)) continue;
      const fr = f.polygons().flat();
      if (!fr.length || !near(bboxOf(fr)) || !ringsWithin(fr, rings, toleranceM, lat0)) continue;
      seen.add(key);
      out.push({ kuiki: f.kuiki, chiban: f.chiban });
    }
  }
  // 地番のある筆が先、地番の無い道路・水路はあと
  const numbered = (n: Neighbor) => (isLotChiban(n.chiban) ? 0 : 1);
  return out.sort((a, b) => numbered(a) - numbered(b) || a.kuiki.localeCompare(b.kuiki) || compareChiban(a.chiban, b.chiban));
}

/** 輪の集まりの範囲 [西, 南, 東, 北] */
function bboxOf(rings: LngLat[][]): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings)
    for (const [x, y] of ring) {
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  return b;
}

/** 2つの輪の集まりの縁が、どこかで tolerance（m）以内に近づくか（頂点から相手の辺までの距離を両方向に見る） */
function ringsWithin(a: LngLat[][], b: LngLat[][], toleranceM: number, lat0: number): boolean {
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_950;
  const close = (from: LngLat[][], to: LngLat[][]) => {
    for (const ring of from)
      for (const [px, py] of ring)
        for (const r of to)
          for (let i = 0; i + 1 < r.length; i++) {
            const ax = (r[i][0] - px) * kx;
            const ay = (r[i][1] - py) * ky;
            const dx = (r[i + 1][0] - r[i][0]) * kx;
            const dy = (r[i + 1][1] - r[i][1]) * ky;
            const len = dx * dx + dy * dy;
            const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
            if (Math.hypot(ax + t * dx, ay + t * dy) <= toleranceM) return true;
          }
    return false;
  };
  return close(a, b) || close(b, a);
}
