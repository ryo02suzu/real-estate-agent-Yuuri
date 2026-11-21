// 公図（任意座標系の登記所備付地図データ）を、道路縁に合わせて推定の位置に置いた筆のタイルの置き場所と版。既定は data/kozu-source.json。
// タイルは scripts/kozu-tiles/kozu.py で市区町村ごとに作り、ワークフロー（.github/workflows/kozu-tiles.yml）が R2 に置いてこのファイルを書き換える。
// url が空のあいだは推定の筆を出さない。ビルド時の環境変数 NEXT_PUBLIC_KOZU_PMTILES_URL / NEXT_PUBLIC_KOZU_EDITION があれば、そちらを使う
import SOURCE from "./data/kozu-source.json";
import { PARCEL_CREDIT, PARCEL_DATA, PARCEL_SOURCE } from "./parcel-data";
import { ALL_PREF_NAMES, ALL_REGIONS } from "./regions";
import { SANKO_CITIES } from "./sanko-data";

export const KOZU_DATA = {
  /** 「/data/…」のようにサイト内のパスのときは、開いているサイトのファイルを読む */
  url: process.env.NEXT_PUBLIC_KOZU_PMTILES_URL || SOURCE.url,
  /** 画面に出すデータの版（「2026年公開版」） */
  edition: process.env.NEXT_PUBLIC_KOZU_EDITION || SOURCE.edition,
  /** タイルのレイヤ名（地番の筆のタイルと同じ属性：地番区域・地番） */
  layer: "kozu",
};

/** 推定の筆のデータがあるか */
export const hasKozu = () => !!KOZU_DATA.url;

/** 国の地価公示・地価調査の地点で測った、推定の筆の確かさ（確かさの高い推定・低い推定ごと。scripts/kozu-tiles/check_accuracy.mjs） */
export type KozuLevel = {
  /** 推定の筆の中にあった地点 */
  points: number;
  /** 筆の地番が所在の地番と同じ */
  exact: number;
  /** 30m 以内に同じ地番の筆がある（一致を含む） */
  within30: number;
  /** 同じ地番の筆が 30m より遠い・近くに無い・別の町（30m 以上離れた別の場所に置かれていた） */
  elsewhere: number;
};
export type KozuAccuracy = { file: string; date: string; method: string; high?: KozuLevel; low?: KozuLevel };
/** 推定の筆のまとまり（関東・大阪府など、都府県の組ごとに作ったタイル。scripts/kozu-tiles/sets.py が kozu-source.json に書く） */
export type KozuSet = { file: string; codes: string[]; edition: string; high_only?: boolean; accuracy?: KozuAccuracy };

/** 公開している推定の筆のまとまり（まだ公開していないまとまりの確かさは scripts/kozu-tiles/accuracy-unpublished.json にあり、アプリは読まない） */
export const KOZU_SETS: Record<string, KozuSet> = (SOURCE as { sets?: Record<string, KozuSet> }).sets ?? {};

/**
 * 筆の市区町村コード（政令市は区のコード。いくつか渡してもよい）の推定の筆のまとまり。
 * そのコードがどのまとまりにも無ければ、同じ都府県のまとまり（境目の筆など）
 */
export function kozuSetOf(codes?: string | readonly string[], sets: Record<string, KozuSet> = KOZU_SETS): KozuSet | undefined {
  const list = typeof codes === "string" ? [codes] : (codes ?? []);
  if (!list.length) return undefined;
  const all = Object.values(sets);
  return all.find((s) => list.some((c) => s.codes.includes(c))) ?? all.find((s) => list.some((c) => s.codes.some((d) => d.slice(0, 2) === c.slice(0, 2))));
}

/** 割合の言い方（「約3%」「1割弱」「約3割」）。1% に満たなければ言わない（undefined） */
export function shareText(rate: number): string | undefined {
  if (!(rate >= 0.01)) return undefined;
  if (rate < 0.07) return `約${Math.round(rate * 100)}%`;
  if (rate < 0.1) return "1割弱";
  return `約${Math.round(rate * 10)}割`;
}

/** まとまりの地域の名前：1つの都府県ならその名前（「大阪府」）、ほかは地方の名前（「近畿」「関東」） */
function areaOf(codes: readonly string[]): string {
  const prefs = [...new Set(codes.map((c) => c.slice(0, 2)))];
  if (prefs.length === 1) return ALL_PREF_NAMES[prefs[0]] ?? "";
  return [...new Set(prefs.map((p) => Object.values(ALL_REGIONS).find((r) => p in r.prefs)?.name).filter(Boolean))].join("・");
}

