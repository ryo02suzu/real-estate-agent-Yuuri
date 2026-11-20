// 入力途中の住所の候補（PC の検索欄）。入力が止まってから、今と同じ国土地理院の住所検索に聞く（住所は MICHILU のサーバーには送らない）。
// 候補ごとに、入れた番号のどこまで国のデータで当たったかを付ける。番・町までしか当たらない候補は「代表点」と書き、正確な位置のように見せない。
// 2026-11-20 に確かめたこと：国土地理院の住所検索は、住居表示住所（基礎番号の位置）が無い街区では号を返さない
// （「千代田区丸の内1-9-1」→「丸の内一丁目９番」。住居表示住所の千代田区のデータに、丸の内一丁目は7番と10番の号しか無い）
import { geocodeCandidates, matchedNumbers, partialMatch } from "./geocode";

export type SuggestLevel = "full" | "block" | "town";
export type Suggestion = { title: string; level: SuggestLevel; label: string };

/** 候補を聞く入力か（短すぎる・地番で探す入力は聞かない。地番は地番の地図データで探す） */
export function wantsSuggest(input: string): boolean {
  const q = input.trim();
  return q.length >= 4 && /[぀-ヿ㐀-鿿]/.test(q) && !/^地番/.test(q);
}

/** 候補1つの当たり方（号・番地まで／番まで／町まで） */
export function suggestLevel(input: string, matchedAddress: string): SuggestLevel {
  if (!matchedNumbers(matchedAddress).length) return "town";
  return partialMatch(input, matchedAddress) ? "block" : "full";
}

export function suggestLabel(level: SuggestLevel, matchedAddress: string): string {
  if (level === "town") return "町まで（町の代表点）";
  if (level === "block") return /番地$/.test(matchedAddress.normalize("NFKC")) ? "番地まで（代表点）" : "番まで（街区の代表点）";
  return /号$/.test(matchedAddress.normalize("NFKC")) ? "号まで" : "番地まで";
}

export async function suggestAddresses(input: string): Promise<Suggestion[]> {
  if (!wantsSuggest(input)) return [];
  const list = await geocodeCandidates(input.trim());
  return list.slice(0, 6).map((c) => {
    const level = suggestLevel(input, c.matchedAddress);
    return { title: c.matchedAddress.normalize("NFKC"), level, label: suggestLabel(level, c.matchedAddress) };
  });
}
