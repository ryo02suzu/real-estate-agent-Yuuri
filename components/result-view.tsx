"use client";

import { useState } from "react";
import type { LookupResult, Municipality, ResolvedLink } from "@/lib/roadmap";
import { buildSummary } from "@/lib/summary";
import { ContactCard } from "./contact-card";
import { COVERAGE, CoveragePill } from "./coverage";
import { BuildingIcon, ChevronRightIcon, CopyIcon, InfoIcon, MapIcon, PinOutlineIcon, SearchIcon, ShareIcon } from "./icons";
import { MapPreview } from "./map-preview";

const CARD = "shadow-soft rounded-2xl border border-white bg-white";

export function ResultView({ query, result }: { query: string; result: LookupResult }) {
  if (result.status === "not_found") return <NotFound query={query} />;
  if (result.status === "unsupported") return <Unsupported result={result} />;
  return <Found result={result} />;
}

function NotFound({ query }: { query: string }) {
  return (
    <div className={`${CARD} p-6 text-center`}>
      <SearchIcon className="mx-auto h-9 w-9 text-muted" />
      <p className="mt-3 font-bold text-ink">住所が見つかりませんでした</p>
      <p className="mt-1 break-all text-sm text-muted">「{query}」</p>
      <p className="mt-3 text-xs leading-relaxed text-muted">都道府県・市区町村から入力してください。建物名や部屋番号は外すと見つかりやすくなります。</p>
    </div>
  );
}

function Unsupported({ result }: { result: Extract<LookupResult, { status: "unsupported" }> }) {
  const city = result.matchedAddress.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, "").match(/^.+?[市区町村]/)?.[0] ?? "";
  const q = encodeURIComponent(`${city} 建築基準法 道路種別`);
  return (
    <section className={CARD}>
      <Place address={result.matchedAddress} />
      <div className="border-t border-line/70 p-4">
        <MapPreview lat={result.lat} lng={result.lng} />
        <p className="mt-4 font-bold text-ink">{city ? `${city}は` : "この市町村は"}まだ未対応です</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">市町村の公式サイトで「指定道路図」や「道路種別」を探してください。</p>
        <a
          href={`https://www.google.com/search?q=${q}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-line py-3 text-sm font-bold text-brand"
        >
          <SearchIcon className="h-4 w-4" />
          Googleで探す
        </a>
      </div>
    </section>
  );
}

function Found({ result }: { result: Extract<LookupResult, { status: "ok" }> }) {
  const m = result.municipality;
  // ネットで分からない市は、地図ボタンを参考扱いにして問い合わせ先を先に見せる
  const offline = m.coverage === "none" || m.coverage === "outside";
  const primary = offline ? [] : result.links.filter((l) => l.kind !== "public_road");
  const secondary = offline ? [] : result.links.filter((l) => l.kind === "public_road");
  const hint = result.links.some((l) => l.pinpoint) && (
    <p className="mt-3 flex gap-2 text-[11px] leading-[1.7] text-muted">
      <InfoIcon className="mt-px h-4 w-4 shrink-0" />
      最初に利用規約の画面が出ることがあります。同意すると（「同意する」、またはチェックを入れて「OK」）、物件の場所が地図の中央に表示されます。
    </p>
  );
  const contact = result.contact && <ContactCard contact={result.contact} city={m.name} />;

  return (
    <div className="space-y-3">
      <section className={CARD}>
        <Place address={result.matchedAddress} copyable />
        <div className="border-t border-line/70 p-4">
          <CityLine municipality={m} />
          <div className="mt-3">
            <MapPreview lat={result.lat} lng={result.lng} />
          </div>
          {(primary.length > 0 || secondary.length > 0) && (
            <>
              <h3 className="mb-2 mt-4 text-[13px] tracking-[0.08em] text-ink">地図を開く</h3>
              <div className="space-y-2">
                {primary.map((l) => (
                  <MapButton key={l.url} link={l} primary />
                ))}
                {secondary.map((l) => (
                  <MapButton key={l.url} link={l} />
                ))}
              </div>
              {hint}
            </>
          )}
        </div>
      </section>

      {contact}

      {offline && result.links.length > 0 && (
        <section className={`${CARD} p-4`}>
          <h3 className="mb-2 text-[13px] text-ink">参考：公道（市道）かどうかの地図</h3>
          <div className="space-y-2">
            {result.links.map((l) => (
              <MapButton key={l.url} link={l} />
            ))}
          </div>
          {hint}
        </section>
      )}

      <ShareButton result={result} />
    </div>
  );
}

/** 「検索地点」：国土地理院が解釈した住所。番地まで一致しないことがあるので「付近」 */
function Place({ address, copyable }: { address: string; copyable?: boolean }) {
  const { done, copy } = useCopy();
  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <PinOutlineIcon className="h-4 w-4 text-brand-light" />
          検索地点
        </p>
        {copyable && (
          // 物件の場所で開けない地図では、地図内の住所検索に貼り付けて使う
          <button onClick={() => copy(address)} className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] text-brand">
            <CopyIcon className="h-3.5 w-3.5" />
            {done ? "コピーしました" : "住所コピー"}
          </button>
        )}
      </div>
      <p className="mt-1.5 font-serif text-[17px] leading-snug tracking-[0.03em] text-ink">
        {address} <span className="whitespace-nowrap text-[14px]">付近</span>
      </p>
      <p className="mt-1.5 text-[11px] leading-[1.7] text-muted">
        ※ 番地まで一致しない場合があります。入力した住所と違う場所になっていないか確認してください。
      </p>
    </div>
  );
}

function CityLine({ municipality: m }: { municipality: Municipality }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-mint to-white text-brand-light">
            <BuildingIcon className="h-5 w-5" />
          </span>
          <span className="text-[17px] text-ink">{m.name}</span>
        </span>
        <CoveragePill coverage={m.coverage} />
      </div>
      <p className="mt-2 text-[11px] leading-[1.7] text-muted">{COVERAGE[m.coverage].long}</p>
      {m.note && <p className="mt-1 text-[11px] leading-[1.7] text-muted">{m.note}</p>}
    </div>
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
    <button onClick={onClick} className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white py-2.5 text-[13px] text-brand">
      <ShareIcon className="h-4 w-4" />
      {done ? "結果をコピーしました" : "結果を共有・コピー（報告やメモ用）"}
    </button>
  );
}

function MapButton({ link, primary }: { link: ResolvedLink; primary?: boolean }) {
  const sub = link.pinpoint ? "物件の場所が開きます" : "地図の入口が開きます（地図内で住所を検索してください）";
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className={
        primary
          ? "bg-gold flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-[0_6px_16px_rgba(138,102,50,0.28)] active:scale-[0.99]"
          : "flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-ink active:scale-[0.99]"
      }
    >
      <MapIcon className={`h-6 w-6 shrink-0 ${primary ? "" : "text-brand-light"}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-snug">{link.label}</span>
        <span className={`mt-0.5 block text-[10.5px] ${primary ? "text-white/85" : "text-muted"}`}>{sub}</span>
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 opacity-80" />
    </a>
  );
}
