"use client";

import { useEffect, useRef, useState } from "react";
import { showHazardOnMap, showLandPriceOnMap } from "@/lib/map-style";
import { positionAccuracy } from "@/lib/position-accuracy";
import type { LookupResult, Municipality, ResolvedLink } from "@/lib/roadmap";
import { chibanzuFor } from "@/lib/roadmap/chibanzu";
import type { HazardKind } from "@/lib/roadmap/hazard";
import { chibanLabel, kuikiLabel, parcelMark } from "@/lib/roadmap/parcel";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { sheetName, type SheetHit } from "@/lib/roadmap/sheets";
import type { DraftInput } from "@/lib/draft";
import { buildSummary } from "@/lib/summary";
import { BuildingCard, BuildingDetail, useBuilding, type BuildingState } from "./building-card";
import { ContactCard } from "./contact-card";
import { COVERAGE, CoveragePill } from "./coverage";
import { DRAFT_EVENT, DraftSheet, openDraft } from "./draft-sheet";
import { GuideMapSheet } from "./guide-map";
import { HazardCard, HazardLine, useHazard, type HazardState } from "./hazard-card";
import {
  AlertIcon,
  BuildingIcon,
  ChevronRightIcon,
  CopyIcon,
  FrameIcon,
  InfoIcon,
  MapIcon,
  NoteIcon,
  PinOutlineIcon,
  PrintIcon,
  SearchIcon,
  ShareIcon,
} from "./icons";
import { LandPriceCard, LandPriceLine, useLandPrices, type LandPriceState } from "./land-price-card";
import { LegendBlock, LegendButton } from "./legend";
import { MapPreview } from "./map-preview";
import { NearbyRoadsBlock, NearbyRoadsLine, useNearbyRoads, type RoadsState } from "./nearby-roads";
import { Sheet } from "./sheet";
import { SheetPreview } from "./sheet-preview";
import { parcelLines, ParcelButton, ParcelCard, useParcelInfo, type ParcelInfo } from "./parcel-card";
import { PrintSheet } from "./print-sheet";
import { SchoolButton, SchoolCard, useSchools, type SchoolState } from "./school-card";
import { PoiCard, usePois, type PoiState } from "./poi-card";
import { StationCard, StationLine, useStations, type StationState } from "./station-card";
import { useCopy } from "./use-copy";
import { UtilityLine, useZoning, ZoningCard, ZoningLine, type ZoningState } from "./zoning-card";

const CARD = "shadow-soft rounded-2xl border border-white bg-white";

/** スマホの全画面の地図を開くときに重ねておくもの */
export type MapOpen = { roads?: boolean; hazard?: HazardKind; /** 地価を重ね、この地点（[経度, 緯度]）も見えるように開く */ landPrice?: [number, number] };

/**
 * 結果の中身。スマホは地図の下から重なるパネルの中身（Found。縮めず、パネルの中でスクロールして読む）、
 * PC は地図の左のパネルの中身（desktop）
 */
