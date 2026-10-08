"use client";

import Image from "next/image";
import { useState } from "react";
import type { HistoryItem } from "@/lib/history";
import { webglAvailable } from "@/lib/map-style";
import { MUNICIPALITIES, type LookupResult } from "@/lib/roadmap";
import { HistoryChips } from "./history-list";
import { AlertIcon, InfoIcon, MapIcon, PinIcon } from "./icons";
import { MapIllustration } from "./illustrations";
import { MapPanel } from "./map-panel";
import { MapPreview } from "./map-preview";
import { ResultView } from "./result-view";
import { SearchCard } from "./search-card";
import { Wordmark } from "./header";

const MARK = { src: "/logo-mark.webp", w: 204, h: 202 };
/** 左のパネルの幅（地図の中心は、この分だけ右にずらす） */
const PANEL = 440;
const GAP = 20;

type Shown = { query: string; result: LookupResult };

/**
 * PC の画面。全面に動く地図を敷き、左に検索と結果のパネル、右上にメニューを重ねる。
 * 地図のピンをドラッグするか、地図をクリックして「ここで調べる」で、場所を選び直せる
 */
export function DesktopShell({
  shown,
  input,
  setInput,
  loading,
  error,
  history,
  areaText,
  onSearch,
  onPickAddress,
  onPickPoint,
  onPickHistory,
  onOpen,
  onHome,
}: {
  shown: Shown | null;
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  error: string | null;
  history: HistoryItem[];
  areaText: string;
  onSearch: () => void;
  onPickAddress: (address: string) => void;
  onPickPoint: (lat: number, lng: number) => void;
  onPickHistory: (item: HistoryItem) => void;
  onOpen: (name: "help" | "cities" | "history") => void;
  onHome?: () => void;
}) {
  // 動く地図が使えない端末では、地図で選び直す案内を出さない
  const [live] = useState(() => typeof document !== "undefined" && webglAvailable());
  const r = shown?.result;
  const point = r && (r.status === "ok" || r.status === "unsupported") ? { lat: r.lat, lng: r.lng } : undefined;
  const sheet = r?.status === "ok" ? r.links.find((l) => l.sheet)?.sheet : undefined;
  const links: ["help" | "cities" | "history", string][] = [
    ["help", "使い方"],
    ["cities", "対応エリア"],
    ["history", "検索履歴"],
  ];

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-mint">
      <MapPanel
        point={point}
        sheet={sheet}
        onPick={onPickPoint}
        padding={{ left: PANEL + GAP * 2, top: 64, right: 16, bottom: 16 }}
        toolsClassName="right-5 top-[76px]"
        // WebGL が使えない端末：物件の周りは静的な地図、ホームは地図の絵
        fallback={
          <div className="absolute inset-0 py-5 pr-5" style={{ paddingLeft: PANEL + GAP * 2 }}>
            {point ? (
              <MapPreview lat={point.lat} lng={point.lng} className="h-full" large />
            ) : (
              <MapIllustration className="h-full w-full opacity-70" />
            )}
          </div>
        }
      />

      <nav className="absolute right-5 top-5 z-10 flex items-center gap-1 rounded-full bg-white/95 p-1 shadow-soft">
        {links.map(([key, label]) => (
          <button key={key} onClick={() => onOpen(key)} className="rounded-full px-4 py-1.5 text-[13px] text-ink hover:bg-mint">
            {label}
          </button>
        ))}
      </nav>

      <aside
        className="absolute bottom-5 left-5 top-5 z-10 flex flex-col overflow-hidden rounded-3xl border border-white bg-background/95 shadow-[0_10px_40px_rgba(60,44,20,0.16)] backdrop-blur"
        style={{ width: PANEL }}
      >
        <div className="shrink-0 px-5 pb-3 pt-5">
          <button onClick={onHome} aria-label="ホームへ戻る" className="flex items-center gap-2.5">
            <Image src={MARK.src} alt="" width={Math.round((40 * MARK.w) / MARK.h)} height={40} priority />
            <Wordmark className="text-[22px] leading-none" />
          </button>
          <div className="mt-4">
            <SearchCard value={input} onChange={setInput} onSearch={onSearch} loading={loading} compact={!!shown} />
          </div>
          {error && (
            <p role="alert" className="mt-3 flex gap-2 rounded-2xl bg-[#f8efe9] p-3 text-sm text-[#8a4f3a]">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {shown ? (
            <>
              {live && shown.result.status === "ok" && (
                <p className="mb-2 flex gap-1.5 text-[11.5px] leading-[1.6] text-muted">
                  <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                  場所がずれていたら、地図のピンをドラッグするか、地図をクリックして選び直せます。
                </p>
              )}
              <ResultView query={shown.query} result={shown.result} onPick={onPickAddress} desktop />
            </>
          ) : (
            <Welcome history={history} areaText={areaText} live={live} onPickHistory={onPickHistory} onOpen={onOpen} />
          )}
        </div>

        <p className="flex shrink-0 items-start gap-1.5 border-t border-line/70 px-5 py-2.5 text-[10.5px] leading-[1.6] text-muted">
          <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          表示される地図は参考情報です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。
        </p>
      </aside>
    </div>
  );
}

/** PC のホーム（パネルの中身）。見出し・地図で選べることの案内・履歴・対応範囲 */
function Welcome({
  history,
  areaText,
  live,
  onPickHistory,
  onOpen,
}: {
  history: HistoryItem[];
  areaText: string;
  live: boolean;
  onPickHistory: (item: HistoryItem) => void;
  onOpen: (name: "help" | "cities" | "history") => void;
}) {
  return (
    <div className="flex flex-col gap-5 pt-2">
      <section>
        <span className="mb-3 block h-px w-10 bg-brand-light" />
        <h1 className="text-[26px] font-semibold leading-[1.5] tracking-[0.04em] text-ink">
          住所から、
          <br />
          道路種別の確認先へ。
        </h1>
        <p className="mt-2 text-[13px] leading-[1.9] text-muted">
          国土地理院で物件の場所を調べ、市区町村の公式道路図をその場所で開きます。ネットで分からない市は、窓口と聞くことを案内します。
        </p>
      </section>

      {live && (
        <p className="flex gap-2 rounded-2xl bg-white p-3.5 text-[12.5px] leading-[1.7] text-ink shadow-soft">
          <MapIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-light" />
          <span>
            住所が分からない土地は、<b className="font-semibold">右の地図をクリック</b>して「ここで調べる」を押すと、その場所の道路図を調べられます。
          </span>
        </p>
      )}

      <HistoryChips items={history.slice(0, 5)} onSelect={onPickHistory} onShowAll={() => onOpen("history")} />

      <dl className="grid grid-cols-3 gap-3">
        {[
          [`${MUNICIPALITIES.length}`, "対応市区町村"],
          [areaText, "対応エリア"],
          ["毎週", "地図リンクの自動確認"],
        ].map(([v, k]) => (
          <div key={k} className="rounded-2xl bg-white px-3 py-2.5 shadow-soft">
            <dt className="text-[10.5px] text-muted">{k}</dt>
            <dd className="mt-0.5 text-[16px] font-semibold tracking-[0.02em] text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-2 text-[12px]">
        <button onClick={() => onOpen("help")} className="rounded-full border border-line bg-white px-3 py-1.5 text-ink hover:bg-mint">
          使い方を見る
        </button>
        <button onClick={() => onOpen("cities")} className="rounded-full border border-line bg-white px-3 py-1.5 text-ink hover:bg-mint">
          対応している市区町村
        </button>
      </div>
    </div>
  );
}
