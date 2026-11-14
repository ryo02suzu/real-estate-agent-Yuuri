// 物件の地点の小学校区・中学校区（通学区域）。国土数値情報の学校区（scripts/school-districts/build.py。z14 のタイル）から、
// 地点を含む区域の学校名・設置者・所在地と、学校までの距離（道路をたどった徒歩の目安。たどれなければ直線）を出す。区域は市区町村の教育委員会の資料をもとにした令和5年度の
// データで、見直されることがある。指定校は教育委員会で確かめるよう添える（市区町村によってはデータの利用条件でもそう求めている）
import type { LngLat, Polygon } from "./parcel";
import { SCHOOL_CREDIT, schoolGap, type SchoolKey } from "./school-data";
import { ROAD_CREDIT, routedOk, walkMinutes, walkTo } from "./walk";
import { inPolygon } from "./zoning";

/** 学校区のタイルのズーム（z14 だけ） */
export const SCHOOL_ZOOM = 14;

export type SchoolKind = "小学校" | "中学校";

export type School = {
  kind: SchoolKind;
  name: string;
  /** 設置者（「新宿区立」） */
  owner?: string;
  /** 所在地 */
  address?: string;
  /** 市区町村コード（政令市は市） */
  city: string;
  /** 市区町村ごとの一言（日光市の旧今市市など） */
  note?: string;
  /** 学校の位置（国土数値情報の学校データで分かったものだけ） */
  point?: LngLat;
};

export type SchoolArea = School & {
  polygons: Polygon[];
  /** その学校の区域の広さ（ha。区域が分かれていれば合計）。区域の広さを入れて作ったタイルだけ（scripts/school-districts/build.py の ar） */
  area?: number;
};

/** タイル (x, y)（z14）の学校区。タイルが無ければ null（データの無い所） */
export type SchoolSource = { tile(x: number, y: number): Promise<SchoolArea[] | null> };

export type SchoolHit = School & {
  /** 物件から学校までの直線距離（m）。学校の位置が分からなければ無し */
  distance?: number;
  /** 同じ地点を区域に含む、ほかの学校（国のデータで学校区が重なっている所。市内のどこからでも通える学校・入学者の選考のある学校・選べる区域など） */
  overlaps?: string[];
  /** 通学区域の指定が無い市区町村で、国のデータの学校名を置きかえたもの（学校の位置・距離は出さない） */
  choice?: true;
  /** 学校（の位置の点）までの道路距離（m）と徒歩の分数（80m を1分）。道路をたどれなければ無し */
  walk?: { meters: number; minutes: number };
};

export type Schools = {
  elementary?: SchoolHit;
  junior?: SchoolHit;
  /** 国のデータでは、この地点を区域に含むのが「住所で決まる指定校ではない学校」（NOT_ASSIGNED）だけだった種類。指定校は出さず、注意で知らせる */
  unassigned?: { kind: SchoolKind; name: string; what: string }[];
};

const M_PER_DEG_LAT = 110_950;

function distance(a: LngLat, b: LngLat): number {
  return Math.hypot((b[0] - a[0]) * M_PER_DEG_LAT * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * M_PER_DEG_LAT);
}

function tileOf(lat: number, lng: number, z: number): [number, number] {
  const n = 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [Math.floor(((lng + 180) / 360) * n), Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n)];
}

/**
 * 国のデータの学校区が、ふつうの指定校ではない市区町村（市区町村の公式ページで確かめたものだけ）。学校名を決まりの書き方に置きかえる。
 * 千代田区：区立中学校は通学区域が無く、麹町中学校・神田一橋中学校から選ぶ（学校選択制）。九段中等教育学校は受検で合格した人だけが入る
 * （区の公式「区立中学校の通学区域と学校選択」https://www.city.chiyoda.lg.jp/koho/kosodate/gakko/gakkosentaku.html）。
 * 国のデータ（令和5年度）は、区の全域を九段中等教育学校の区域にしている
 */
const NO_ZONE: Record<string, { kind: SchoolKind; was: RegExp; name: string; note: string }[]> = {
  "13101": [
    {
      kind: "中学校",
      was: /九段中等教育学校/,
      name: "麹町中学校・神田一橋中学校から選択",
      note: "千代田区の区立中学校は通学区域が無く、麹町中学校・神田一橋中学校から選びます（学校選択制）。九段中等教育学校は、受検で合格した人が入る学校です。",
    },
  ],
};

