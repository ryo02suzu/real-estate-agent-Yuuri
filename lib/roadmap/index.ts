import GSI_CODES from "./data/gsi-muni-codes.json";
import { geocodeCandidates, isApproximate, needsChoice, reverseGeocode, type GeocodeResult } from "./geocode";
import { buildLinks, findMunicipality, resolveContact, type Contact, type Municipality, type ResolvedLink } from "./municipalities";
import { parcelAt, searchParcel, splitChiban, townFromAddress, type Parcel, type ParcelSource } from "./parcel";
import { pmtilesParcelSource } from "./parcel-tiles";

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
      /** 地番で探して見つかった筆（場所はこの筆の中。matchedAddress は町・大字まで）。地図で選んだ地点では、その地点の筆 */
      parcel?: Parcel;
      /** 同じ町に同じ地番の筆がほかにもあった数（小字違いなど） */
      parcelOthers?: number;
      /** 地番で探したが見つからなかったときの案内と、枝番違いなどの近い地番 */
      parcelMiss?: { chiban: string; reason: "not_found" | "no_map" | "error"; similar: string[] };
      municipality: Municipality;
      links: ResolvedLink[];
      /** その地点の問い合わせ先（政令市は区ごとの窓口） */
      contact?: Contact;
    };

/**
 * 住所を1つ渡すと、その場所の道路図URLと問い合わせ先をまとめて返す。
 * 番地まで見つからない住所（「熊谷市下奈良391番地3」のように地番で書く土地）や、「地番」と書いた入力は、
 * 登記所備付地図の筆を探して、その筆の場所を使う
 */
export async function lookup(address: string, { parcels = pmtilesParcelSource }: { parcels?: ParcelSource } = {}): Promise<LookupResult> {
  const chiban = splitChiban(address);
  // 「地番」の語は外して調べる（国土地理院が番地まで持っていれば、その位置から筆を探せる）
  const candidates = await geocodeCandidates(chiban?.explicit ? `${chiban.body}${chiban.chiban}` : address);
  if (candidates.length === 0) return { status: "not_found" };
  if (needsChoice(address, candidates)) return { status: "choose", candidates: candidates.slice(0, 15) };
  let geo = candidates[0];
  // 「地番」と明示したのに住居表示の街区（「217番」）に当たったら、地番と取り違えないよう町の代表点から探す
  if (chiban?.explicit && isJukyo(geo.matchedAddress)) geo = (await geocodeCandidates(chiban.body))[0] ?? geo;
  const rev = await reverseGeocode(geo.lat, geo.lng);
  const municipality = rev && findMunicipality(rev.muniCd);
  if (!rev || !municipality) {
    return { status: "unsupported", lat: geo.lat, lng: geo.lng, muniCd: rev?.muniCd ?? "", matchedAddress: geo.matchedAddress };
  }
  const approximate = isApproximate(address, geo.matchedAddress);
  let parcelMiss: Extract<LookupResult, { status: "ok" }>["parcelMiss"];
  // 住居表示（「1番」「1番1号」）まで一致した住所は地番ではないので探さない。町・大字まで、または「354番地」までの一致なら、
  // 地番の筆を探して位置（枝番まで）と筆の形を出す
  if (chiban && (chiban.explicit || !isJukyo(geo.matchedAddress))) {
    const city = muniCity(rev.muniCd) ?? municipality.name;
    const town = townFromAddress(geo.matchedAddress, city);
    try {
      const r = town ? await searchParcel({ city, town, chiban: chiban.chiban }, geo, parcels) : ({ status: "no_map" } as const);
      if (r.status === "found") {
        const { lat, lng } = r.parcel.point;
        const prev = (await reverseGeocode(lat, lng)) ?? rev;
        const m = findMunicipality(prev.muniCd) ?? municipality;
        return {
          status: "ok",
          lat,
          lng,
          matchedAddress: geo.matchedAddress.replace(/[0-9０-９][0-9０-９番地号の\-－]*$/, ""),
          town: prev.town,
          approximate: false,
          parcel: r.parcel,
          parcelOthers: r.others,
          municipality: m,
          links: buildLinks(m, lat, lng, prev.town),
          contact: resolveContact(m, prev.muniCd),
        };
      }
      // 国土地理院が番地まで見つけた住所で、ついでに筆を探しただけなら、見つからなくても何も言わない
      if (chiban.explicit || approximate) parcelMiss = { chiban: chiban.chiban, reason: r.status, similar: r.status === "not_found" ? r.similar : [] };
    } catch {
      if (chiban.explicit || approximate) parcelMiss = { chiban: chiban.chiban, reason: "error", similar: [] };
    }
  }
  return {
    status: "ok",
    lat: geo.lat,
    lng: geo.lng,
    matchedAddress: geo.matchedAddress,
    town: rev.town,
    approximate,
    ...(parcelMiss ? { parcelMiss } : {}),
    municipality,
    links: buildLinks(municipality, geo.lat, geo.lng, rev.town),
    contact: resolveContact(municipality, rev.muniCd),
  };
}

/** 国土地理院の住所が住居表示の街区・号（「1番」「1番1号」）まで一致しているか（「354番地」は地番による住所） */
const isJukyo = (matched: string) => /\d+番$|\d+号$/.test(matched.normalize("NFKC"));

/** 逆ジオコーダの市区町村コード → 「さいたま市見沼区」「瑞穂町」（都県なし）。関東1都6県の外は undefined */
export function muniCity(muniCd: string): string | undefined {
  for (const codes of Object.values(GSI_CODES as Record<string, Record<string, string>>)) if (codes[muniCd]) return codes[muniCd].replace(/\s/g, "");
  return undefined;
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
export async function lookupPoint(lat: number, lng: number, { parcels = pmtilesParcelSource }: { parcels?: ParcelSource } = {}): Promise<LookupResult> {
  // その地点の筆（地番）も一緒に調べる。読めなくても場所の結果は出す
  const [rev, parcel] = await Promise.all([reverseGeocode(lat, lng), parcelAt(lat, lng, parcels).catch(() => null)]);
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
    ...(parcel ? { parcel } : {}),
    municipality,
    links: buildLinks(municipality, lat, lng, rev.town),
    contact: resolveContact(municipality, rev.muniCd),
  };
}
