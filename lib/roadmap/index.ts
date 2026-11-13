import GSI_CODES from "./data/gsi-muni-codes.json";
import { correctAddress, describeMatch, placeNotFound, type AddressFix, type AddressMiss } from "./address-fix";
import { geocodeCandidates, geocoderAlive, GeocoderUnavailable, isApproximate, matchedNumbers, needsChoice, numbersAgree, reverseGeocode, subAreaDropped, withoutNumbers, type GeocodeResult } from "./geocode";
import { buildLinks, findMunicipality, resolveContact, type Contact, type Municipality, type ResolvedLink } from "./municipalities";
import { kuikiAllows, kuikiHasSub, kuikiSubLabel, normalizeChiban, parcelAt, searchParcel, splitChiban, splitLotHead, townFromAddress, townKey, type Parcel, type ParcelSource } from "./parcel";
import { addressSub, elsewhereLabel, sameTownName, typedChome, type AddressSub, type Elsewhere } from "./parcel-sub";
import { loadParcelIndex, type ParcelIndex } from "./parcel-index";
import { pmtilesParcelSource } from "./parcel-tiles";

export * from "./municipalities";
export { geocode, geocodeCandidates, GeocoderUnavailable, isApproximate, needsChoice, reverseGeocode, type GeocodeResult } from "./geocode";
export { toWebMercator } from "./vendors";
export { changedMarks, type AddressFix, type AddressMiss } from "./address-fix";

