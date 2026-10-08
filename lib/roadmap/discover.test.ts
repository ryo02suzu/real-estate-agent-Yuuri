// 新しく公開された道路の地図の自動発見。市区町村が新しく出した「建築基準法上の道路」の地図を探し、
// まだアプリに入っていないものを discover-report.md に書く（GitHub Actions が Issue で知らせる）。
// ネットにつなぐので通常のテストでは動かさない。DISCOVER=1 で実行し、毎週まわす（.github/workflows/discover.yml）。
//
// 探す先:
//  - ArcGIS Online の全体検索（行田市・つくば市のように ArcGIS で公開する市が増えている）
//  - wagmap（行政地図の共通基盤）を使う市のポータルの地図一覧
// 一度知らせたものは data/discover-seen.json に記録し、次からは知らせない。調べて使わないと決めたものは
// data/discover-ignore.json に理由つきで書く。
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import IGNORE from "./data/discover-ignore.json";
import SEEN from "./data/discover-seen.json";
import { MUNICIPALITIES, buildLinks, findMunicipality, reverseGeocode, type Municipality } from "./index";

const DATA_DIR = join(process.cwd(), "lib/roadmap/data");
/** 道路種別（建築基準法上の道路）の地図らしい名前 */
const ROAD_TYPE_RE = /指定道路|道路種別|建築基準法|位置指定|42条|４２条|２項道路|2項道路|二項道路|道路判定/;
/** 公道（道路台帳・認定路線）の地図らしい名前。ネット非公開・一部の市で参考になる */
const PUBLIC_ROAD_RE = /道路台帳|認定路線|路線網|道路網|市道|町道|区道/;
/** 関東1都6県（伊豆・小笠原諸島を除く）の範囲 [西, 南, 東, 北] */
const KANTO = [138.38, 34.85, 140.9, 37.16];
const ARCGIS = "https://www.arcgis.com/sharing/rest";
const QUERIES = ["指定道路", "指定道路図", "建築基準法 道路", "建築基準法上の道路", "道路種別", "位置指定道路", "42条 道路", "2項道路", "道路判定"];
const APP_TYPES = new Set(["Web Experience", "Web Map", "Web Mapping Application", "Dashboard", "Application", "StoryMap", "Hub Site Application"]);
const DATA_TYPES = new Set(["Feature Service", "Map Service", "Vector Tile Service"]);

type Item = { id: string; title: string; type: string; owner: string; snippet?: string; url?: string; extent?: number[][]; modified: number };
type Candidate = { key: string; city: string; title: string; kind: string; url: string; note: string };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (michilu map discovery)" }, signal: AbortSignal.timeout(30_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (michilu map discovery)" }, signal: AbortSignal.timeout(30_000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const intersectsKanto = (e?: number[][]) => !!e?.length && e[0][0] < KANTO[2] && e[1][0] > KANTO[0] && e[0][1] < KANTO[3] && e[1][1] > KANTO[1];

/** タイトルなどに関東の市区町村名が出てくれば、その名前 */
function kantoCityIn(text: string): string | undefined {
  // 「府中市」（広島県にもある）など同名の市があるので、名前が出てくるだけでは関東と決めない（範囲が分からないときの手がかり）
  return MUNICIPALITIES.find((m) => m.name.length >= 3 && text.includes(m.name))?.name;
}

/** 範囲の中心にある市区町村（関東の外なら undefined） */
async function cityAt(e: number[][]): Promise<string | undefined> {
  try {
    const rev = await reverseGeocode((e[0][1] + e[1][1]) / 2, (e[0][0] + e[1][0]) / 2);
    const m = rev && findMunicipality(rev.muniCd);
    return m ? `${m.pref}${m.name}` : undefined;
  } catch {
    return undefined;
  }
}

/** Experience・Web アプリ・ダッシュボードは範囲を持たないことが多いので、中で使う Web マップの範囲を見る */
async function extentOf(item: Item): Promise<number[][] | undefined> {
  if (item.extent?.length) return item.extent;
  for (const id of [...(await innerIds(item.id, item.type)).ids].slice(0, 5)) {
    const it = await getJson<Item>(`${ARCGIS}/content/items/${id}?f=json`);
    if (it?.extent?.length) return it.extent;
  }
  return undefined;
}

/** ArcGIS のアイテムが中で使う Web マップ・レイヤのアイテムID と、サービスの URL */
async function innerIds(id: string, type?: string): Promise<{ ids: Set<string>; services: Set<string> }> {
  const ids = new Set<string>();
  const services = new Set<string>();
  const t = type ?? (await getJson<Item>(`${ARCGIS}/content/items/${id}?f=json`))?.type;
  // Experience Builder の設定は別ファイル
  const text =
    t === "Web Experience" ? await getText(`${ARCGIS}/content/items/${id}/resources/config/config.json?f=json`) : await getText(`${ARCGIS}/content/items/${id}/data?f=json`);
  for (const m of (text ?? "").matchAll(/"(?:itemId|webmap|id)"\s*:\s*"([0-9a-f]{32})"/g)) if (m[1] !== id) ids.add(m[1]);
  for (const m of (text ?? "").matchAll(/"url"\s*:\s*"(https?:[^"]+?\/(?:Feature|Map|VectorTile)Server)\b/g)) services.add(serviceKey(m[1]));
  return { ids, services };
}

