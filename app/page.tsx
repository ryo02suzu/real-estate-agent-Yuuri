"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/header";
import { HistoryList } from "@/components/history-list";
import { AlertIcon, ChevronRightIcon, MapIcon } from "@/components/icons";
import { CitiesSheet, HelpSheet } from "@/components/info-sheets";
import { ResultView } from "@/components/result-view";
import { SearchCard } from "@/components/search-card";
import { addHistory, clearHistory, loadHistory, type HistoryItem } from "@/lib/history";
import { lookup, MUNICIPALITIES, type LookupResult } from "@/lib/roadmap";

type Shown = { query: string; result: LookupResult };

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sheet, setSheet] = useState<"help" | "cities" | null>(null);
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

  return (
    <div className="flex flex-1 flex-col bg-background">
      <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 pb-8 pt-6">
        <Header onHelp={() => setSheet("help")} compact={!!shown} />

        {shown ? (
          <ResultView query={shown.query} result={shown.result} onBack={backHome} />
        ) : (
          <>
            <SearchCard
              value={input}
              onChange={setInput}
              onSearch={() => search(input, true)}
              loading={loading}
              cityCount={MUNICIPALITIES.length}
              onShowCities={() => setSheet("cities")}
            />
            {error && (
              <p role="alert" className="flex gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-800">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            {history.length === 0 && (
              <button onClick={() => setSheet("help")} className="flex w-full items-center gap-4 rounded-3xl border border-line bg-white/80 p-4 text-left">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mint text-brand">
                  <MapIcon className="h-6 w-6" />
                </span>
                <span className="flex-1">
                  <span className="block font-bold text-brand">このアプリでできること</span>
                  <span className="text-sm text-muted">住所から、市の公式道路図を物件の場所で開きます。ネットで分からない市は問い合わせ先を案内します。</span>
                </span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
              </button>
            )}
            <HistoryList
              items={history}
              onSelect={(a) => search(a, true)}
              onClear={() => {
                clearHistory();
                setHistory([]);
              }}
            />
          </>
        )}
      </main>

      <footer className="border-t border-line bg-white/70 px-4 py-4">
        <p className="mx-auto flex max-w-md gap-2 text-xs text-muted">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          表示される地図は参考情報です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。
        </p>
      </footer>

      <HelpSheet open={sheet === "help"} onClose={() => setSheet(null)} />
      <CitiesSheet open={sheet === "cities"} onClose={() => setSheet(null)} />
    </div>
  );
}