export type LookupResult =
  | { status: "not_found" } // 住所が見つからない
  | {
      status: "choose";
      candidates: GeocodeResult[];
      /** 書き間違いを直そうとして、近い名前の町が2つ以上あった */
      near?: true;
      /** 市区町村を書かずに町名から入れた住所で、同じ町名が2つ以上の市区町村にあった（「東京都新宿3-1-1」は新宿区と葛飾区） */
      omitted?: true;
    } // 同名の場所が複数（都道府県から入れ直すか、候補から選ぶ）
  | { status: "unsupported"; lat: number; lng: number; muniCd: string; matchedAddress: string } // 未対応の市町村
  | {
      status: "ok";
      lat: number;
      lng: number;
      matchedAddress: string;
      town: string;
      /** 番地まで一致せず、町・大字の代表点で表示している */
      approximate: boolean;
      /** 入れた住所の書き間違いを直して出した（「南大道り」→「南大通り」。lib/roadmap/address-fix.ts） */
      fix?: AddressFix;
      /** 入れた町名が見つからず、別の町（または市区町村の中心）を出している */
      miss?: AddressMiss;
      /** 住所ではなく、地図で選んだ地点（matchedAddress は町・大字まで） */
      picked?: true;
      /** 地番で探して見つかった筆（場所はこの筆の中。matchedAddress は町・大字まで）。地図で選んだ地点では、その地点の筆 */
      parcel?: Parcel;
      /** 同じ町に同じ地番の筆がほかにもあった数（小字違いなど） */
      parcelOthers?: number;
      /** ほかの候補（同じ地番の別の筆）。区分の名前（「字羽黒山」。地番区域に書かれていなければ空）と場所 */
      parcelAlts?: { label: string; lat: number; lng: number }[];
      /** 入力の小字・地割などを地図データで確かめられず、同じ地番の筆がほかにもある（どれが入力の土地かは決められない） */
      parcelUnsure?: true;
      /** 地番で探したが見つからなかったときの案内と、枝番違いなどの近い地番 */
      parcelMiss?: {
        chiban: string;
        reason: "not_found" | "no_map" | "error";
        similar: string[];
        /** 同じ地番が、入れた小字・地割・丁目とは別の所にあった（その区分の画面での言い方と、その地番を探し直す住所）。別の土地なので当てていない */
        elsewhere?: Elsewhere[];
        /** 同じ地番の筆は見つかったが、入れた町から遠く（3km 超）離れた別の町にあった（地図データの置き間違いのおそれ。場所としては出していない） */
        away?: { lat: number; lng: number; km: number; town: string };
      };
      /**
       * 国土地理院は住居表示（「14番1号」「22番」）として当てたが、入力が登記の書き方（「14番1」）なので地番の筆を出した。
       * その住居表示の住所（別の場所のことがあるので、画面で住居表示として探し直せるようにする）
       */
      jukyoAlt?: string;
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
/**
 * 国土地理院の住所に無い細かい区分（岩手の「第16地割」・小字など）を、地番の地図の区分で確かめて筆を見つけたときは、
 * 「入れた町名が見つからず、名前の近い別の町を出しています」とは言わない（出す場所はその筆で、町の代表点ではない）。
 * 入れた町名が見つかった町の名前の続き（「石鳥谷町好地」＋「第16地割」）で、筆の地番区域にその区分が書かれていて合うときだけ
 */
function withoutVerifiedMiss<T extends { miss?: AddressMiss }>(notes: T, sub: AddressSub | null, kuiki: string, town: string | null): T {
  const m = notes.miss;
  if (!m || m.kind !== "town" || !sub || !town) return notes;
  if (!townKey(m.typed).startsWith(townKey(m.found)) || !kuikiHasSub(kuiki, sub) || !kuikiAllows(kuiki, sub, town)) return notes;
  const rest = { ...notes };
  delete rest.miss;
  return rest;
}

export async function lookup(
  address: string,
  {
    parcels = pmtilesParcelSource,
    exact = false,
    loadIndex = loadParcelIndex,
  }: {
    parcels?: ParcelSource;
    /** 書き間違いを直さず、入れたとおりに探す */
    exact?: boolean;
    /** 地番の索引の読み方（試験で差し替える） */
    loadIndex?: (code: string) => Promise<ParcelIndex | null>;
  } = {},
): Promise<LookupResult> {
  const chiban = splitChiban(address);
  // 「地番」の語は外して調べる（国土地理院が番地まで持っていれば、その位置から筆を探せる）
  const query = chiban?.explicit ? `${chiban.body}${chiban.chiban}` : address;
  let candidates = await geocodeCandidates(query);
  // 書き間違い（市の抜け・町名の誤字・旧字・区の違い・合併前の市の名前）で町・市の中心や別の場所に当たったら、正式な名前で探し直す
  const fixed = exact ? null : await correctAddress(query, candidates);
  if (fixed && "choices" in fixed) return { status: "choose", candidates: fixed.choices.slice(0, 15), ...(fixed.omitted ? { omitted: true as const } : { near: true as const }) };
  if (fixed) candidates = fixed.candidates;
  if (candidates.length === 0) {
    // 住所検索がどの住所にも0件を返しているとき（障害など）は「見つからない」ではない
    if (!(await geocoderAlive())) throw new GeocoderUnavailable("住所検索が応答していません");
    return { status: "not_found" };
  }
  if (!fixed && needsChoice(address, candidates)) return { status: "choose", candidates: candidates.slice(0, 15) };
  let geo = candidates[0];
  // 入れた市区町村・町名がどれも見つからず、都道府県（県庁のあたり）や名前の頭が似ているだけの別の町村に当たったときは、
  // そこを物件の場所として出さない
  if (placeNotFound(query, geo.matchedAddress)) return { status: "not_found" };
  // 見つかった番地が入れた番地と食い違う（国土地理院が小字の漢数字を番地と読んだ）ときは、同じ町で番地の合う所を探し直す。
  // 無ければ番地は当てず、町の代表点にする（別の番地を「その住所」として出さない）
  if (!numbersAgree(address, geo.matchedAddress)) geo = await rematchNumbers(address, chiban, geo, candidates);
  // 入力の番号の区分（「10字」「第16地割」）を飛ばして番地だけで当てたときも、別の区分の番地のおそれがあるので、町の代表点にする
  // （番号の区分ごとに地番が振り直される町では、区分の違う同じ番地は別の土地）
  if (subAreaDropped(address, geo.matchedAddress) && matchedNumbers(geo.matchedAddress).length) geo = await townPoint(geo);
  // 「地番」と明示したのに住居表示の街区（「217番」）に当たったら、地番と取り違えないよう町の代表点から探す
  if (chiban?.explicit && isJukyo(geo.matchedAddress)) geo = (await geocodeCandidates(chiban.body))[0] ?? geo;
  const rev = await reverseGeocode(geo.lat, geo.lng);
  const municipality = rev && findMunicipality(rev.muniCd);
  if (!rev || !municipality) {
    return { status: "unsupported", lat: geo.lat, lng: geo.lng, muniCd: rev?.muniCd ?? "", matchedAddress: geo.matchedAddress };
  }
  const approximate = isApproximate(address, geo.matchedAddress);
  // 入れた住所と出す住所の違い（直した・別の町に当たった）。入れたとおりに探したときは「直した」とは言わない
  const said = describeMatch(query, geo.matchedAddress, fixed?.query);
  const notes = {
    ...(said?.fix && !exact ? { fix: { input: address, ...(fixed ? { query: fixed.query } : {}), ...said.fix } } : {}),
    ...(said?.miss ? { miss: said.miss } : {}),
  };
  let parcelMiss: Extract<LookupResult, { status: "ok" }>["parcelMiss"];
  // 住居表示（「1番」「1番1号」）まで一致した住所は、ふつうは地番ではないので探さない。町・大字まで、または「354番地」までの一致なら、
  // 地番の筆を探して位置（枝番まで）と筆の形を出す。ただし入力が登記の書き方（「14番1」「150番地」。号が無い）か、
  // 住居表示が街区（「22番」）までしか合わず枝番が残るときは、地番の筆を先に探す（見つからなければ住居表示の地点のまま）
  const jukyo = isJukyo(geo.matchedAddress);
  const asRegistry = !!chiban && jukyo && (registryStyle(address) || (!/号$/.test(geo.matchedAddress.normalize("NFKC")) && chiban.chiban.includes("-")));
  if (chiban && (chiban.explicit || !jukyo || asRegistry)) {
    const city = muniCity(rev.muniCd) ?? municipality.name;
    const town = townFromAddress(geo.matchedAddress, city);
    try {
      // 地番の索引（市区町村コードごと。あれば番号の入ったタイルを先に開く。無ければ null で今までの探し方）
      const index = town ? await loadIndex(rev.muniCd) : null;
      // 入れた住所に、見つかった町より細かい区分（丁目・地割・小字）があれば、筆の地番区域と照らし合わせる（同じ地番の別の土地を当てない）
      const sub = town ? addressSub(chiban.body, town, city) : null;
      // 町の名前のすぐ後ろに書かれた丁目（「上麻生1丁目5番3」）。丁目は地番区域の一部なので、丁目の無い地番区域・別の丁目の同じ地番は当てない
      const chome = town ? typedChome(chiban.body, town, city) : null;
      const r = town ? await searchParcel({ city, town, chiban: chiban.chiban, sub, chome }, geo, parcels, { index }) : ({ status: "no_map" } as const);
      // 見つけた筆が入れた町から遠く離れた別の町にあれば（図面ごと置き間違えた地図データのおそれ）、物件の場所としては出さない
      let away: ReturnType<typeof awayFrom> = null;
      if (r.status === "found") {
        const { lat, lng } = r.parcel.point;
        const prev = (await reverseGeocode(lat, lng)) ?? rev;
        away = awayFrom(r.parcel.point, geo, town, prev.town);
        const m = findMunicipality(prev.muniCd) ?? municipality;
        if (!away) return {
          status: "ok",
          lat,
          lng,
          matchedAddress: geo.matchedAddress.replace(/[0-9０-９][0-9０-９番地号の\-－]*$/, ""),
          town: prev.town,
          approximate: false,
          ...withoutVerifiedMiss(notes, sub, r.parcel.kuiki, town),
          parcel: r.parcel,
          parcelOthers: r.others,
          ...(r.alts?.length ? { parcelAlts: r.alts.map((a) => ({ label: kuikiSubLabel(a.kuiki), lat: a.point.lat, lng: a.point.lng })) } : {}),
          ...(r.unverified ? { parcelUnsure: true as const } : {}),
          ...(jukyo && !chiban.explicit ? { jukyoAlt: geo.matchedAddress } : {}),
          municipality: m,
          links: buildLinks(m, lat, lng, prev.town),
          contact: resolveContact(m, prev.muniCd),
        };
      }
      if (away) parcelMiss = { chiban: chiban.chiban, reason: "not_found", similar: [], away };
      // 国土地理院が番地まで見つけた住所で、ついでに筆を探しただけなら、見つからなくても何も言わない
      else if (r.status !== "found" && (chiban.explicit || approximate))
        parcelMiss = {
          chiban: chiban.chiban,
          reason: r.status,
          similar: r.status === "not_found" ? r.similar : [],
          ...(r.status === "not_found" && r.elsewhere?.length ? { elsewhere: elsewhereOf(r.elsewhere, geo.matchedAddress, chiban.chiban, chome != null) } : {}),
        };
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
    ...notes,
    ...(parcelMiss ? { parcelMiss } : {}),
    municipality,
    links: buildLinks(municipality, geo.lat, geo.lng, rev.town),
    contact: resolveContact(municipality, rev.muniCd),
  };
}

/**
 * 見つけた筆の場所が、入れた町から 3km より遠く、その場所の町（国土地理院の逆ジオコーダ。there）が入れた町と違えば、その場所と距離・町。
 * 法務省の地図データには、図面ごと別の町の上に置かれたものがある（いわき市中央台高久1丁目の図面が約10km 北の平絹谷に。2026-11-13 の地価公示の所在での確かめ）。
 * 広い大字で町の代表点から遠い筆（同じ町）や、町の境のすぐ外（3km 以内）は当てはまらない
 */
export function awayFrom(point: { lat: number; lng: number }, geo: { lat: number; lng: number }, town: string, there: string): { lat: number; lng: number; km: number; town: string } | null {
  const km = Math.hypot((point.lat - geo.lat) * 111.32, (point.lng - geo.lng) * 111.32 * Math.cos((geo.lat * Math.PI) / 180));
  if (km <= 3 || !there || sameTownName(there, town)) return null;
  return { lat: point.lat, lng: point.lng, km: Math.round(km * 10) / 10, town: there };
}

/**
 * 同じ地番が別の区分（地番区域）にあったときの案内：区分の画面での言い方と、その地番を探し直す住所。
 * 区分の付かない地番区域（label が空）は、入れた丁目を外した町の住所で探し直す（「上麻生一丁目」→「上麻生」）
 */
export function elsewhereOf(labels: string[], matchedAddress: string, lot: string, chome: boolean): Elsewhere[] {
  const town = matchedAddress.replace(/[0-9０-９][0-9０-９番地号の\-－]*$/, "");
  const bare = chome ? town.replace(/[0-9０-９一二三四五六七八九十]+丁目$/, "") : town;
  return labels.map((l) => ({ label: elsewhereLabel(l, chome), query: l ? `${town}${l}${lot}` : `${bare}${lot}` }));
}

/**
 * 見つかった番地が入れた番地と食い違うときの探し直し（geocode.ts の numbersAgree）。
 * (1) ほかの候補に、同じ町で番地の合うものがあれば使う。(2) 地番の書き方の入力なら、小字を外して「町＋地番」で聞き直す
 * （「松戸字三丁目1791番1」→「松戸1791番1」）。(3) どちらも無ければ、その町の代表点（番地は当てない。町までの一致になる）
 */
async function rematchNumbers(input: string, chiban: ReturnType<typeof splitChiban>, geo: GeocodeResult, candidates: GeocodeResult[]): Promise<GeocodeResult> {
  const town = withoutNumbers(geo.matchedAddress);
  const fits = (c: GeocodeResult) => withoutNumbers(c.matchedAddress) === town && matchedNumbers(c.matchedAddress).length > 0 && numbersAgree(input, c.matchedAddress);
  const other = candidates.find(fits);
  if (other) return other;
  // 番号の区分（「10字」「第16地割」）を書いた入力は、区分を外して聞き直すと別の区分の番地に当たるので聞き直さない
  if (chiban && !subAreaDropped(input, town)) {
    const [parent, branch] = splitLotHead(normalizeChiban(chiban.chiban))[1].split("-");
    const again = (await geocodeCandidates(`${town}${parent}番${branch ?? ""}`)).find(fits);
    if (again) return again;
  }
  return townPoint(geo);
}

/** 見つかった住所の町（番地を外したもの）の代表点。国土地理院が町だけで探して見つからなければ、地点はそのままで住所だけ町まで */
async function townPoint(geo: GeocodeResult): Promise<GeocodeResult> {
  const town = withoutNumbers(geo.matchedAddress);
  const rep = (await geocodeCandidates(town)).find((c) => c.matchedAddress === town);
  return rep ?? { ...geo, matchedAddress: town };
}

/** 国土地理院の住所が住居表示の街区・号（「1番」「1番1号」）まで一致しているか（「354番地」は地番による住所） */
const isJukyo = (matched: string) => /\d+番$|\d+号$/.test(matched.normalize("NFKC"));

/**
 * 入力の末尾が登記の地番の書き方か（「14番1」「22番39」「150番地」「391番地3」「1234番地の5」。住居表示は「14番1号」「14-1」と書く）。
 * 「地番」の語・甲乙・番外は splitChiban で外してから見る
 */
export function registryStyle(input: string): boolean {
  const s = input.normalize("NFKC").replace(/\s+/g, "").replace(/[(（]?地番[)）]?[:：]?/g, "");
  if (/号$/.test(s)) return false;
  return /\d+番地(?:の?\d+)?$/.test(s) || /\d+番の?\d+$/.test(s);
}

/** 逆ジオコーダの市区町村コード → 「さいたま市見沼区」「瑞穂町」（都県なし）。対応エリアの外は undefined */
export function muniCity(muniCd: string): string | undefined {
  for (const codes of Object.values(GSI_CODES as Record<string, Record<string, string>>)) if (codes[muniCd]) return codes[muniCd].replace(/\s/g, "");
  return undefined;
}

/** 逆ジオコーダの市区町村コード → 「埼玉県さいたま市西区」。対応エリアの外は undefined */
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