export type KozuMisplaced = {
  /** 30m 以上離れた別の場所に置かれていた割合（「約3%」「1割弱」） */
  share: string;
  /** その筆のまとまりの地域（「近畿」「大阪府」）。筆の市区町村が分からないときは無し */
  area?: string;
  /** 筆の市区町村が分からず、地域によって割合が違う（いちばん多い地域の割合を「地域によっては」と言う） */
  varies?: boolean;
};

/**
 * 公図から推定した筆が、30m 以上離れた別の場所に置かれていた割合（国の地価の地点で測った結果。kozu-source.json の sets の accuracy）。
 * codes（筆の市区町村コード）があれば、その筆のまとまりで測った割合。無い・そのまとまりで測っていなければ、測った全部のまとまりの
 * うち、いちばん多い割合（どの地域の筆でも言い過ぎにならないように）。1% に満たないとき・測っていないときは undefined
 */
export function kozuMisplaced(level: "high" | "low", codes?: string | readonly string[], sets: Record<string, KozuSet> = KOZU_SETS): KozuMisplaced | undefined {
  const rate = (s: KozuSet) => {
    const a = s.accuracy?.[level];
    return a && a.points > 0 ? a.elsewhere / a.points : undefined;
  };
  const set = kozuSetOf(codes, sets);
  const own = set ? rate(set) : undefined;
  if (set && own !== undefined) {
    const share = shareText(own);
    return share ? { share, area: areaOf(set.codes) } : undefined;
  }
  const rates = Object.values(sets)
    .map(rate)
    .filter((r): r is number => r !== undefined);
  const share = rates.length ? shareText(Math.max(...rates)) : undefined;
  return share ? { share, ...(rates.some((r) => shareText(r) !== share) ? { varies: true } : {}) } : undefined;
}

/** 出典の文に入れる、推定の筆のずれの目安（どの地域の筆か決めない言い方）：「数m」、測った地域に取り違えの多い所があれば「数m（地域によっては約3%が30m以上）」 */
function shiftText(): string {
  const m = kozuMisplaced("high");
  return m ? `数m（${m.varies ? `地域によっては${m.share}が` : `${m.share}は`}30m以上）` : "数m";
}

/** 読みに行く URL（サイト内のパスは、開いているサイトの URL にする） */
export function kozuUrl(): string {
  const { url } = KOZU_DATA;
  if (/^https?:/.test(url) || typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

/** 出典（登記所備付地図データの利用規約と、位置合わせに使った基盤地図情報） */
export const KOZU_CREDIT = `公図（任意座標）の筆は、「登記所備付地図データ」（法務省）を、国土地理院の基盤地図情報（道路縁）に合わせて MICHILU が推定の位置に置いたもの${
  KOZU_DATA.edition ? `（${KOZU_DATA.edition}）` : ""
}。${shiftText()}ずれることがあり、法務局の証明ではありません`;

/**
 * 筆の出典を1つの文にする（「筆の出典：…を加工して作成（版）。公図（任意座標）の筆は…で、数mずれることがあります。どちらも法務局の証明ではありません」）。
 * estimated：公図から推定した筆も出したとき。推定の筆の版は、登記所備付地図データの版と違うときだけ書く。
 * sanko：市町村の地番参考図の筆も出したとき（その市区町村コード。市町村ごとの出典とライセンス）
 */
export function parcelCreditLine(estimated: boolean, sanko?: string): string {
  if (!estimated && !sanko) return `筆の${PARCEL_CREDIT}`;
  const parts = [`筆の${PARCEL_SOURCE}`];
  const c = sanko ? SANKO_CITIES[sanko] : undefined;
  if (sanko)
    parts.push(
      `地番参考図の筆は${c ? `${c.credit}（${c.license}・${c.date}）` : "市町村の地番参考図（オープンデータ）"}を加工して作成したもので、課税用の参考図のため登記の地番・筆の形と違うことがあります`,
    );
  if (estimated) {
    const edition = KOZU_DATA.edition && KOZU_DATA.edition !== PARCEL_DATA.edition ? `（${KOZU_DATA.edition}）` : "";
    parts.push(`公図（任意座標）の筆は、国土地理院の基盤地図情報（道路縁）に合わせて MICHILU が推定の位置に置いたもの${edition}で、${shiftText()}ずれることがあります`);
  }
  return `${parts.join("。")}。${parts.length > 2 ? "どれも" : "どちらも"}法務局の証明ではありません`;
}
