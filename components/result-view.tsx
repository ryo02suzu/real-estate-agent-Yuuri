"use client";

import { useState } from "react";
import type { LookupResult, Municipality, ResolvedLink } from "@/lib/roadmap";
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

const CARD = "shadow-soft rounded-2xl border border-white bg-white";

export function ResultView({
  query,
  result,
  onPick,
}: {
  query: string;
  result: LookupResult;
  onPick: (address: string) => void;
}) {
  if (result.status === "not_found") return <NotFound query={query} />;
  if (result.status === "choose")
    return <Choose query={query} result={result} onPick={onPick} />;
  if (result.status === "unsupported") return <Unsupported result={result} />;
  return <Found result={result} />;
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
}: {
  result: Extract<LookupResult, { status: "unsupported" }>;
}) {
  const city =
    result.matchedAddress
      .replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, "")
      .match(/^.+?[市区町村]/)?.[0] ?? "";
  const q = encodeURIComponent(`${city} 建築基準法 道路種別`);
  return (
    <section className={CARD}>
      <Place address={result.matchedAddress} />
      <div className="border-t border-line/70 p-4">
        <MapPreview lat={result.lat} lng={result.lng} />
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
}: {
  result: Extract<LookupResult, { status: "ok" }>;
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
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 [&>*]:shrink-0 lg:grid lg:grid-cols-[3fr_2fr] lg:grid-rows-[minmax(0,1fr)] lg:items-start lg:gap-5">
      <section
        className={`${CARD} flex min-h-0 flex-1 !shrink flex-col lg:h-full`}
      >
        <Place
          address={result.matchedAddress}
          approximate={result.approximate}
          actions={
            <>
              <CopyButton text={result.matchedAddress} />
              <ShareButton result={result} />
            </>
          }
        />
        <div className="flex min-h-0 flex-1 flex-col border-t border-line/70 px-4 pb-4 pt-3 [&>*]:shrink-0">
          <CityLine municipality={m} />
          {/* 画面の高さに合わせて地図プレビューが伸び縮みする（スクロールさせない） */}
          <div className="mt-2.5 flex min-h-[64px] flex-1 !shrink flex-col">
            <MapPreview
              lat={result.lat}
              lng={result.lng}
              className="min-h-[64px] flex-1"
            />
          </div>
          {(primary.length > 0 || secondary.length > 0) && (
            <>
              <h3 className="mb-1.5 mt-3 text-[12px] font-semibold text-ink">
                地図を開く
              </h3>
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

      {/* PC では右の列にまとめる。スマホではそのまま下に並ぶ */}
      <div className="flex flex-col gap-2.5 lg:gap-5">
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

/** 「検索地点」：国土地理院が解釈した住所。番地まで一致しないことがあるので「付近」 */
function Place({
  address,
  approximate,
  actions,
}: {
  address: string;
  approximate?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="px-4 pb-3 pt-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-[11px] text-muted">
          <PinOutlineIcon className="h-3.5 w-3.5 text-brand-light" />
          検索地点
        </p>
        {actions && <span className="flex gap-1.5">{actions}</span>}
      </div>
      <p className="mt-1 text-[16px] font-semibold leading-snug text-ink">
        {address}{" "}
        <span className="whitespace-nowrap text-[13px] font-normal">付近</span>
      </p>
      {approximate ? (
        <p className="mt-1 flex gap-1 text-[10.5px] leading-[1.6] text-[#8a4f3a]">
          <AlertIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          番地が見つからず、町の中心を表示しています。
        </p>
      ) : (
        <p className="mt-1 text-[10.5px] text-muted [@media(max-height:720px)]:hidden">
          ※ 番地までは一致しないことがあります
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

function MapButton({
  link,
  primary,
}: {
  link: ResolvedLink;
  primary?: boolean;
}) {
  const sheet = link.sheet;
  const sub = sheet
    ? `物件が載っている図（${sheet.label}）が開きます`
    : link.pinpoint
      ? "物件の場所が開きます"
      : "地図の入口が開きます";
  // 開いたあとに操作が要る地図は、その手順を出す。入口しか開けない地図は住所の貼り付けを案内
  const tip = sheet
    ? `物件は図の${sheet.where}あたりです。`
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
            ? "bg-gold flex items-center gap-3 rounded-xl px-4 py-2.5 text-white shadow-[0_6px_16px_rgba(138,102,50,0.28)] active:scale-[0.99]"
            : "flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5 text-ink active:scale-[0.99]"
        }
      >
        <MapIcon
          className={`h-6 w-6 shrink-0 ${primary ? "" : "text-brand-light"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold leading-snug">
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
