"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/header";
import { HistoryChips, HistoryList } from "@/components/history-list";
import { AlertIcon, AreaIcon, ChevronRightIcon, ClockIcon, InfoIcon, MapIcon } from "@/components/icons";
import { MapIllustration, SkylineIllustration } from "@/components/illustrations";
import { CitiesSheet, HelpSheet, MenuSheet, type SheetName } from "@/components/info-sheets";
import { ResultView } from "@/components/result-view";
import { SearchCard } from "@/components/search-card";
import { Sheet } from "@/components/sheet";
import { addHistory, clearHistory, loadHistory, type HistoryItem } from "@/lib/history";
import { lookup, MUNICIPALITIES, type LookupResult } from "@/lib/roadmap";

type Shown = { query: string; result: LookupResult };

const PREFS = [...new Set(MUNICIPALITIES.map((m) => m.pref))];
// 関東の1都6県がそろったら地方名でまとめて表示する
const KANTO = ["東京都", "神奈川県", "埼玉県", "千葉県", "茨城県", "栃木県", "群馬県"];
const AREA_TEXT = KANTO.every((p) => PREFS.includes(p as (typeof PREFS)[number])) ? "関東1都6県" : PREFS.join("・");

const FEATURES: { key: SheetName; title: string; body: string; Icon: typeof MapIcon }[] = [
  { key: "help", title: "道路種別を確認", body: "公式の道路図を物件の場所で開く。", Icon: MapIcon },
  { key: "cities", title: "対応エリア", body: `${AREA_TEXT}の全${MUNICIPALITIES.length}市区町村。`, Icon: AreaIcon },
  { key: "help", title: "カンタン操作", body: "住所を入れるだけ。窓口も案内。", Icon: ClockIcon },
];

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sheet, setSheet] = useState<SheetName | "menu" | null>(null);
  const pushed = useRef(false);

  const search = useCallback(async (address: string, push: boolean) => {
    const q = address.trim();
    if (!q) return;
    setInput(q);
    setLoading(true);
    setError(null);
    try {
      const result = await lookup(q);
      setShown({ query: q, result });
      if (result.status !== "not_found") {
        setHistory(
          addHistory({
            address: q,
            city: result.status === "ok" ? result.municipality.name : undefined,
            coverage: result.status === "ok" ? result.municipality.coverage : undefined,
            at: Date.now(),
          }),
        );
      }
      // 端末の「戻る」でホームに戻れるよう、結果画面を履歴に積む
      if (push) {
        window.history.pushState(null, "", `?q=${encodeURIComponent(q)}`);
        pushed.current = true;
      }
      window.scrollTo(0, 0);
    } catch {
      setError("通信に失敗しました。電波の良い場所でもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回表示: 端末の履歴を読み、?q= 付きで開かれたらそのまま検索する
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    queueMicrotask(() => {
      setHistory(loadHistory());
      if (q) void search(q, false);
    });
    const onPop = () => {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) void search(q, false);
      else setShown(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [search]);

  function backHome() {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", window.location.pathname);
      setShown(null);
    }
  }

  const open = (name: SheetName | "menu") => setSheet(name);

  // iPhone の1画面（390×844pt）に収まる寸法。モックを 390pt 幅に換算して決めた
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-background">
      {/* 右上から流れるゴールドの細い弧（モックの飾り） */}
      <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute -right-40 -top-28 h-[360px] w-[360px] text-brand-light/40">
        <path d="M90 0 C130 150 250 250 400 290" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>

      <main className="relative mx-auto w-full max-w-md flex-1 px-4 pb-4 pt-[max(12px,env(safe-area-inset-top))]">
        <Header onMenu={() => open("menu")} onHome={shown ? backHome : undefined} compact={!!shown} />

        {shown ? (
          <div className="mt-4 space-y-3">
            <SearchCard value={input} onChange={setInput} onSearch={() => search(input, true)} loading={loading} compact />
            {error && <ErrorLine text={error} />}
            <ResultView query={shown.query} result={shown.result} />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <SearchCard value={input} onChange={setInput} onSearch={() => search(input, true)} loading={loading} />
            {error && <ErrorLine text={error} />}

            <HistoryChips items={history} onSelect={(a) => search(a, true)} onShowAll={() => open("history")} />

            <button
              onClick={() => open("help")}
              className="shadow-soft relative flex h-[132px] w-full overflow-hidden rounded-2xl border border-white bg-white text-left"
            >
              <span className="relative z-10 flex-1 py-4 pl-5 pr-2 [text-shadow:0_0_10px_#fff,0_0_3px_#fff]">
                <span className="mb-2.5 block h-px w-6 bg-brand-light" />
                <span className="block font-serif text-[17px] leading-[1.65] tracking-[0.08em] text-ink">
                  公式の地図で、
                  <br />
                  スムーズなご提案を。
                </span>
                <span className="mt-1.5 block text-[10.5px] leading-[1.7] text-muted">
                  国土地理院で場所を調べ、
                  <br />
                  市町村の公式道路図をその場所で開きます。
                </span>
              </span>
              <MapIllustration className="absolute -right-8 top-0 h-full w-[56%] opacity-90" />
              <span className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink shadow-soft">
                <ChevronRightIcon className="h-4 w-4" />
              </span>
            </button>

            <section>
              <h2 className="mb-2.5 flex items-center gap-3 px-1 text-[13px] tracking-[0.2em] text-ink">
                <span className="h-px w-8 bg-brand-light" />
                できること
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {FEATURES.map(({ key, title, body, Icon }) => (
                  <button
                    key={title}
                    onClick={() => open(key)}
                    className="shadow-soft relative flex h-[128px] flex-col rounded-xl border border-white bg-white px-2.5 pt-2.5 text-left"
                  >
                    <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-mint to-white text-brand-light">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="whitespace-nowrap text-[12px] font-medium text-ink">{title}</span>
                    <span className="mt-1 text-[10px] leading-[1.6] text-muted">{body}</span>
                    <span className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full border border-line text-ink">
                      <ChevronRightIcon className="h-3 w-3" />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <div className="relative -mx-4 -mb-2 h-[92px]">
              <SkylineIllustration className="absolute inset-0 h-full w-full" />
              <p className="absolute left-7 top-1 -rotate-[12deg] font-serif text-[13px] leading-6 tracking-[0.2em] text-ink/70">
                もっとスムーズに、
                <br />
                <span className="pl-6">もっと確実に。</span>
              </p>
              <svg aria-hidden viewBox="0 0 300 60" className="absolute left-5 top-11 w-48 text-brand-light">
                <path d="M2 58 C80 20 170 6 298 2" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            </div>
          </div>
        )}
      </main>

      <footer className="relative px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-1">
        <p className="mx-auto flex max-w-md items-start gap-2 text-[10.5px] leading-[1.7] text-muted">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          表示される地図は参考情報です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。
        </p>
      </footer>

      <MenuSheet open={sheet === "menu"} onClose={() => setSheet(null)} onOpen={open} />
      <HelpSheet open={sheet === "help"} onClose={() => setSheet(null)} />
      <CitiesSheet open={sheet === "cities"} onClose={() => setSheet(null)} />
      <Sheet title="検索履歴" open={sheet === "history"} onClose={() => setSheet(null)}>
        <HistoryList
          items={history}
          onSelect={(a) => {
            setSheet(null);
            void search(a, true);
          }}
          onClear={() => {
            clearHistory();
            setHistory([]);
          }}
        />
      </Sheet>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="flex gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-800">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}
