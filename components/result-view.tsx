"use client";

import { useState } from "react";
import type { LookupResult, Municipality, ResolvedLink } from "@/lib/roadmap";
import { chibanLabel, kuikiLabel } from "@/lib/roadmap/parcel";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { sheetName } from "@/lib/roadmap/sheets";
import { buildSummary } from "@/lib/summary";
import { ContactCard } from "./contact-card";
import { COVERAGE, CoveragePill } from "./coverage";
import {
  AlertIcon,
  BuildingIcon,
  ChevronRightIcon,
  CopyIcon,
  InfoIcon,
  MapIcon,
  PinOutlineIcon,
  SearchIcon,
  ShareIcon,
} from "./icons";
import { MapPreview } from "./map-preview";
import { SheetPreview } from "./sheet-preview";

const CARD = "shadow-soft rounded-2xl border border-white bg-white";

export function ResultView({
  query,
  result,
  onPick,
  onFix,
  desktop,
}: {
  query: string;
  result: LookupResult;
  onPick: (address: string) => void;
  /** 「場所を直す」：地図で物件の場所を選び直す（スマホは全画面の地図を開く） */
  onFix?: () => void;
  /** PC（地図の左のパネル）用の配置 */
  desktop?: boolean;
}) {
  if (result.status === "not_found") return <NotFound query={query} />;
  if (result.status === "choose") return <Choose query={query} result={result} onPick={onPick} />;
  if (result.status === "unsupported") return <Unsupported result={result} onFix={onFix} />;
  return desktop ? <DesktopFound result={result} onPick={onPick} /> : <Found result={result} onFix={onFix} onPick={onPick} />;
}

function NotFound({ query }: { query: string }) {
  return (
    <div className={`${CARD} p-6 text-center`}>
      <SearchIcon className="mx-auto h-9 w-9 text-muted" />
      <p className="mt-3 font-bold text-ink">住所が見つかりませんでした</p>
      <p className="mt-1 break-all text-sm text-muted">「{query}」</p>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        都道府県・市区町村から入力してください。建物名や部屋番号は外すと見つかりやすくなります。
      </p>
    </div>
  );
}

