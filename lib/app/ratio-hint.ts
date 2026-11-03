// 用途地域のデータに建ぺい率・容積率が無い市区町村（都市計画決定GISデータに数値が入っていない所）で、
// 近くの地価公示・地価調査の地点のうち、同じ用途地域の地点の指定建ぺい率・容積率を「参考」として出す。
// 同じ用途地域でも場所によって数値が違うことがあるので、画面では「参考」と「市で確認」を添える
import { zoneName, type LandPriceHit } from "../roadmap/land-price";

/** 参考にする地点までの距離の上限（m） */
export const HINT_MAX_M = 1500;

const norm = (n: string) => n.normalize("NFKC").replace(/第1種/, "第一種").replace(/第2種/, "第二種");

export type RatioHint = { bcr: number; far: number; distance: number; label: string };

/** 用途地域 youto の名前と同じ用途地域の、いちばん近い地点の建ぺい率・容積率（無ければ undefined） */
export function ratioHint(youto: string | undefined, hits: LandPriceHit[]): RatioHint | undefined {
  if (!youto) return undefined;
  const want = norm(youto);
  const h = hits.filter((x) => x.distance <= HINT_MAX_M && x.bcr && x.far && norm(zoneName(x.zone) ?? "") === want).sort((a, b) => a.distance - b.distance)[0];
  return h ? { bcr: h.bcr!, far: h.far!, distance: h.distance, label: `${h.kind === "公示" ? "地価公示" : "地価調査"} ${h.no}` } : undefined;
}

/**
 * 物件の用途地域に合う地価の地点の用途。住居系 → 住宅地、商業系（近隣商業・商業）→ 商業地、工業・工業専用 → 工業地。
 * 準工業地域・用途地域の無い所は、住宅も工場もあるので決めない（undefined）
 */
export function usageForZone(youto: string | undefined): LandPriceHit["usage"] | undefined {
  if (!youto) return undefined;
  const n = norm(youto);
  if (/商業/.test(n)) return "商業地";
  if (/準工業/.test(n)) return undefined;
  if (/工業/.test(n)) return "工業地";
  if (/住居|田園/.test(n)) return "住宅地";
  return undefined;
}

/** 参考の地点を選ぶ範囲（m）。これより遠い同じ用途の地点より、近い別の用途の地点を見せる */
export const REF_MAX_M = 2000;

/**
 * 「土地の参考価格」に出す地点：物件の用途地域に合う用途（住宅地・商業地・工業地）の、いちばん近い地点。
 * 2km 以内に合う地点が無い・用途を決めない所では、いちばん近い地点（matched が false。画面で用途を書く）。
 * 住宅地の物件に、駅前の商業地の地価を「この土地の参考価格」として出さないため
 */
export function refLandPoint(hits: LandPriceHit[], youto: string | undefined): { top: LandPriceHit | undefined; matched: boolean } {
  const want = usageForZone(youto);
  const same = want ? hits.find((h) => h.usage === want && h.distance <= REF_MAX_M) : undefined;
  return { top: same ?? hits[0], matched: !!same };
}
