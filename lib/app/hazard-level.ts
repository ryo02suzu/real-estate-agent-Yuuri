// ハザードの画面の「区分」と「総合の目安」。国の重ねるハザードマップから読んだ区分（lib/roadmap/hazard.ts）を、
// カードの印（区域外・注意・やや高い・高い）と一言にする。総合の目安は区域にかかる種類と深さから MICHILU が出したもので、
// 公的な評価ではない（画面に「目安」と書き、根拠の画面で読んだ値をすべて出す）
import { HAZARDS, type HazardKind, type HazardReport, type KindReport, type LayerHit } from "../roadmap/hazard";

/** 印の種類。tone は色（区域外=緑、注意=淡い黄、やや高い=黄、高い=赤、データなし・確認中=灰、地図で確認=青） */
export type Tone = "out" | "caution" | "mid" | "high" | "none" | "map" | "near";

export type HazardCardInfo = {
  kind: HazardKind;
  /** 「洪水」 */
  title: string;
  /** 印の文字（「区域外」「やや高い」） */
  chip: string;
  tone: Tone;
  /** カードの説明（2〜3行） */
  lines: string[];
};

const meters = (d: number) => `約${Math.max(1, Math.round(d))}m`;

/** 浸水深（ランク）→ 印。0.5m 未満は注意、0.5〜3m はやや高い、3m 以上は高い */
function depthTone(rank: number): { chip: string; tone: Tone } {
  if (rank >= 5) return { chip: "高い", tone: "high" };
  if (rank >= 3) return { chip: "やや高い", tone: "mid" };
  return { chip: "注意", tone: "caution" };
}

const worstAt = (hits: LayerHit[]) => hits.filter((h) => h.at).sort((a, b) => b.at!.rank - a.at!.rank)[0];
const nearestNear = (hits: LayerHit[]) => hits.filter((h) => h.near).sort((a, b) => a.near!.distance - b.near!.distance)[0];

/** 浸水の種類（洪水・内水・高潮・津波）のカード */
function depthCard(kind: "flood" | "naisui" | "takashio" | "tsunami", r: KindReport | undefined): HazardCardInfo {
  const title = HAZARDS[kind].short;
  if (!r) return { kind, title, chip: "確認中", tone: "none", lines: ["読み込んでいます"] };
  if (r.status === "error") return { kind, title, chip: "読み込めず", tone: "none", lines: ["通信のよい所で開き直してください"] };
  const hit = worstAt(r.hits);
  const near = nearestNear(r.hits);
  const scale = kind === "naisui" ? "" : "想定最大規模で";
  if (hit?.at) {
    const t = depthTone(hit.at.rank);
    return { kind, title, ...t, lines: [`${scale}${hit.at.label}の浸水が想定されています。`] };
  }
  if (kind === "naisui" && r.noData) return { kind, title, chip: "データなし", tone: "none", lines: ["国のデータがありません。市区町村の内水ハザードマップで確認してください。"] };
  if (near?.near) return { kind, title, chip: "注意", tone: "caution", lines: [`想定区域の外ですが、${meters(near.near.distance)}先に${near.near.cls.label}の区域があります。`] };
  return { kind, title, chip: "区域外", tone: "out", lines: [`国のデータでは${title}の想定区域の外です。`] };
}

/** 土砂災害のカード（特別警戒区域は高い、警戒区域はやや高い） */
function doshaCard(r: KindReport | undefined): HazardCardInfo {
  const title = "土砂災害";
  if (!r) return { kind: "dosha", title, chip: "確認中", tone: "none", lines: ["読み込んでいます"] };
  if (r.status === "error") return { kind: "dosha", title, chip: "読み込めず", tone: "none", lines: ["通信のよい所で開き直してください"] };
  const hit = worstAt(r.hits);
  if (hit?.at) {
    const special = hit.at.rank >= 3;
    return {
      kind: "dosha",
      title,
      chip: special ? "特別警戒" : "警戒区域",
      tone: special ? "high" : "mid",
      lines: [`${hit.layer.name}の${hit.at.label}に入っています。`],
    };
  }
  const near = nearestNear(r.hits);
  if (near?.near) return { kind: "dosha", title, chip: "注意", tone: "caution", lines: [`区域の外ですが、${meters(near.near.distance)}先に${near.layer.name}の${near.near.cls.label}があります。`] };
  return { kind: "dosha", title, chip: "区域外", tone: "out", lines: ["土砂災害警戒区域には指定されていません。"] };
}

/** 洪水・内水・高潮・津波・土砂災害のカード（画面の並び順） */
export function hazardCards(report: HazardReport): HazardCardInfo[] {
  return [
    depthCard("flood", report.flood),
    depthCard("naisui", report.naisui),
    depthCard("takashio", report.takashio),
    depthCard("tsunami", report.tsunami),
    doshaCard(report.dosha),
  ];
}

export type HazardTotal = {
  /** 「低い」「注意」「やや高い」「高い」 */
  level: string;
  tone: Tone;
  /** メーターの針（0=左端、1=右端） */
  needle: number;
  /** 一言（区域にかかる種類） */
  comment: string;
};

/** 総合の目安（MICHILU の目安）。区域にかかる種類のうちいちばん強い印で決める。家屋倒壊等氾濫想定区域は高い */
export function hazardTotal(report: HazardReport): HazardTotal | null {
  const cards = hazardCards(report);
  if (cards.some((c) => c.chip === "確認中")) return null;
  const order: Tone[] = ["out", "caution", "mid", "high"];
  let worst: Tone = "out";
  for (const c of cards) if (order.indexOf(c.tone) > order.indexOf(worst)) worst = c.tone;
  const kaoku = report.kaoku?.status === "ok" && report.kaoku.hits.some((h) => h.at);
  if (kaoku) worst = "high";
  const hit = cards.filter((c) => c.tone === "caution" || c.tone === "mid" || c.tone === "high").map((c) => c.title);
  if (kaoku) hit.unshift("家屋倒壊等氾濫");
  const level = { out: "低い", caution: "注意", mid: "やや高い", high: "高い" }[worst as "out" | "caution" | "mid" | "high"];
  const needle = { out: 0.15, caution: 0.42, mid: 0.66, high: 0.88 }[worst as "out" | "caution" | "mid" | "high"];
  // データの無い種類（内水など）は「区域外」と言わない
  const out = cards.filter((c) => c.tone === "out").map((c) => c.title);
  const none = cards.filter((c) => c.tone === "none").map((c) => c.title);
  const comment = hit.length
    ? `${hit.join("・")}のリスクがあるエリアです。市区町村のハザードマップで詳細を確認してください。`
    : `国のデータでは、${out.join("・")}の想定区域の外です。${none.length ? `${none.join("・")}は国のデータが無いため、市区町村のハザードマップで確認してください。` : ""}`;
  return { level, tone: worst, needle, comment };
}
