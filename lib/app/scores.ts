// 周辺環境の「MICHILUの目安」（5点満点）。駅・お店・病院・保育園などまでの徒歩の目安と、まわりの飲食店の数から出す。
// 公的な評価ではないので、画面では「目安」と書き、どの施設まで何分かという根拠をいっしょに出す。
// 治安はデータが無いので点を付けない（null）
import POI_SOURCE from "../roadmap/data/poi-source.json";
import type { PoiWalk } from "../roadmap/poi";
import type { Schools } from "../roadmap/school";
import { lineLabel, type StationWalk } from "../roadmap/walk";

export type ScoreKey = "transport" | "shopping" | "dining" | "medical" | "childcare" | "safety";

export type Score = {
  key: ScoreKey;
  label: string;
  /** 1.0〜5.0（0.1 刻み）。データが無ければ null */
  value: number | null;
  /** 根拠（「渋谷駅 徒歩6分」） */
  basis: string[];
};

export const SCORE_LABELS: Record<ScoreKey, string> = {
  transport: "交通の利便性",
  shopping: "買い物の利便性",
  dining: "飲食店の充実度",
  medical: "医療の利便性",
  childcare: "子育て環境",
  safety: "治安・安全性",
};

/** 点の付け方の説明（根拠の画面に出す） */
export const SCORE_METHOD =
  "徒歩の目安（道路距離80mを1分）が3分以内で5点、5分で4.8点、10分で4点、15分で3点、20分で2点、30分以上で1点（間は比例）。" +
  "交通は最寄り駅の分数に、15分以内の駅の路線の数を少し足します。買い物はスーパー5・コンビニ3・ドラッグストア2の割合、" +
  "子育ては保育園・幼稚園、学区の小学校、公園の平均です。飲食店は半径500m以内の数（30軒以上で5点）。" +
  "公的な評価ではなく、MICHILUが距離から出した目安です。施設が今もあるかは現地で確かめてください。";

/** 分数 → 点（アンカーの間は比例） */
const MINUTE_ANCHORS: [number, number][] = [
  [3, 5],
  [5, 4.8],
  [10, 4],
  [15, 3],
  [20, 2],
  [30, 1],
];
/** 半径500m以内の飲食店の数 → 点 */
const COUNT_ANCHORS: [number, number][] = [
  [0, 1],
  [1, 1.5],
  [3, 2],
  [8, 3],
  [15, 4],
  [30, 5],
];

function interpolate(x: number, anchors: [number, number][]): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i];
    const [x0, y0] = anchors[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return anchors[anchors.length - 1][1];
}

/** 分数の点（施設が無い＝歩いて行ける範囲に無いときは 1 点） */
export const minuteScore = (minutes: number | undefined) => (minutes === undefined ? 1 : interpolate(minutes, MINUTE_ANCHORS));
export const countScore = (count: number) => interpolate(count, COUNT_ANCHORS);

const round1 = (v: number) => Math.round(Math.min(5, Math.max(1, v)) * 10) / 10;

