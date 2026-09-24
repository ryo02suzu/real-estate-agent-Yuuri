"use client";

import { useState } from "react";
import type { LookupResult, Municipality, ResolvedLink } from "@/lib/roadmap";
import { buildSummary } from "@/lib/summary";
import { ContactCard } from "./contact-card";
import { COVERAGE, CoverageBadge } from "./coverage";
import { ChevronLeftIcon, CopyIcon, ExternalIcon, MapIcon, PinIcon, SearchIcon, ShareIcon } from "./icons";
import { MapPreview } from "./map-preview";

export function ResultView({ query, result, onBack }: { query: string; result: LookupResult; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="-ml-1 flex items-center gap-1 text-sm font-bold text-brand">
        <ChevronLeftIcon className="h-5 w-5" />
        別の住所を調べる
      </button>
      {result.status === "not_found" && <NotFound query={query} />}
      {result.status === "unsupported" && <Unsupported result={result} />}
      {result.status === "ok" && <Found result={result} />}
    </div>
  );
}

function NotFound({ query }: { query: string }) {
  return (
    <div className="rounded-3xl bg-white p-6 text-center border border-line shadow-[0_4px_24px_rgba(30,63,74,0.06)]">
      <SearchIcon className="mx-auto h-10 w-10 text-muted" />
      <p className="mt-3 font-bold text-ink">住所が見つかりませんでした</p>
      <p className="mt-1 break-all text-sm text-muted">「{query}」</p>
      <p className="mt-3 text-sm text-muted">都道府県・市区町村から入力してください。建物名や部屋番号は外すと見つかりやすくなります。</p>
    </div>
  );
}

