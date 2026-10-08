import GSI_CODES from "./data/gsi-muni-codes.json";
import { geocodeCandidates, isApproximate, needsChoice, reverseGeocode, type GeocodeResult } from "./geocode";
import { buildLinks, findMunicipality, resolveContact, type Contact, type Municipality, type ResolvedLink } from "./municipalities";

export * from "./municipalities";
export { geocode, geocodeCandidates, isApproximate, needsChoice, reverseGeocode, type GeocodeResult } from "./geocode";
export { toWebMercator } from "./vendors";

export type LookupResult =
  | { status: "not_found" } // 住所が見つからない
  | { status: "choose"; candidates: GeocodeResult[] } // 同名の場所が複数（都道府県から入れ直すか、候補から選ぶ）
  | { status: "unsupported"; lat: number; lng: number; muniCd: string; matchedAddress: string } // 未対応の市町村
  | {
      status: "ok";
      lat: number;
      lng: number;
      matchedAddress: string;
      town: string;
      /** 番地まで一致せず、町・大字の代表点で表示している */
      approximate: boolean;
      /** 住所ではなく、地図で選んだ地点（matchedAddress は町・大字まで） */
      picked?: true;
      municipality: Municipality;
      links: ResolvedLink[];
      /** その地点の問い合わせ先（政令市は区ごとの窓口） */
      contact?: Contact;
    };

/** 住所を1つ渡すと、その場所の道路図URLと問い合わせ先をまとめて返す */
export async function lookup(address: string): Promise<LookupResult> {
  const candidates = await geocodeCandidates(address);
  if (candidates.length === 0) return { status: "not_found" };
  if (needsChoice(address, candidates)) return { status: "choose", candidates: candidates.slice(0, 15) };
  const geo = candidates[0];
  const rev = await reverseGeocode(geo.lat, geo.lng);
  const municipality = rev && findMunicipality(rev.muniCd);
  if (!rev || !municipality) {
    return { status: "unsupported", lat: geo.lat, lng: geo.lng, muniCd: rev?.muniCd ?? "", matchedAddress: geo.matchedAddress };
  }
  return {
    status: "ok",
    lat: geo.lat,
    lng: geo.lng,
    matchedAddress: geo.matchedAddress,
    town: rev.town,
    approximate: isApproximate(address, geo.matchedAddress),
    municipality,
    links: buildLinks(municipality, geo.lat, geo.lng, rev.town),
    contact: resolveContact(municipality, rev.muniCd),
  };
}

/** 逆ジオコーダの市区町村コード → 「埼玉県さいたま市西区」。関東1都6県の外は undefined */
export function muniName(muniCd: string): string | undefined {
  for (const [pref, codes] of Object.entries(GSI_CODES as Record<string, Record<string, string>>)) {
    if (codes[muniCd]) return `${pref}${codes[muniCd].replace(/\s/g, "")}`;
  }
  return undefined;
}

/**
 * 地図で選んだ地点（緯度経度）の道路図と問い合わせ先。住所の代わりに、逆ジオコーダの市区町村と町名を使う。
 * 番地は分からないので、表示する住所は「埼玉県熊谷市宮町二丁目」まで
 */
export async function lookupPoint(lat: number, lng: number): Promise<LookupResult> {
  const rev = await reverseGeocode(lat, lng);
  const municipality = rev && findMunicipality(rev.muniCd);
  const place = rev ? `${muniName(rev.muniCd) ?? ""}${rev.town}` : "";
  if (!rev || !municipality) return { status: "unsupported", lat, lng, muniCd: rev?.muniCd ?? "", matchedAddress: place || "地図で選んだ地点" };
  return {
    status: "ok",
    lat,
    lng,
    matchedAddress: place,
    town: rev.town,
    approximate: false,
    picked: true,
    municipality,
    links: buildLinks(municipality, lat, lng, rev.town),
    contact: resolveContact(municipality, rev.muniCd),
  };
}
