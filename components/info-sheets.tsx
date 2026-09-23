import { MUNICIPALITIES, type Municipality } from "@/lib/roadmap";
import { COVERAGE, CoverageBadge } from "./coverage";
import { Sheet } from "./sheet";

const ORDER: Municipality["coverage"][] = ["full", "partial", "none"];

export function CitiesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet title="対応している市" open={open} onClose={onClose}>
      <div className="space-y-5">
        {ORDER.map((cov) => {
          const cities = MUNICIPALITIES.filter((m) => m.coverage === cov);
          return (
            <section key={cov}>
              <div className="mb-1.5 flex items-center gap-2">
                <CoverageBadge coverage={cov} />
                <span className="text-xs text-muted">{cities.length}市</span>
              </div>
              <p className="mb-2 text-xs text-muted">{COVERAGE[cov].list}</p>
              <p className="text-sm leading-relaxed text-ink">{cities.map((m) => m.name).join("、")}</p>
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
    ["道路図を開く", "緑のボタンで市の公式道路図が開きます。利用規約に同意すると、物件の場所が画面中央の十字の位置に表示されます。"],
    ["分からなければ問い合わせ", "ネットで公開していない市は、窓口の連絡先を表示します。電話不可の市もあるので注意書きを確認してください。"],
  ];
  return (
    <Sheet title="使い方" open={open} onClose={onClose}>
      <ol className="space-y-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
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
          市の公式地図を開くためのツールです。地図は参考情報で、重要事項説明などの最終確認は必ず役所の窓口で行ってください。
        </p>
      </div>
    </Sheet>
  );
}
