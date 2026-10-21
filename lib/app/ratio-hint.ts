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
