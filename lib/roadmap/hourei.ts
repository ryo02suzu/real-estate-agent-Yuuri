// 土砂災害などに関わる法令の区域（砂防指定地・地すべり防止区域・急傾斜地崩壊危険区域・災害危険区域）。国土数値情報の
// データ（scripts/hourei/build.py。z14 のタイル）から、物件の地点を含む区域の種類・名前・告示番号・告示日を出す。
// どれも縮尺 1/25,000 程度の概略の位置で、重要事項説明の根拠には使えない（国土数値情報の注意事項）ので参考として出し、
// 指定した都県・市の資料で確かめる旨と、都県が利用条件で求める特記事項を添える
import SOURCE from "./data/hourei-source.json";
import type { LngLat, Polygon } from "./parcel";
import { inPolygon } from "./zoning";

/** 区域のタイルのズーム（z14 だけ） */
export const HOUREI_ZOOM = 14;

export type HoureiKind = "砂防指定地" | "地すべり防止区域" | "急傾斜地崩壊危険区域" | "災害危険区域";

/** タイルの種類の番号（t）→ 区域の種類 */
export const HOUREI_KINDS: Record<number, HoureiKind> = { 1: "砂防指定地", 2: "地すべり防止区域", 3: "急傾斜地崩壊危険区域", 4: "災害危険区域" };

/** 区域の種類 → 法令（重説の欄の名前）とデータの番号 */
export const HOUREI_LAWS: Record<HoureiKind, { law: string; code: "A52" | "A46" | "A47" | "A48" }> = {
  砂防指定地: { law: "砂防法", code: "A52" },
  地すべり防止区域: { law: "地すべり等防止法", code: "A46" },
  急傾斜地崩壊危険区域: { law: "急傾斜地法", code: "A47" },
  災害危険区域: { law: "建築基準法39条", code: "A48" },
};

export type HoureiArea = {
  kind: HoureiKind;
  /** 区域の名前（砂防指定地は河川・渓流の名前） */
  name?: string;
  /** 市区町村コード・名前 */
  city?: string;
  cityName?: string;
  /** 都県コード（2桁） */
  pref: string;
  /** 告示番号・告示日（「2005-04-06」か和暦の文字） */
  notice?: string;
  since?: string;
  /** 災害危険区域：指定の理由（急傾斜地崩壊・溶岩流など）と、指定した条例 */
  reason?: string;
  rule?: string;
  /** 災害危険区域を市町村が指定した。地すべり防止区域は所管（国土交通省・農林水産省・林野庁）を office に */
  byCity?: boolean;
  office?: string;
  polygons: Polygon[];
};

/** タイル (x, y)（z14）の区域。タイルが無ければ null（区域の無い所） */
export type HoureiSource = { tile(x: number, y: number): Promise<HoureiArea[] | null> };

export type HoureiHit = Omit<HoureiArea, "polygons">;

/** 地点の区域。hits が空なら国のデータでは区域外。missing は都県のデータが国のデータに無い種類 */
export type Hourei = { pref: string; hits: HoureiHit[]; missing: HoureiKind[] };

export const HOUREI_DATA = { url: process.env.NEXT_PUBLIC_HOUREI_PMTILES_URL || SOURCE.url, layer: "hr" };

/** 出典（CC BY 4.0 のとおり、加工したことを書く） */
export const HOUREI_CREDIT =
  "出典：「国土数値情報（砂防指定地データ・地すべり防止区域データ・急傾斜地崩壊危険区域データ・災害危険区域データ）」（国土交通省、https://nlftp.mlit.go.jp/ksj/）を加工して作成";

export const PREF_NAMES: Record<string, string> = { "08": "茨城県", "09": "栃木県", "10": "群馬県", "11": "埼玉県", "12": "千葉県", "13": "東京都", "14": "神奈川県" };

const YEARS = SOURCE.years as Record<string, Record<string, number>>;

/** 都県が利用条件で、成果物に明記するよう求めている特記事項（国土数値情報の都県別の利用条件） */
const NOTES: Partial<Record<HoureiKind, Record<string, string>>> = {
  地すべり防止区域: {
    "12": "本データの情報は利用している地図及びデータ作成上の誤差を含んでいます。",
    "13": "平成29年5月19日現在のもので、これ以降に区域を指定している場合があります。なお、区域の形状は概略であるため、実際に告示している区域の位置等の詳細については、東京都にお問合せをお願いします。",
    "14": "区域の形状は概略であるため、正式な区域の形状については、神奈川県の各土木事務所等で確認するようにしてください。",
  },
  急傾斜地崩壊危険区域: {
    "12": "本データの情報は利用している地図及びデータ作成上の誤差を含んでいます。",
    "13": "提供しているデータは、令和2年6月5日現在のもので、これ以降に区域を指定している場合があります。なお、実際に告示している区域の位置等の詳細については、東京都にお問合せをお願いします。",
    "14": "区域の形状は概略であるため、正式な区域の形状については、神奈川県の各土木事務所等で確認するようにしてください。",
  },
};