/**
 * 住所で決まる指定校ではない学校（市・教育委員会の公式の資料で確かめたものだけ）。国のデータでは市の全域がその学校の区域になっているが、
 * 指定校としては出さない（ほかの学校の区域と重なっていれば、ほかの学校を出す。その学校の区域しか無い地点は、指定校を出さずに注意で知らせる）。
 * 白石市：白石南小学校・白石南中学校（通称 白石きぼう学園）は、令和5年4月に開校した学びの多様化学校（不登校特例校）で、市内に住む児童生徒が通う
 * （文部科学省のサイトにある白石市教育委員会の資料 https://www.mext.go.jp/content/20240925-mxt_sisetujo-000036757_11.pdf）。
 * 小学校区は、福岡深谷・福岡八宮・福岡蔵本のあたりで、この学校の区域しか入っていない。
 * 川口市：川口市立高等学校附属中学校は、入学者選考のある中高一貫校。通学区域は川口市の全域（令和8年度の入学者選考から埼玉県の全域）
 * （川口市教育委員会定例会 令和7年4月1日の資料「川口市立高等学校附属中学校の生徒募集について」
 * https://www.city.kawaguchi.lg.jp/material/files/group/150/0706shiryou.pdf）。
 * 対応している地方の全部のタイルで、市の全域に重ねてある区域はこの3校（と千代田区の九段中等教育学校＝NO_ZONE）だけ（2026-11-14 の点検）
 */
const NOT_ASSIGNED: Record<string, { name: RegExp; what: string }[]> = {
  "04206": [{ name: /^白石南(小|中)学校$/, what: "学びの多様化学校（不登校の児童生徒のための学校）で、住所で決まる指定校ではありません" }],
  "11203": [{ name: /^川口市立高等学校附属中学校$/, what: "入学者選考のある中高一貫校で、住所で決まる指定校ではありません" }],
};
const notAssigned = (a: SchoolArea) => NOT_ASSIGNED[a.city]?.find((n) => n.name.test(a.name));

