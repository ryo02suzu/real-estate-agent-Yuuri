// 物件を URL のどこに入れるか。「#」の後ろ（ハッシュ）に入れる：ハッシュはサーバー（Vercel）に送られないので、リロード・共有リンク・
// ブックマークから開いても、住所・座標が外に出ない。「?」の後ろ（クエリ）に入れていた古いリンク（?q=…、?ll=…）も読めるようにし、
// 読んだら「#」の形に書き換える。日時のプレビュー（#t=…。lib/app/sun.ts）など、ほかのハッシュの項目は残す

export type UrlState = { q?: string; ll?: [number, number] };

/** 地図で選んだ地点の文字（緯度,経度。小数5桁＝約1m） */
export const llParam = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

export function parseLl(v: string | null | undefined): [number, number] | null {
  const m = v?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** ハッシュの項目（#q=…&t=… → URLSearchParams） */
export function hashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

/** URL から物件を読む。ハッシュを優先し、無ければ古いクエリを読む。fromQuery は古い形だったか（書き換えるため） */
export function readUrlState(loc: { search: string; hash: string }): UrlState & { fromQuery: boolean } {
  const pick = (p: URLSearchParams): UrlState => {
    const q = p.get("q");
    const ll = parseLl(p.get("ll"));
    return q ? { q } : ll ? { ll } : {};
  };
  const h = pick(hashParams(loc.hash));
  if (h.q || h.ll) return { ...h, fromQuery: false };
  const s = pick(new URLSearchParams(loc.search));
  return { ...s, fromQuery: !!(s.q || s.ll) };
}

/** 物件のハッシュを作る（"#q=…" / "#ll=…" / ""）。今のハッシュの物件以外の項目（t など）は残す */
export function buildHash(state: UrlState, currentHash = ""): string {
  const p = hashParams(currentHash);
  p.delete("q");
  p.delete("ll");
  const rest = p.toString();
  const own = state.q ? `q=${encodeURIComponent(state.q)}` : state.ll ? `ll=${llParam(state.ll[0], state.ll[1])}` : "";
  const all = [own, rest].filter(Boolean).join("&");
  return all ? `#${all}` : "";
}

/** ページの URL（パス＋ハッシュ。クエリは付けない） */
export function pageUrl(loc: { pathname: string }, hash: string): string {
  return `${loc.pathname}${hash}`;
}
