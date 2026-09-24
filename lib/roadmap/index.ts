import { geocode, reverseGeocode } from "./geocode";
import { buildLinks, findMunicipality, resolveContact, type Contact, type Municipality, type ResolvedLink } from "./municipalities";

export * from "./municipalities";
export { geocode, reverseGeocode } from "./geocode";
export { toWebMercator } from "./vendors";

export type LookupResult =
  | { status: "not_found" } // 住所が見つからない
  | { status: "unsupported"; lat: number; lng: number; muniCd: string; matchedAddress: string } // 未対応の市町村
  | {
      status: "ok";
      lat: number;
      lng: number;
      matchedAddress: string;
      town: string;
      municipality: Municipality;
      links: ResolvedLink[];
      /** その地点の問い合わせ先（政令市は区ごとの窓口） */
      contact?: Contact;
    };

/** 住所を1つ渡すと、その場所の道路図URLと問い合わせ先をまとめて返す */
export async function lookup(address: string): Promise<LookupResult> {
  const geo = await geocode(address);
  if (!geo) return { status: "not_found" };
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
    municipality,
    links: buildLinks(municipality, geo.lat, geo.lng),
    contact: resolveContact(municipality, rev.muniCd),
  };
}