/** 砂防指定地のデータの時点（都県別。国土数値情報の案内） */
const SABO_AS_OF: Record<string, string> = { "08": "令和2年3月末", "09": "令和4年12月", "11": "令和4年3月末", "12": "令和4年3月末", "13": "平成30年3月末", "14": "令和5年3月末" };

/** 都県の特記事項（無ければ undefined） */
export function houreiNote(kind: HoureiKind, pref: string): string | undefined {
  return NOTES[kind]?.[pref];
}

/** その種類のデータの年度（都県別）。国のデータに無ければ undefined */
export function houreiYear(kind: HoureiKind, pref: string): number | undefined {
  return YEARS[HOUREI_LAWS[kind].code]?.[pref];
}

/** データの時点（「令和4年3月末時点」「2021年度」） */
export function houreiAsOf(kind: HoureiKind, pref: string): string | undefined {
  if (kind === "砂防指定地" && SABO_AS_OF[pref]) return `${SABO_AS_OF[pref]}時点`;
  const y = houreiYear(kind, pref);
  return y ? `${y}年度` : undefined;
}

function tileOf(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [Math.floor(((lng + 180) / 360) * n), Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n)];
}

const ORDER: HoureiKind[] = ["急傾斜地崩壊危険区域", "地すべり防止区域", "砂防指定地", "災害危険区域"];

