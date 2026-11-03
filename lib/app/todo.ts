// 「要注意点と次にやること」（スマホ）の並べ方：次にやることを行き先ごと（法務局 → 市区町村の窓口 → ハザードマップ → 県などの担当 →
// 水道・ガス → 現地）にまとめ、問題になりそうな所（lib/app/triage.ts の issues）がどのやることで確かめられるかをつなぐ。
// やることごとに、確かめた結果を書き込む欄（lib/records.ts の確認事項）と、よく使う答えの札を持つ。
// 画面の見た目は持たない（components/app/todo-sheet.tsx が使う）。法令の判断はしない（答えの札は窓口で聞いた言葉を写すためのもの）
import type { PropertyRecords, RecordTopic } from "../records";
import type { NearbyRoad } from "../roadmap/road-read";
import type { Zoning } from "../roadmap/zoning";
import type { Action, Issue, Triage } from "./triage";

export type TodoGroupKey = "houmu" | "city" | "map" | "pref" | "life" | "site";

/** 行き先のまとまり（並びは1日に回る順の目安：謄本・公図を先に取ると、役所で地番を言える） */
export const TODO_GROUPS: { key: TodoGroupKey; title: (city: string, pref: string) => string; sub: string }[] = [
  { key: "houmu", title: () => "法務局", sub: "謄本・公図（登記情報提供サービスでも）" },
  { key: "city", title: (city) => `${city}の窓口`, sub: "建築・道路・都市計画・文化財" },
  { key: "map", title: (city) => `${city}のハザードマップ`, sub: "ネットで見られます" },
  { key: "pref", title: (_, pref) => `${pref}などの担当`, sub: "盛土・砂防・農地・森林の区域" },
  { key: "life", title: () => "水道・下水道・ガス", sub: "引込み・本管・口径" },
  { key: "site", title: () => "現地", sub: "道路の幅・境界・擁壁・引込み" },
];

/** やることの行き先 */
export function groupOf(id: string): TodoGroupKey {
  switch (id) {
    case "touki":
      return "houmu";
    case "hazard":
      return "map";
    case "morido":
    case "hourei":
    case "tochi":
      return "pref";
    case "utility":
      return "life";
    case "site":
      return "site";
    default:
      // road・chosei・toshi・iseki・building など
      return "city";
  }
}

/** 問題になりそうな所を、確かめるやることへ（どれにも当たらない法令の注意は、都市計画の窓口へ） */
export function actionOfIssue(issue: Issue): string {
  const id = issue.id;
  if (id === "senbiki") return "chosei";
  if (id === "morido") return "morido";
  if (/^hourei/.test(id)) return "hourei";
  if (/^(park|agri|forest)/.test(id)) return "tochi";
  if (id === "old-building") return "building";
  switch (issue.topic) {
    case "road":
      return "road";
    case "zoning":
      return "toshi";
    case "law":
      return "toshi";
    case "hazard":
      return "hazard";
    case "place":
      return "touki";
    case "building":
      return "building";
    case "utility":
      return "utility";
  }
}

export type TodoItem = { action: Action; issues: Issue[]; special: boolean };
export type TodoGroup = { key: TodoGroupKey; title: string; sub: string; items: TodoItem[] };

/**
 * 次にやることを行き先ごとにまとめる。つながる問題があるやることは「この物件で特に」（special）で、まとまりの中の先頭に。
 * 問題のうち、確かめるやることが無いものは、いちばん近いやること（法務局・市の窓口）へ寄せずに issues に残す（画面では問題の側に出る）
 */
export function buildTodo(t: Triage, city: string, pref: string): { groups: TodoGroup[]; linked: Map<string, string> } {
  const ids = new Set(t.actions.map((a) => a.id));
  const linked = new Map<string, string>();
  for (const i of t.issues) {
    const a = actionOfIssue(i);
    if (ids.has(a)) linked.set(i.id, a);
  }
  const groups: TodoGroup[] = [];
  for (const g of TODO_GROUPS) {
    const items: TodoItem[] = t.actions
      .filter((a) => groupOf(a.id) === g.key)
      .map((action) => {
        const issues = t.issues.filter((i) => linked.get(i.id) === action.id);
        return { action, issues, special: issues.length > 0 };
      })
      .sort((a, b) => Number(b.special) - Number(a.special) || a.action.priority - b.action.priority);
    if (items.length) groups.push({ key: g.key, title: g.title(city, pref), sub: g.sub, items });
  }
  return { groups, linked };
}