const serviceKey = (url: string) => url.replace(/^http:/, "https:").replace(/\/(\d+)?$/, "").toLowerCase();

/** アプリのデータに既に入っている ArcGIS のアイテムID と、wagmap の「ホスト/市/mid」 */
function known(): { arcgis: Set<string>; wagmap: Set<string> } {
  const arcgis = new Set<string>();
  const wagmap = new Set<string>();
  const files = readdirSync(DATA_DIR, { withFileTypes: true }).filter((e) => e.isFile() && /\.ts$/.test(e.name));
  for (const f of [...files.map((e) => join(DATA_DIR, e.name)), join(process.cwd(), "lib/roadmap/vendors.ts")])
    for (const m of readFileSync(f, "utf8").matchAll(/[0-9a-f]{32}/g)) arcgis.add(m[0]);
  for (const m of MUNICIPALITIES)
    for (const l of buildLinks(m, 35.7, 139.7)) {
      const w = l.url.match(/^https:\/\/([^/]+)\/([^/]+)\/Map\?mid=(\d+)/);
      if (w) wagmap.add(`${w[1]}/${w[2]}/${w[3]}`);
    }
  return { arcgis, wagmap };
}

/**
 * 既に入っている地図（Experience・Web アプリ）が中で使う Web マップ・レイヤも既知にする。
 * 行田市の Experience の元の Web マップや、埼玉県の地図に載る町ごとのレイヤを「新しい地図」と知らせないため
 */
async function expandKnown(ids: Set<string>): Promise<{ ids: Set<string>; services: Set<string> }> {
  const all = new Set(ids);
  const services = new Set<string>();
  let frontier = [...ids];
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const inner = await innerIds(id);
      for (const s of inner.services) services.add(s);
      for (const x of inner.ids)
        if (!all.has(x)) {
          all.add(x);
          next.push(x);
        }
    }
    frontier = next;
  }
  return { ids: all, services };
}

/** 地図の名前に出てくる市町村（同じ都県の中で探す。「境町」のような2文字の名前もあるので長い名前から） */
function cityInName(name: string, pref: string): Municipality | undefined {
  const n = name.replace(/[ヶヵ]/g, "ケ");
  return MUNICIPALITIES.filter((m) => m.pref === pref)
    .sort((a, b) => b.name.length - a.name.length)
    .find((m) => n.includes(m.name.replace(/[ヶヵ]/g, "ケ")));
}

