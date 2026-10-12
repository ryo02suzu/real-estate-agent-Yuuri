// 動く地図の凡例（用途地域・道路種別の色）。地図に塗った色・描いた線が何の種別かを、見ている辺りの分だけ並べる

export type LegendItem = {
  /** 種別の名前（例：第一種低層住居専用地域、42条2項(公道)） */
  label: string;
  /** 短い名前（例：1種低層、2項道路）。スマホの狭い凡例に使う */
  short: string;
  color: string;
  /** 見本の形：面（薄い塗り）・線・点線 */
  kind: "area" | "line" | "dash";
};

/** スマホの凡例に並べる数（それより多いときは「ほか○種類」） */
const COMPACT_MAX = 8;

function Swatch({ item }: { item: LegendItem }) {
  if (item.kind === "area")
    return <span aria-hidden className="h-3 w-4 shrink-0 rounded-[3px] border-[1.5px]" style={{ borderColor: item.color, background: `${item.color}88` }} />;
  if (item.kind === "dash") return <span aria-hidden className="w-4 shrink-0 border-t-[3px] border-dashed" style={{ borderColor: item.color }} />;
  return <span aria-hidden className="h-[4px] w-4 shrink-0 rounded-full" style={{ background: item.color }} />;
}

/**
 * 凡例の箱。PC は名前を縦に並べる。スマホ（compact）は短い名前を折り返して並べ、地図をなるべく隠さない
 * （短い名前が同じになる種別、例えば豊島区の「1項5号(公道)」と「1項5号(私道)」は、元の名前で出す）
 */
export function MapLegend({ title, items, compact, foot }: { title: string; items: LegendItem[]; compact?: boolean; foot?: string }) {
  const shown = compact ? items.slice(0, COMPACT_MAX) : items;
  const dup = new Set(items.map((i) => i.short).filter((s, i, all) => all.indexOf(s) !== i));
  return (
    <div className={`rounded-xl bg-white/95 px-3 py-2 text-[11px] leading-[1.4] text-ink shadow-soft ${compact ? "" : "max-w-[248px]"}`}>
      <p className="mb-1 font-semibold">{title}</p>
      {/* PC は種別が多くても地図の高さに収まるよう、長ければ一覧の中でスクロール */}
      <ul className={compact ? "flex flex-wrap gap-x-2.5 gap-y-1" : "flex max-h-[32vh] flex-col gap-1 overflow-y-auto"}>
        {shown.map((item) => (
          <li key={`${item.label}|${item.color}`} className="flex items-center gap-1.5">
            <Swatch item={item} />
            <span>{compact && !dup.has(item.short) ? item.short : item.label}</span>
          </li>
        ))}
        {items.length > shown.length && <li className="text-muted">ほか{items.length - shown.length}種類</li>}
      </ul>
      {foot && <p className="mt-1 text-[10px] leading-[1.45] text-muted">{foot}</p>}
    </div>
  );
}