/** 地点の区域。city は物件の市区町村コード。関東1都6県の外は null。区域の無い所にはタイルが無い */
export async function houreiAt(lat: number, lng: number, city: string, source: HoureiSource): Promise<Hourei | null> {
  const pref = city.slice(0, 2);
  if (!PREF_NAMES[pref]) return null;
  const areas = (await source.tile(...tileOf(lat, lng, HOUREI_ZOOM))) ?? [];
  const p: LngLat = [lng, lat];
  const seen = new Set<string>();
  const hits: HoureiHit[] = [];
  for (const a of areas) {
    if (!a.polygons.some((poly) => inPolygon(p, poly))) continue;
    // 同じ区域が分かれて入っていることがあるので、種類・名前・告示番号で1つにまとめる
    const key = `${a.kind}|${a.name}|${a.notice}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { polygons, ...hit } = a;
    void polygons;
    hits.push(hit);
  }
  hits.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const missing = ORDER.filter((k) => houreiYear(k, pref) === undefined);
  return { pref, hits, missing };
}

// ---- 画面・共有・下書きの文字 ----

/** 「2005-04-06」→「2005年4月6日」（和暦はそのまま） */
export function houreiDate(d?: string): string | undefined {
  const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : d;
}

/** 区域の名前。データの整理の書き込み（「会瀬 *R3確認済(不明)」の「*R3確認済(不明)」）は除く */
export function houreiName(raw?: string): string | undefined {
  return raw?.replace(/\s*[*＊]\s*R\d+確認済.*$/, "").trim() || undefined;
}

/** 告示番号の書き方をそろえる（「417」「733号」→「第417号」、「告示0285号」→「告示285号」。災害危険区域の「(急傾斜)」は除く） */
function noticeText(n: string): string {
  const s = n.replace(/[(（]急傾斜[)）]$/, "").trim().replace(/(^|\D)0+(?=\d+号)/, "$1");
  return /^\d+号?$/.test(s) ? `第${s.replace(/号$/, "")}号` : s;
}

/** 告示日の書き方をそろえる（「2005-04-06」→「2005年4月6日」、「平成03年03月15日」→「平成3年3月15日」） */
function dateText(d: string): string {
  return (houreiDate(d) ?? d).replace(/(^|\D)0(\d)(?=[年月日])/g, "$1$2");
}

/** 区域の告示（「第220号・1994年3月25日」）。告示が並ぶデータは、番号と日の数が同じなら組にして「／」でつなぐ */
export function houreiNotice(h: Pick<HoureiHit, "notice" | "since">): string {
  const ns = (h.notice ?? "").split(/[,、]/).map(noticeText).filter(Boolean);
  const ds = (h.since ?? "").split(/[,、]/).map((d) => d.trim()).filter(Boolean).map(dateText);
  if (ns.length > 1 && ns.length === ds.length) return [...new Set(ns.map((n, i) => `${n}・${ds[i]}`))].join("／");
  return [[...new Set(ns)].join("、"), [...new Set(ds)].join("、")].filter(Boolean).join("・");
}

/** 区域を指定した（確かめる先の）都県・市。市町村の境にまたがる区域は、指定した条例の市町村 */
export function houreiAuthority(h: HoureiHit): string {
  if (h.kind === "災害危険区域" && h.byCity && h.cityName) {
    const names = h.cityName.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
    return names.find((n) => h.rule?.startsWith(n)) ?? names[0];
  }
  return PREF_NAMES[h.pref] ?? "都県";
}

/** 確かめる担当（「砂防」「建築」）。地すべり防止区域は所管（国土交通省・農林水産省・林野庁）で担当が分かれる */
function houreiRoles(kind: HoureiKind, office?: string): string[] {
  if (kind === "災害危険区域") return ["建築"];
  if (kind !== "地すべり防止区域") return ["砂防"];
  if (!office) return ["砂防", "農林"];
  return [office.startsWith("農林水産省") ? "農地" : office === "林野庁" ? "治山" : "砂防"];
}

/** 確かめる窓口の言い方（「神奈川県（砂防の担当）」） */
export function houreiOffice(kind: HoureiKind, authority: string, office?: string): string {
  return `${authority}（${houreiRoles(kind, office).join("・")}の担当）`;
}

/** いくつかの種類をまとめた窓口（「東京都（砂防・農林の担当）」） */
export function houreiOfficeAll(kinds: HoureiKind[], authority: string): string {
  return `${authority}（${[...new Set(kinds.flatMap((k) => houreiRoles(k)))].join("・")}の担当）`;
}

/** 区域の補足（「矢上川（神奈川県告示第320号・1985年3月30日）」） */
export function houreiDetail(h: HoureiHit): string {
  const extra = houreiNotice(h);
  const reason = h.kind === "災害危険区域" ? [h.reason, h.rule].filter(Boolean).join("・") : undefined;
  return [h.name, extra && `（${extra}）`, reason && `（${reason}）`].filter(Boolean).join("");
}

/** 画面・下書きの短い注意（「国のデータ（2021年度）の概略の区域。重要事項説明には神奈川県（建築の担当）の資料で確認」） */
export function houreiCaution(h: HoureiHit): string {
  const asOf = houreiAsOf(h.kind, h.pref);
  return `国のデータ（${asOf ?? "時点の記載なし"}）の概略の区域。重要事項説明には${houreiOffice(h.kind, houreiAuthority(h), h.office)}の資料で確認`;
}

/** 共有・印刷の1行（「急傾斜地崩壊危険区域・災害危険区域（国のデータ・参考）」。区域外なら「区域外（国のデータ・参考）」） */
export function houreiLine(h: Hourei): string {
  return h.hits.length ? `${[...new Set(h.hits.map((x) => x.kind))].join("・")}（国のデータ・参考）` : "砂防指定地・地すべり防止区域・急傾斜地崩壊危険区域・災害危険区域の外（国のデータ・参考）";
}

/** 画面の短い名前（結果の画面の印・一覧の頭） */
export const HOUREI_SHORT: Record<HoureiKind, string> = { 急傾斜地崩壊危険区域: "急傾斜地", 地すべり防止区域: "地すべり", 砂防指定地: "砂防", 災害危険区域: "災害危険区域" };

export type HoureiGroup = { kind: HoureiKind; hits: HoureiHit[]; text: string };

/**
 * 種類ごとにまとめた区域の文。同じ名前の区域（もとの指定と追加の指定など）は告示を「／」でつなぎ、急傾斜地崩壊危険区域と
 * 同じ名前の災害危険区域（条例で急傾斜地崩壊危険区域を災害危険区域にしている都県・市）は「急傾斜地崩壊危険区域と同じ区域」とする
 */
export function houreiGroups(hits: HoureiHit[]): HoureiGroup[] {
  const steep = new Set(hits.filter((h) => h.kind === "急傾斜地崩壊危険区域").map((h) => h.name));
  return ORDER.filter((k) => hits.some((h) => h.kind === k)).map((kind) => {
    const hs = hits.filter((h) => h.kind === kind);
    const same = kind === "災害危険区域" ? hs.filter((h) => steep.has(h.name)) : [];
    const parts: string[] = [];
    if (same.length) {
      const rules = [...new Set(same.map((h) => h.rule).filter(Boolean))].join("・");
      parts.push(`急傾斜地崩壊危険区域と同じ区域${rules ? `（${rules}）` : ""}`);
    }
    const byName = new Map<string, HoureiHit[]>();
    for (const h of hs) if (!same.includes(h)) byName.set(h.name ?? "", [...(byName.get(h.name ?? "") ?? []), h]);
    // 告示が同じ区域（同じ告示で指定した渓流など）は名前を「・」でつなぐ
    const byNotice = new Map<string, string[]>();
    for (const [name, list] of byName) {
      const notices = [...new Set(list.map(houreiNotice).filter(Boolean))].join("／");
      const why = kind === "災害危険区域" ? [...new Set(list.flatMap((h) => [h.reason, h.rule]).filter(Boolean))].join("・") : "";
      const tail = `${notices ? `（${notices}）` : ""}${why ? `（${why}）` : ""}`;
      byNotice.set(tail, [...(byNotice.get(tail) ?? []), name || "名前の記載なし"]);
    }
    for (const [tail, names] of byNotice) parts.push(`${joinNames(names)}${tail}`);
    return { kind, hits: hs, text: parts.join("、") };
  });
}

/** 名前をつなぐ。頭が同じ（「早川水系須雲川 前榎沢」「早川水系須雲川 丸山沢」）なら頭は1回（「早川水系須雲川 前榎沢・丸山沢」） */
function joinNames(names: string[]): string {
  const head = names[0].includes(" ") ? names[0].slice(0, names[0].lastIndexOf(" ") + 1) : "";
  if (names.length < 2 || !head || !names.every((n) => n.startsWith(head) && n.length > head.length)) return names.join("・");
  return head + names.map((n) => n.slice(head.length)).join("・");
}

/**
 * 区域に入っているときの注意をまとめて1つ。同じ都県・市の担当は1つにまとめる
 * （「国のデータ（2021年度）の概略の区域。重要事項説明には神奈川県（砂防の担当）・横須賀市（建築の担当）の資料で確認」）
 */
export function houreiCautionAll(h: Hourei): string {
  const asOf = [...new Set(houreiGroups(h.hits).map((g) => houreiAsOf(g.kind, h.pref)).filter(Boolean))].join("・");
  const roles = new Map<string, Set<string>>();
  for (const x of h.hits) {
    const by = houreiAuthority(x);
    roles.set(by, new Set([...(roles.get(by) ?? []), ...houreiRoles(x.kind, x.office)]));
  }
  const offices = [...roles].map(([by, r]) => `${by}（${[...r].join("・")}の担当）`).join("・");
  return `国のデータ（${asOf || "時点の記載なし"}）の概略の区域。重要事項説明には${offices}の資料で確認`;
}

/** 結果の画面の都市計画の行に並べる印（区域に入っているときだけ。「急傾斜地」「災害危険区域」） */
export function houreiChips(h?: Hourei): string[] {
  return h ? houreiGroups(h.hits).map((g) => HOUREI_SHORT[g.kind]) : [];
}

/** 都県が利用条件で求める特記事項（その都県のもの）。同じ文は1つにして、当てはまる区域の種類を添える */
export function houreiNoteGroups(pref: string): { kinds: HoureiKind[]; note: string }[] {
  const out: { kinds: HoureiKind[]; note: string }[] = [];
  for (const kind of ["急傾斜地崩壊危険区域", "地すべり防止区域"] as HoureiKind[]) {
    const note = houreiNote(kind, pref);
    if (!note) continue;
    const same = out.find((g) => g.note === note);
    if (same) same.kinds.push(kind);
    else out.push({ kinds: [kind], note });
  }
  return out;
}

/** 特記事項を1つの文に（「東京都の区域のデータについて：（急傾斜地）…（地すべり）…」）。その都県に無ければ undefined */
export function houreiNotesLine(pref: string): string | undefined {
  const groups = houreiNoteGroups(pref);
  if (!groups.length) return undefined;
  const label = (g: (typeof groups)[number]) => (groups.length > 1 ? `（${g.kinds.map((k) => HOUREI_SHORT[k]).join("・")}）` : "");
  return `${PREF_NAMES[pref]}の区域のデータについて：${groups.map((g) => label(g) + g.note).join("")}`;
}
