// 国土地理院の無料API（APIキー不要・保存制限なし）で住所→座標→市区町村コードを引く。
// 住所をサーバーに送らないよう、ブラウザから直接呼ぶ想定。
import { KYOTO_SAME_NAME } from "./data/kyoto-same-name";
import { PREF_NAME_RE } from "./regions";
import { kanjiToInt, normalizeChiban, splitChiban, splitLotHead } from "./parcel";

export type GeocodeResult = {
  lat: number;
  lng: number;
  /** 国土地理院が解釈した住所（入力とズレていないか画面で確認する用） */
  matchedAddress: string;
};

/**
 * 国土地理院の住所検索が、県・市の名前にも何も返さない（障害・混雑で、どの住所にも0件を返すことがある）。
 * 「住所が見つかりません」と言わないために、ふつうの通信の失敗とも分ける
 */
export class GeocoderUnavailable extends Error {}

/** 住所検索が動いているか（必ず見つかる「東京都千代田区」で確かめる） */
export async function geocoderAlive(): Promise<boolean> {
  return (await geocodeCandidates("東京都千代田区")).length > 0;
}

export async function geocode(address: string): Promise<GeocodeResult | null> {
  return (await geocodeCandidates(address))[0] ?? null;
}

const PREF = /^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/;

/** 候補をすべて返す（同じ住所は1つにまとめ、対応エリア（関東・中部）を先に並べる） */
export async function geocodeCandidates(address: string): Promise<GeocodeResult[]> {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`住所検索に失敗しました (${res.status})`);
  const items: Array<{ geometry: { coordinates: [number, number] }; properties: { title: string } }> =
    await res.json();
  const seen = new Set<string>();
  const list = items
    .map((it) => ({ lat: it.geometry.coordinates[1], lng: it.geometry.coordinates[0], matchedAddress: it.properties.title }))
    .filter((c) => !seen.has(c.matchedAddress) && seen.add(c.matchedAddress));
  // 先頭の結果は国土地理院の一致度順なので崩さず、対応エリアだけを前に寄せる（安定ソート）
  return list.sort((a, b) => Number(PREF_NAME_RE.test(b.matchedAddress)) - Number(PREF_NAME_RE.test(a.matchedAddress)));
}

/**
 * 都道府県を書かずに「本町1-1」「緑区」のように入れると、全国の同名の場所が並ぶ。
 * 違う市区町村の候補が2つ以上あれば、利用者に選んでもらう（先頭を黙って使うと別の県になることがある）
 */
export function needsChoice(input: string, candidates: GeocodeResult[]): boolean {
  if (PREF.test(input.trim())) return false;
  const places = new Set(
    candidates.filter((c) => PREF.test(c.matchedAddress)).map((c) => c.matchedAddress.match(/^.+?[都道府県].+?[市区町村]/)?.[0] ?? c.matchedAddress),
  );
  return places.size > 1;
}

/**
 * 地割（岩手県などで大字を区分けした「第13地割」）。番号は町名の一部で、番地ではない。
 * 国土地理院は「第十三地割」と漢数字で返すので、比べるときは数字にそろえる（chiwariDigits）
 */
export const CHIWARI = /第?(?:[0-9０-９]+|[一二三四五六七八九十]+)地割/g;
/** 地割の番号を数字に（「第十三地割」→「第13地割」、「第１３地割」→「第13地割」） */
export const chiwariDigits = (s: string) =>
  s.replace(CHIWARI, (m) => m.normalize("NFKC").replace(/[一二三四五六七八九十]+/, (k) => String(kanjiToInt(k))));

/**
 * 北海道の「条」（札幌・旭川・帯広・岩見沢などの「北1条西2丁目」「7条通9丁目」）。条の番号は町名の一部で、番地ではない
 * （町名は「北一条西」「七条通」）。国土地理院は「北一条西二丁目」と漢数字で返すので、比べるときは数字にそろえる（joDigits）。
 * 京都の「四条通」・奈良の「三条町」・新潟の「三条市」のような、北海道の外の「条」の付く名前も同じ形にそろうだけで、困らない
 */
