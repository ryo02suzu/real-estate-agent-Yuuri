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
import { DETAIL_CLOSE_EVENT } from "@/components/panel-detail";
import type { MapOpen } from "@/components/result-view";
import { Sheet } from "@/components/sheet";
import { closeTopModal, openModalCount, subscribeModals } from "@/components/use-modal";
import { decidePop, depthOf, detailState, overlayAction, resultState, stepsToHome, withoutDetail, type NavState } from "@/lib/detail-history";
import { addHistory, clearHistory, loadHistory, type HistoryItem } from "@/lib/history";
import { accuracyOf, pointView } from "@/lib/position-accuracy";
import { createGeneration, inputAfterResult, runGuarded } from "@/lib/search-gen";
import { lookup, lookupPoint, MUNICIPALITIES, type LookupResult } from "@/lib/roadmap";

type Shown = { query: string; result: LookupResult };
/** 地図で選んだ地点の URL（?ll=緯度,経度）。小数5桁（約1m） */
const llParam = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
/** いまの画面が、ホームから何画面進んだところか（pushState で積んだ数。結果パネルの詳細の分も数える） */
const historyDepth = () => depthOf(window.history.state as NavState);
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
  // スマホの「地図で選ぶ」画面（start: 最初に表示する地点とズーム）
  const [picker, setPicker] = useState<{ start?: { lat: number; lng: number; zoom?: number } } | null>(null);
  // 住所で調べた回数。変わると地図が物件の場所へ戻る（同じ住所で調べ直したときも）
  const [focus, setFocus] = useState(0);
  // スマホの「地図を拡大」（MICHILU の中の動く地図）。roads: 道路種別を重ねて開く
  const [fullMap, setFullMap] = useState<MapOpen | null>(null);
  const desktop = useDesktop();

  // 検索の世代。新検索・ホーム・戻るで進め、古い応答が画面・履歴・URLを上書きしないようにする
  const gen = useRef(createGeneration());
  // スマホで重なった画面（結果パネルの詳細・シート・全画面の地図・地図で選ぶ画面）を開いている間、履歴の先頭に積んだ
  // 「重なった画面の履歴」があるか（端末の「戻る」で、いちばん上の画面だけ閉じる。lib/detail-history.ts）。いくつ重なっても積むのはひとつ
  const detailHist = useRef(false);
  // 画面の「戻る」などで自分が history.back() した回数。その分の popstate は無視する（時刻ではなく回数で数える。遅い端末で
  // popstate が遅れて届いても、調べ直しと取り違えない。届かないまま残らないよう、3秒で数え直す）
  const skips = useRef({ count: 0, until: 0 });
  // 結果パネルの詳細を開いているか（components/mobile-shell.tsx から）
  const detailOpen = useRef(false);
  const desktopRef = useRef(desktop);
  // いまの入力（検索の応答が届いたとき、待っている間に打ち直した住所を上書きしないため）
  const inputRef = useRef(input);
  useEffect(() => {
    desktopRef.current = desktop;
    inputRef.current = input;
  });
  // 最後に始めた検索（エラーの「もう一度」で、同じ対象・同じ積み方で調べ直す）
  const last = useRef<{ target: { q: string } | { ll: [number, number] }; push: boolean } | null>(null);

  /**
   * 重なった画面の履歴を、いま開いている画面に合わせる（開いたら積み、全部閉じたら自分で戻す）。
   * シートの切り替え（閉じてすぐ別のシートを開く）で積む・戻すを繰り返さないよう、同じ描画の後にまとめて1回だけ判断する
   */
  const overlayQueued = useRef(false);
  const syncOverlay = useCallback(() => {
    if (overlayQueued.current) return;
    overlayQueued.current = true;
    queueMicrotask(() => {
      overlayQueued.current = false;
      const want = !desktopRef.current && (detailOpen.current || openModalCount() > 0);
      const act = overlayAction(want, detailHist.current);
      if (act === "push") {
        window.history.pushState(detailState(window.history.state as NavState), "", window.location.href);
        detailHist.current = true;
      } else if (act === "back") {
        detailHist.current = false;
        skips.current = { count: skips.current.count + 1, until: Date.now() + 3000 };
        window.history.back();
      }
    });
  }, []);
  useEffect(() => subscribeModals(syncOverlay), [syncOverlay]);

  /** 住所（q）か、地図で選んだ地点（ll）で調べて結果を出す */
  const run = useCallback((target: { q: string } | { ll: [number, number] }, push: boolean) => {
    last.current = { target, push };
    // 検索を始めたときの入力（住所で調べるときは、その住所を入力に入れてから始める）
    const startedWith = "q" in target ? target.q : inputRef.current;
    return runGuarded(gen.current, () => ("q" in target ? lookup(target.q) : lookupPoint(...target.ll)), {
        onStart: () => {
          setLoading(true);
          setError(null);
        },
        onResult: (result) => {
          const query = "q" in target ? target.q : result.status === "ok" || result.status === "unsupported" ? result.matchedAddress : "";
          // 住所・結果（ピン・サブデータの元）・履歴・URL は、この応答ひとつから同時に決める。
          // ただし入力は、待っている間に打ち直していなければ（日本語の変換中の文字を消さない）
          setInput((cur) => inputAfterResult(cur, startedWith, query));
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
          // depth: ホームから何画面進んだか（ロゴで一度にホームへ戻るのに使う）。
          // 重なった画面の履歴が積まれたまま新しい結果が出たら、その履歴を結果に置き換える（重なった画面の分を残さない）
          const nav = window.history.state as NavState;
          if (push) {
            if (detailHist.current) window.history.replaceState(resultState(nav, false), "", url);
            else window.history.pushState(resultState(nav, true), "", url);
          } else {
            // 積まない結果（候補・近い地番を選んだ・URL から開いた・戻る/進む）も、URL はこの結果に合わせる（履歴は増やさない）。
            // 候補を選んだあとに再読み込みしても、選んだ住所の結果になる
            window.history.replaceState(detailHist.current ? withoutDetail(nav) : nav, "", url);
          }
          detailHist.current = false;
          // シートなどがまだ開いていれば、その分の履歴を積み直す（結果パネルの詳細は新しい結果で閉じるので数えない）
          if (!desktopRef.current && openModalCount() > 0) {
            window.history.pushState(detailState(window.history.state as NavState), "", window.location.href);
            detailHist.current = true;
          }
          window.scrollTo(0, 0);
        },
        onError: () => setError("通信に失敗しました。電波の良い場所でもう一度お試しください。"),
        onSettled: () => setLoading(false),
      });
  }, []);
  /** エラーの「もう一度」：失敗した検索と同じ対象（住所・地図で選んだ地点）・同じ積み方で調べ直す（入力欄の住所ではなく） */
  const retryLast = useCallback(() => {
    const l = last.current;
    if (l) void run(l.target, l.push);
  }, [run]);

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

  // 重なった画面（全画面の地図・案内図・地図で選ぶ画面。スマホはシートも）を閉じる。前の画面・ホームへ移るとき（PC のシートは今のまま）
  const closeOverlays = useCallback(() => {
    setFullMap(null);
    setGuide(false);
    setPicker(null);
    if (!desktopRef.current) setSheet(null);
  }, []);

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
      // 詳細の履歴の印が付いたまま開き直したとき（再読み込みなど）は、詳細は閉じた状態から始まるので印だけ外す
      if ((window.history.state as NavState)?.detail) window.history.replaceState(withoutDetail(window.history.state as NavState), "");
      fromUrl();
    });
    const onPop = (e: PopStateEvent) => {
      const s = skips.current;
      if (Date.now() >= s.until) s.count = 0;
      const action = decidePop({ skip: s.count > 0, detailOpen: detailHist.current, state: e.state as NavState });
      // 画面の「戻る」ボタンなどで自分が戻した分は、何もしない
      if (action === "skip") {
        s.count -= 1;
        return;
      }
      // 重なった画面を出している最中の端末の「戻る」：いちばん上の画面だけ閉じる（シート・全画面の地図・地図で選ぶ画面。
      // 無ければ結果パネルの詳細を閉じて一覧に戻る）。検索し直さない。まだ下に重なった画面が残っていれば、閉じたあとに
      // 履歴を積み直す（画面が閉じて数が変わったときの syncOverlay）
      if (action === "close-detail") {
        detailHist.current = false;
        if (!closeTopModal()) window.dispatchEvent(new Event(DETAIL_CLOSE_EVENT));
        return;
      }
      // 詳細の履歴の印が付いた履歴に、詳細を出さずに着いた（進む）：印だけ外し、画面はそのまま
      if (action === "normalize") {
        window.history.replaceState(withoutDetail(e.state as NavState), "");
        return;
      }
      // 戻る・進むで、飛んでいる検索の応答は無効にする（fromUrl が新しい検索を始めればその世代が有効）
      gen.current.cancel();
      setLoading(false);
      setError(null);
      // 前の画面に移ったので、重なった画面の状態は片付ける（残すと、次に結果が出たとき全画面の地図・案内図が勝手に開き直す）
      closeOverlays();
      if (!fromUrl()) {
        setShown(null);
        // スマホのホームは入力を空にして始める（結果の画面で書きかけた住所を残さない。直近の検索は履歴から選べる）
        if (!desktopRef.current) setInput("");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [search, searchPoint, closeOverlays]);

  // 結果パネルの詳細を開いた・閉じた。開くと同じURLで履歴をひとつ積み（端末の「戻る」で詳細だけ閉じられる）、
  // 画面の「戻る」ボタンなどで閉じたときは、積んだ履歴を戻す（シートなどほかの重なった画面が残っていれば、そのまま）
  const onDetailChange = useCallback(
    (open: boolean) => {
      detailOpen.current = open;
      syncOverlay();
    },
    [syncOverlay],
  );

  // 画面が PC 用に替わったとき（iPad の横向きなど）、スマホの重なった画面の履歴の印が残っていれば、閉じたものとして印を外す
  // （残すと、PC で次の「戻る」が詳細を閉じる扱いになって、1回効かなくなる）
  useEffect(() => {
    if (!desktop) return;
    detailOpen.current = false;
    if (!detailHist.current) return;
    detailHist.current = false;
    window.history.replaceState(withoutDetail(window.history.state as NavState), "");
  }, [desktop]);

  // ホームへ。結果画面を積んできた分だけ戻る（地図で選び直した画面も含めて一度に）
  function backHome() {
    gen.current.cancel();
    // 詳細の履歴も含めて一度に戻るので、詳細だけ閉じる扱いにしない
    const overlay = detailHist.current;
    detailHist.current = false;
    setLoading(false);
    setError(null);
    closeOverlays();
    const steps = stepsToHome(historyDepth(), overlay);
    if (steps > 0) window.history.go(-steps);
    else {
      // 戻る先のホームの履歴が無い（?q= で直接開いた）ときは、履歴は戻さず、いまの画面（詳細の履歴があればそれ）をホームに置き換える
      window.history.replaceState({ ...((window.history.state as object | null) ?? {}), depth: 0, detail: false }, "", window.location.pathname);
      setShown(null);
      if (!desktop) setInput("");
    }
  }

  // スマホ：結果の画面で住所を書き換えた・検索中に「キャンセル」（Esc も）。飛んでいる検索を無効にし、入力を今の結果の住所に戻す
  // （物件・結果パネル・地図・URL・履歴はそのまま。ホームで検索中に押したときは、入力はそのまま）
  function cancelEdit() {
    gen.current.cancel();
    setLoading(false);
    setError(null);
    if (shown) setInput(shown.query);
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
        input={input}
        setInput={setInput}
        loading={loading}
        error={error}
        history={history}
        areaText={AREA_TEXT}
        onSearch={() => search(input, true)}
        onRetry={retryLast}
        onPickAddress={(a) => search(a, false)}
        onPickHistory={pickHistory}
        onShowHistory={() => open("history")}
        onMenu={() => open("menu")}
        onHome={backHome}
        onMap={() => setPicker({})}
        onFix={() => {
          // 「場所を直す」は、位置の目安に合った広さで開く（町の中心は町の広がりが見える所から、住所・筆はその付近から）
          const r = shown?.result;
          const a = r ? accuracyOf(r) : null;
          setPicker({ start: r && a && (r.status === "ok" || r.status === "unsupported") ? { lat: r.lat, lng: r.lng, zoom: Math.max(14, pointView(a.kind).zoom) } : undefined });
        }}
        onExpand={(o) => setFullMap(o ?? {})}
        onGuide={() => setGuide(true)}
        onOpenHelp={() => open("help")}
        onOpenCities={() => open("cities")}
        onDetailChange={onDetailChange}
        onCancelEdit={cancelEdit}
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
