// 国土地理院の無料API（APIキー不要・保存制限なし）で住所→座標→市区町村コードを引く。
// 住所をサーバーに送らないよう、ブラウザから直接呼ぶ想定。
import { kanjiToInt } from "./parcel";

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
const KANTO = /^(東京都|神奈川県|埼玉県|千葉県|茨城県|栃木県|群馬県)/;

/** 候補をすべて返す（同じ住所は1つにまとめ、関東を先に並べる） */
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
  // 先頭の結果は国土地理院の一致度順なので崩さず、関東だけを前に寄せる（安定ソート）
  return list.sort((a, b) => Number(KANTO.test(b.matchedAddress)) - Number(KANTO.test(a.matchedAddress)));
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

/** 入力に番地（数字）があるのに、結果が町・大字までしか一致していない（代表点になっている） */
export function isApproximate(input: string, matchedAddress: string): boolean {
  const digit = /[0-9０-９]/;
  return digit.test(input) && !digit.test(matchedAddress);
}

/** 住所の番号（丁目・番地・号）を数の並びにする（「丸の内一丁目9番」→ [1, 9]）。郵便番号は外し、漢数字の丁目も数える */
export function addressNumbers(a: string): number[] {
  const s = a
    .normalize("NFKC")
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
