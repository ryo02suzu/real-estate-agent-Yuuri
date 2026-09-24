import type { Municipality } from "@/lib/roadmap";

type Coverage = Municipality["coverage"];

export const COVERAGE: Record<Coverage, { short: string; long: string; list: string; badge: string; panel: string; dot: string }> = {
  full: {
    short: "全種別あり",
    long: "この市町村の地図で、建築基準法上の道路種別がすべて分かります。",
    list: "市町村の地図で道路種別がすべて分かる",
    badge: "bg-green-100 text-green-800",
    panel: "bg-green-50 text-green-900 border-green-200",
    dot: "bg-green-500",
  },
  partial: {
    short: "一部のみ",
    long: "ネットで分かるのは位置指定道路など一部だけです。地図に載っていない道路は窓口で確認してください。",
    list: "位置指定道路など、一部だけネットで分かる",
    badge: "bg-amber-100 text-amber-800",
    panel: "bg-amber-50 text-amber-900 border-amber-200",
    dot: "bg-amber-500",
  },
  none: {
    short: "ネット非公開",
    long: "道路種別はネットで公開されていません。下の窓口に問い合わせてください。",
    list: "ネットでは分からない（問い合わせ先を表示します）",
    badge: "bg-red-100 text-red-800",
    panel: "bg-red-50 text-red-900 border-red-200",
    dot: "bg-red-500",
  },
  outside: {
    short: "都市計画区域外",
    long: "この市町村には都市計画区域がありません。建築基準法の接道義務（43条）は原則かかりませんが、条例や開発の条件があるため、下の窓口で確認してください。",
    list: "都市計画区域外（接道義務は原則かからない。窓口で確認）",
    badge: "bg-slate-100 text-slate-700",
    panel: "bg-slate-50 text-slate-800 border-slate-200",
    dot: "bg-slate-500",
  },
};

export function CoverageBadge({ coverage }: { coverage: Coverage }) {
  const c = COVERAGE[coverage];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${c.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.short}
    </span>
  );
}