/**
 * 札幌市白石区の「本通14丁目北」「平和通16丁目南」「南郷通7丁目南」のような、丁目が通りの北と南に分かれた町を、丁目を書かずに
 * 「本通14北5-35」と書いた住所（地価公示の住居表示もこの書き方）。国土地理院は「本通十四丁目南」と「本通十四丁目北」の両方を返し、
 * 先頭の「南」を当てると道の反対側の別の町になる。「◯◯通」のすぐ後ろの「数字＋北・南（＋数字）」を「数字＋丁目＋北・南」に書き直す
 */
export function streetSide(address: string): string {
  return address.replace(/(通)([0-9０-９]+)([北南])(?=[0-9０-９])/g, "$1$2丁目$3");
}

/** 郵便番号の区切り（半角・全角のハイフン、マイナス記号、長音） */
const ZIP_DASH = "[-－‐−ー]";

/**
 * 貼り付けた住所の前後に付いてくる飾りを外す（住所そのものは変えない）。Google マップのコピー（「日本、〒163-8001 東京都…」）、
 * 名刺・資料の郵便番号（「〒163-8001」「163-8001 東京都…」）、見出し（「住所：」「所在地 」「物件所在地：」）。
 * 国土地理院の住所検索は、これらが付いていると何も返さないか、町までしか当たらない。
 * 「日本橋」「日本平」のような地名は残す（「日本」の後ろに読点・空白があるときだけ外す）。「地番」の語は地番として探す印なので残す
 */
export function pastedAddress(input: string): string {
  let s = input.replace(/[\r\n\t]+/g, " ").trim();
  s = s.replace(/^日本\s*[、,，]\s*|^日本[\s　]+/, "");
  s = s.replace(/^(?:物件)?(?:住所|所在地|所在)(?:\s*[:：]\s*|[\s　]+)/, "");
  // 「〒」の付いた郵便番号はどこにあっても外す。「〒」の無い郵便番号は、先頭にあって後ろに空白か数字でない字が続くときだけ
  s = s.replace(new RegExp(`〒[\\s　]*[0-9０-９]{3}${ZIP_DASH}?[0-9０-９]{4}`, "g"), " ");
  s = s.replace(new RegExp(`^[0-9０-９]{3}${ZIP_DASH}[0-9０-９]{4}(?=[\\s　]|[^0-9０-９\\-－‐−ー])`), "");
  return s.replace(/[\s　]+/g, " ").trim();
}

/** 京都市の通り名の住所の向き（「上る」「下る」「西入」「東入」） */
const KYOTO_DIR = "(?:上る|上ル|上がる|下る|下ル|下がる|西入る|西入ル|西入|東入る|東入ル|東入)";
const KYOTO_STREET = new RegExp(
  `^(.*京都市(?:北|上京|左京|中京|東山|下京|南|右京|伏見|山科|西京)区)(.*${KYOTO_DIR})(?:[0-9０-９一二三四五六七八九十]+丁目)?(?:[東西南北]側)?(.+)$`,
);

/** 京都市の通り名の住所の、区まで（「京都府京都市中京区」）・区の名前・通り名と向き（「河原町通二条下る」）・町名から後ろ（「下丸屋町400」） */
function kyotoParts(address: string): { head: string; ward: string; street: string; rest: string } | null {
  const m = address.match(KYOTO_STREET);
  if (!m || !m[2].includes("通") || !/^[^0-9０-９]*町/.test(m[3])) return null;
  return { head: m[1], ward: m[1].replace(/^.*京都市/, ""), street: m[2], rest: m[3] };
}

