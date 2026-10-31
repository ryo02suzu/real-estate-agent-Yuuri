"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DesktopShell } from "@/components/desktop-shell";
import { Header } from "@/components/header";
import { useDesktop } from "@/lib/use-desktop";
import { HistoryChips, HistoryList } from "@/components/history-list";
import { AlertIcon, InfoIcon } from "@/components/icons";
import { CitiesSheet, HelpSheet, MenuSheet, type SheetName } from "@/components/info-sheets";
import { StageMap, type StageApi } from "@/components/stage-map";
import { createRunToken } from "@/lib/motion";
import { FullMap } from "@/components/full-map";
import { openDraft } from "@/components/draft-sheet";
import { GuideMapSheet } from "@/components/guide-map";
import { LocationPicker } from "@/components/location-picker";
import { ResultView, type MapOpen } from "@/components/result-view";
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


export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sheet, setSheet] = useState<SheetName | "menu" | null>(null);
  // スマホの「案内図」（メニューから開く。PC は結果の印刷の欄から）
  const [guide, setGuide] = useState(false);
  // スマホの「地図で選ぶ」画面（start: 最初に表示する地点）
  const [picker, setPicker] = useState<{ start?: { lat: number; lng: number } } | null>(null);
  // 住所で調べた回数。変わると PC の地図が物件の場所へ戻る（同じ住所で調べ直したときも）
  const [focus, setFocus] = useState(0);
  // スマホの「地図を拡大」（MICHILU の中の動く地図）。roads: 道路種別を重ねて開く
  const [fullMap, setFullMap] = useState<MapOpen | null>(null);
  const desktop = useDesktop();
  // スマホのホームの日本地図（PC では無し）。検索で確定した座標へここからズームする
  const stage = useRef<StageApi | null>(null);
  const onStageReady = useCallback((api: StageApi | null) => {
    stage.current = api;
  }, []);
  // 検索のたびに番号を進め、古い検索（連打・ズーム中の再検索）の結果や動きを捨てる
  const token = useRef(createRunToken());
  const shownRef = useRef(false);
  const last = useRef<{ target: { q: string } | { ll: [number, number] }; push: boolean } | null>(null);
  useEffect(() => {
    shownRef.current = !!shown;
    // 結果からホームへ戻ったら、地図も日本全体へ戻す
    if (!shown) stage.current?.home();
  }, [shown]);

  /** 住所（q）か、地図で選んだ地点（ll）で調べて結果を出す */
  const run = useCallback(async (target: { q: string } | { ll: [number, number] }, push: boolean) => {
    const id = token.current.next();
    last.current = { target, push };
    setLoading(true);
    setError(null);
    try {
      const result = "q" in target ? await lookup(target.q) : await lookupPoint(...target.ll);
      if (!token.current.isCurrent(id)) return;
      // 確定した実際の座標へ、日本地図から寄る（ホームからの検索だけ。結果の画面では静かに位置だけ合わせる）
      if (stage.current && (result.status === "ok" || result.status === "unsupported")) {
        const ok = await stage.current.flyTo(result.lat, result.lng, push && !shownRef.current);
        if (!ok || !token.current.isCurrent(id)) return;
      }
      const query = "q" in target ? target.q : result.status === "ok" || result.status === "unsupported" ? result.matchedAddress : "";
      setInput(query);
      setShown({ query, result });
      if ("q" in target) setFocus((n) => n + 1);
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
      if (token.current.isCurrent(id)) setError("通信に失敗しました。電波の良い場所でもう一度お試しください。");
    } finally {
      if (token.current.isCurrent(id)) setLoading(false);
    }
  }, []);
  const retry = () => last.current && void run(last.current.target, last.current.push);

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
      <MenuSheet
        open={sheet === "menu"}
        onClose={() => setSheet(null)}
        onOpen={open}
        onPrint={
          shown?.result.status === "ok"
            ? (kind) => {
                // 調査メモはそのまま印刷する（押した操作の中で呼ぶ。iPhone はプリントの画面から PDF にもできる）
                if (kind === "memo") window.print();
                else if (kind === "draft") openDraft();
                else setGuide(true);
                setSheet(null);
              }
            : undefined
        }
      />
      {shown?.result.status === "ok" && <GuideMapSheet result={shown.result} open={guide} onClose={() => setGuide(false)} />}
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
          focus={focus}
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

  // スクロールしない1画面の作り。ホームは日本地図の上にブランド・検索・最近の検索だけ。検索で確定した座標へ地図が寄り、結果のパネルが下から重なる
  return (
    <div className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${shown ? "bg-background" : "bg-mint"}`}>
      {/* ホームの背景：日本地図（結果が出ているあいだは後ろに残し、戻ると日本全体に戻る） */}
      <div className={`absolute inset-0 ${shown ? "pointer-events-none" : ""}`} aria-hidden={!!shown}>
        <StageMap onReady={onStageReady} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-3/5 bg-gradient-to-b from-background via-background/85 to-transparent" />
      </div>

      <main className={`relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] ${shown ? "panel-in bg-background lg:max-w-5xl lg:px-8" : "lg:max-w-lg"}`}>
        <Header onMenu={() => open("menu")} onHome={shown ? backHome : undefined} compact={!!shown} />

        {shown ? (
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 [&>*]:shrink-0 [&>*:last-child]:shrink">
            <SearchCard value={input} onChange={setInput} onSearch={() => search(input, true)} loading={loading} compact />
            {error && <ErrorLine text={error} onRetry={retry} />}
            <ResultView
              query={shown.query}
              result={shown.result}
              onPick={(a) => search(a, false)}
              onFix={() => {
                const r = shown.result;
                setPicker({ start: r.status === "ok" || r.status === "unsupported" ? { lat: r.lat, lng: r.lng } : undefined });
              }}
              onExpand={(o) => setFullMap(o ?? {})}
            />
          </div>
        ) : (
          <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4 [@media(max-height:720px)]:mt-3 [@media(max-height:720px)]:gap-3 [&>*:not(:last-child)]:shrink-0">
            <SearchCard value={input} onChange={setInput} onSearch={() => search(input, true)} loading={loading} onMap={() => setPicker({})} />
            {error && <ErrorLine text={error} onRetry={retry} />}

            <HistoryChips items={history} onSelect={pickHistory} onShowAll={() => open("history")} />

            {/* 残りの高さは日本地図を見せる */}
            <div className="min-h-0 flex-1" />
          </div>
        )}
      </main>

      <footer className={`relative px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-1 ${shown ? "" : "bg-gradient-to-t from-background/90 to-transparent pt-6"}`}>
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
      {fullMap && shown?.result.status === "ok" && (
        <FullMap
          result={shown.result}
          withRoads={fullMap.roads}
          hazard={fullMap.hazard}
          landPrice={fullMap.landPrice}
          onClose={() => setFullMap(null)}
          onPick={(lat, lng) => void searchPoint(lat, lng)}
        />
      )}
    </div>
  );
}

/** 失敗の理由と、もう一度試す導線（同じ検索をやり直す） */
function ErrorLine({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-2xl bg-[#f8efe9] p-3 text-sm text-[#8a4f3a]">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">{text}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="press -my-2 -mr-1 min-h-11 shrink-0 rounded-full px-3 font-bold text-brand hover:bg-white/60">
          もう一度試す
        </button>
      )}
    </div>
  );
}
