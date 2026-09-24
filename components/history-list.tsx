import type { HistoryItem } from "@/lib/history";
import { CoverageBadge } from "./coverage";
import { ChevronRightIcon, ClockIcon, PinIcon, TrashIcon } from "./icons";

/** ホームの「直近の検索履歴」。横スクロールのチップ */
export function HistoryChips({ items, onSelect, onShowAll }: { items: HistoryItem[]; onSelect: (address: string) => void; onShowAll: () => void }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2.5 text-[15px] tracking-[0.08em] text-ink">
          <ClockIcon className="h-6 w-6 text-brand-light" />
          直近の検索履歴
        </h2>
        <button onClick={onShowAll} className="flex items-center gap-1 text-xs tracking-[0.08em] text-muted hover:text-ink">
          すべて見る
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {items.map((h) => (
          <li key={h.address} className="shrink-0">
            <button
              onClick={() => onSelect(h.address)}
              className="flex max-w-[15rem] items-center gap-2 rounded-full border border-line/60 bg-white px-4 py-2.5 text-[13px] text-ink shadow-soft hover:bg-mint/60"
            >
              <PinIcon className="h-4 w-4 shrink-0 text-ink/70" />
              <span className="truncate">{h.address}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 「すべて見る」のシートの中身。市と公開レベルつき */
export function HistoryList({ items, onSelect, onClear }: { items: HistoryItem[]; onSelect: (address: string) => void; onClear: () => void }) {
  if (items.length === 0) return <p className="text-sm text-muted">まだ検索履歴はありません。</p>;
  return (
    <section>
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
      <div className="mt-3 flex items-center justify-between px-1">
        <p className="text-[11px] text-muted">履歴はこの端末の中だけに保存されます。</p>
        <button onClick={onClear} className="flex items-center gap-1 text-xs text-muted hover:text-ink">
          <TrashIcon className="h-3.5 w-3.5" />
          すべて消去
        </button>
      </div>
    </section>
  );
}
