// 調べた結果を、メモや報告にそのまま貼れる文章にする
import type { LookupResult } from "./roadmap";
import { chibanLabel, kuikiLabel } from "./roadmap/parcel";
import { PARCEL_CREDIT } from "./roadmap/parcel-data";

const COVERAGE_SHORT = { full: "ネットで全種別が分かる", partial: "ネットで分かるのは一部", none: "ネット非公開（窓口で確認）", outside: "都市計画区域外（窓口で確認）" } as const;

export function buildSummary(result: Extract<LookupResult, { status: "ok" }>): string {
  const m = result.municipality;
  const p = result.parcel;
  const lines = [`【道路種別の確認先】${result.matchedAddress}${p && !result.picked ? ` ${chibanLabel(p.chibanRaw)}` : " 付近"}`];
  // 地図で選んだ地点・地番で探した筆は、その地点を地理院地図で開けるようにする
  if (result.picked || p) lines.push(`${result.picked ? "地図で選んだ地点" : "筆の位置"}：https://maps.gsi.go.jp/#18/${result.lat.toFixed(6)}/${result.lng.toFixed(6)}/`);
  if (p && result.picked) lines.push(`この地点の筆：${chibanLabel(p.chibanRaw)}（${kuikiLabel(p.kuiki)}）`);
  lines.push(`${m.pref}${m.name}：${COVERAGE_SHORT[m.coverage]}`);
  for (const l of result.links) lines.push(`・${l.label}${l.pinpoint ? "" : "（地図内で住所検索）"}\n  ${l.url}`);
  const c = result.contact;
  if (c) {
    const dept = /^(東京都|\S{2,3}県)\s/.test(c.dept) ? c.dept : `${m.name} ${c.dept}`;
    lines.push(`・窓口：${dept}${c.phone ? ` ${c.phone}` : ""}${c.noPhoneInquiry ? "（道路種別は電話不可・窓口で確認）" : ""}`);
  }
  lines.push("※地図は参考図。最終確認は窓口で。");
  if (p) lines.push(`※筆の${PARCEL_CREDIT}。`);
  return lines.join("\n");
}
