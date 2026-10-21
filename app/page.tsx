"use client";

import { useCallback, useEffect, useState } from "react";
import { DesktopShell } from "@/components/desktop-shell";
import { Header } from "@/components/header";
import { useDesktop } from "@/lib/use-desktop";
import { HistoryList } from "@/components/history-list";
import { MockHome } from "@/components/mock-home";
import { AlertIcon, AreaIcon, BookmarkIcon, ChevronRightIcon, ClockIcon, InfoIcon, PinIcon, TrashIcon } from "@/components/icons";
import { CitiesSheet, HelpSheet, MenuSheet, type SheetName } from "@/components/info-sheets";
import { FullMap } from "@/components/full-map";
import { openDraft } from "@/components/draft-sheet";
import { GuideMapSheet } from "@/components/guide-map";
import { LocationPicker } from "@/components/location-picker";
import { ResultView, type MapOpen } from "@/components/result-view";
import { SearchCard } from "@/components/search-card";
import { Sheet } from "@/components/sheet";
import { favoriteKey, loadFavorites, removeFavorite, type FavoriteItem } from "@/lib/favorites";
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

/** 下から出る画面。メニュー・お気に入り・マイページは、このファイルの中で出す */
type AnySheet = SheetName | "menu" | "favorites" | "account";

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  // お気に入り（保存した物件。端末の中だけ）
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [sheet, setSheet] = useState<AnySheet | null>(null);
  // スマホの「案内図」（メニューから開く。PC は結果の印刷の欄から）
  const [guide, setGuide] = useState(false);
  // スマホの「地図で選ぶ」画面（start: 最初に表示する地点）
  const [picker, setPicker] = useState<{ start?: { lat: number; lng: number } } | null>(null);
  // 住所で調べた回数。変わると PC の地図が物件の場所へ戻る（同じ住所で調べ直したときも）
  const [focus, setFocus] = useState(0);
  // スマホの「地図を拡大」（MICHILU の中の動く地図）。roads: 道路種別を重ねて開く
  const [fullMap, setFullMap] = useState<MapOpen | null>(null);
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
      setFavorites(loadFavorites());
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

  const open = (name: AnySheet) => setSheet(name);

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
      <Sheet title="お気に入り" open={sheet === "favorites"} onClose={() => setSheet(null)}>
        {favorites.length === 0 ? (
          <div className="py-2">
            <p className="text-[14px] text-ink">保存した物件はまだありません。</p>
            <p className="mt-2 text-[12px] leading-[1.7] text-muted">調べた物件を「お気に入り」で保存できるようにする機能は、結果の画面を新しい見た目にするときに入れます。保存した物件はこの端末の中だけに残ります。</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {favorites.map((f) => (
              <li key={favoriteKey(f)} className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-3">
                <button
                  onClick={() => {
                    setSheet(null);
                    void pickHistory(f);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <PinIcon className="h-5 w-5 shrink-0 text-brand-light" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{f.address}</span>
                    {f.city && <span className="mt-0.5 block text-xs text-muted">{f.city}</span>}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
                </button>
                <button onClick={() => setFavorites(removeFavorite(f))} aria-label="お気に入りから外す" className="rounded-full p-1.5 text-muted">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <Sheet title="マイページ" open={sheet === "account"} onClose={() => setSheet(null)}>
        <ul className="divide-y divide-line">
          {(
            [
              ["help", "使い方", InfoIcon],
              ["cities", "対応している市区町村", AreaIcon],
              ["history", "検索履歴", ClockIcon],
              ["favorites", "お気に入り", BookmarkIcon],
            ] as [AnySheet, string, typeof InfoIcon][]
          ).map(([key, label, Icon]) => (
            <li key={key}>
              <button onClick={() => open(key)} className="flex w-full items-center gap-3 py-4 text-left text-ink">
                <Icon className="h-5 w-5 text-brand-light" />
                <span className="flex-1">{label}</span>
                <ChevronRightIcon className="h-4 w-4 text-muted" />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11.5px] leading-[1.7] text-muted">ログインと、会社の中での案件の共有は準備中です。検索履歴とお気に入りは、この端末の中だけに保存されます。</p>
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

  // 検索する前：見本の絵を敷いたホーム（絵の各部分にボタンを重ねたもの。縦にスクロールする）
  if (!shown) {
    return (
      <>
        <MockHome
          input={input}
          setInput={setInput}
          onSearch={() => search(input, true)}
          loading={loading}
          error={error}
          onAction={(a) => {
            if (a === "map") setPicker({});
            else if (a === "history" || a === "favorites" || a === "account" || a === "menu" || a === "help") open(a);
          }}
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
      </>
    );
  }

  // 結果：スクロールしない1画面の作り。画面の高さに応じて地図プレビューが伸び縮みする（まだ前の見た目）
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* 右上から流れるゴールドの細い弧（モックの飾り） */}
      <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute -right-40 -top-28 h-[360px] w-[360px] text-brand-light/40">
        <path d="M90 0 C130 150 250 250 400 290" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>

      <main className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] lg:max-w-5xl lg:px-8">
        <Header onMenu={() => open("menu")} onHome={backHome} compact />

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
            onExpand={(o) => setFullMap(o ?? {})}
          />
        </div>
      </main>

      <footer className="relative px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-1">
        <p className="mx-auto flex max-w-md items-start gap-2 text-[10.5px] lg:max-w-5xl lg:justify-center leading-[1.7] text-muted">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          {/* 結果をスクロールさせないよう1行に */}
          <span>地図は参考情報です。最終確認は必ず役所の窓口で。</span>
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

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="flex gap-2 rounded-2xl bg-[#f8efe9] p-3 text-sm text-[#8a4f3a]">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}
