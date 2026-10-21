"use client";

// スマホのホーム（検索する前）の、検索窓の下：「MICHILUの強み」のカード、最近調べた場所、できること、対応エリア
import { MUNICIPALITIES } from "@/lib/roadmap";
import { historyKey, type HistoryItem } from "@/lib/history";
import { CoverageBadge } from "./coverage";
import { ChevronRightIcon, HazardIcon, InfoIcon, LandPriceIcon, MapIcon, ParcelIcon, PinIcon, RoadIcon, TrainIcon, ZoningIcon } from "./icons";
import { StrengthCard } from "./strength-card";

const FEATURES: { title: string; body: string; Icon: typeof MapIcon }[] = [
  { title: "道路種別", body: "公式の道路図を物件の場所で開く", Icon: RoadIcon },
  { title: "法令・規制", body: "用途地域・建ぺい率・容積率・防火", Icon: ZoningIcon },
  { title: "ハザード", body: "洪水・土砂・高潮・津波の想定区域", Icon: HazardIcon },
  { title: "地番・筆", body: "謄本を取る地番と隣地の一覧", Icon: ParcelIcon },
  { title: "周辺環境", body: "駅・学校・施設までの徒歩の目安", Icon: TrainIcon },
  { title: "相場・地価", body: "近くの公示地価と路線価", Icon: LandPriceIcon },
];

/** 「今日」「昨日」「10月19日」 */
function when(at: number): string {
  const d = new Date(at);
  const day = (x: Date) => Math.floor((x.getTime() - x.getTimezoneOffset() * 60000) / 86400000);
  const diff = day(new Date()) - day(d);
  return diff <= 0 ? "今日" : diff === 1 ? "昨日" : `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function MobileHome({
  history,
  onPickHistory,
  onShowHistory,
  onHelp,
  onCities,
  onStart,
  areaText,
}: {
  history: HistoryItem[];
  onPickHistory: (h: HistoryItem) => void;
  onShowHistory: () => void;
  onHelp: () => void;
  onCities: () => void;
  /** 「住所を入れて調べる」：検索窓へ */
  onStart: () => void;
  areaText: string;
}) {
  return (
    <>
      <div className="px-4 pb-4 pt-1">
        <StrengthCard onStart={onStart} />
      </div>
      <div className="rounded-t-[24px] bg-white px-4 pb-6 pt-4 shadow-[0_-10px_30px_rgba(15,47,95,0.07)]">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-navy-deep">最近調べた場所</h2>
            {history.length > 0 && (
              <button onClick={onShowHistory} className="flex items-center text-[11.5px] text-navy">
                すべて見る
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="rounded-2xl border border-hairline px-3 py-3 text-[12px] leading-[1.6] text-steel">住所を入れて調べると、ここに残ります（この端末の中だけ）。</p>
          ) : (
            <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
              {history.slice(0, 3).map((h) => (
                <li key={historyKey(h)}>
                  <button onClick={() => onPickHistory(h)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-mist">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mist text-navy">{h.ll ? <MapIcon className="h-4 w-4" /> : <PinIcon className="h-4 w-4" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-navy-deep">{h.address}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-steel">
                        {h.city ?? "未対応の市町村"}・{when(h.at)}
                        {h.coverage && <CoverageBadge coverage={h.coverage} />}
                      </span>
                    </span>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-steel" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5">
          <h2 className="mb-2.5 text-[14px] font-bold text-navy-deep">できること</h2>
          <div className="grid grid-cols-2 gap-2">
            {FEATURES.map(({ title, body, Icon }) => (
              <button key={title} onClick={onHelp} className="flex items-start gap-2.5 rounded-2xl border border-hairline bg-sky/70 px-3 py-3 text-left active:bg-mist">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-navy shadow-[0_2px_8px_rgba(15,47,95,0.08)]">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-navy-deep">{title}</span>
                  <span className="mt-0.5 block text-[10.5px] leading-[1.55] text-steel">{body}</span>
                </span>
              </button>
            ))}
          </div>
          <button onClick={onCities} className="mt-2 flex w-full items-center gap-2.5 rounded-2xl border border-hairline px-3 py-3 text-left active:bg-mist">
            <span className="text-[12px] text-steel">対応エリア</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-navy-deep">
              {areaText}・全{MUNICIPALITIES.length}市区町村
            </span>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-steel" />
          </button>
        </section>

        <p className="mt-5 flex items-start gap-2 text-[10.5px] leading-[1.7] text-steel">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
          表示される地図は参考情報です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。
        </p>
      </div>
    </>
  );
}