/**
 * 確かめた結果を書き込む欄：確認の記録（topic・sub）と、よく使う答えの札。unit は数字の欄の単位（数字だけ書いたら付ける）。
 * short は書いた結果を札で見せるときの頭（無ければ値だけ）
 */
export type ResultField = { topic: RecordTopic; sub: string; label: string; short?: string; chips: string[]; unit?: string; placeholder?: string };

export const RESULT_FIELDS: Record<string, ResultField[]> = {
  road: [
    { topic: "road", sub: "kind", label: "道路種別", chips: ["42条1項1号", "42条1項2号", "42条1項3号", "42条1項5号（位置指定）", "42条2項", "43条2項", "建築基準法の道路ではない"] },
    { topic: "road", sub: "width", label: "幅員", short: "幅員", chips: ["4m未満", "4m", "6m"], unit: "m", placeholder: "例：4.5" },
    { topic: "road", sub: "setback", label: "セットバック", short: "セットバック", chips: ["不要", "要", "済み"] },
    { topic: "road", sub: "frontage", label: "接道の長さ", short: "接道", chips: [], unit: "m", placeholder: "例：6.2" },
  ],
  chosei: [{ topic: "zoning", sub: "chiku", label: "窓口の回答（調整区域での建築）", short: "調整区域", chips: ["許可を受けて建築できる", "建築できない", "要相談"] }],
  toshi: [
    { topic: "zoning", sub: "youto", label: "用途地域", chips: [] },
    { topic: "zoning", sub: "ratio", label: "建ぺい率・容積率", short: "建ぺい・容積", chips: [], placeholder: "例：60%・200%" },
    { topic: "zoning", sub: "koudo", label: "高度地区・防火", chips: ["指定なし"] },
    { topic: "zoning", sub: "chiku", label: "地区計画など", short: "地区計画", chips: ["なし", "あり"] },
  ],
  morido: [{ topic: "law", sub: "kuiki", label: "盛土規制法の区域", short: "盛土規制法", chips: ["区域外", "宅地造成等工事規制区域", "特定盛土等規制区域"] }],
  hourei: [{ topic: "law", sub: "kuiki", label: "砂防・急傾斜地などの区域", short: "砂防など", chips: ["区域外", "区域内"] }],
  tochi: [{ topic: "law", sub: "kuiki", label: "自然公園・農地・森林", short: "自然公園など", chips: ["該当なし", "該当あり"] }],
  iseki: [{ topic: "law", sub: "iseki", label: "埋蔵文化財包蔵地", short: "埋蔵文化財", chips: ["包蔵地ではない", "包蔵地（届出が要る）", "包蔵地の近く"] }],
  utility: [{ topic: "law", sub: "lifeline", label: "上下水道・ガス", chips: ["上水・下水・都市ガスあり", "浄化槽", "プロパンガス", "引込みが要る"] }],
  hazard: [
    { topic: "hazard", sub: "flood", label: "洪水・内水", short: "洪水", chips: ["区域外", "0.5m未満", "0.5〜3m", "3m以上"] },
    { topic: "hazard", sub: "dosha", label: "土砂災害", short: "土砂", chips: ["区域外", "警戒区域", "特別警戒区域"] },
    { topic: "hazard", sub: "tsunami", label: "津波・高潮", short: "津波・高潮", chips: ["区域外", "区域内"] },
  ],
  touki: [{ topic: "parcel", sub: "touki", label: "登記の地番・地目・地積", chips: [], placeholder: "例：123-4・宅地・150.25㎡" }],
  site: [
    { topic: "around", sub: "site", label: "現地で見たこと", chips: ["境界標あり", "境界標なし", "擁壁あり", "越境あり"] },
    { topic: "parcel", sub: "boundary", label: "境界", short: "境界", chips: ["確定", "未確定", "越境あり"] },
  ],
};

const fieldKey = (f: Pick<ResultField, "topic" | "sub">) => `${f.topic}.${f.sub}`;