/** タイルの中に見えている区域の広さ（度の2乗。区域の広さの入っていない前の版のタイルで、同じタイルの中の区域どうしを比べるだけ） */
function areaOf(polygons: Polygon[]): number {
  const ring = (r: number[][]) => Math.abs(r.reduce((a, q, i) => a + q[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * q[1], 0)) / 2;
  return polygons.reduce((a, poly) => a + ring(poly[0]) - poly.slice(1).reduce((h, r) => h + ring(r), 0), 0);
}

/**
 * 地点の小学校区・中学校区。データの無い所（タイルが無い）は null、区域に入っていなければ空。
 * 国のデータには学校区が重なっている所がある（市内のどこからでも通える学校・入学者の選考のある学校の区域が、市の全域に重ねてある。
 * 選べる区域もある）。重なっていれば、いちばん狭い区域の学校（近所の学校）を出し、ほかの学校は overlaps に入れる。
 * 広さはタイルに入っている値（その学校の区域の合計）で比べる。タイルは区域を切って入れてあるので、タイルの中の形で比べると、
 * どちらの区域もタイルを覆っている所（白石市の郊外など）で同じ広さに見えてしまう。広さの入っていない前の版のタイルだけ、タイルの中の形で比べる。
 * 広さが同じ（差が2%未満）なら、データの順のまま
 */
export async function schoolsAt(lat: number, lng: number, source: SchoolSource): Promise<Schools | null> {
  const areas = await source.tile(...tileOf(lat, lng, SCHOOL_ZOOM));
  if (!areas) return null;
  const p: LngLat = [lng, lat];
  const out: Schools = {};
  for (const kind of ["小学校", "中学校"] as const) {
    const all = areas.filter((a) => a.kind === kind && a.polygons.some((poly) => inPolygon(p, poly)));
    // 住所で決まる指定校ではない学校（学びの多様化学校・入学者選考のある学校）の区域は、指定校の候補にしない
    const inside = all.filter((a) => !notAssigned(a));
    if (!inside.length) {
      const only = all[0] && notAssigned(all[0]);
      if (only) (out.unassigned ??= []).push({ kind, name: all[0].name, what: only.what });
      continue;
    }
    const real = inside.every((a) => a.area !== undefined);
    const found = inside.map((a) => ({ a, size: real ? a.area! : areaOf(a.polygons) }));
    const smallest = Math.min(...found.map((f) => f.size));
    // いちばん狭い区域（と、ほぼ同じ広さの区域）のうち、データの順で先のもの
    const first = found.find((f) => f.size <= smallest * 1.02) ?? found[0];
    const a = first.a;
    const others = [...new Set(found.filter((f) => f !== first && f.a.name !== a.name).map((f) => f.a.name))];
    const swap = NO_ZONE[a.city]?.find((z) => z.kind === kind && z.was.test(a.name));
    const hit: SchoolHit = swap
      ? { kind, name: swap.name, owner: a.owner, city: a.city, note: swap.note, choice: true }
      : {
          kind,
          name: a.name,
          owner: a.owner,
          address: a.address,
          city: a.city,
          note: a.note,
          point: a.point,
          distance: a.point ? distance(p, a.point) : undefined,
        };
    if (others.length) hit.overlaps = others;
    if (kind === "小学校") out.elementary = hit;
    else out.junior = hit;
  }
  return out;
}

/** 学区の下に出す注意（市区町村ごとの一言と、学校区が重なっている所の知らせ）。無ければ空 */
export function schoolNotes(schools: Schools): string[] {
  const hits = [schools.elementary, schools.junior].filter((h): h is SchoolHit => !!h);
  const notes = [...new Set(hits.map((h) => h.note).filter((n): n is string => !!n))];
  for (const u of schools.unassigned ?? [])
    notes.push(`国のデータでは、この地点の${u.kind}区は${u.name}の区域だけです。${u.name}は${u.what}。指定校は教育委員会で確かめてください。`);
  const over = hits.filter((h) => h.overlaps?.length).map((h) => `${h.kind}は${h.overlaps!.join("・")}`);
  if (over.length)
    notes.push(`国のデータでは、この地点はほかの学校の区域にも入っています（${over.join("、")}）。選べる区域・分校・統合の前後の学校・市内のどこからでも通える学校のことがあり、どちらが指定校かは、このデータでは決められません。指定校は教育委員会で確かめてください。`);
  return notes;
}

/**
 * 学校までの道路距離（国土地理院の道路中心線。lib/roadmap/walk.ts）を足す。道がつながらない・遠回りすぎる学校は直線のまま。
 * 道路のタイルが読めなくても、学区はそのまま返す
 */
export async function withSchoolWalks(lat: number, lng: number, schools: Schools, walk = walkTo): Promise<Schools> {
  const hits = [schools.elementary, schools.junior];
  const targets = hits.flatMap((h, id) => (h?.point ? [{ id, points: [h.point] }] : []));
  if (!targets.length) return schools;
  const dist = await walk(lat, lng, targets).catch(() => new Map<number, number>());
  const add = (h: SchoolHit | undefined, id: number): SchoolHit | undefined => {
    const d = dist.get(id);
    return h && h.distance !== undefined && routedOk(d, h.distance) ? { ...h, walk: { meters: d, minutes: walkMinutes(d) } } : h;
  };
  return { ...schools, elementary: add(schools.elementary, 0), junior: add(schools.junior, 1) };
}

// ---- 画面に出す文字 ----

/** 「約450m」「約1.2km」（直線） */
export function schoolDistanceText(m?: number): string | undefined {
  if (m === undefined) return undefined;
  return m < 1000 ? `約${Math.max(10, Math.round(m / 10) * 10)}m` : `約${(Math.round(m / 100) / 10).toFixed(1)}km`;
}

/** 距離（「徒歩約8分・約620m」。道路をたどれなければ「直線約450m」） */
export function schoolWayText(s: SchoolHit): string | undefined {
  if (s.walk) return `徒歩約${s.walk.minutes}分・${schoolDistanceText(s.walk.meters)}`;
  return s.distance !== undefined ? `直線${schoolDistanceText(s.distance)}` : undefined;
}

/** 1行（「戸塚第二小学校（新宿区立・徒歩約8分・約620m）」） */
export function schoolLine(s: SchoolHit): string {
  const extra = [s.owner, schoolWayText(s)].filter(Boolean).join("・");
  const line = extra ? `${s.name}（${extra}）` : s.name;
  // 国のデータで学校区が重なっている所は、書類にもほかの学校を書く（どちらが指定校かは、このデータでは決められない）
  return s.overlaps?.length ? `${line}。国のデータでは${s.overlaps.join("・")}の区域にも入っています` : line;
}

/** 学区の出典（共有・印刷・下書き）。徒歩の目安を出したときは道のりの出典も */
export function schoolCredit(s: Schools): string {
  return s.elementary?.walk || s.junior?.walk ? `${SCHOOL_CREDIT}。${ROAD_CREDIT}` : SCHOOL_CREDIT;
}

/** 見出し用の短い名前。国のデータで学校区が重なっている所は「山田小ほか」（1校に決められないことが、見出しでも分かるように） */
export function schoolLabel(s: Pick<SchoolHit, "name" | "overlaps">): string {
  return `${schoolShort(s.name)}${s.overlaps?.length ? "ほか" : ""}`;
}

/** 短い名前（「戸塚第二小」）。スマホの狭い所に */
export function schoolShort(name: string): string {
  // 「麹町中学校・神田一橋中学校から選択」（通学区域の指定が無い区）も「麹町中・神田一橋中から選択」に
  return name.replace(/小学校(?=$|・|から)/g, "小").replace(/中学校(?=$|・|から)/g, "中");
}

// ---- 出せなかった学校区 ----

/** 出せなかったわけ：terms 国のデータの利用条件で出せない市区町村・absent 国のデータに無い市区町村・outside 地点を含む区域がデータに無い */
export type SchoolGapWhy = "terms" | "absent" | "outside";
export type SchoolGapItem = { key: SchoolKey; label: "小学校区" | "中学校区"; why: SchoolGapWhy };

/**
 * 地点で出せなかった学校区（小学校区・中学校区）とわけ。muniCd は地点の市区町村（政令市は区のコードでもよい）。
 * schools は地点で見つかった学校区（データの無い所では空か null）
 */
export function schoolGaps(muniCd: string, schools: Schools | null | undefined): SchoolGapItem[] {
  const out: SchoolGapItem[] = [];
  for (const [key, label, hit] of [
    ["es", "小学校区", schools?.elementary],
    ["jh", "中学校区", schools?.junior],
  ] as const) {
    if (hit) continue;
    out.push({ key, label, why: schoolGap(muniCd, key) ?? "outside" });
  }
  return out;
}

/** 短いわけ（「利用条件で出せない市」「国のデータに無い市」「この地点の区域がデータに無い」）。市区町村の最後の字で「市・区・町・村」 */
export function schoolGapShort(why: SchoolGapWhy, city: string): string {
  const unit = /[市区町村]$/.test(city) ? city.slice(-1) : "市区町村";
  return why === "terms" ? `利用条件で出せない${unit}` : why === "absent" ? `国のデータに無い${unit}` : "この地点の区域がデータに無い";
}

/**
 * わけの説明（同じわけはまとめる）。「桐生市の小学校区は、国のデータ（国土数値情報）の利用条件で、このアプリには出せません。」
 * 最後に「指定校は〇〇市の教育委員会で確かめてください。」
 */
export function schoolGapText(gaps: SchoolGapItem[], city: string): string {
  if (!gaps.length) return "";
  const parts: string[] = [];
  for (const why of ["terms", "absent", "outside"] as const) {
    const g = gaps.filter((x) => x.why === why);
    if (!g.length) continue;
    const what = g.length === 2 ? "小学校区・中学校区" : g[0].label;
    parts.push(
      why === "terms"
        ? `${city}の${what}は、国のデータ（国土数値情報）の利用条件で、このアプリには出せません。`
        : why === "absent"
          ? `${city}の${what}は、国のデータ（国土数値情報）にありません。`
          : `この地点を含む${what}が、国のデータ（国土数値情報）にありません（区域の境目や、区域の決まっていない所など）。`,
    );
  }
  return `${parts.join("")}指定校は${city}の教育委員会で確かめてください。`;
}