/** 「徒歩約6分」か、道のりが分からなければ「直線約450m」 */
function way(w: { routed: boolean; minutes: number; meters: number; straight?: number }): string {
  if (w.routed) return `徒歩約${w.minutes}分`;
  const m = w.straight ?? w.meters;
  return `直線約${m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m / 10) * 10}m`}`;
}

/** 道のりが分からない施設は、直線距離を道のりとみなした分数（実際より短めになる） */
const minutesOf = (w: { routed: boolean; minutes: number; meters: number }) => (w.routed ? w.minutes : Math.max(1, Math.ceil(w.meters / 80)));

export type ScoreInput = {
  stations?: StationWalk[];
  pois?: PoiWalk[];
  /** 半径500m以内の飲食店の数（飲食店のデータが無ければ undefined） */
  diningCount?: number;
  schools?: Schools;
};

/** 飲食店のデータ（施設のタイルの種類 13）が入っているか */
export const HAS_DINING_DATA = "13" in (POI_SOURCE.counts as Record<string, number>);

export function livingScores({ stations, pois, diningCount, schools }: ScoreInput): Score[] {
  const poi = (kind: number) => pois?.find((p) => p.kind === kind);
  const out: Score[] = [];

  // 交通：最寄り駅の分数＋15分以内の駅の路線の数（2路線目から1路線 0.1 点、0.4 点まで）
  if (stations) {
    const s = stations[0];
    if (s) {
      const near = stations.filter((x) => x.routed && x.minutes <= 15);
      const lines = new Set(near.flatMap((x) => x.lines.map((l) => lineLabel(l))));
      const bonus = Math.min(0.4, Math.max(0, lines.size - 1) * 0.1);
      out.push({
        key: "transport",
        label: SCORE_LABELS.transport,
        value: round1(minuteScore(minutesOf(s)) + bonus),
        basis: [`${s.name}駅 ${way(s)}`, ...(lines.size ? [`徒歩15分以内の駅の路線：${lines.size}路線`] : [])],
      });
    } else out.push({ key: "transport", label: SCORE_LABELS.transport, value: 1, basis: ["近くに駅がありません"] });
  } else out.push({ key: "transport", label: SCORE_LABELS.transport, value: null, basis: ["確認中"] });

  // 買い物：スーパー・コンビニ・ドラッグストア
  if (pois) {
    const parts: [number, number][] = [
      [1, 0.5],
      [2, 0.3],
      [3, 0.2],
    ];
    const v = parts.reduce((sum, [k, w]) => sum + w * minuteScore(poi(k) && minutesOf(poi(k)!)), 0);
    const basis = parts.map(([k]) => poi(k)).filter((p): p is PoiWalk => !!p).map((p) => `${p.label}：${p.name} ${way(p)}`);
    out.push({ key: "shopping", label: SCORE_LABELS.shopping, value: round1(v), basis: basis.length ? basis : ["歩いて行ける範囲にお店がありません"] });
  } else out.push({ key: "shopping", label: SCORE_LABELS.shopping, value: null, basis: ["確認中"] });

  // 飲食店：半径500m以内の数
  if (diningCount !== undefined) out.push({ key: "dining", label: SCORE_LABELS.dining, value: round1(countScore(diningCount)), basis: [`半径500m以内の飲食店：${diningCount}軒`] });
  else out.push({ key: "dining", label: SCORE_LABELS.dining, value: null, basis: [HAS_DINING_DATA ? "確認中" : "飲食店のデータを準備中です"] });

  // 医療：病院・診療所のうち近い方
  if (pois) {
    const med = [poi(4), poi(5)].filter((p): p is PoiWalk => !!p).sort((a, b) => minutesOf(a) - minutesOf(b));
    out.push({
      key: "medical",
      label: SCORE_LABELS.medical,
      value: round1(minuteScore(med[0] && minutesOf(med[0]))),
      basis: med.length ? med.map((p) => `${p.label}：${p.name} ${way(p)}`) : ["歩いて行ける範囲に病院・診療所がありません"],
    });
  } else out.push({ key: "medical", label: SCORE_LABELS.medical, value: null, basis: ["確認中"] });

  // 子育て：保育園・幼稚園、学区の小学校、公園の平均
  if (pois) {
    const nursery = poi(9);
    const park = poi(6);
    const e = schools?.elementary;
    const schoolMin = e?.walk ? e.walk.minutes : e?.distance !== undefined ? Math.max(1, Math.ceil(e.distance / 80)) : undefined;
    const parts = [minuteScore(nursery && minutesOf(nursery)), minuteScore(park && minutesOf(park)), ...(e ? [minuteScore(schoolMin)] : [])];
    const basis = [
      nursery ? `${nursery.label}：${nursery.name} ${way(nursery)}` : "歩いて行ける範囲に保育園・幼稚園がありません",
      ...(e ? [`学区の小学校：${e.name}${e.walk ? ` 徒歩約${e.walk.minutes}分` : schoolMin ? ` 直線約${Math.round(e.distance! / 10) * 10}m` : ""}`] : []),
      park ? `公園：${park.name} ${way(park)}` : "歩いて行ける範囲に公園がありません",
    ];
    out.push({ key: "childcare", label: SCORE_LABELS.childcare, value: round1(parts.reduce((a, b) => a + b, 0) / parts.length), basis });
  } else out.push({ key: "childcare", label: SCORE_LABELS.childcare, value: null, basis: ["確認中"] });

  out.push({ key: "safety", label: SCORE_LABELS.safety, value: null, basis: ["治安のデータはまだありません（警察が公表している犯罪の件数の取り込みを準備中）"] });
  return out;
}

/** 総合の目安（点のある項目の平均）。点が1つも無ければ null */
export function totalScore(scores: Score[]): number | null {
  const v = scores.map((s) => s.value).filter((x): x is number => x !== null);
  if (!v.length) return null;
  return round1(v.reduce((a, b) => a + b, 0) / v.length);
}

/** 総合の目安の一言 */
export function totalComment(total: number | null): string {
  if (total === null) return "周辺の施設を確認しています。";
  if (total >= 4.5) return "駅・お店・病院が歩いて行ける範囲にそろったエリアです。";
  if (total >= 3.8) return "日常の買い物や交通が比較的便利なエリアです。";
  if (total >= 3.0) return "生活施設はひととおりありますが、少し距離があります。";
  if (total >= 2.0) return "車や自転車があると便利なエリアです。";
  return "歩いて行ける範囲の生活施設が少ないエリアです。";
}
