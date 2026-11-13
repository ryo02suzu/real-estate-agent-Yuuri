"use client";

import { useCallback, useEffect, useState } from "react";
import { DesktopShell } from "@/components/desktop-shell";
import { useDesktop } from "@/lib/use-desktop";
import { MobileApp } from "@/components/app/mobile-app";
import { loadFavorites, type FavoriteItem } from "@/lib/favorites";
import { addHistory, clearHistory, loadHistory, removeHistory, restoreHistory, type HistoryItem } from "@/lib/history";
import { propertyIdOf } from "@/lib/property-id";
import { GeocoderUnavailable, lookup, lookupPoint, type AddressFix, type LookupResult } from "@/lib/roadmap";
import { buildHash, pageUrl, readUrlState } from "@/lib/app/url";
import { AREA_SHORT } from "@/lib/roadmap/regions";

/** literal：書き間違いを直した住所を、入れたとおりに探し直した（そのときの直し。スマホで「直した住所で探す」に使う） */
type Shown = { query: string; result: LookupResult; literal?: AddressFix };

/** いまの画面が、ホームから何画面進んだところか（pushState で積んだ数） */
function historyDepth(): number {
  const d = (window.history.state as { depth?: unknown } | null)?.depth;
  return typeof d === "number" ? d : 0;
}

// PC の「対応エリア」。対応している地方の名前（lib/roadmap/regions.ts の AREA_SHORT。例「関東・中部・東北」）
const AREA_TEXT = AREA_SHORT;

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  // お気に入り（保存した物件。端末の中だけ）
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
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

  if (desktop) {
    // PC：調査デスク（components/desktop-shell.tsx）。お気に入り・履歴・書類・比較・使い方・対応エリア・設定は、画面の真ん中に重ねて開く
    return (
      <DesktopShell
        shown={shown}
        focus={focus}
        input={input}
        setInput={setInput}
        loading={loading}
        error={error}
        history={history}
        favorites={favorites}
        setFavorites={setFavorites}
        areaText={AREA_TEXT}
        onSearch={() => search(input, true)}
        onPickAddress={(a) => search(a, false)}
        onLiteral={(fix) => void run({ q: fix.input, literal: fix }, false)}
        onPickPoint={(lat, lng) => searchPoint(lat, lng)}
        onPickHistory={pickHistory}
        onRemoveHistory={(items) => setHistory(removeHistory(history, items).items)}
        onClearHistory={() => {
          clearHistory();
          setHistory([]);
        }}
        onHome={shown ? backHome : undefined}
      />
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
