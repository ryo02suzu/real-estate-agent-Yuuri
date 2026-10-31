"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DesktopShell } from "@/components/desktop-shell";
import { useDesktop } from "@/lib/use-desktop";
import { HistoryList } from "@/components/history-list";
import { CitiesSheet, HelpSheet, MenuSheet, type SheetName } from "@/components/info-sheets";
import { FullMap } from "@/components/full-map";
import { openDraft } from "@/components/draft-sheet";
import { GuideMapSheet } from "@/components/guide-map";
import { LocationPicker } from "@/components/location-picker";
import { MobileShell } from "@/components/mobile-shell";
import type { MapOpen } from "@/components/result-view";
import { Sheet } from "@/components/sheet";
import { addHistory, clearHistory, loadHistory, type HistoryItem } from "@/lib/history";
import { createGeneration, runGuarded } from "@/lib/search-gen";
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
  // 住所で調べた回数。変わると地図が物件の場所へ戻る（同じ住所で調べ直したときも）
  const [focus, setFocus] = useState(0);
  // スマホの「地図を拡大」（MICHILU の中の動く地図）。roads: 道路種別を重ねて開く
  const [fullMap, setFullMap] = useState<MapOpen | null>(null);
  const desktop = useDesktop();

  // 検索の世代。新検索・ホーム・戻るで進め、古い応答が画面・履歴・URLを上書きしないようにする
  const gen = useRef(createGeneration());

  /** 住所（q）か、地図で選んだ地点（ll）で調べて結果を出す */
  const run = useCallback(
    (target: { q: string } | { ll: [number, number] }, push: boolean) =>
      runGuarded(gen.current, () => ("q" in target ? lookup(target.q) : lookupPoint(...target.ll)), {
        onStart: () => {
          setLoading(true);
          setError(null);
        },
        onResult: (result) => {
          const query = "q" in target ? target.q : result.status === "ok" || result.status === "unsupported" ? result.matchedAddress : "";
          // 住所・結果（ピン・サブデータの元）・履歴・URL は、この応答ひとつから同時に決める
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
        },
        onError: () => setError("通信に失敗しました。電波の良い場所でもう一度お試しください。"),
        onSettled: () => setLoading(false),
      }),
    [],
  );

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
      // 戻る・進むで、飛んでいる検索の応答は無効にする（fromUrl が新しい検索を始めればその世代が有効）
      gen.current.cancel();
      setLoading(false);
      setError(null);
      if (!fromUrl()) setShown(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [search, searchPoint]);

  // ホームへ。結果画面を積んできた分だけ戻る（地図で選び直した画面も含めて一度に）
  function backHome() {
    gen.current.cancel();
    setLoading(false);
    setError(null);
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

  // スマホ：日本地図の上に検索ドックと結果パネル（components/mobile-shell.tsx）
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <MobileShell
        shown={shown}
        focus={focus}
        input={input}
        setInput={setInput}
        loading={loading}
        error={error}
        history={history}
        onSearch={() => search(input, true)}
        onPickAddress={(a) => search(a, false)}
        onPickHistory={pickHistory}
        onShowHistory={() => open("history")}
        onMenu={() => open("menu")}
        onHome={backHome}
        onMap={() => setPicker({})}
        onFix={() => {
          const r = shown?.result;
          setPicker({ start: r && (r.status === "ok" || r.status === "unsupported") ? { lat: r.lat, lng: r.lng } : undefined });
        }}
        onExpand={(o) => setFullMap(o ?? {})}
        onOpenHelp={() => open("help")}
        onOpenCities={() => open("cities")}
      />

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
