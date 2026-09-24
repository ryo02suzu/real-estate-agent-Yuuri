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
    links: buildLinks(municipality, geo.lat, geo.lng),
    contact: resolveContact(municipality, rev.muniCd),
  };
}