export function ResultView({
  query,
  result,
  onPick,
  onFix,
  onExpand,
  onGuide,
  desktop,
}: {
  query: string;
  result: LookupResult;
  onPick: (address: string) => void;
  /** 「場所を直す」：地図で物件の場所を選び直す（スマホは全画面の地図を開く） */
  onFix?: () => void;
  /** 「地図を拡大」：MICHILU の中の動く地図で物件のまわりを見る（スマホ）。roads なら道路種別、hazard ならその災害の想定区域を重ねて開く */
  onExpand?: (opts?: MapOpen) => void;
  /** 案内図（A4）を開く（スマホの「共有・書類」） */
  onGuide?: () => void;
  /** PC（地図の左のパネル）用の配置 */
  desktop?: boolean;
}) {
  if (result.status === "not_found") return <NotFound query={query} />;
  if (result.status === "choose") return <Choose query={query} result={result} onPick={onPick} />;
  if (result.status === "unsupported") return <Unsupported result={result} onFix={onFix} />;
  return desktop ? <DesktopFound result={result} onPick={onPick} /> : <Found result={result} onFix={onFix} onExpand={onExpand} onGuide={onGuide} onPick={onPick} />;
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

/**
 * スマホの結果（地図の下から重なるパネルの中身）。1行1項目で、F01〜F12 の入口を並べる。
 * 縮めず、パネルの中でスクロールして全部読む（背の低い画面で項目や文字を減らす詰め方はしない）
 */
function Found({
  result,
  onFix,
  onExpand,
  onGuide,
  onPick,
}: {
  result: Extract<LookupResult, { status: "ok" }>;
  onFix?: () => void;
  onExpand?: (opts?: MapOpen) => void;
  /** 案内図（A4）を開く */
  onGuide?: () => void;
  onPick: (address: string) => void;
}) {
  const m = result.municipality;
  const zoning = useZoning(result.lat, result.lng, m);
  const parcels = useParcelInfo(result);
  const roads = useNearbyRoads(result.links, result.lat, result.lng);
  const hazard = useHazard(result.lat, result.lng, m);
  const building = useBuilding(result, parcels);
  const landPrice = useLandPrices(result.lat, result.lng);
  const schools = useSchools(result.lat, result.lng);
  const stations = useStations(result.lat, result.lng);
  const pois = usePois(result.lat, result.lng);
  // ネットで分からない市は、地図ボタンを参考扱いにして問い合わせ先を先に見せる
  const offline = m.coverage === "none" || m.coverage === "outside";
  const primary = offline
    ? []
    : result.links.filter((l) => l.kind !== "public_road");
  const secondary = offline
    ? []
    : result.links.filter((l) => l.kind === "public_road");
  // 地図ごとの操作メモ（同意の押し方など）があれば、同じことを言う一般の案内は出さない
  const hint = result.links.some((l) => l.pinpoint) && !primary.some((l) => l.tip) && (
    <p className="mt-2 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted short:hidden">
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
  // 印刷・PDF 保存用の調査メモ（画面には出ない。iPhone の共有 → プリントでも同じメモになる）
  const print = <PrintSheet result={result} zoning={zoning} parcels={parcels} roads={roads} hazard={hazard} building={building} landPrice={landPrice} schools={schools} stations={stations} pois={pois} />;
  // 重説・物件概要の下書き（メニューから開く）
  const [draft, setDraft] = useState(false);
  useEffect(() => {
    const open = () => setDraft(true);
    window.addEventListener(DRAFT_EVENT, open);
    return () => window.removeEventListener(DRAFT_EVENT, open);
  }, []);

  // 1行1項目（F01〜F12の入口）。縮めず、パネルの中でスクロールして読む
  const onMapRoads = onExpand && (() => onExpand({ roads: true }));
  const sheetRange = result.links.find((l) => l.sheet)?.sheet;
  return (
    <div className="mui-scope flex flex-col gap-3 pb-2" data-testid="result-panel">
      <Place
        result={result}
        flush
        fixable={!!onFix}
        onPick={onPick}
        actions={
          <>
            <CopyButton text={copyText(result)} tall />
            <ShareButton result={result} zoning={zoning} parcels={parcels} roads={roads} hazard={hazard} building={building} landPrice={landPrice} schools={schools} stations={stations} pois={pois} tall />
          </>
        }
      />
      <PositionBar result={result} onFix={onFix} onExpand={onExpand && (() => onExpand())} />
      <CityLine municipality={m} />
      {(primary.length > 0 || secondary.length > 0) && (
        <section aria-label="道路の公式図">
          <h3 className="mui-h3">道路の公式図</h3>
          <div className="space-y-2">
            {primary.map((l) => (
              <MapButton key={l.url} link={l} primary />
            ))}
            {secondary.map((l) => (
              <MapButton key={l.url} link={l} />
            ))}
          </div>
          <NearbyRoadsLine state={roads} onShowMap={onMapRoads} />
          {sheetRange && (
            <div className="mui-rows mt-2">
              <div>
                <SheetRangeLine lat={result.lat} lng={result.lng} sheet={sheetRange} />
              </div>
            </div>
          )}
          {hint}
        </section>
      )}
      <section aria-label="調べた項目">
        <h3 className="mui-h3">調べた項目（参考）</h3>
        <div className="mui-rows">
          <div>
            <ZoningLine state={zoning} city={m.name} />
          </div>
          <div>
            <HazardLine state={hazard} city={m.name} onShowMap={onExpand && ((k) => onExpand({ hazard: k }))} />
          </div>
          <div>
            <ParcelButton
              info={parcels}
              extra={building.status !== "none" && <BuildingDetail state={building} />}
              withBuilding={building.status !== "none"}
              chibanzu={chibanzuFor(m, result.lat, result.lng)}
              panel
            />
          </div>
          <div>
            <UtilityLine state={zoning} city={m.name} />
          </div>
          <div>
            <LandPriceLine state={landPrice} onShowMap={onExpand && ((p) => onExpand({ landPrice: p }))} />
          </div>
          <div>
            <StationLine state={stations} pois={pois} panel />
          </div>
          <div>
            <SchoolButton state={schools} panel />
          </div>
        </div>
      </section>
      {/* 共有・書類（F11）：調査メモの印刷・PDF保存、案内図、重説・物件概要の下書き。共有・住所コピーは上の住所の行 */}
      <section aria-label="共有・書類">
        <h3 className="mui-h3">共有・書類</h3>
        <div className="mui-rows">
          <div>
            <button type="button" onClick={() => window.print()}>
              <PrintIcon className="h-4 w-4 shrink-0 text-[var(--mui-primary)]" />
              <span className="min-w-0 flex-1">調査メモを印刷・PDF保存</span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--mui-muted)]" />
            </button>
          </div>
          {onGuide && (
            <div>
              <button type="button" onClick={onGuide}>
                <MapIcon className="h-4 w-4 shrink-0 text-[var(--mui-primary)]" />
                <span className="min-w-0 flex-1">案内図（A4）を印刷・PDF保存</span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--mui-muted)]" />
              </button>
            </div>
          )}
          <div>
            <button type="button" onClick={openDraft}>
              <NoteIcon className="h-4 w-4 shrink-0 text-[var(--mui-primary)]" />
              <span className="min-w-0 flex-1">重説・物件概要の下書き</span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--mui-muted)]" />
            </button>
          </div>
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
      {print}
      <DraftSheet result={result} input={loaded({ zoning, parcels, roads, hazard, building, landPrice, schools, stations, pois })} open={draft} onClose={() => setDraft(false)} />
    </div>
  );
}

