// 調べた結果を、メモや報告にそのまま貼れる文章にする
import type { LookupResult } from "./roadmap";

const COVERAGE_SHORT = { full: "ネットで全種別が分かる", partial: "ネットで分かるのは一部", none: "ネット非公開（窓口で確認）", outside: "都市計画区域外（窓口で確認）" } as const;

export function buildSummary(result: Extract<LookupResult, { status: "ok" }>): string {
  const m = result.municipality;
  const lines = [`【道路種別の確認先】${result.matchedAddress} 付近`, `${m.pref}${m.name}：${COVERAGE_SHORT[m.coverage]}`];
  for (const l of result.links) lines.push(`・${l.label}${l.pinpoint ? "" : "（地図内で住所検索）"}\n  ${l.url}`);
  const c = result.contact;
  if (c) {
    const dept = /^(東京都|\S{2,3}県)\s/.test(c.dept) ? c.dept : `${m.name} ${c.dept}`;
    lines.push(`・窓口：${dept}${c.phone ? ` ${c.phone}` : ""}${c.noPhoneInquiry ? "（道路種別は電話不可・窓口で確認）" : ""}`);
  }
  lines.push("※地図は参考図。最終確認は窓口で。");
  return lines.join("\n");
}
