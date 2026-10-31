// スマホの結果パネルの行（災害リスク・都市計画）に並べる印を、データの実態に合わせて言い分ける。
// 「調べられない（読めない・データが無い）」を「区域外」「指定なし」と言い切らない（F05「データなし≠安全」）。
// PC の要点の行・印刷・共有・下書きは lib/roadmap/hazard.ts の hazardChips・zoning.ts の zoningChips のまま（変えない）。
import { HAZARD_KINDS, hazardChips, type HazardChip, type HazardReport } from "./roadmap/hazard";
import type { Zoning, ZoningLayer, ZoningStatus } from "./roadmap/zoning";

/** 印の状態。fail：読み込めなかった種類がある／none：データが無い（「無い」とは言えない） */
export type PanelChip = HazardChip & { state?: "fail" | "none" };

/** 災害の行で「何も区域にかからない」ときの印（lib/roadmap/hazard.ts の hazardChips と同じ言い方） */
const OUT_TEXT = "国のデータで区域外";

/**
 * 災害リスクの行の印（スマホの結果パネル）。区域にかかる種類は hazardChips と同じ。
 * - 読み込めなかった種類があれば「一部読み込めず」を必ず出し、そのときは「国のデータで区域外」と言わない
 *   （読めた種類だけで区域外でも、読めなかった種類は分からない）
 * - 内水の国のデータがこの辺りに無ければ「内水はデータなし」を添える（区域外とは言えない）
 */
export function panelHazardChips(report: HazardReport): PanelChip[] {
  const base = hazardChips(report);
  const nothing = base.length === 1 && base[0].text === OUT_TEXT;
  const failed = HAZARD_KINDS.some((k) => report[k]?.status === "error");
  const naisui = report.naisui;
  const naisuiNone = naisui?.status === "ok" && !!naisui.noData;
  const chips: PanelChip[] = nothing ? [] : [...base];
  if (failed) chips.push({ text: "一部読み込めず", warn: false, state: "fail" });
  else if (nothing) chips.push(base[0]);
  if (naisuiNone) chips.push({ text: "内水はデータなし", warn: false, state: "none" });
  return chips;
}

/**
 * 都市計画の行の先頭の印（スマホの結果パネル）を、詳細（zoningRows）と同じ判定で言い直す。
 * 「都市計画区域外」「用途地域なし」と言えるのは、その市のデータ（都市計画決定GISデータ）があるときだけ。
 * 無ければ「都市計画データなし」「用途地域データなし」を返す（言い直さないときは undefined）
 */
export function zoningNoData(z: Zoning, st: ZoningStatus | undefined, first: string | undefined): string | undefined {
  const flag = (l: ZoningLayer) => (st ? st.layers[l] : 0);
  if (first === "都市計画区域外" && !(st && flag("tokei") === 1)) return "都市計画データなし";
  if (first === "用途地域なし" && (z.tokei || z.jyuntoshi) && flag("youto") === 0) return "用途地域データなし";
  return undefined;
}
