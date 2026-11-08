"use client";

import { useCallback, useEffect, useState } from "react";
import { DesktopShell } from "@/components/desktop-shell";
import { useDesktop } from "@/lib/use-desktop";
import { HistoryList } from "@/components/history-list";
import { MobileApp } from "@/components/app/mobile-app";
import { AreaIcon, BookmarkIcon, ChevronRightIcon, ClockIcon, InfoIcon, PinIcon, TrashIcon } from "@/components/icons";
import { CitiesSheet, HelpSheet, MenuSheet, type SheetName } from "@/components/info-sheets";
import { openDraft } from "@/components/draft-sheet";
import { GuideMapSheet } from "@/components/guide-map";
import { Sheet } from "@/components/sheet";
import { favoriteKey, loadFavorites, removeFavorite, type FavoriteItem } from "@/lib/favorites";
import { addHistory, clearHistory, loadHistory, removeHistory, restoreHistory, type HistoryItem } from "@/lib/history";
import { propertyIdOf } from "@/lib/property-id";
import { GeocoderUnavailable, lookup, lookupPoint, type AddressFix, type LookupResult } from "@/lib/roadmap";
import { buildHash, pageUrl, readUrlState } from "@/lib/app/url";
import { AREA_SHORT } from "@/lib/roadmap/regions";

/** literal：書き間違いを直した住所を、入れたとおりに探し直した（そのときの直し。スマホで「直した住所で探す」に使う） */
type Shown = { query: string; result: LookupResult; literal?: AddressFix };
/** PC の検索履歴のシートに出す数（前の上限と同じ。PC の見た目は変えない） */
const PC_HISTORY_ROWS = 30;

/** いまの画面が、ホームから何画面進んだところか（pushState で積んだ数） */
function historyDepth(): number {
  const d = (window.history.state as { depth?: unknown } | null)?.depth;
  return typeof d === "number" ? d : 0;
}

// PC のホームの「対応エリア」。対応している地方の名前（例「関東・中部」。都県の数までは小さな枠に入らない）
const AREA_TEXT = AREA_SHORT;

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
  // 住所で調べた回数。変わると PC の地図が物件の場所へ戻る（同じ住所で調べ直したときも）
  const [focus, setFocus] = useState(0);
  const desktop = useDesktop();

  /**
   * 住所（q）か、地図で選んだ地点（ll）で調べて結果を出す。literal は、書き間違いを直さずに入れたとおりに探す
   * （スマホの「入れたとおりに探す」。履歴には残さない）
   */
  const run = useCallback(async (target: { q: string; literal?: AddressFix } | { ll: [number, number] }, push: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const literal = "q" in target ? target.literal : undefined;
      const result = "q" in target ? await lookup(target.q, { exact: !!literal }) : await lookupPoint(...target.ll);
      // 書き間違いを直して見つけたら、履歴・URL には直した住所を残す（次に開くと直さずに一度で見つかる）
      const fixed = result.status === "ok" ? result.fix?.query : undefined;
      const query = "q" in target ? (fixed ?? target.q) : result.status === "ok" || result.status === "unsupported" ? result.matchedAddress : "";
      setInput("q" in target ? target.q : query);
      setShown({ query, result, ...(literal ? { literal } : {}) });
      if ("q" in target) setFocus((n) => n + 1);
      if (!literal && (result.status === "ok" || result.status === "unsupported")) {
        setHistory(
          addHistory({
            address: query,
            city: result.status === "ok" ? result.municipality.name : undefined,
            coverage: result.status === "ok" ? result.municipality.coverage : undefined,
            at: Date.now(),
            ...("ll" in target ? { ll: target.ll } : {}),
            // 同じ物件の見分け（信頼できる識別情報があるときだけ。lib/property-id.ts）
            ...(result.status === "ok" ? { pid: propertyIdOf(query, result) } : {}),
          }),
        );
      }
      // 端末の「戻る」でひとつ前の画面に戻れるよう、結果画面を履歴に積む。物件は URL の「#」の後ろに入れる
      // （「#」以降はサーバーに送られないので、リロード・共有リンクでも住所が外に出ない。lib/app/url.ts）
      const url = pageUrl(window.location, buildHash("q" in target ? { q: query } : { ll: target.ll }, window.location.hash));
      // depth: ホームから何画面進んだか（ロゴで一度にホームへ戻るのに使う）
      if (push) window.history.pushState({ ...window.history.state, depth: historyDepth() + 1 }, "", url);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(
        e instanceof GeocoderUnavailable
          ? "住所検索（国土地理院）が今つながりにくくなっています。少し時間をおいてもう一度お試しください。地図で場所を選んで調べることはできます。"
          : "通信に失敗しました。電波の良い場所でもう一度お試しください。",
      );
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
      const { q, ll, fromQuery } = readUrlState(window.location);
      // 古い「?q=」の形のリンクで開いたら、「#」の形に書き換える（次のリロードから住所がサーバーに送られないように）
      if (fromQuery) window.history.replaceState(window.history.state, "", pageUrl(window.location, buildHash({ q, ll }, window.location.hash)));
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
      window.history.replaceState(window.history.state, "", pageUrl(window.location, buildHash({}, window.location.hash)));
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
        {/* PC の検索履歴は前と同じ30件まで（端末には 200 件まで残す。スマホの履歴のページはすべて出す） */}
        <HistoryList
          items={history.slice(0, PC_HISTORY_ROWS)}
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

  // スマホ：紺の新しい見た目（components/app/mobile-app.tsx）。検索する前のホーム・物件の6つのタブ・検索履歴・お気に入り・マイページ
  return (
    <MobileApp
      shown={shown}
      input={input}
      setInput={setInput}
      loading={loading}
      error={error}
      history={history}
      favorites={favorites}
      setFavorites={setFavorites}
      onSearch={() => search(input, true)}
      onPickAddress={(a) => search(a, false)}
      onLiteral={(fix) => void run({ q: fix.input, literal: fix }, false)}
      onPickPoint={(lat, lng) => void searchPoint(lat, lng)}
      onPickHistory={(h) => void pickHistory(h)}
      onRemoveHistory={(items) => {
        const r = removeHistory(history, items);
        setHistory(r.items);
        return r.saved;
      }}
      onRestoreHistory={(items) => setHistory(restoreHistory(history, items))}
      onReloadStores={() => {
        setHistory(loadHistory());
        setFavorites(loadFavorites());
      }}
      onHome={backHome}
    />
  );
}