/** 位置の目安（付近／推定／町の中心など）と、場所を直す・周辺の地図に重ねて見る入口（F01・F02） */
function PositionBar({ result, onFix, onExpand }: { result: Extract<LookupResult, { status: "ok" }>; onFix?: () => void; onExpand?: () => void }) {
  const a = positionAccuracy(result);
  return (
    <div className="space-y-2">
      <p
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${a.warn ? "bg-[var(--mui-warn-bg)] text-[var(--mui-warn-ink)]" : "bg-[var(--mui-primary-soft)] text-[var(--mui-primary-ink)]"}`}
      >
        {a.warn ? <AlertIcon className="h-3.5 w-3.5" /> : <PinOutlineIcon className="h-3.5 w-3.5" />}
        位置の目安：{a.label}
      </p>
      {(onFix || onExpand) && (
        <div className="flex gap-2">
          {onFix && (
            <button type="button" onClick={onFix} className="mui-row-btn">
              <PinOutlineIcon className="h-4 w-4 shrink-0 text-[var(--mui-primary)]" />
              <span className="min-w-0 flex-1">場所を直す</span>
            </button>
          )}
          {onExpand && (
            <button type="button" onClick={onExpand} className="mui-row-btn">
              <MapIcon className="h-4 w-4 shrink-0 text-[var(--mui-primary)]" />
              <span className="min-w-0 flex-1">地図に重ねて見る</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** PDF の図と同じ範囲（北が上）の地図で、物件の場所を見る行。押すと同じパネルの中で詳細を開く（F02） */
function SheetRangeLine({ lat, lng, sheet }: { lat: number; lng: number; sheet: SheetHit }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mui-row-btn">
        <FrameIcon className="h-4 w-4 shrink-0 text-[var(--mui-primary)]" />
        <span className="mui-row-label">図の範囲</span>
        <span className="min-w-0 flex-1 truncate text-[var(--mui-muted)]">{sheetName(sheet)}と同じ範囲（北が上）</span>
        <ChevronRightIcon className="ml-auto h-4 w-4 shrink-0 text-[var(--mui-muted)]" />
      </button>
      <Sheet detail title={`${sheetName(sheet)}と同じ範囲`} open={open} onClose={() => setOpen(false)}>
        <SheetPreview lat={lat} lng={lng} sheet={sheet} zoomable={false} fitWidth />
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          北が上です。道路や川の形を PDF の図と見比べると、物件（●）の場所がすぐ見つかります。
          {sheet.howto && <span className="mt-1 block text-brand">{sheet.howto}</span>}
        </p>
      </Sheet>
    </>
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
  flush,
}: {
  result: Extract<LookupResult, { status: "ok" }>;
  /** PC のパネル（出典を本文に書く。スマホは地図プレビューの上に書く） */
  desktop?: boolean;
  /** スマホの結果パネル：枠（カード）の内側ではなく、パネルの本文にそのまま置く（左右の余白を足さない） */
  flush?: boolean;
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
    <div className={flush ? "pb-1 pt-1" : "px-4 pb-3 pt-3 short:pb-2"}>
      <PlaceHeader
        label={found ? "地番で探した筆" : picked ? "地図で選んだ地点" : "検索地点"}
        address={address}
        suffix={
          found ? (
            <b className="text-[15px] font-semibold">
              {chibanLabel(found.chibanRaw)}
              {found.estimated && <span className="text-[11px] font-normal text-[#8a4f3a]">（公図から推定{found.estimated === "low" ? "・確度低" : ""}）</span>}
              {found.sanko && <span className="text-[11px] font-normal text-[#8a4f3a]">{parcelMark(found)}</span>}
            </b>
          ) : (
            "付近"
          )
        }
        actions={actions}
      />
      {found ? (
        <p className={`mt-1 text-[10.5px] leading-[1.6] text-muted ${desktop || parcelOthers ? "" : "short:hidden"}`}>
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
            この地点の筆：{chibanLabel(parcel.chibanRaw)}（{kuikiLabel(parcel.kuiki)}）{parcelMark(parcel)}
          </b>
          {desktop && (
            <>
              {" "}
              <ParcelCredit />
            </>
          )}
        </p>
      ) : (
        <p className="mt-1 text-[10.5px] text-muted short:hidden">
          {picked ? "※ 番地は分からないので、町名までを表示しています" : "※ 番地までは一致しないことがあります"}
        </p>
      )}
    </div>
  );
}

/** 物件の場所で開けない地図では、地図内の住所検索に貼り付けて使う */
function CopyButton({ text, tall }: { text: string; /** スマホの結果パネル：押しやすい高さ */ tall?: boolean }) {
  const { done, copy } = useCopy();
  return (
    <button
      onClick={() => copy(text)}
      className={`flex items-center gap-1 rounded-full border border-line text-brand ${tall ? "min-h-9 px-3 text-[12px]" : "px-2.5 py-1 text-[11px]"}`}
    >
      <CopyIcon className="h-3.5 w-3.5" />
      {done ? "コピー済" : "住所コピー"}
    </button>
  );
}

/** 市の名前とネットでの分かり方 */
function CityLine({ municipality: m }: { municipality: Municipality }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-mint to-white text-brand-light">
            <BuildingIcon className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[16px] font-semibold text-ink">{m.name}</span>
        </span>
        <CoveragePill coverage={m.coverage} />
      </div>
      {(m.note || m.coverage !== "full") && (
        <p className="mt-1.5 text-[10.5px] leading-[1.6] text-muted short:hidden">
          {m.note ?? COVERAGE[m.coverage].long}
        </p>
      )}
    </div>
  );
}

/** 読み込めた結果だけを、共有の文面・重説の下書きに渡す形にする（読み込み中・失敗は渡さない） */
function loaded({
  zoning,
  parcels,
  roads,
  hazard,
  building,
  landPrice,
  schools,
  stations,
  pois,
}: {
  zoning: ZoningState;
  parcels: ParcelInfo;
  roads: RoadsState;
  hazard: HazardState;
  building: BuildingState;
  landPrice: LandPriceState;
  schools: SchoolState;
  stations?: StationState;
  pois?: PoiState;
}): DraftInput {
  return {
    zoning: zoning.status === "ok" ? zoning : undefined,
    parcels: parcels.status === "ok" ? { ...parcelLines(parcels), reference: parcels.kind === "address", estimated: parcels.parcel.estimated, sanko: parcels.parcel.sanko } : undefined,
    roads: roads.status === "ok" ? roads.roads : undefined,
    hazard: hazard.status === "ok" ? hazard : undefined,
    building: building.status === "ok" ? building.result : undefined,
    landPrice: landPrice.status === "ok" ? landPrice.hits : undefined,
    schools: schools.status === "ok" ? schools.schools : undefined,
    stations: stations?.status === "ok" ? stations.stations : undefined,
    pois: pois?.status === "ok" ? pois.pois : undefined,
  };
}

/** 結果を報告・メモ用の文章にして共有（スマホ）またはコピー（PC） */
function ShareButton({
  result,
  zoning,
  parcels,
  roads,
  hazard,
  building,
  landPrice,
  schools,
  stations,
  pois,
  desktop,
  tall,
}: {
  result: Extract<LookupResult, { status: "ok" }>;
  zoning: ZoningState;
  parcels: ParcelInfo;
  roads: RoadsState;
  hazard: HazardState;
  building: BuildingState;
  landPrice: LandPriceState;
  schools: SchoolState;
  stations: StationState;
  pois: PoiState;
  /** PC：共有の画面は出さず、メールやチャットに貼れるようコピーする */
  desktop?: boolean;
  /** スマホの結果パネル：押しやすい高さ */
  tall?: boolean;
}) {
  const { done, copy } = useCopy();
  const onClick = async () => {
    const text = buildSummary(result, loaded({ zoning, parcels, roads, hazard, building, landPrice, schools, stations, pois }));
    if (!desktop && typeof navigator.share === "function") {
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
      className={`flex items-center gap-1 rounded-full border border-line text-brand ${tall ? "min-h-9 px-3 text-[12px]" : "px-2.5 py-1 text-[11px]"}`}
    >
      {desktop ? <CopyIcon className="h-3.5 w-3.5" /> : <ShareIcon className="h-3.5 w-3.5" />}
      {done ? "コピー済" : desktop ? "結果をコピー" : "結果を共有"}
    </button>
  );
}

function MapButton({
  link,
  primary,
  desktop,
}: {
  link: ResolvedLink;
  primary?: boolean;
  /** PC：色の見方（凡例）をボタンの下にそのまま出す（スマホは「色の見方」を押すとシートで出す） */
  desktop?: boolean;
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
            ? "bg-gold flex items-center gap-3 rounded-xl px-4 py-2.5 text-white shadow-[0_6px_16px_rgba(138,102,50,0.28)] active:scale-[0.99] snug:py-2"
            : "flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5 text-ink active:scale-[0.99] snug:py-2"
        }
      >
        <MapIcon
          className={`h-6 w-6 shrink-0 ${primary ? "" : "text-brand-light"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold leading-snug short:truncate">
            {link.label}
          </span>
          <span
            className={`mt-0.5 block text-[10.5px] snug:hidden ${primary ? "text-white/85" : "text-muted"}`}
          >
            {sub}
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 opacity-80" />
      </a>
      {(tip || (link.legend && !desktop)) && (
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
            {link.legend && !desktop && <LegendButton legend={link.legend} title={link.label} />}
          </span>
        </p>
      )}
      {link.legend && desktop && <LegendBlock legend={link.legend} />}
    </div>
  );
}

/**
 * PC の結果（地図の左のパネルの中身）。検索地点・市・地図ボタン・問い合わせ先。
 * 物件の場所と図の範囲は、右の動く地図に出る（components/desktop-shell.tsx）
 */
function DesktopFound({ result, onPick }: { result: Extract<LookupResult, { status: "ok" }>; onPick: (address: string) => void }) {
  const m = result.municipality;
  const zoning = useZoning(result.lat, result.lng, m);
  const parcels = useParcelInfo(result);
  const roads = useNearbyRoads(result.links, result.lat, result.lng);
  const chibanzu = chibanzuFor(m, result.lat, result.lng);
  const hazard = useHazard(result.lat, result.lng, m);
  const building = useBuilding(result, parcels);
  const landPrice = useLandPrices(result.lat, result.lng);
  const schools = useSchools(result.lat, result.lng);
  const stations = useStations(result.lat, result.lng);
  const pois = usePois(result.lat, result.lng);
  const [draft, setDraft] = useState(false);
  const offline = m.coverage === "none" || m.coverage === "outside";
  const primary = result.links.filter((l) => !offline && l.kind !== "public_road");
  const others = result.links.filter((l) => offline || l.kind === "public_road");
  // くわしい内容は、パネルの下のタブで1つずつ出す（全部を縦に並べると画面7枚分ほどになるので）。要点の行を押すと、そのタブを開いて動かす
  const tabs = pcTabs({ parcels, chibanzu, building, landPrice, stations, pois, schools });
  const [tab, setTab] = useState<PcTab>("zoning");
  const current = tabs.some((t) => t.key === tab) ? tab : "zoning";
  const jump = (t: PcTab) => {
    setTab(t);
    requestAnimationFrame(() => document.getElementById("pc-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
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
              <ShareButton result={result} zoning={zoning} parcels={parcels} roads={roads} hazard={hazard} building={building} landPrice={landPrice} schools={schools} stations={stations} pois={pois} desktop />
              <PrintMenu result={result} onDraft={() => setDraft(true)} />
              <DraftSheet result={result} input={loaded({ zoning, parcels, roads, hazard, building, landPrice, schools, stations, pois })} open={draft} onClose={() => setDraft(false)} />
            </>
          }
        />
        <div className="border-t border-line/70 px-4 pb-4 pt-3">
          <CityLine municipality={m} />
          {/* 要点（スマホと同じ行）。最初の画面で用途地域・建ぺい率・容積率と地番、災害リスクが分かる */}
          <div className="mt-2.5 flex gap-1.5">
            <ZoningLine state={zoning} city={m.name} onOpen={() => jump("zoning")} />
            <ParcelButton info={parcels} onOpen={() => jump("parcel")} chibanzu={chibanzu} />
          </div>
          <div className="mt-1.5 flex">
            <HazardLine state={hazard} city={m.name} onOpen={() => jump("hazard")} />
          </div>
          {!(landPrice.status === "ok" && landPrice.hits.length === 0) && (
            <div className="mt-1.5 flex">
              <LandPriceLine state={landPrice} onOpen={() => jump("land-price")} />
            </div>
          )}
          {!(stations.status === "ok" && stations.stations.length === 0) && (
            <div className="mt-1.5 flex">
              <StationLine state={stations} onOpen={() => jump("station")} />
            </div>
          )}
          {(schools.status === "ok" || schools.status === "loading") && (
            <div className="mt-1.5 flex">
              <SchoolButton state={schools} onOpen={() => jump("school")} />
            </div>
          )}
        </div>
      </section>

      {result.links.length > 0 && (
        <section className={`${CARD} p-4`}>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">{offline ? "参考：公道（市道）かどうかの地図" : "地図を開く"}</h3>
          <div className="space-y-2">
            {primary.map((l) => (
              <MapButton key={l.url} link={l} primary desktop />
            ))}
            {others.map((l) => (
              <MapButton key={l.url} link={l} desktop />
            ))}
          </div>
          <NearbyRoadsBlock state={roads} />
          {result.links.some((l) => l.pinpoint) && (
            <p className="mt-2 flex gap-1.5 text-[11px] leading-[1.6] text-muted">
              <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
              地図は新しいタブで開きます。利用規約に同意すると、物件の場所が地図の中央に出ます。
            </p>
          )}
        </section>
      )}

      <div>
        {/* パネルを動かしても、タブは上に残る */}
        <div id="pc-tabs" role="tablist" className="no-scrollbar sticky top-0 z-10 -mx-1 flex scroll-mt-0 gap-1.5 overflow-x-auto bg-background/95 px-1 pb-2 pt-1 backdrop-blur">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={t.key === current}
              onClick={() => setTab(t.key)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] ${t.key === current ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-mint"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {current === "zoning" && <ZoningCard state={zoning} city={m.name} />}
          {current === "hazard" && <HazardCard state={hazard} city={m.name} onShowMap={showHazardOnMap} />}
          {current === "parcel" && (
            <>
              {(parcels.status !== "none" || chibanzu) && <ParcelCard info={parcels} chibanzu={chibanzu} />}
              <BuildingCard state={building} />
            </>
          )}
          {current === "land-price" && <LandPriceCard state={landPrice} onShowMap={showLandPriceOnMap} />}
          {current === "station" && (
            <>
              <StationCard state={stations} />
              <div id="pc-poi">
                <PoiCard state={pois} />
              </div>
            </>
          )}
          {current === "school" && <SchoolCard state={schools} />}
        </div>
      </div>

      {result.contact && <ContactCard contact={result.contact} city={m.name} address={result.matchedAddress} />}
      <PrintSheet result={result} zoning={zoning} parcels={parcels} roads={roads} hazard={hazard} building={building} landPrice={landPrice} schools={schools} stations={stations} pois={pois} />
    </div>
  );
}

/**
 * PC：調査メモ（components/print-sheet.tsx）・案内図（components/guide-map.tsx）の印刷・PDF 保存と、重説・物件概要の下書き（onDraft）。
 * 見出しの行が窮屈なのでアイコンだけで、押すと選ぶ
 */
function PrintMenu({ result, onDraft }: { result: Extract<LookupResult, { status: "ok" }>; onDraft: () => void }) {
  const [menu, setMenu] = useState(false);
  const [guide, setGuide] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  // 選ぶ欄の外を押すか Esc で閉じる
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);
  const item = "flex items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-mint";
  return (
    <span ref={ref} className="relative">
      <button
        onClick={() => setMenu((v) => !v)}
        aria-label="印刷"
        aria-expanded={menu}
        title="調査メモ・案内図の印刷・PDF保存、重説・物件概要の下書き"
        className="flex items-center rounded-full border border-line px-2 py-1 text-brand lg:hover:bg-mint"
      >
        <PrintIcon className="h-3.5 w-3.5" />
      </button>
      {menu && (
        <span className="absolute right-0 top-full z-40 mt-1 flex w-max flex-col rounded-xl border border-line bg-white p-1 text-[12.5px] text-ink shadow-soft">
          <button
            className={item}
            onClick={() => {
              setMenu(false);
              window.print();
            }}
          >
            <PrintIcon className="h-3.5 w-3.5 text-brand" />
            調査メモを印刷
          </button>
          <button
            className={item}
            onClick={() => {
              setMenu(false);
              setGuide(true);
            }}
          >
            <MapIcon className="h-3.5 w-3.5 text-brand" />
            案内図を印刷…
          </button>
          <button
            className={item}
            onClick={() => {
              setMenu(false);
              onDraft();
            }}
          >
            <NoteIcon className="h-3.5 w-3.5 text-brand" />
            重説・物件概要の下書き…
          </button>
        </span>
      )}
      <GuideMapSheet result={result} open={guide} onClose={() => setGuide(false)} />
    </span>
  );
}

type PcTab = "zoning" | "hazard" | "parcel" | "land-price" | "station" | "school";

/** PC のパネルのタブ（データの無いものは出さない） */
function pcTabs({
  parcels,
  chibanzu,
  building,
  landPrice,
  stations,
  pois,
  schools,
}: {
  parcels: ParcelInfo;
  chibanzu?: ReturnType<typeof chibanzuFor>;
  building: BuildingState;
  landPrice: LandPriceState;
  stations: StationState;
  pois: PoiState;
  schools: SchoolState;
}): { key: PcTab; label: string }[] {
  const out: { key: PcTab; label: string }[] = [
    { key: "zoning", label: "法令の制限" },
    { key: "hazard", label: "災害リスク" },
  ];
  if (parcels.status !== "none" || chibanzu || building.status !== "none") out.push({ key: "parcel", label: building.status !== "none" ? "地番・建物" : "地番" });
  if (!(landPrice.status === "ok" && landPrice.hits.length === 0)) out.push({ key: "land-price", label: "地価" });
  if (!(stations.status === "ok" && stations.stations.length === 0) || !(pois.status === "ok" && pois.pois.length === 0)) out.push({ key: "station", label: "駅・周辺" });
  if (schools.status !== "none") out.push({ key: "school", label: "学区" });
  return out;
}
