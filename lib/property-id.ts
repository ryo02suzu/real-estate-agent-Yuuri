// 同じ物件の見分け方。信頼できる識別情報があるときだけ同じ物件と見なす（地点が近いだけ・町名が同じだけでは別の物件のまま）。
//  (a) 登記所備付地図の筆が見つかり（地番で探した・地図で選んだ地点の筆）、市区町村コードと町（地番区域）と登記の地番が同じ → p:市区町村コード:町:地番
//  (b) 住所の文字列が同じ（全角・半角と丁目の表記をそろえたあと） → a:住所
//  (c) 地図で選んだ地点の座標が同じ（小数5桁＝約1m） → ll:緯度,経度
// 確認の記録（lib/records.ts）・済んだ印・履歴のまとめはこの鍵で結びつける

const KANJI_NUM: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** 「四丁目」→「4丁目」、「十二丁目」→「12丁目」 */
function chomeToDigits(s: string): string {
  return s.replace(/([一二三四五六七八九十〇]+)丁目/g, (_, k: string) => {
    let n = 0;
    let unit = 0;
    for (const c of k) {
      const v = KANJI_NUM[c];
      if (v === 10) {
        n = (n || 1) * 10;
        unit = 1;
      } else if (unit) {
        n += v;
        unit = 0;
      } else n = n * 10 + v;
    }
    return `${n}丁目`;
  });
}

/** 住所の表記をそろえる（全角→半角、空白を外す、丁目の漢数字を数字に、「番」「号」を「-」に） */
export function normalizeAddress(address: string): string {
  return chomeToDigits(address.normalize("NFKC").replace(/\s+/g, "").replace(/^地番/, ""))
    .replace(/番地?の?/g, "-")
    .replace(/番/g, "-")
    .replace(/号/g, "")
    .replace(/-+$/, "");
}

export type IdSource = {
  /** 調べた住所（入力）。地図で選んだときは空でよい */
  address?: string;
  /** 市区町村コード（5桁） */
  muniCd?: string;
  /** 登記の地番（「3556-1」）。筆が信頼できるとき（地番で探した・地図で選んだ地点の筆）だけ渡す */
  chiban?: string;
  /** 町・大字（地番は町ごとに付くので、筆の鍵に入れる） */
  town?: string;
  /** 地図で選んだ地点 */
  ll?: [number, number];
};

/** 調べた結果から物件の鍵を作る（筆が見つかっていれば筆、地図で選んだ地点なら座標、それ以外は住所） */
export function propertyIdOf(query: string, r: { town: string; lat: number; lng: number; picked?: true; parcel?: { chibanRaw: string }; municipality: { codes?: readonly string[] } }): string {
  const code = r.municipality.codes?.[0];
  if (r.parcel && code && /^\d/.test(r.parcel.chibanRaw)) return propertyId({ muniCd: code, town: r.town, chiban: r.parcel.chibanRaw });
  if (r.picked) return propertyId({ ll: [r.lat, r.lng] });
  return propertyId({ address: query });
}

/** 物件の鍵。信頼できる順に 筆 → 住所 → 地点 */
export function propertyId(src: IdSource): string {
  if (src.muniCd && src.chiban) return `p:${src.muniCd}:${(src.town ?? "").normalize("NFKC").replace(/\s+/g, "")}:${src.chiban.normalize("NFKC").replace(/\s+/g, "")}`;
  if (src.address?.trim()) return `a:${normalizeAddress(src.address)}`;
  if (src.ll) return `ll:${src.ll[0].toFixed(5)},${src.ll[1].toFixed(5)}`;
  return "";
}