/** 京都市の同じ区の同じ名前の町（KYOTO_SAME_NAME）で、町名から後ろ（「下丸屋町400」）の町の名前。同じ名前の町でなければ null */
function sameNameBase(ward: string, rest: string): string | null {
  const same = KYOTO_SAME_NAME[ward];
  if (!same) return null;
  // 長い名前から（「中之町」と「上中之町」のように、短い名前が長い名前の一部のことがある）
  return Object.keys(same)
    .sort((a, b) => b.length - a.length)
    .find((b) => rest.startsWith(b)) ?? null;
}

/** 通り名と向き（「河原町通二条下る」）に、地番区域の括弧の中の通り名（「河原町通二条」。「二条通河原町」と逆に書いたものも）があるか */
function streetHas(street: string, name: string): boolean {
  const br = name.match(/（(.+)）$/)?.[1];
  if (!br) return false;
  const s = street.normalize("NFKC");
  const b = br.normalize("NFKC");
  if (s.includes(b)) return true;
  const m = b.match(/^(.+?)通(.+)$/);
  return !!m && s.includes(`${m[2]}通${m[1]}`);
}

/** 京都市の区まで（「京都府京都市中京区」）と、その後ろ */
const KYOTO_WARD = /^(.*京都市(?:北|上京|左京|中京|東山|下京|南|右京|伏見|山科|西京)区)(.+)$/;

/**
 * 京都市の同じ区の同じ名前の町（KYOTO_SAME_NAME）の住所の分け方：区まで・通り名と向き（無ければ空）・町の名前（「下丸屋町」）・
 * 町名に付けた括弧の中（「下丸屋町（河原町通二条）400」の「河原町通二条」。無ければ null）・その後ろ（「400」）。同じ名前の町でなければ null
 */
function kyotoSameName(address: string): { head: string; ward: string; street: string; base: string; bracket: string | null; after: string } | null {
  const p = kyotoParts(address);
  const head = p ? p.head : address.match(KYOTO_WARD)?.[1];
  if (!head) return null;
  const ward = head.replace(/^.*京都市/, "");
  const rest = p ? p.rest : address.slice(head.length);
  const base = sameNameBase(ward, rest);
  if (!base) return null;
  const tail = rest.slice(base.length);
  const br = tail.match(/^[（(](.+?)[）)](.*)$/);
  return { head, ward, street: p ? p.street : "", base, bracket: br ? br[1] : null, after: br ? br[2] : tail };
}

/** 京都市の同じ区の同じ名前の町で、通り名から決めた町（地番区域の町名「下丸屋町（河原町通二条）」と、その町の位置） */
export type KyotoTown = { base: string; town: string; lat: number; lng: number };

/**
 * 京都市の同じ区に同じ名前の町がある（中京区の「下丸屋町」は小川通竹屋町と河原町通二条の2つ）住所で、どちらの町かを決める。
 * 町名に括弧で通り名を付けた住所（「下丸屋町（河原町通二条）400」。候補から選んだ住所）はその町。通り名の住所は、地番区域の括弧の中の
 * 通り名（「河原町通二条」）が住所の通り名にある町が1つだけならその町。位置が分からない・決められなければ null
 */
export function kyotoTown(address: string): KyotoTown | null {
  const s = kyotoSameName(address);
  if (!s) return null;
  const rows = KYOTO_SAME_NAME[s.ward][s.base];
  const hit =
    s.bracket != null
      ? rows.filter(([name]) => name.normalize("NFKC") === `${s.base}(${s.bracket})`.normalize("NFKC"))
      : rows.filter(([name]) => streetHas(s.street, name));
  if (hit.length !== 1) return null;
  const [town, lat, lng] = hit[0];
  return lat == null || lng == null ? null : { base: s.base, town, lat, lng };
}

/**
 * 京都市の同じ区に同じ名前の町がある住所で、どちらの町か決められないとき（通り名が無い・括弧の中の通り名が住所の通り名に無い）の候補。
 * 町名を地番区域の名前（「下丸屋町（河原町通二条）」）にした住所と、その町の位置（選ぶと、その町で探す）。国土地理院は同じ名前の町を
 * 1つの点にしか当てないので、選んでもらう。括弧の付かない町がある名前（下京区の「上之町」）・位置の分からない町がある名前は候補にできない（null）
 */
