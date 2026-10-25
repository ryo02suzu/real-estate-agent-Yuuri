// 調査の状況（基本情報タブの一番上のカード）：項目ごとに「自動取得済み・公式資料を参照可能・確認済み・一部確認済み・未確認・取得失敗」
// を決める。自動で取得した情報（データの読み込みの状態）と、あなたの確認の記録（lib/records.ts）は別で、記録があればそちらが勝つ
// （全部の確認事項が済むまで「確認済み」にはならない）。次にやることの案内は、確認の手順と公式資料への入口だけ（判定はしない）
import { hazardTotal } from "@/lib/app/hazard-level";
import { RECORD_ITEMS, topicProgress, type PropertyRecords, type RecordTopic } from "@/lib/records";
import { roadShort } from "@/lib/roadmap/road-read";
import type { StatusKey } from "./tokens";
import type { Ok, PropertyData } from "./use-property";

export type TopicStatus = {
  topic: RecordTopic;
  label: string;
  /** loading は読んでいる途中 */
  status: StatusKey | "loading";
  /** 札の字（「取得済み」「公式図を確認」「確認済み 10/24」「一部確認 1/4」「未確認」「読み込めず」「確認中」） */
  chip: string;
  /** 取れた情報の要点（「2項道路・幅員 約3.6m」など） */
  value: string;
  /** 次にやること（確認の手順・公式資料への入口。判定はしない） */
  hint: string;
};

const md = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** あなたの記録があれば、その状態（無ければ null） */
function recorded(records: PropertyRecords | undefined, topic: RecordTopic): Pick<TopicStatus, "status" | "chip" | "hint"> | null {
  const p = topicProgress(records, topic);
  if (p.status === "all") return { status: "confirmed", chip: `確認済み ${p.latest ? md(p.latest) : ""}`.trim(), hint: "記録を見直す" };
  if (p.status === "partial") {
    const left = RECORD_ITEMS[topic].subs.filter((s) => !records?.items[topic]?.[s.id]?.done).map((s) => s.label);
    return { status: "partial", chip: `一部確認 ${p.done}/${p.total}`, hint: `残り：${left.join("・")}` };
  }
  return null;
}

