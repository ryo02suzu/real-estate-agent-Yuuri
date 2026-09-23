import type { HistoryItem } from "@/lib/history";
import { CoverageBadge } from "./coverage";
import { ChevronRightIcon, ClockIcon, PinIcon, TrashIcon } from "./icons";

export function HistoryList({ items, onSelect, onClear }: { items: HistoryItem[]; onSelect: (address: string) => void; onClear: () => void }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <ClockIcon className="h-4 w-4" />
          直近の検索
        </h2>
        <button onClick={onClear} className="flex items-center gap-1 text-xs text-muted hover:text-ink">
          <TrashIcon className="h-3.5 w-3.5" />
          すべて消去
        </button>
      </div>
      <ul className="space-y-2">
        {items.map((h) => (
          <li key={h.address}>
            <button
              onClick={() => onSelect(h.address)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white px-3 py-3 text-left hover:bg-mint/50"
            >
              <PinIcon className="h-5 w-5 shrink-0 text-brand-light" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{h.address}</span>
                {/* 住所が見つからなかった検索は履歴に残さないので、市が無い＝未対応の市町村 */}
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  {h.city ?? "未対応の市町村"}
                  {h.coverage && <CoverageBadge coverage={h.coverage} />}
                </span>
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-[11px] text-muted">履歴はこの端末の中だけに保存されます。</p>
    </section>
  );
}