export function kyotoChoices(address: string): GeocodeResult[] | null {
  const s = kyotoSameName(address);
  if (!s || kyotoTown(address)) return null;
  const rows = KYOTO_SAME_NAME[s.ward][s.base];
  if (rows.some(([name, lat, lng]) => !name.includes("（") || lat == null || lng == null)) return null;
  return rows.map(([name, lat, lng]) => ({ lat: lat!, lng: lng!, matchedAddress: `${s.head}${name}${s.after}` }));
}

/**
 * 京都市の通り名の住所（「上京区下長者町通七本松西入鳳瑞町233番10」）から、通り名と向き（上る・下る・西入・東入）を外して、
 * 町名から始まる形（「上京区鳳瑞町233番10」）にする。国土地理院の住所検索は、通り名の住所を通り名の一部に似た別の町
 * （「下之町」「松原中之町」など）に当てることがある（町名だけにすると、その町の番地に当たる）。向きの後ろの「2丁目」
 * （四条通寺町東入2丁目）と「西側」も外す。通り名（「◯◯通」）の無い住所・向きの後ろに町名の無い住所はそのまま。
 * 同じ区に同じ名前の町がある住所は、町を決められる（kyotoTown）ときだけ、通り名・町名の括弧を外す（国土地理院は同じ名前の町を
 * 1つの点にしか当てない。決められなければ、そのまま）
 */
export function kyotoStreet(address: string): string {
  const s = kyotoSameName(address);
  if (s) return kyotoTown(address) ? s.head + s.base + s.after : address;
  const p = kyotoParts(address);
  return p ? p.head + p.rest : address;
}

export const JO = /(?:[0-9０-９]+|[一二三四五六七八九十]+)条/g;
/** 条の番号を数字に（「北二十四条西」→「北24条西」、「北２４条西」→「北24条西」） */
export const joDigits = (s: string) => s.replace(JO, (m) => m.normalize("NFKC").replace(/[一二三四五六七八九十]+/, (k) => String(kanjiToInt(k))));
/**
 * 北海道の殖民区画の「線」（士幌町「字士幌西2線171番12」・上士幌町「字上士幌東3線」）。線の番号は町名の一部で、番地ではない
 * （国土地理院の町名は「士幌西二線」）。番地の数字と見分けるため、すぐ後ろに番地の数字が続くときだけ
 */
export const SEN = /(?:[0-9０-９]+|[一二三四五六七八九十]+)線(?=[0-9０-９])/g;
/** 線の番号を数字に（「士幌西二線」→「士幌西2線」）。国土地理院の町名（後ろに番地が無い）にも使うので、後ろは見ない */
export const senDigits = (s: string) => s.replace(/(?:[0-9０-９]+|[一二三四五六七八九十]+)線/g, (m) => m.normalize("NFKC").replace(/[一二三四五六七八九十]+/, (k) => String(kanjiToInt(k))));

/** 大字を区分けする字（八街市の「八街い」〜「八街ち」のイロハ、高知市の「朝倉甲」〜「朝倉庚」の甲乙丙…） */
const SUB_AREA_MARK = "[甲乙丙丁戊己庚辛壬癸いろはにほへとちりぬるをイロハニホヘトチリヌルヲ]";
/** 小字のあとに区分の字を書いた地番の住所（「…八街字北中道ほ224番12」）：前・小字・区分の字・番地 */
const SUB_AREA_RE = new RegExp(`^(.*[^小])字([^字\\d]+?)(${SUB_AREA_MARK})(\\d.*)$`);

