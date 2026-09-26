"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DesktopHeader, Header } from "@/components/header";
import { useDesktop } from "@/lib/use-desktop";
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
  const desktop = useDesktop();

  const search = useCallback(async (address: string, push: boolean) => {
    const q = address.trim();
    if (!q) return;
    setInput(q);
    setLoading(true);
    setError(null);
    try {
      const result = await lookup(q);
      setShown({ query: q, result });
      if (result.status === "ok" || result.status === "unsupported") {
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

  const sheetsEl = (
    <>
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
    </>
  );

  if (desktop) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute -right-24 -top-24 h-[520px] w-[520px] text-brand-light/40">
          <path d="M90 0 C130 150 250 250 400 290" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
        <main className="relative mx-auto flex min-h-0 w-full max-w-[1280px] flex-1 flex-col px-10 pb-4 pt-6">
          <DesktopHeader onHome={shown ? backHome : undefined} onOpen={open}>
            {shown && (
              <div className="max-w-2xl">
                <SearchCard value={input} onChange={setInput} onSearch={() => search(input, true)} loading={loading} compact />
              </div>
            )}
          </DesktopHeader>
          {error && (
            <div className="mt-4">
              <ErrorLine text={error} />
            </div>
          )}
          {shown ? (
            <div className="mt-6 flex min-h-0 flex-1 flex-col">
              {shown.result.status === "ok" ? (
                <ResultView query={shown.query} result={shown.result} onPick={(a) => search(a, false)} desktop />
              ) : (
                <div className="mx-auto w-full max-w-xl">
                  <ResultView query={shown.query} result={shown.result} onPick={(a) => search(a, false)} />
                </div>
              )}
            </div>
          ) : (
            <DesktopHome
              input={input}
              setInput={setInput}
              loading={loading}
              onSearch={() => search(input, true)}
              history={history}
              onPick={(a) => search(a, true)}
              onOpen={open}
            />
          )}
        </main>
        <footer className="relative px-10 pb-4">
          <p className="mx-auto flex max-w-[1280px] items-center justify-center gap-2 text-[11.5px] text-muted">
            <InfoIcon className="h-4 w-4 shrink-0" />
            表示される地図は参考情報です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。
          </p>
        </footer>
        {sheetsEl}
      </div>
    );
  }

  // スクロールしない1画面の作り。画面の高さに応じて、ホームは街並みの絵、結果は地図プレビューが伸び縮みする
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* 右上から流れるゴールドの細い弧（モックの飾り） */}
      <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute -right-40 -top-28 h-[360px] w-[360px] text-brand-light/40">
        <path d="M90 0 C130 150 250 250 400 290" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>

      <main className={`relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] ${shown ? "lg:max-w-5xl lg:px-8" : "lg:max-w-lg"}`}>
        <Header onMenu={() => open("menu")} onHome={shown ? backHome : undefined} compact={!!shown} />

        {shown ? (
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 [&>*]:shrink-0 [&>*:last-child]:shrink">
            <SearchCard value={input} onChange={setInput} onSearch={() => search(input, true)} loading={loading} compact />
            {error && <ErrorLine text={error} />}
            <ResultView query={shown.query} result={shown.result} onPick={(a) => search(a, false)} />
          </div>
        ) : (
          <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4 [@media(max-height:720px)]:mt-3 [@media(max-height:720px)]:gap-3 [&>*:not(:last-child)]:shrink-0">
            <SearchCard value={input} onChange={setInput} onSearch={() => search(input, true)} loading={loading} />
            {error && <ErrorLine text={error} />}

            <HistoryChips items={history} onSelect={(a) => search(a, true)} onShowAll={() => open("history")} />

            <button
              onClick={() => open("help")}
              className="shadow-soft relative flex h-[132px] w-full overflow-hidden rounded-2xl border border-white bg-white text-left [@media(max-height:720px)]:hidden"
            >
              <span className="relative z-10 flex-1 py-4 pl-5 pr-2 [text-shadow:0_0_10px_#fff,0_0_3px_#fff]">
                <span className="mb-2.5 block h-px w-6 bg-brand-light" />
                <span className="block text-[17px] font-semibold leading-[1.6] tracking-[0.04em] text-ink">
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

            <div className="relative -mx-4 -mb-2 min-h-[64px] flex-1 lg:max-h-[200px]">
              <SkylineIllustration className="absolute inset-0 h-full w-full" />
              <p className="absolute left-7 top-1 -rotate-[12deg] text-[13px] leading-6 tracking-[0.15em] text-ink/70">
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
        <p className="mx-auto flex max-w-md items-start gap-2 text-[10.5px] lg:max-w-5xl lg:justify-center leading-[1.7] text-muted">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          表示される地図は参考情報です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。
        </p>
      </footer>

      {sheetsEl}
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="flex gap-2 rounded-2xl bg-[#f8efe9] p-3 text-sm text-[#8a4f3a]">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}

/** PC のホーム。左：見出し・検索・履歴、右：地図の絵とできること。下に街並み */
function DesktopHome({
  input,
  setInput,
  loading,
  onSearch,
  history,
  onPick,
  onOpen,
}: {
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onSearch: () => void;
  history: HistoryItem[];
  onPick: (address: string) => void;
  onOpen: (name: SheetName) => void;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="grid flex-1 grid-cols-[1.05fr_1fr] items-center gap-14">
        <section>
          <span className="mb-5 block h-px w-12 bg-brand-light" />
          <h1 className="text-[38px] font-semibold leading-[1.45] tracking-[0.04em] text-ink xl:text-[44px]">
            住所から、
            <br />
            道路種別の確認先へ。
          </h1>
          <p className="mt-4 text-[15px] leading-[1.9] text-muted">
            国土地理院で物件の場所を調べ、市区町村の公式道路図をその場所で開きます。
            <br />
            ネットで分からない市は、窓口と聞くことを案内します。
          </p>
          <div className="mt-8">
            <SearchCard value={input} onChange={setInput} onSearch={onSearch} loading={loading} />
          </div>
          <div className="mt-6">
            <HistoryChips items={history.slice(0, 3)} onSelect={onPick} onShowAll={() => onOpen("history")} />
          </div>
          <dl className="mt-8 flex gap-10">
            {[
              [`${MUNICIPALITIES.length}`, "対応市区町村"],
              [AREA_TEXT, "対応エリア"],
              ["毎週", "地図リンクの自動確認"],
            ].map(([v, k]) => (
              <div key={k}>
                <dt className="text-[11.5px] text-muted">{k}</dt>
                <dd className="mt-0.5 text-[22px] font-semibold tracking-[0.02em] text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col gap-4">
          <button
            onClick={() => onOpen("help")}
            className="shadow-soft relative flex h-[250px] w-full overflow-hidden rounded-3xl border border-white bg-white text-left"
          >
            <span className="relative z-10 flex-1 py-8 pl-8 pr-2 [text-shadow:0_0_10px_#fff,0_0_3px_#fff]">
              <span className="mb-3 block h-px w-8 bg-brand-light" />
              <span className="block text-[24px] font-semibold leading-[1.6] tracking-[0.04em] text-ink">
                公式の地図で、
                <br />
                スムーズなご提案を。
              </span>
              <span className="mt-3 block text-[12.5px] leading-[1.8] text-muted">使い方を見る</span>
            </span>
            <MapIllustration className="absolute -right-6 top-0 h-full w-[60%] opacity-90" />
          </button>
          <div className="grid grid-cols-3 gap-4">
            {FEATURES.map(({ key, title, body, Icon }) => (
              <button
                key={title}
                onClick={() => onOpen(key)}
                className="shadow-soft relative flex flex-col rounded-2xl border border-white bg-white p-4 pb-10 text-left transition hover:-translate-y-0.5"
              >
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-mint to-white text-brand-light">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[14px] font-medium text-ink">{title}</span>
                <span className="mt-1.5 text-[12px] leading-[1.7] text-muted">{body}</span>
                <span className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink">
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <SkylineIllustration className="pointer-events-none absolute -bottom-4 right-0 h-[130px] w-[520px] opacity-70" />
    </div>
  );
}