function Unsupported({ result }: { result: Extract<LookupResult, { status: "unsupported" }> }) {
  const city = result.matchedAddress.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, "").match(/^.+?[市区町村]/)?.[0] ?? "";
  const q = encodeURIComponent(`${city} 建築基準法 道路種別`);
  return (
    <div className="space-y-4">
      <PlaceLine address={result.matchedAddress} />
      <MapPreview lat={result.lat} lng={result.lng} />
      <div className="rounded-3xl bg-white p-5 border border-line shadow-[0_4px_24px_rgba(30,63,74,0.06)]">
        <p className="font-bold text-ink">{city ? `${city}は` : "この市町村は"}まだ未対応です</p>
        <p className="mt-1 text-sm text-muted">市町村の公式サイトで「指定道路図」や「道路種別」を探してください。</p>
        <a
          href={`https://www.google.com/search?q=${q}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-brand py-3 font-bold text-brand"
        >
          <SearchIcon className="h-5 w-5" />
          Googleで探す
        </a>
      </div>
    </div>
  );
}

function Found({ result }: { result: Extract<LookupResult, { status: "ok" }> }) {
  const m = result.municipality;
  const primary = result.links.filter((l) => l.kind !== "public_road");
  const secondary = result.links.filter((l) => l.kind === "public_road");
  const contact = result.contact && <ContactCard contact={result.contact} city={m.name} />;
  const share = <ShareButton result={result} />;
  const pinpointHint = result.links.some((l) => l.pinpoint) && (
    <p className="mt-3 text-xs text-muted">最初に利用規約の画面が出ることがあります。同意すると（「同意する」ボタン、またはチェックを入れて「OK」）、物件の場所が地図の中央に表示されます。</p>
  );

  // ネットで分からない市は、問い合わせ先を先に見せ、市道の地図は参考として後ろに回す
  if (m.coverage === "none" || m.coverage === "outside") {
    return (
      <div className="space-y-4">
        <PlaceLine address={result.matchedAddress} copyable />
        <MapPreview lat={result.lat} lng={result.lng} />
        <CityPanel municipality={m} />
        {contact}
        {result.links.length > 0 && (
          <section className="rounded-2xl border border-line bg-white p-4">
            <p className="mb-2 text-xs text-muted">参考：公道（市道）かどうかの地図</p>
            <div className="space-y-2">
              {result.links.map((l) => (
                <MapButton key={l.url} link={l} />
              ))}
            </div>
            {pinpointHint}
          </section>
        )}
        {share}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PlaceLine address={result.matchedAddress} copyable />
      <MapPreview lat={result.lat} lng={result.lng} />

      <CityPanel municipality={m}>
        {primary.length > 0 && (
          <div className="mt-4 space-y-2">
            {primary.map((l) => (
              <MapButton key={l.url} link={l} primary />
            ))}
          </div>
        )}
        {secondary.length > 0 && (
          <div className="mt-2 space-y-2">
            {secondary.map((l) => (
              <MapButton key={l.url} link={l} />
            ))}
          </div>
        )}
        {pinpointHint}
      </CityPanel>

      {contact}
      {share}
    </div>
  );
}

function CityPanel({ municipality: m, children }: { municipality: Municipality; children?: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 border border-line shadow-[0_4px_24px_rgba(30,63,74,0.06)]">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-black text-ink">{m.name}</p>
        <CoverageBadge coverage={m.coverage} />
      </div>
      <p className={`mt-3 rounded-xl border p-3 text-sm ${COVERAGE[m.coverage].panel}`}>{COVERAGE[m.coverage].long}</p>
      {m.note && <p className="mt-2 text-xs text-muted">{m.note}</p>}
      {children}
    </section>
  );
}

/** クリップボードへ書き込み、2秒だけ「コピーしました」を出す */
function useCopy() {
  const [done, setDone] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      window.prompt("コピーしてください", text);
    }
  };
  return { done, copy };
}

function PlaceLine({ address, copyable }: { address: string; copyable?: boolean }) {
  const { done, copy } = useCopy();
  return (
    <div className="flex items-start gap-2 text-sm text-ink">
      <PinIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-light" />
      <span className="min-w-0 flex-1">
        <span className="font-bold">{address}</span> 付近
        <span className="block text-xs text-muted">入力した住所と違う場所になっていないか確認してください</span>
      </span>
      {copyable && (
        // 物件の場所で開けない地図では、地図内の住所検索に貼り付けて使う
        <button onClick={() => copy(address)} className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-brand">
          <CopyIcon className="h-4 w-4" />
          {done ? "コピーしました" : "住所コピー"}
        </button>
      )}
    </div>
  );
}

/** 結果を報告・メモ用の文章にして共有（スマホ）またはコピー（PC） */
function ShareButton({ result }: { result: Extract<LookupResult, { status: "ok" }> }) {
  const { done, copy } = useCopy();
  const onClick = async () => {
    const text = buildSummary(result);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        // 利用者がキャンセルしたときは何もしない。共有できない環境ならコピーに切り替える
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copy(text);
  };
  return (
    <button onClick={onClick} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand py-3 font-bold text-brand">
      <ShareIcon className="h-5 w-5" />
      {done ? "結果をコピーしました" : "結果を共有・コピー（報告やメモ用）"}
    </button>
  );
}

function MapButton({ link, primary }: { link: ResolvedLink; primary?: boolean }) {
  const sub = link.pinpoint ? "物件の場所で開きます" : "地図の入口が開きます（地図内で住所を検索してください）";
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className={
        primary
          ? "flex items-center gap-3 bg-gold rounded-2xl px-4 py-3.5 text-white shadow-[0_6px_16px_rgba(138,102,50,0.3)] active:scale-[0.99]"
          : "flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-ink active:scale-[0.99]"
      }
    >
      <MapIcon className={`h-6 w-6 shrink-0 ${primary ? "" : "text-brand"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block font-bold ${primary ? "" : "text-sm"}`}>{link.label}</span>
        <span className={`block text-xs ${primary ? "text-white/80" : "text-muted"}`}>{sub}</span>
      </span>
      <ExternalIcon className="h-5 w-5 shrink-0 opacity-80" />
    </a>
  );
}