/**
 * 大字が「い・ろ・は…」「甲・乙・丙…」で分かれた町の地番は、「八街市八街字北中道ほ224番12」「高知市朝倉字田島丙219番1」のように、
 * 小字のあとに区分の字を書く。国土地理院の町名は「八街ほ」「朝倉丙」（区分の字が町名の終わり）で、小字は持っていないので、
 * そのまま探すと区分の兄弟（「八街い」「朝倉横町」）を先に返す（2026-11-16 の総点検：4.7〜6.4km・1.0〜1.6km 離れた別の場所）。
 * 国土地理院の町名の形（「八街市八街ほ224番12」）にした住所と、その町（「…八街ほ」）。当てはまらなければ null
 */
export function subAreaForm(address: string): { query: string; town: string } | null {
  const m = address.normalize("NFKC").replace(/\s+/g, "").match(SUB_AREA_RE);
  if (!m) return null;
  const [, head, , mark, rest] = m;
  // 小字の前に大字（町名）が無い（市区町村のすぐ後ろが字）ときは、区分の町ではない
  if (/[市区町村郡]$/.test(head)) return null;
  return { query: `${head}${mark}${rest}`, town: `${head}${mark}` };
}

/** 比べるための形（郡の名前と「大字」を外し、全角・半角をそろえる。国土地理院の住所に郡は無く、大字は付いたり付かなかったりする） */
const placeForm = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/(?:^|(?<=[都道府県]))[^都道府県市区町村]{1,6}?郡(?=.)/, "")
    .replace(/大字/g, "");

/** 国土地理院の住所（番地を外した町まで）が、区分の町（subAreaForm の town）と同じか。入力が都道府県・市区町村を省いていても、後ろがそろえば同じ */
export function subAreaMatched(town: string, matchedAddress: string): boolean {
  const a = placeForm(town);
  const b = placeForm(withoutNumbers(matchedAddress));
  return !!a && !!b && (a === b || a.endsWith(b) || b.endsWith(a)) && b.endsWith(a.slice(-2));
}

/**
 * 小字のあとに区分の字を書いた地番の住所で、国土地理院が区分の兄弟の町に当てたときは、区分の町の形で探し直す。
 * 探し直した先頭が区分の町そのもの（「八街ほ２２４番地」「朝倉丙」）なら、その候補を返す。当てはまらない・見つからなければ null
 */
export async function subAreaRequery(address: string, candidates: GeocodeResult[], search: (q: string) => Promise<GeocodeResult[]> = geocodeCandidates): Promise<GeocodeResult[] | null> {
  const f = subAreaForm(address);
  if (!f) return null;
  if (candidates[0] && subAreaMatched(f.town, candidates[0].matchedAddress)) return null;
  const again = await search(f.query).catch(() => []);
  return again[0] && subAreaMatched(f.town, again[0].matchedAddress) ? again : null;
}
/** 数字で書いた条（「1条」）を外す。番地の数字を数える前に使う（漢数字の条は、もともと番地に数えない） */
const dropJo = (s: string) => s.replace(/[0-9０-９]+条/g, "条");

/** 入力に番地（数字）があるのに、結果が町・大字までしか一致していない（代表点になっている）。地割・条の番号は番地に数えない */
export function isApproximate(input: string, matchedAddress: string): boolean {
  const digit = /[0-9０-９]/;
  return digit.test(dropJo(input.replace(CHIWARI, ""))) && !digit.test(dropJo(matchedAddress.replace(CHIWARI, "")));
}

/**
 * 入力に書いた番号の区分（「10字」「第16地割」）が、見つかった住所に無いか。国土地理院がその区分を飛ばして番地だけで当てると、
 * 同じ番地の別の区分の場所になることがある（「越前市横市町10字四ノ縄1番4」が、区分の無い「横市町１番地」の 599m 先に当たった）
 */
export function subAreaDropped(input: string, matchedAddress: string): boolean {
  const areas = (a: string) =>
    new Set(
      [...a.normalize("NFKC").matchAll(/第?(\d+|[一二三四五六七八九十]+)(字|地割)/g)].map((m) => `${/^\d+$/.test(m[1]) ? Number(m[1]) : kanjiToInt(m[1])}${m[2]}`),
    );
  const got = areas(matchedAddress);
  return [...areas(input)].some((a) => !got.has(a));
}