/** 同名の場所が複数あるとき、候補から選んでもらう */
function Choose({
  query,
  result,
  onPick,
}: {
  query: string;
  result: Extract<LookupResult, { status: "choose" }>;
  onPick: (address: string) => void;
}) {
  return (
    <section className={`${CARD} p-4`}>
      <p className="text-[14px] font-semibold text-ink">
        「{query}」に当てはまる場所が複数あります
      </p>
      <p className="mt-1 text-[11px] text-muted">
        物件の場所を選んでください。無ければ都道府県から入れ直すと一度で見つかります。
      </p>
      <ul className="mt-3 divide-y divide-line/70">
        {result.candidates.slice(0, 7).map((c) => (
          <li key={c.matchedAddress}>
            <button
              onClick={() => onPick(c.matchedAddress)}
              className="flex w-full items-center gap-2 py-2.5 text-left text-[13px] text-ink"
            >
              <PinOutlineIcon className="h-4 w-4 shrink-0 text-brand-light" />
              <span className="flex-1">{c.matchedAddress}</span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Unsupported({
  result,
  onFix,
}: {
  result: Extract<LookupResult, { status: "unsupported" }>;
  onFix?: () => void;
}) {
  const city =
    result.matchedAddress
      .replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, "")
      .match(/^.+?[市区町村]/)?.[0] ?? "";
  const q = encodeURIComponent(`${city} 建築基準法 道路種別`);
  return (
    <section className={CARD}>
      <PlaceHeader label="検索地点" address={result.matchedAddress} suffix="付近" />
      <div className="border-t border-line/70 p-4">
        <MapPreview lat={result.lat} lng={result.lng} onFix={onFix} />
        <p className="mt-4 font-bold text-ink">
          {city ? `${city}は` : "この市町村は"}まだ未対応です
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          市町村の公式サイトで「指定道路図」や「道路種別」を探してください。
        </p>
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

function Found({
  result,
  onFix,
  onPick,
}: {
  result: Extract<LookupResult, { status: "ok" }>;
  onFix?: () => void;
  onPick: (address: string) => void;
}) {
  const m = result.municipality;
  // ネットで分からない市は、地図ボタンを参考扱いにして問い合わせ先を先に見せる
  const offline = m.coverage === "none" || m.coverage === "outside";
  const primary = offline
    ? []
    : result.links.filter((l) => l.kind !== "public_road");
  const secondary = offline
    ? []
    : result.links.filter((l) => l.kind === "public_road");
  const hint = result.links.some((l) => l.pinpoint) && (
    <p className="mt-2 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted [@media(max-height:720px)]:hidden">
      <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
      利用規約に同意すると、物件の場所が地図の中央に出ます。
    </p>
  );
  const contact = result.contact && (
    <ContactCard
      contact={result.contact}
      city={m.name}
      address={result.matchedAddress}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 [&>*]:shrink-0">
      <section
        className={`${CARD} flex min-h-0 flex-1 !shrink flex-col`}
      >
        <Place
          result={result}
          fixable={!!onFix}
          onPick={onPick}
          actions={
            <>
              <CopyButton text={copyText(result)} />
              <ShareButton result={result} />
            </>
          }
        />
        <div className="flex min-h-0 flex-1 flex-col border-t border-line/70 px-4 pb-4 pt-3 [&>*]:shrink-0">
          <CityLine municipality={m} />
          {/* 画面の高さに合わせて地図プレビューが伸び縮みする（スクロールさせない） */}
          <div className="mt-2.5 flex min-h-[64px] flex-1 !shrink flex-col [@media(max-height:720px)]:mt-1.5 [@media(max-height:720px)]:min-h-[52px]">
            <Preview result={result} onFix={onFix} className="min-h-[64px] flex-1 [@media(max-height:720px)]:min-h-[52px]" />
          </div>
          {(primary.length > 0 || secondary.length > 0) && (
            <>
              <h3 className="mb-1.5 mt-3 text-[12px] font-semibold text-ink [@media(max-height:720px)]:hidden">
                地図を開く
              </h3>
              <div className="space-y-2 [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:space-y-1.5">
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

      <div className="flex flex-col gap-2.5">
        {contact}

        {offline && result.links.length > 0 && (
          <section className={`${CARD} p-4`}>
            <h3 className="mb-2 text-[13px] text-ink">
              参考：公道（市道）かどうかの地図
            </h3>
            <div className="space-y-2">
              {result.links.map((l) => (
                <MapButton key={l.url} link={l} />
              ))}
            </div>
            {hint}
          </section>
        )}
      </div>
    </div>
  );
}

/** 「住所コピー」で写す文字。地番で探した筆は地番まで（地図システムの住所検索に貼る） */
function copyText(result: Extract<LookupResult, { status: "ok" }>): string {
  const p = result.parcel;
  return p && !result.picked && /^\d/.test(p.chibanRaw) ? `${result.matchedAddress}${p.chibanRaw}` : result.matchedAddress;
}

/** 見出し（「検索地点」など）と住所の2行 */
function PlaceHeader({ label, address, suffix, actions }: { label: string; address: string; suffix: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1 text-[11px] text-muted">
          <PinOutlineIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
          <span className="whitespace-nowrap">{label}</span>
        </p>
        {actions && <span className="flex shrink-0 gap-1.5">{actions}</span>}
      </div>
      <p className="mt-1 text-[16px] font-semibold leading-snug text-ink">
        {address} <span className="whitespace-nowrap text-[13px] font-normal">{suffix}</span>
      </p>
    </>
  );
}

/** 筆の形の出典（登記所備付地図データ利用規約の出典と、加工したことの記載） */
function ParcelCredit() {
  return (
    <>
      <a href="https://front.geospatial.jp/moj-chizu-xml-readme/" target="_blank" rel="noreferrer" className="underline">
        「登記所備付地図データ」（法務省）
      </a>
      を加工して作成（{PARCEL_DATA.edition}）
    </>
  );
}

/**
 * 「検索地点」：国土地理院が解釈した住所。番地まで一致しないことがあるので「付近」。
 * 地図で選んだ地点は住所が町名までなので「地図で選んだ地点」、地番で探した筆は「地番で探した筆」と地番を出す
 */
function Place({
  result,
  fixable,
  onPick,
  actions,
  desktop,
}: {
  result: Extract<LookupResult, { status: "ok" }>;
  /** PC のパネル（出典を本文に書く。スマホは地図プレビューの上に書く） */
  desktop?: boolean;
  /** 地図の「場所を直す」で選び直せる（その案内を添える） */
  fixable?: boolean;
  /** 近い地番を選んで探し直す */
  onPick: (address: string) => void;
  actions?: React.ReactNode;
}) {
  const { matchedAddress: address, approximate, picked, parcel, parcelMiss, parcelOthers } = result;
  const found = parcel && !picked ? parcel : undefined;
  const warn = "mt-1 flex gap-1 text-[10.5px] leading-[1.6] text-[#8a4f3a]";
  const town = approximate ? "町の中心を表示しています。" : "";
  return (
    <div className="px-4 pb-3 pt-3">
      <PlaceHeader
        label={found ? "地番で探した筆" : picked ? "地図で選んだ地点" : "検索地点"}
        address={address}
        suffix={found ? <b className="text-[15px] font-semibold">{chibanLabel(found.chibanRaw)}</b> : "付近"}
        actions={actions}
      />
      {found ? (
        <p className={`mt-1 text-[10.5px] leading-[1.6] text-muted ${desktop || parcelOthers ? "" : "[@media(max-height:720px)]:hidden"}`}>
          {desktop ? (
            <>
              筆の形は<ParcelCredit />。分筆などで変わっていることがあります。
            </>
          ) : (
            `※ 筆は${PARCEL_DATA.edition}の地図。分筆などで変わることがあります`
          )}
          {!!parcelOthers && <span className="block text-[#8a4f3a]">同じ地番の筆がほかに{parcelOthers}件あります（小字違いなど）。</span>}
        </p>
      ) : parcelMiss ? (
        <div className={warn}>
          <AlertIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            {parcelMiss.reason === "not_found"
              ? `地番 ${parcelMiss.chiban} は見つかりません（${PARCEL_DATA.edition}の地図）。${town}`
              : parcelMiss.reason === "no_map"
                ? `この地域は地番の地図データがありません。${town}`
                : `地番の地図データを読み込めませんでした。${town}`}
            {parcelMiss.similar.length > 0 && (
              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                近い地番：
                {parcelMiss.similar.slice(0, 4).map((c) => (
                  <button key={c} onClick={() => onPick(`地番 ${address}${c}`)} className="rounded-full bg-mint px-2 py-px font-semibold text-brand">
                    {c}
                  </button>
                ))}
              </span>
            )}
          </span>
        </div>
      ) : approximate ? (
        <p className={warn}>
          <AlertIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          {fixable ? "番地が見つからず、町の中心を表示しています。地図の「場所を直す」で物件の位置を選べます。" : "番地が見つからず、町の中心を表示しています。"}
        </p>
      ) : picked && parcel ? (
        <p className="mt-1 truncate text-[10.5px] leading-[1.6] text-muted">
          <b className="font-semibold text-ink">
            この地点の筆：{chibanLabel(parcel.chibanRaw)}（{kuikiLabel(parcel.kuiki)}）
          </b>
          {desktop && (
            <>
              {" "}
              <ParcelCredit />
            </>
          )}
        </p>
      ) : (
        <p className="mt-1 text-[10.5px] text-muted [@media(max-height:720px)]:hidden">
          {picked ? "※ 番地は分からないので、町名までを表示しています" : "※ 番地までは一致しないことがあります"}
        </p>
      )}
    </div>
  );
}

/** 物件の場所で開けない地図では、地図内の住所検索に貼り付けて使う */
function CopyButton({ text }: { text: string }) {
  const { done, copy } = useCopy();
  return (
    <button
      onClick={() => copy(text)}
      className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] text-brand"
    >
      <CopyIcon className="h-3.5 w-3.5" />
      {done ? "コピー済" : "住所コピー"}
    </button>
  );
}

function CityLine({ municipality: m }: { municipality: Municipality }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-mint to-white text-brand-light">
            <BuildingIcon className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[16px] font-semibold text-ink">{m.name}</span>
        </span>
        <CoveragePill coverage={m.coverage} />
      </div>
      {(m.note || m.coverage !== "full") && (
        <p className="mt-1.5 text-[10.5px] leading-[1.6] text-muted [@media(max-height:720px)]:hidden">
          {m.note ?? COVERAGE[m.coverage].long}
        </p>
      )}
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
function ShareButton({
  result,
}: {
  result: Extract<LookupResult, { status: "ok" }>;
}) {
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
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] text-brand"
    >
      <ShareIcon className="h-3.5 w-3.5" />
      {done ? "コピー済" : "結果を共有"}
    </button>
  );
}

/**
 * 地図プレビュー。PDF の分割図を開く市では「図の範囲」（開く図と同じ範囲・北が上）を先に見せ、
 * 「周辺」に切り替えられる。図を開いたあと、道路や川の形を見比べて物件の場所を探せる
 */
function Preview({
  result,
  className,
  onFix,
}: {
  result: Extract<LookupResult, { status: "ok" }>;
  className: string;
  onFix?: () => void;
}) {
  const sheet = result.links.find((l) => l.sheet)?.sheet;
  const [mode, setMode] = useState<"sheet" | "around">("sheet");
  if (!sheet) return <MapPreview lat={result.lat} lng={result.lng} className={className} onFix={onFix} parcel={result.parcel} />;
  const tab = (m: typeof mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`rounded-full px-2.5 py-0.5 text-[10.5px] [@media(max-height:720px)]:py-0 [@media(max-height:720px)]:text-[10px] ${mode === m ? "bg-gold text-white" : "text-ink"}`}
    >
      {label}
    </button>
  );
  // 地図の上には何も重ねない（ピンが隠れないように）。見出しと切り替えは地図の上の行に置く
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2 [@media(max-height:720px)]:mb-1">
        <span className="truncate text-[11px] text-muted [@media(max-height:720px)]:text-[10px]">
          {mode === "sheet" ? `${sheetName(sheet)}と同じ範囲（北が上）` : "物件の周辺"}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {onFix && (
            <button
              onClick={onFix}
              className="rounded-full bg-mint px-2.5 py-0.5 text-[10.5px] font-semibold text-brand [@media(max-height:720px)]:py-0 [@media(max-height:720px)]:text-[10px]"
            >
              場所を直す
            </button>
          )}
          <span className="flex rounded-full border border-line bg-white p-0.5">
            {tab("sheet", "図の範囲")}
            {tab("around", "周辺")}
          </span>
        </span>
      </div>
      {mode === "sheet" ? (
        <SheetPreview lat={result.lat} lng={result.lng} sheet={sheet} className="min-h-0 flex-1" />
      ) : (
        <MapPreview lat={result.lat} lng={result.lng} className="min-h-0 flex-1" parcel={result.parcel} />
      )}
    </div>
  );
}

function MapButton({
  link,
  primary,
}: {
  link: ResolvedLink;
  primary?: boolean;
}) {
  const sheet = link.sheet;
  const sub = sheet
    ? sheet.howto
      ? `物件が載っている図（${sheet.label}）の場所で地図が開きます`
      : sheet.whole
        ? "市全体の図が開きます"
        : `物件が載っている図（${sheet.label}）が開きます`
    : link.pinpoint
      ? "物件の場所が開きます"
      : "地図の入口が開きます";
  // 開いたあとに操作が要る地図は、その手順を出す。入口しか開けない地図は住所の貼り付けを案内
  // 複数ページのPDF（北区など）はページを添える。iPhone ではページ指定が効かないことがある
  const page = sheet?.url.match(/#page=(\d+)/)?.[1];
  const tip = sheet
    ? sheet.howto
      ? `${sheet.howto}物件は図の${sheet.where}あたりです。`
      : `物件は図の${sheet.where}あたりです${page ? `（PDFの${page}ページ目）` : ""}。`
    : (link.tip ??
      (link.pinpoint
        ? undefined
        : "上の「住所コピー」を押し、地図の住所検索に貼り付けてください。"));
  return (
    <div>
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className={
          primary
            ? "bg-gold flex items-center gap-3 rounded-xl px-4 py-2.5 text-white shadow-[0_6px_16px_rgba(138,102,50,0.28)] active:scale-[0.99] [@media(max-height:720px)]:py-2"
            : "flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5 text-ink active:scale-[0.99] [@media(max-height:720px)]:py-2"
        }
      >
        <MapIcon
          className={`h-6 w-6 shrink-0 ${primary ? "" : "text-brand-light"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold leading-snug [@media(max-height:720px)]:truncate">
            {link.label}
          </span>
          <span
            className={`mt-0.5 block text-[10.5px] [@media(max-height:720px)]:hidden ${primary ? "text-white/85" : "text-muted"}`}
          >
            {sub}
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 opacity-80" />
      </a>
      {tip && (
        <p className="mt-1 flex gap-1 px-1 text-[10.5px] leading-[1.6] text-brand">
          <span className="shrink-0">▶︎</span>
          <span>
            {tip}
            {/* 図の端に近いときは隣の図も（位置合わせの誤差を見込む） */}
            {sheet?.neighbor && (
              <>
                {" "}
                端に近いので、隣の図
                <a
                  href={sheet.neighbor.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mx-0.5 underline"
                >
                  {sheet.neighbor.label}
                </a>
                も確認してください。
              </>
            )}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * PC の結果（地図の左のパネルの中身）。検索地点・市・地図ボタン・問い合わせ先。
 * 物件の場所と図の範囲は、右の動く地図に出る（components/desktop-shell.tsx）
 */
function DesktopFound({ result, onPick }: { result: Extract<LookupResult, { status: "ok" }>; onPick: (address: string) => void }) {
  const m = result.municipality;
  const offline = m.coverage === "none" || m.coverage === "outside";
  const primary = result.links.filter((l) => !offline && l.kind !== "public_road");
  const others = result.links.filter((l) => offline || l.kind === "public_road");
  return (
    <div className="flex flex-col gap-3">
      <section className={CARD}>
        <Place
          result={result}
          onPick={onPick}
          desktop
          actions={
            <>
              <CopyButton text={copyText(result)} />
              <ShareButton result={result} />
            </>
          }
        />
        <div className="border-t border-line/70 px-4 pb-4 pt-3">
          <CityLine municipality={m} />
        </div>
      </section>

      {result.links.length > 0 && (
        <section className={`${CARD} p-4`}>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">{offline ? "参考：公道（市道）かどうかの地図" : "地図を開く"}</h3>
          <div className="space-y-2">
            {primary.map((l) => (
              <MapButton key={l.url} link={l} primary />
            ))}
            {others.map((l) => (
              <MapButton key={l.url} link={l} />
            ))}
          </div>
          {result.links.some((l) => l.pinpoint) && (
            <p className="mt-2 flex gap-1.5 text-[11px] leading-[1.6] text-muted">
              <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
              地図は新しいタブで開きます。利用規約に同意すると、物件の場所が地図の中央に出ます。
            </p>
          )}
        </section>
      )}

      {result.contact && <ContactCard contact={result.contact} city={m.name} address={result.matchedAddress} />}
    </div>
  );
}
