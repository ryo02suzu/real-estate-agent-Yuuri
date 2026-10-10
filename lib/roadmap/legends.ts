// 道路種別の地図の凡例（線の色 → 種別）。地図ごとに色の付け方が違うので、地図を開く前に文字で見られるようにする。
// data/legends.json は各地図の公開の凡例から作った（wagmap 系はレイヤ一覧を読み、Sonicweb・ICBA は凡例の画像・欄を読んだもの。scripts/legends/ 参照）
import LEGENDS from "./data/legends.json";

export type LegendEntry = { label: string; color: string };

type Stored = { map: string; legend?: LegendEntry[]; byCity?: Record<string, LegendEntry[]> };

/** 地図の URL → 凡例を引くキー。wagmap 系は「ホスト/地図名/mid」、Sonicweb は「ホスト＋パス?theme=…」、それ以外は「ホスト＋パス」 */
export function legendKey(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const mid = u.searchParams.get("mid");
  const m = u.pathname.match(/^\/([^/]+)\/Map$/);
  if (m && mid) return `${u.host}/${m[1]}/${mid}`;
  const theme = u.searchParams.get("theme");
  if (theme) return `${u.host}${u.pathname}?theme=${theme}`;
  return `${u.host}${u.pathname.replace(/\/$/, "")}`;
}

/** 地図の凡例。県の共同の地図（茨城県）は市町村ごとの凡例を引く。無ければ undefined */
export function legendFor(url: string, city: string): LegendEntry[] | undefined {
  const key = legendKey(url);
  const s = key ? (LEGENDS as Record<string, Stored>)[key] : undefined;
  if (!s) return undefined;
  const list = s.byCity ? s.byCity[city] : s.legend;
  return list && list.length ? list : undefined;
}