/**
 * 住所の番号（丁目・番地・号）を数の並びにする（「丸の内一丁目9番」→ [1, 9]）。郵便番号は外し、漢数字の丁目・地割も数える。
 * 北海道の条（「北1条西2丁目1」の「1条」）は町名の一部なので数えない（→ [2, 1]）
 */
export function addressNumbers(a: string): number[] {
  const s = dropJo(chiwariDigits(a.normalize("NFKC")))
    .replace(/〒?\s*\d{3}-\d{4}/g, "")
    .replace(/([一二三四五六七八九十]+)丁目/g, (_, k: string) => `${kanjiToInt(k)}丁目`);
  return (s.match(/\d+/g) ?? []).map(Number);
}

/**
 * 入力した住所の番号の一部（多くは「号」）が、見つかった住所に無いか（「丸の内1-9-1」が「丸の内一丁目9番」までの一致）。
 * 番地がまったく無い一致（町の中心）は isApproximate で見る。建物名・部屋番号を数えないよう、入力は丁目・番地・号の3つまで
 */
export function partialMatch(input: string, matchedAddress: string): boolean {
  const a = addressNumbers(input).slice(0, 3);
  const b = addressNumbers(matchedAddress);
  return b.length > 0 && a.length > b.length;
}

/**
 * 番までの一致（partialMatch）のうち、地番の枝番が合っていないもの：見つかった住所が「〇〇番地」（登記の地番の書き方）で、
 * 入力にはその先の番号（枝番）がある（「新城字山田587番255」が「新城山田５８７番地」までの一致）。
 * 住居表示の「号」が無いだけ（同じ街区の中）と違い、同じ番地でも枝番の違う土地は離れた所にあることがある
 * （2026-11-13 の総点検：地番の書き方の住所 175件で、国の地点から中央値 44m・200m を超えるもの 9件・最大 1.3km）。
 * 画面の案内を「号などが無い」ではなく「枝番が合っていない」にするために使う
 */
export function branchUnmatched(input: string, matchedAddress: string): boolean {
  return partialMatch(input, matchedAddress) && /番地$/.test(matchedAddress.normalize("NFKC"));
}

/** 見つかった住所の終わりの番地・号（「松戸３番地」→ [3]、「寺内二丁目１３番５７号」→ [13, 57]。町までの一致は空） */
export function matchedNumbers(matchedAddress: string): number[] {
  const tail = matchedAddress.normalize("NFKC").replace(CHIWARI, "").match(/\d[\d番地号の-]*$/)?.[0];
  return (tail?.match(/\d+/g) ?? []).map(Number);
}

/**
 * 地番の筆を出さないときに、住所の後ろに添える言葉。
 * 住所が番地・号まで見つかっていれば何も付けない（「付近」とは書かない。住所の場所はネットの地図と同じくらい分かっていて、
 * 分からないのは地番だけ。地番のことは地番の欄に書く）。地図で選んだ地点と、町の中心の点（番地まで見つからなかった・
 * 番地を書かずに町名で調べた）のときだけ、そう書く。地番で探した筆が見つかったときは、場所はその筆なので何も付けない
 */
export function placeSuffix(r: { approximate: boolean; picked?: true; parcel?: unknown; matchedAddress: string }): string {
  if (r.picked) return "（地図で選んだ地点）";
  if (r.parcel) return "";
  return r.approximate || matchedNumbers(r.matchedAddress).length === 0 ? "（町の中心）" : "";
}

/** 見つかった住所から終わりの番地・号を外した、町までの部分（「千葉県松戸市松戸３番地」→「千葉県松戸市松戸」） */
export const withoutNumbers = (matchedAddress: string) => matchedAddress.replace(/[0-9０-９][0-9０-９番地号の\-－]*$/, "");