describe.skipIf(!process.env.DISCOVER)("新しく公開された道路の地図の自動発見", () => {
  it("ArcGIS Online と wagmap のポータルを調べる", { timeout: 20 * 60_000 }, async () => {
    const { arcgis, wagmap: knownWag } = known();
    const { ids: knownIds, services: knownServices } = await expandKnown(arcgis);
    const ignore = IGNORE as Record<string, string>;
    const seen = { ...(SEEN as Record<string, string>) };
    const skip = (key: string) => key in ignore || key in seen;
    const apps: Candidate[] = [];
    const dataOnly: Candidate[] = [];
    const publicRoad: Candidate[] = [];
    const errors: string[] = [];

    // --- ArcGIS Online ------------------------------------------------------------
    const items = new Map<string, Item>();
    for (const q of QUERIES) {
      const r = await getJson<{ results?: Item[] }>(`${ARCGIS}/search?f=json&num=100&sortField=modified&sortOrder=desc&q=${encodeURIComponent(q)}`);
      if (!r) errors.push(`ArcGIS の検索に失敗: ${q}`);
      for (const it of r?.results ?? []) items.set(it.id, it);
    }
    for (const it of items.values()) {
      const key = `arcgis:${it.id}`;
      if (knownIds.has(it.id) || (it.url && knownServices.has(serviceKey(it.url))) || skip(key)) continue;
      const text = `${it.title} ${it.snippet ?? ""}`;
      if (!ROAD_TYPE_RE.test(text)) continue;
      const isApp = APP_TYPES.has(it.type);
      if (!isApp && !DATA_TYPES.has(it.type)) continue;
      const extent = await extentOf(it);
      const named = kantoCityIn(`${text} ${it.owner}`);
      if (extent ? !intersectsKanto(extent) : !named) continue;
      // 名前に市町村が無ければ、範囲の中心の市町村を手がかりにする（全国・地方全体の範囲のものは除く）
      const center = extent && !named ? await cityAt(extent) : undefined;
      if (!named && !center && extent && extent[1][0] - extent[0][0] > 2) continue;
      const city = named ?? (center ? `${center}あたり` : "（関東の範囲）");
      const url = it.url && /^https?:/.test(it.url) ? it.url : `https://www.arcgis.com/home/item.html?id=${it.id}`;
      const c = { key, city, title: it.title, kind: it.type, url, note: `所有者 ${it.owner}・更新 ${new Date(it.modified).toISOString().slice(0, 10)}` };
      (isApp ? apps : dataOnly).push(c);
    }

    // --- wagmap のポータル -----------------------------------------------------------
    // 県のポータル（茨城県・群馬県）は多くの市町村が使うので、ポータルごとに使う市町村をすべて持つ
    const portals = new Map<string, Municipality[]>();
    for (const m of MUNICIPALITIES)
      for (const l of buildLinks(m, 35.7, 139.7)) {
        const w = l.url.match(/^https:\/\/([^/]+)\/([^/]+)\/Map\?mid=/);
        if (!w) continue;
        const users = portals.get(`${w[1]}/${w[2]}`) ?? [];
        if (!users.includes(m)) portals.set(`${w[1]}/${w[2]}`, [...users, m]);
      }
    for (const [portal, users] of portals) {
      const html = await getText(`https://${portal}/Portal`);
      if (!html) {
        errors.push(`wagmap のポータルが開けない: https://${portal}/Portal`);
        continue;
      }
      for (const [, mid, raw] of html.matchAll(/"MapId":(\d+),"MapName":"([^"]+)"/g)) {
        const key = `wagmap:${portal}/${mid}`;
        if (knownWag.has(`${portal}/${mid}`) || skip(key)) continue;
        const name = raw.trim();
        // 地図の名前に市町村名があればその市町村。無ければ、ポータルを使うのが1市町村ならそこ、県のポータルなら県
        const m = cityInName(name, users[0].pref) ?? (users.length === 1 ? users[0] : undefined);
        const city = m ? `${m.pref}${m.name}` : `${users[0].pref}（県のポータル）`;
        const c = { key, city, title: name, kind: "wagmap", url: `https://${portal}/Map?mid=${mid}`, note: `mid=${mid}` };
        if (ROAD_TYPE_RE.test(name)) apps.push(c);
        else if (m?.coverage !== "full" && PUBLIC_ROAD_RE.test(name)) publicRoad.push(c);
      }
    }

    const all = [...apps, ...dataOnly, ...publicRoad];
    for (const c of all) seen[c.key] = `${new Date().toISOString().slice(0, 10)} ${c.city} ${c.title}`.slice(0, 120);
    if (all.length) writeFileSync(join(DATA_DIR, "discover-seen.json"), JSON.stringify(Object.fromEntries(Object.entries(seen).sort()), null, 1) + "\n");

    const row = (c: Candidate) => `| ${c.city} | ${c.title.replace(/\|/g, "／")} | ${c.kind} | ${c.note} | [開く](${c.url}) |`;
    const table = (title: string, lead: string, cs: Candidate[]) =>
      cs.length ? ["", `## ${title}`, "", lead, "", "| 市区町村 | 名前 | 種類 | メモ | URL |", "|---|---|---|---|---|", ...cs.map(row)] : [];
    const report = [
      `# 新しく公開された可能性のある道路の地図（${new Date().toISOString().slice(0, 10)}）`,
      "",
      `道路種別の地図 ${apps.length} 件 / 地図はまだ無くデータだけ ${dataOnly.length} 件 / 公道の地図 ${publicRoad.length} 件`,
      ...table(
        "道路種別（建築基準法上の道路）の地図",
        "物件の位置で開けるか確かめて lib/roadmap/data に入れる。使わないものは lib/roadmap/data/discover-ignore.json に理由を書く。",
        apps,
      ),
      ...table("データだけ（公開の地図にはまだ載っていない可能性）", "市が公開の地図を出したら全種別に上げられるかもしれない。", dataOnly),
      ...table("公道（道路台帳・認定路線）の地図（ネット非公開・一部の市）", "参考の地図として追加できるか確かめる。", publicRoad),
      ...(errors.length ? ["", "## 調べられなかったもの", "", ...errors.map((e) => `- ${e}`)] : []),
    ].join("\n");
    writeFileSync("discover-report.md", report + "\n");
    writeFileSync("discover.json", JSON.stringify({ found: all.length }));
    console.log(report);
  });
});