/** 6つの項目の状態 */
export function topicStatuses(result: Ok, data: PropertyData, records: PropertyRecords | undefined): TopicStatus[] {
  const m = result.municipality;
  const out: TopicStatus[] = [];
  const push = (topic: RecordTopic, auto: Pick<TopicStatus, "status" | "chip" | "value" | "hint">) => {
    const r = recorded(records, topic);
    out.push({ topic, label: RECORD_ITEMS[topic].label, ...auto, ...(r ?? {}) });
  };

  // 道路：市の公開データで種別が読めれば取得済み。読めない市は公式図（リンク）か窓口
  {
    const { roads } = data;
    const link = result.links[0];
    const offline = m.coverage === "none" || m.coverage === "outside";
    const hint = offline ? "窓口で種別を確認（電話不可の市あり）→ 幅員・接道" : m.coverage === "partial" ? "一部は公式図、ほかは窓口で確認 → 幅員・接道" : "公式道路図で種別を確認 → 幅員・接道";
    if (roads.status === "loading") push("road", { status: "loading", chip: "確認中", value: "市の道路データを読んでいます", hint });
    else if (roads.status === "error") push("road", { status: "failed", chip: "読み込めず", value: "市の道路データを読めませんでした", hint: "再試行、または公式図で確認" });
    else if (roads.status === "ok" && roads.roads[0]) {
      const r = roads.roads[0];
      push("road", { status: "auto", chip: "取得済み", value: `${r.direction}側・${roadShort(r.label)}${r.width ? `・幅員 約${r.width}` : ""}（市の地図データ）`, hint: "幅員・接道は現地と窓口で確認" });
    } else if (link && !offline) push("road", { status: "official", chip: "公式図を確認", value: `道路種別：未確認（${m.name}の公式道路図で）`, hint });
    else push("road", { status: "unconfirmed", chip: "未確認", value: offline ? "道路種別：未確認（ネット非公開の市）" : "道路種別：未確認", hint });
  }
  // 都市計画
  {
    const { zoning } = data;
    const hint = "都市計画図・窓口で確認";
    if (zoning.status === "loading") push("zoning", { status: "loading", chip: "確認中", value: "都市計画のデータを読んでいます", hint });
    else if (zoning.status === "error") push("zoning", { status: "failed", chip: "読み込めず", value: "都市計画のデータを読めませんでした", hint: "再試行、または都市計画図で確認" });
    else if (zoning.status === "ok") {
      const z = zoning.zoning;
      const y = z.youto[0];
      const value = y ? `${z.youto.map((o) => o.name).join("／")}${y.bcr && y.far ? `・建ぺい${y.bcr}%・容積${y.far}%` : ""}` : z.senbiki === "市街化調整区域" ? "市街化調整区域（用途地域の指定なし）" : !z.tokei && !z.jyuntoshi ? "都市計画区域外" : "用途地域の指定なし";
      push("zoning", { status: "auto", chip: "取得済み", value: `${value}（国のGISデータ・参考）`, hint: y && (!y.bcr || !y.far) ? "建ぺい率・容積率は都市計画図で確認" : "地区計画・高度地区の種類は都市計画図で確認" });
    } else push("zoning", { status: "unconfirmed", chip: "未確認", value: `${m.name}の用途地域は国のデータにありません`, hint });
  }
  // 建築の注意点（区域・埋蔵文化財・上下水道）
  {
    const { zoning, triage } = data;
    const issues = triage.issues.filter((i) => i.topic === "law" || i.topic === "building" || i.topic === "utility");
    const warn = issues.filter((i) => i.level === "warn").length;
    const hint = "区域の該当を担当課で確認 → 上下水道・ガスは台帳で";
    if (zoning.status === "loading") push("law", { status: "loading", chip: "確認中", value: "区域のデータを読んでいます", hint });
    else if (zoning.status === "error") push("law", { status: "failed", chip: "読み込めず", value: "区域のデータを読めませんでした", hint: "再試行、または担当課で確認" });
    else push("law", { status: "auto", chip: "取得済み", value: issues.length ? `要注意 ${warn}・要確認 ${issues.length - warn}：${issues.slice(0, 2).map((i) => i.title).join("・")}` : "データで見つかった注意はありません", hint });
  }
  // ハザード
  {
    const { hazard } = data;
    const hint = `${m.name}のハザードマップで確認（重要事項説明はこちらで）`;
    if (hazard.status === "loading") push("hazard", { status: "loading", chip: "確認中", value: "国のハザードマップを読んでいます", hint });
    else if (hazard.status === "error") push("hazard", { status: "failed", chip: "読み込めず", value: "国のハザードマップを読めませんでした", hint: "再試行、または市のハザードマップで確認" });
    else if (hazard.status === "ok") {
      // 種類のどれかがまだ読めていなければ総合の目安は出ない（確認中）
      const t = hazardTotal(hazard.report);
      if (t) push("hazard", { status: "auto", chip: "取得済み", value: `総合の目安：${t.level}。${t.comment}`, hint });
      else push("hazard", { status: "loading", chip: "確認中", value: "国のハザードマップを読んでいます", hint });
    } else push("hazard", { status: "unconfirmed", chip: "未確認", value: "国のデータなし", hint });
  }
  // 周辺環境
  {
    const { around, stations } = data;
    const st = stations.status === "ok" ? stations.stations[0] : undefined;
    const hint = "現地で見たこと（騒音・日当たり・前面道路の様子）を記録";
    if (around.status === "loading" || stations.status === "loading") push("around", { status: "loading", chip: "確認中", value: "駅・施設を読んでいます", hint });
    else if (around.status === "error") push("around", { status: "failed", chip: "読み込めず", value: "施設のデータを読めませんでした", hint: "再試行" });
    else push("around", { status: "auto", chip: "取得済み", value: `${st ? `${st.name}駅${st.routed ? ` 徒歩${st.minutes}分` : ""}` : "近くに駅なし"}・施設 ${around.status === "ok" ? around.all.length : 0}件`, hint });
  }
  // 地番・土地
  {
    const { parcels } = data;
    const hint = "法務局の公図・登記で地番と面積を確認";
    if (parcels.status === "loading") push("parcel", { status: "loading", chip: "確認中", value: "登記所の地図データを読んでいます", hint });
    else if (parcels.status === "error") push("parcel", { status: "failed", chip: "読み込めず", value: "地番の地図データを読めませんでした", hint: "再試行、または公図で確認" });
    else if (parcels.status === "ok") {
      const kind = parcels.kind === "chiban" ? "地番で探した筆" : parcels.kind === "picked" ? "地図で選んだ地点の筆" : "住所の地点の筆（参考）";
      push("parcel", { status: "auto", chip: "取得済み", value: `${parcels.parcel.chibanRaw}（${kind}）`, hint: parcels.kind === "address" ? "住所と地番は別物。公図で物件の筆を確認" : hint });
    } else push("parcel", { status: "unconfirmed", chip: "未確認", value: parcels.approximate ? "場所を直すと筆が出ます" : "この地点の筆が地図データにありません", hint });
  }
  return out;
}

/** 「確認済み 2・一部 1・未確認 3」のような要約 */
export function statusSummary(list: TopicStatus[]): string {
  const n = (k: TopicStatus["status"]) => list.filter((s) => s.status === k).length;
  const parts: string[] = [];
  if (n("confirmed")) parts.push(`確認済み ${n("confirmed")}`);
  if (n("partial")) parts.push(`一部 ${n("partial")}`);
  const auto = n("auto") + n("official");
  if (auto) parts.push(`取得済み ${auto}`);
  if (n("unconfirmed")) parts.push(`未確認 ${n("unconfirmed")}`);
  if (n("failed")) parts.push(`読み込めず ${n("failed")}`);
  if (n("loading")) parts.push(`確認中 ${n("loading")}`);
  return parts.join("・");
}