/** 2つ以上のやることが書く確認事項（盛土・砂防・自然公園は「宅造・盛土・土砂などの区域」に、調整区域と地区計画は「地区計画・その他の規制」に） */
const SHARED: ReadonlySet<string> = (() => {
  const n = new Map<string, number>();
  for (const fields of Object.values(RESULT_FIELDS)) for (const f of fields) n.set(fieldKey(f), (n.get(fieldKey(f)) ?? 0) + 1);
  return new Set([...n].filter(([, c]) => c > 1).map(([k]) => k));
})();

/** 2つ以上のやることが書くメモの区切り（「盛土規制法の区域：区域外／砂防・急傾斜地などの区域：区域内」） */
const SEP = "／";

/** 欄の今の値（確認の記録のメモから）。2つ以上のやることが書く確認事項は、自分の見出しの付いた所だけ */
export function fieldValue(note: string | undefined, f: ResultField): string {
  if (!note) return "";
  if (!SHARED.has(fieldKey(f))) return note;
  const head = `${f.label}：`;
  return note.split(SEP).find((s) => s.startsWith(head))?.slice(head.length) ?? "";
}

/** 欄の値を書いたあとのメモ。2つ以上のやることが書く確認事項は、ほかの見出しの所を残して自分の所だけ入れ替える（空なら消す） */
export function mergeNote(note: string | undefined, f: ResultField, value: string): string | undefined {
  const v = value.trim();
  if (!SHARED.has(fieldKey(f))) return v || undefined;
  const head = `${f.label}：`;
  const rest = (note ?? "").split(SEP).filter((s) => s && !s.startsWith(head));
  const next = [...rest, ...(v ? [head + v] : [])].join(SEP);
  return next || undefined;
}

/** 書いた値に単位を足す（数字だけ書いたとき：「4.5」→「4.5m」） */
export function withUnit(f: ResultField, value: string): string {
  const v = value.trim().normalize("NFKC");
  return f.unit && /^\d+(\.\d+)?$/.test(v) ? `${v}${f.unit}` : value.trim();
}

/** 書いた結果の札（値。頭のある欄は「幅員 4m」） */
export function resultChip(f: ResultField, value: string): string {
  return f.short ? `${f.short} ${value}` : value;
}

/** やることの、書いた結果の札（確認済みの記録だけ）。無ければ空 */
export function resultChips(id: string, records: PropertyRecords | undefined): string[] {
  const out: string[] = [];
  for (const f of RESULT_FIELDS[id] ?? []) {
    const r = records?.items[f.topic]?.[f.sub];
    const v = r?.done ? fieldValue(r.note, f) : "";
    if (v) out.push(resultChip(f, v));
  }
  return out;
}

/** データで読んだ値（答えの札の先頭に「データ」として出し、押すとその値が入る）。確認事項（topic.sub）ごと */
export function dataHints(zoning: Zoning | undefined, roads: NearbyRoad[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const y = zoning?.youto ?? [];
  if (y.length) out["zoning.youto"] = [...new Set(y.map((v) => v.name))].join("・");
  if (y[0]?.bcr && y[0]?.far) out["zoning.ratio"] = `${y[0].bcr}%・${y[0].far}%`;
  const koudo = [zoning?.bouka, zoning?.koudoti ? "高度地区" : ""].filter(Boolean).join("・");
  if (koudo) out["zoning.koudo"] = koudo;
  const near = roads?.length ? [...roads].sort((a, b) => a.distance - b.distance)[0] : undefined;
  if (near) {
    const m = near.label.normalize("NFKC").match(/42条(?:第)?(\d)項(?:(?:第)?(\d)号)?/);
    out["road.kind"] = m ? (m[2] ? `42条${m[1]}項${m[2]}号` : `42条${m[1]}項`) : near.label.normalize("NFKC");
    if (near.width) out["road.width"] = near.width;
  }
  return out;
}

/** 確かめた方法の初めの値（現地は現地、ハザードマップは公式サイト、ほかは窓口） */
export function defaultMethod(id: string): "窓口" | "現地" | "公式サイト" {
  return id === "site" ? "現地" : id === "hazard" ? "公式サイト" : "窓口";
}
