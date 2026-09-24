import { MUNICIPALITIES, type Municipality } from "@/lib/roadmap";
import { COVERAGE, CoverageBadge } from "./coverage";
import { AreaIcon, ChevronRightIcon, ClockIcon, InfoIcon } from "./icons";
import { Sheet } from "./sheet";

const ORDER: Municipality["coverage"][] = ["full", "partial", "none", "outside"];

export function CitiesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = [...new Set(MUNICIPALITIES.map((m) => m.pref))];
  return (
    <Sheet title="対応している市町村" open={open} onClose={onClose}>
      <div className="space-y-7">
        {prefs.map((pref) => {
          const inPref = MUNICIPALITIES.filter((m) => m.pref === pref);
          return (
            <section key={pref}>
              <h3 className="mb-3 border-b border-line pb-1 font-bold text-ink">
                {pref}
                <span className="ml-2 text-xs font-normal text-muted">全{inPref.length}市町村</span>
              </h3>
              <div className="space-y-4">
                {ORDER.map((cov) => {
                  const list = inPref.filter((m) => m.coverage === cov);
                  if (list.length === 0) return null;
                  return (
                    <div key={cov}>
                      <div className="mb-1 flex items-center gap-2">
                        <CoverageBadge coverage={cov} />
                        <span className="text-xs text-muted">{list.length}</span>
                      </div>
                      <p className="mb-1.5 text-xs text-muted">{COVERAGE[cov].list}</p>
                      <p className="text-sm leading-relaxed text-ink">
                        {list.map((m, i) => (
                          <span key={m.name} className="whitespace-nowrap">
                            {m.name}
                            {i < list.length - 1 && "、"}
                          </span>
                        ))}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        <p className="text-xs text-muted">この一覧にない市町村は「未対応」と表示されます。</p>
      </div>
    </Sheet>
  );
}

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps = [
    ["住所を入れて検索", "物件の住所を貼り付けて検索します。"],
    ["場所と市を確認", "「〇〇付近」が物件の場所と合っているか確認します。"],
    ["道路図を開く", "地図のボタンで市町村の公式道路図が開きます。利用規約に同意すると、物件の場所が地図の中央に表示されます。"],
    ["分からなければ問い合わせ", "ネットで公開していない市町村は、窓口の連絡先を表示します。電話不可の市もあるので注意書きを確認してください。"],
  ];
  return (
    <Sheet title="使い方" open={open} onClose={onClose}>
      <ol className="space-y-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-sm font-bold text-white">{i + 1}</span>
            <span>
              <span className="block font-bold text-ink">{title}</span>
              <span className="text-sm text-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-2xl bg-mint p-4 text-sm text-ink">
        <p className="font-bold">MICHILUは判定をしません</p>
        <p className="mt-1 text-muted">
          市町村の公式地図を開くためのツールです。地図は参考情報で、重要事項説明などの最終確認は必ず役所の窓口で行ってください。
        </p>
      </div>
    </Sheet>
  );
}

export type SheetName = "help" | "cities" | "history";

export function MenuSheet({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (s: SheetName) => void }) {
  const items: [SheetName, string, typeof InfoIcon][] = [
    ["help", "使い方", InfoIcon],
    ["cities", "対応している市区町村", AreaIcon],
    ["history", "検索履歴", ClockIcon],
  ];
  return (
    <Sheet title="メニュー" open={open} onClose={onClose}>
      <ul className="divide-y divide-line">
        {items.map(([key, label, Icon]) => (
          <li key={key}>
            <button onClick={() => onOpen(key)} className="flex w-full items-center gap-3 py-4 text-left text-ink">
              <Icon className="h-5 w-5 text-brand-light" />
              <span className="flex-1">{label}</span>
              <ChevronRightIcon className="h-4 w-4 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