/**
 * 見つかった住所の番地・号が、入れた番号と食い違わないか。国土地理院の住所検索は、小字の名前の数字を番地として読み、
 * 別の番地を返すことがある（「松戸字三丁目1791番1」→「松戸3番地」、「東長沼字五号1719番7」→「東長沼5番地」、
 * 「内谷字八反田623番1」→「内谷8番地」。1km 以上離れた所になる）。
 * 見つかった番地・号の並びが、入力の番号の中に（丁目の番号を除いて）そのまま続きで入っているかを見る。
 * 地番の書き方の入力（「…字三丁目1791番1」「…49号村上31番4」）では、その並びが地番の位置から始まっていること。
 * 見つかった住所に丁目があれば、入力のその前の番号と同じこと（入力に丁目が無い「青木217-8」は通す）。
 * 町までの一致・入力の番号を読み取れない（漢数字だけなど）ときは、食い違いとしない
 */
export function numbersAgree(input: string, matchedAddress: string): boolean {
  const got = matchedNumbers(matchedAddress);
  if (!got.length) return true;
  const text = dropJo(chiwariDigits(input.normalize("NFKC")))
    .replace(/〒?\s*\d{3}-\d{4}/g, "")
    .replace(/([一二三四五六七八九十]+)丁目/g, (_, k: string) => `${kanjiToInt(k)}丁目`);
  // 入力の番号（丁目の番号かどうかの印つき）
  const typed = [...text.matchAll(/(\d+)(丁目)?/g)].map((m) => ({ n: Number(m[1]), chome: !!m[2] }));
  if (typed.filter((t) => !t.chome).length < got.length) return true;
  const chome = matchedAddress.normalize("NFKC").match(/(\d+|[一二三四五六七八九十]+)丁目/);
  const chomeNo = chome ? (/^\d+$/.test(chome[1]) ? Number(chome[1]) : kanjiToInt(chome[1])) : undefined;
  // 地番の書き方（地番の前に、丁目・地割・号などの付かない番号が無い）なら、地番の位置から始まること
  const lot = splitChiban(input);
  const lotStyle = !!lot && !/\d/.test(lot.body.normalize("NFKC").replace(/第?\d+(?:丁目|丁|地割|号地|号|字|区|部|番割|番町|条)/g, ""));
  const lotAt = lot && lotStyle ? typed.length - (splitLotHead(normalizeChiban(lot.chiban))[1].match(/\d+/g) ?? []).length : -1;
  for (let i = 0; i + got.length <= typed.length; i++) {
    if (lotAt >= 0 && i !== lotAt) continue;
    if (!got.every((n, j) => typed[i + j].n === n && !typed[i + j].chome)) continue;
    // 見つかった住所に丁目があれば、入力のその前の番号と同じこと（丁目を書かない「青木217-8」のような2つまでの番号は通す）
    if (chomeNo !== undefined && (i > 0 ? typed[i - 1].n !== chomeNo : typed.length > 2)) continue;
    return true;
  }
  return false;
}

export type ReverseResult = {
  /** 市区町村コード（例: 熊谷市 = "11202"、さいたま市大宮区 = "11103"） */
  muniCd: string;
  /** 町丁目名（例: "宮町二丁目"） */
  town: string;
};

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult | null> {
  const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`;
  // 応答しないとき（障害・混雑。2026-11-16 は数十分のあいだ 502〜504 と時間切れ）に待ち続けないよう、10秒で打ち切る
  const res = await fetch(url, typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? { signal: AbortSignal.timeout(10_000) } : undefined);
  if (!res.ok) throw new Error(`市区町村の判定に失敗しました (${res.status})`);
  const body: { results?: { muniCd: string; lv01Nm: string } } = await res.json();
  if (!body.results) return null;
  return { muniCd: body.results.muniCd, town: body.results.lv01Nm };
}
