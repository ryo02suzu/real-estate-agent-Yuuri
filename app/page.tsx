"use client";

import { useCallback, useEffect, useState } from "react";
import { DesktopShell } from "@/components/desktop-shell";
import { Header } from "@/components/header";
import { useDesktop } from "@/lib/use-desktop";
import { HistoryChips, HistoryList } from "@/components/history-list";
import { AlertIcon, AreaIcon, ChevronRightIcon, ClockIcon, InfoIcon, MapIcon } from "@/components/icons";
import { MapIllustration, SkylineIllustration } from "@/components/illustrations";
import { CitiesSheet, HelpSheet, MenuSheet, type SheetName } from "@/components/info-sheets";
import { LocationPicker } from "@/components/location-picker";
import { ResultView } from "@/components/result-view";
import { SearchCard } from "@/components/search-card";
import { Sheet } from "@/components/sheet";
import { addHistory, clearHistory, loadHistory, type HistoryItem } from "@/lib/history";
import { lookup, lookupPoint, MUNICIPALITIES, type LookupResult } from "@/lib/roadmap";

type Shown = { query: string; result: LookupResult };
/** 地図で選んだ地点の URL（?ll=緯度,経度）。小数5桁（約1m） */
const llParam = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
/** いまの画面が、ホームから何画面進んだところか（pushState で積んだ数） */
function historyDepth(): number {
  const d = (window.history.state as { depth?: unknown } | null)?.depth;
  return typeof d === "number" ? d : 0;
}
function parseLl(v: string | null): [number, number] | null {
  const m = v?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

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
  // スマホの「地図で選ぶ」画面（start: 最初に表示する地点）
  const [picker, setPicker] = useState<{ start?: { lat: number; lng: number } } | null>(null);
  const desktop = useDesktop();

  /** 住所（q）か、地図で選んだ地点（ll）で調べて結果を出す */
  const run = useCallback(async (target: { q: string } | { ll: [number, number] }, push: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const result = "q" in target ? await lookup(target.q) : await lookupPoint(...target.ll);
      const query = "q" in target ? target.q : result.status === "ok" || result.status === "unsupported" ? result.matchedAddress : "";
      setInput(query);
      setShown({ query, result });
      if (result.status === "ok" || result.status === "unsupported") {
        setHistory(
          addHistory({
            address: query,
            city: result.status === "ok" ? result.municipality.name : undefined,
            coverage: result.status === "ok" ? result.municipality.coverage : undefined,
            at: Date.now(),
            ...("ll" in target ? { ll: target.ll } : {}),
          }),
        );
      }
      // 端末の「戻る」でひとつ前の画面に戻れるよう、結果画面を履歴に積む
      const url = "q" in target ? `?q=${encodeURIComponent(target.q)}` : `?ll=${llParam(...target.ll)}`;
      // depth: ホームから何画面進んだか（ロゴで一度にホームへ戻るのに使う）
      if (push) window.history.pushState({ ...window.history.state, depth: historyDepth() + 1 }, "", url);
      window.scrollTo(0, 0);
    } catch {
      setError("通信に失敗しました。電波の良い場所でもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }, []);

  const search = useCallback(
    (address: string, push: boolean) => {
      const q = address.trim();
      if (!q) return;
      setInput(q);
      return run({ q }, push);
    },
    [run],
  );
  const searchPoint = useCallback((lat: number, lng: number, push = true) => run({ ll: [lat, lng] }, push), [run]);
  const pickHistory = (h: HistoryItem) => (h.ll ? searchPoint(h.ll[0], h.ll[1]) : search(h.address, true));

  // 初回表示: 端末の履歴を読み、?q= / ?ll= 付きで開かれたらそのまま調べる
  useEffect(() => {
    const fromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      const ll = parseLl(params.get("ll"));
      if (q) void search(q, false);
      else if (ll) void searchPoint(ll[0], ll[1], false);
      return !!(q || ll);
    };
    queueMicrotask(() => {
      setHistory(loadHistory());
      fromUrl();
    });
    const onPop = () => {
      if (!fromUrl()) setShown(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [search, searchPoint]);

  // ホームへ。結果画面を積んできた分だけ戻る（地図で選び直した画面も含めて一度に）
  function backHome() {
    const depth = historyDepth();
    if (depth > 0) window.history.go(-depth);
    else {
      window.history.replaceState(window.history.state, "", window.location.pathname);
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
          onSelect={(h) => {
            setSheet(null);
            void pickHistory(h);
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
      <>
        <DesktopShell
          shown={shown}
          input={input}
          setInput={setInput}
          loading={loading}
          error={error}
          history={history}
          areaText={AREA_TEXT}
          onSearch={() => search(input, true)}
          onPickAddress={(a) => search(a, false)}
          onPickPoint={(lat, lng) => searchPoint(lat, lng)}
          onPickHistory={pickHistory}
          onOpen={open}
          onHome={shown ? backHome : undefined}
        />
        {sheetsEl}
      </>
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
            <ResultView
              query={shown.query}
              result={shown.result}
              onPick={(a) => search(a, false)}
              onFix={() => {
                const r = shown.result;
                setPicker({ start: r.status === "ok" || r.status === "unsupported" ? { lat: r.lat, lng: r.lng } : undefined });
              }}
            />
          </div>
        ) : (
          <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4 [@media(max-height:720px)]:mt-3 [@media(max-height:720px)]:gap-3 [&>*:not(:last-child)]:shrink-0">
            <SearchCard value={input} onChange={setInput} onSearch={() => search(input, true)} loading={loading} onMap={() => setPicker({})} />
            {error && <ErrorLine text={error} />}

            <HistoryChips items={history} onSelect={pickHistory} onShowAll={() => open("history")} />

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
          {/* 結果の画面と背の低い画面では1行に（結果をスクロールさせない） */}
          <span className={shown ? "hidden" : "[@media(max-height:720px)]:hidden"}>表示される地図は参考情報です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。</span>
          <span className={shown ? "inline" : "hidden [@media(max-height:720px)]:inline"}>地図は参考情報です。最終確認は必ず役所の窓口で。</span>
        </p>
      </footer>

      {sheetsEl}
      {picker && (
        <LocationPicker
          start={picker.start}
          onClose={() => setPicker(null)}
          onPick={(lat, lng) => {
            setPicker(null);
            void searchPoint(lat, lng);
          }}
        />
      )}
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
