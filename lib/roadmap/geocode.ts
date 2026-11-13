// 国土地理院の無料API（APIキー不要・保存制限なし）で住所→座標→市区町村コードを引く。
// 住所をサーバーに送らないよう、ブラウザから直接呼ぶ想定。
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

/** 入力に番地（数字）があるのに、結果が町・大字までしか一致していない（代表点になっている）。地割の番号は番地に数えない */
export function isApproximate(input: string, matchedAddress: string): boolean {
  const digit = /[0-9０-９]/;
  return digit.test(input.replace(CHIWARI, "")) && !digit.test(matchedAddress.replace(CHIWARI, ""));
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

/** 住所の番号（丁目・番地・号）を数の並びにする（「丸の内一丁目9番」→ [1, 9]）。郵便番号は外し、漢数字の丁目・地割も数える */
export function addressNumbers(a: string): number[] {
  const s = chiwariDigits(a.normalize("NFKC"))
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
  const text = chiwariDigits(input.normalize("NFKC"))
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`市区町村の判定に失敗しました (${res.status})`);
  const body: { results?: { muniCd: string; lv01Nm: string } } = await res.json();
  if (!body.results) return null;
  return { muniCd: body.results.muniCd, town: body.results.lv01Nm };
}
