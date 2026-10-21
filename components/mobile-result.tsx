"use client";

// スマホの結果（新しい見た目）。上に「MICHILUの強み」（道路種別の地図）、白いパネルに住所・お気に入り・共有、
// タブ（基本情報・周辺環境・相場・取引・法令・規制・ハザード・取引事例）。基本情報は、地図と航空写真、物件の表（地番・用途地域・
// 建ぺい率・容積率・図面上の面積・現況・都市計画・防火）、土地の参考価格、周辺の施設、問い合わせ先、共有とレポート。
// ほかのタブは今までのシートの中身（都市計画・災害リスク・地価・駅・学区・施設）をそのまま出す
import { useEffect, useState } from "react";
import type { LookupResult } from "@/lib/roadmap";
import { chibanzuFor } from "@/lib/roadmap/chibanzu";
import { changeText, distanceText, kindText, priceText, tsuboText } from "@/lib/roadmap/land-price";
import { chibanLabel, kuikiLabel, parcelMark, tileBounds, type LngLat, type Parcel } from "@/lib/roadmap/parcel";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { YOUTO_COLORS, zoningRows } from "@/lib/roadmap/zoning";
import { buildSummary } from "@/lib/summary";
import { AerialPhoto } from "./aerial-photo";
import { BuildingDetail, useBuilding } from "./building-card";
import { ContactCard } from "./contact-card";
import { DRAFT_EVENT, DraftSheet } from "./draft-sheet";
import { GuideMapSheet } from "./guide-map";
import { HazardDetail, useHazard } from "./hazard-card";
import {
  AlertIcon,
  BarsIcon,
  BuildingIcon,
  ChevronRightIcon,
  CopyIcon,
  DatabaseIcon,
  HomeIcon,
  LandPriceIcon,
  MapIcon,
  NoteIcon,
  ParcelIcon,
  PinIcon,
  PinOutlineIcon,
  PrintIcon,
  SchoolIcon,
  ShareNodesIcon,
  ShopIcon,
  StarIcon,
  TrainIcon,
  TriangleAlertIcon,
  ZoningIcon,
} from "./icons";
import { LandPriceDetail, useLandPrices } from "./land-price-card";
import { MapPreview } from "./map-preview";
import { NearbyRoadsBlock, useNearbyRoads } from "./nearby-roads";
import { ParcelDetail, useParcelInfo } from "./parcel-card";
import { PoiList, usePois } from "./poi-card";
import { PrintSheet } from "./print-sheet";
import { copyText, loaded, type MapOpen } from "./result-view";
import { SchoolDetail, useSchools } from "./school-card";
import { Sheet } from "./sheet";
import { StationList, useStations } from "./station-card";
import { StrengthCard } from "./strength-card";
import { useCopy } from "./use-copy";
import { useZoning, ZoningDetail } from "./zoning-card";

type Ok = Extract<LookupResult, { status: "ok" }>;
type Tab = "basic" | "around" | "price" | "law" | "hazard" | "deals";

const TABS: { key: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { key: "basic", label: "基本情報", Icon: HomeIcon },
  { key: "around", label: "周辺環境", Icon: PinOutlineIcon },
  { key: "price", label: "相場・取引", Icon: BarsIcon },
  { key: "law", label: "法令・規制", Icon: NoteIcon },
  { key: "hazard", label: "ハザード", Icon: TriangleAlertIcon },
  { key: "deals", label: "取引事例", Icon: DatabaseIcon },
];

/** 周辺の施設のアイコンの色（種類ごと） */
const POI_COLORS: Record<number, string> = { 1: "#f08a24", 2: "#0e9f6e", 3: "#7c5cd6", 4: "#d64545", 5: "#d64545", 6: "#3cae5a", 7: "#d64545", 8: "#2b63c8", 9: "#e0a21b", 10: "#3a5a8a", 11: "#3a5a8a", 12: "#f08a24" };

export function MobileResult({
  result,
  onPick,
  onFix,
  onExpand,
  favorite,
  onToggleFavorite,
}: {
  result: Ok;
  /** 近い地番を選んで探し直す */
  onPick: (address: string) => void;
  onFix: () => void;
  onExpand: (opts?: MapOpen) => void;
  favorite: boolean;
  onToggleFavorite: () => void;
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
  const chibanzu = chibanzuFor(m, result.lat, result.lng);
  const [tab, setTab] = useState<Tab>("basic");
  const [report, setReport] = useState(false);
  const [draft, setDraft] = useState(false);
  const [guide, setGuide] = useState(false);
  const input = loaded({ zoning, parcels, roads, hazard, building, landPrice, schools, stations, pois });
  const { done, copy } = useCopy();
  const addr = useCopy();

  // メニューの「重説・物件概要の下書き」からも開く
  useEffect(() => {
    const open = () => setDraft(true);
    window.addEventListener(DRAFT_EVENT, open);
    return () => window.removeEventListener(DRAFT_EVENT, open);
  }, []);

  const share = async () => {
    const text = buildSummary(result, input);
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

  const found = result.parcel && !result.picked ? result.parcel : undefined;
  const tabBtn = (t: (typeof TABS)[number]) => (
    <button
      key={t.key}
      role="tab"
      aria-selected={tab === t.key}
      onClick={() => setTab(t.key)}
      className={`flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold ${tab === t.key ? "bg-navy text-white" : "bg-mist text-navy-deep"}`}
    >
      <t.Icon className="h-4 w-4" />
      {t.label}
    </button>
  );

  return (
    <div>
      <div className="px-4 pb-4 pt-1">
        <StrengthCard result={result} />
      </div>

      <div className="rounded-t-[24px] bg-white px-4 pb-6 pt-4 shadow-[0_-10px_30px_rgba(15,47,95,0.07)]">
        {/* 住所 */}
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mist text-navy">
            <PinIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold leading-[1.35] text-navy-deep">
              {result.matchedAddress}
              {found ? (
                <span className="ml-1 whitespace-nowrap">
                  {chibanLabel(found.chibanRaw)}
                  {(found.estimated || found.sanko) && <span className="ml-1 text-[11px] font-normal text-[#b4533c]">{found.estimated ? `（公図から推定${found.estimated === "low" ? "・確度低" : ""}）` : parcelMark(found)}</span>}
                </span>
              ) : (
                <span className="ml-1 text-[12px] font-normal text-steel">付近</span>
              )}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-steel">
              <span className="min-w-0 truncate">{found ? "地番で探した筆" : result.picked ? "地図で選んだ地点" : "検索地点"}</span>
              <button onClick={() => addr.copy(copyText(result))} aria-label="住所コピー" className="flex shrink-0 items-center gap-0.5 text-navy">
                <CopyIcon className="h-3.5 w-3.5" />
                {addr.done ? "コピー済" : "住所コピー"}
              </button>
            </p>
            <AddressNote result={result} onPick={onPick} />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onToggleFavorite}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-semibold ${favorite ? "border-navy bg-navy text-white" : "border-hairline bg-white text-navy"}`}
          >
            <StarIcon className="h-4 w-4" />
            {favorite ? "保存済み" : "お気に入り"}
          </button>
          <button onClick={share} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-hairline bg-white px-3 py-2 text-[12.5px] font-semibold text-navy">
            <ShareNodesIcon className="h-4 w-4" />
            {done ? "コピー済" : "共有"}
          </button>
        </div>

        {/* タブ */}
        <div role="tablist" className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4">
          {TABS.map(tabBtn)}
        </div>

        <div className="mt-3">
          {tab === "basic" && (
            <BasicPanel
              result={result}
              zoning={zoning}
              parcels={parcels}
              building={building}
              landPrice={landPrice}
              stations={stations}
              schools={schools}
              pois={pois}
              chibanzu={chibanzu}
              roads={roads}
              onFix={onFix}
              onExpand={onExpand}
              go={setTab}
            />
          )}
          {tab === "around" && (
            <div className="space-y-4">
              <Section title="最寄り駅" Icon={TrainIcon}>
                {stations.status === "loading" && <Loading text="最寄り駅を確認しています…" />}
                {stations.status === "error" && <Loading text="最寄り駅を出せませんでした。" />}
                {stations.status === "ok" && (stations.stations.length ? <StationList stations={stations.stations} /> : <Loading text="近くに駅がありません。" />)}
              </Section>
              {schools.status !== "none" && (
                <Section title="学区" Icon={SchoolIcon}>
                  {schools.status === "loading" && <Loading text="学区を確認しています…" />}
                  {schools.status === "error" && <Loading text="学区のデータを読み込めませんでした。" />}
                  {schools.status === "ok" && <SchoolDetail schools={schools.schools} />}
                </Section>
              )}
              <Section title="周辺施設" Icon={ShopIcon}>
                <PoiList state={pois} />
              </Section>
            </div>
          )}
          {tab === "price" && (
            <Section title="近くの地価（参考）" Icon={LandPriceIcon}>
              {landPrice.status === "loading" && <Loading text="近くの地価を確認しています…" />}
              {landPrice.status === "error" && <Loading text="地価のデータを読み込めませんでした。" />}
              {landPrice.status === "ok" && (landPrice.hits.length ? <LandPriceDetail hits={landPrice.hits} rosenka={landPrice.rosenka} onShowMap={(p) => onExpand({ landPrice: p })} /> : <Loading text="近く（4km 以内）に地価公示・地価調査の地点がありません。" />)}
            </Section>
          )}
          {tab === "law" && (
            <Section title="法令に基づく制限（参考）" Icon={ZoningIcon}>
              {zoning.status === "loading" && <Loading text="都市計画を確認しています…" />}
              {zoning.status === "error" && <Loading text="都市計画のデータを読み込めませんでした。" />}
              {zoning.status === "ok" && <ZoningDetail state={zoning} city={m.name} tabs />}
            </Section>
          )}
          {tab === "hazard" && (
            <Section title="災害リスク（参考）" Icon={TriangleAlertIcon}>
              {hazard.status === "loading" && <Loading text="国のハザードマップのデータを確認しています…" />}
              {hazard.status === "error" && <Loading text="ハザードマップのデータを読み込めませんでした。" />}
              {hazard.status === "ok" && <HazardDetail state={hazard} city={m.name} onShowMap={(k) => onExpand({ hazard: k })} />}
            </Section>
          )}
          {tab === "deals" && (
            <Section title="周辺の取引事例" Icon={DatabaseIcon}>
              <div className="rounded-2xl bg-sky px-3 py-4 text-[12.5px] leading-[1.7] text-ink">
                <p className="font-semibold">準備中です。</p>
                <p className="mt-1 text-steel">国土交通省の不動産情報ライブラリの鍵を登録すると、周辺で実際に取引された価格（町名まで）が出ます。</p>
              </div>
            </Section>
          )}
        </div>

        {/* 共有とレポート */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={share} className="flex items-center justify-center gap-2 rounded-full border border-navy px-3 py-2.5 text-[13px] font-semibold text-navy">
            <ShareNodesIcon className="h-4 w-4" />
            {done ? "コピー済" : "この情報を共有"}
          </button>
          <button onClick={() => setReport(true)} className="bg-navy-gradient flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-[13px] font-semibold text-white shadow-[0_6px_16px_rgba(15,47,95,0.3)]">
            <NoteIcon className="h-4 w-4" />
            レポートを作成
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Sheet title="レポートを作成" open={report} onClose={() => setReport(false)}>
        <ul className="divide-y divide-line">
          {(
            [
              ["調査メモを印刷・PDF保存", PrintIcon, () => window.print()],
              ["案内図を印刷・PDF保存", MapIcon, () => setGuide(true)],
              ["重説・物件概要の下書き", NoteIcon, () => setDraft(true)],
            ] as [string, typeof PrintIcon, () => void][]
          ).map(([label, Icon, act]) => (
            <li key={label}>
              <button
                onClick={() => {
                  setReport(false);
                  act();
                }}
                className="flex w-full items-center gap-3 py-4 text-left text-ink"
              >
                <Icon className="h-5 w-5 text-brand-light" />
                <span className="flex-1">{label}</span>
                <ChevronRightIcon className="h-4 w-4 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      <GuideMapSheet result={result} open={guide} onClose={() => setGuide(false)} />
      <DraftSheet result={result} input={input} open={draft} onClose={() => setDraft(false)} />
      {/* 印刷・PDF 保存用の調査メモ（画面には出ない） */}
      <PrintSheet result={result} zoning={zoning} parcels={parcels} roads={roads} hazard={hazard} building={building} landPrice={landPrice} schools={schools} stations={stations} pois={pois} />
    </div>
  );
}

/** 住所の下の一言（番地が無い・地番が見つからない・地図で選んだ地点など） */
function AddressNote({ result, onPick }: { result: Ok; onPick: (address: string) => void }) {
  const { approximate, picked, parcel, parcelMiss, parcelOthers, matchedAddress } = result;
  const warn = "mt-1 flex gap-1 text-[11px] leading-[1.6] text-[#b4533c]";
  const town = approximate ? "町の中心を表示しています。" : "";
  if (parcel && !picked)
    return (
      <p className="mt-1 text-[10.5px] leading-[1.6] text-steel">
        ※ 筆は{PARCEL_DATA.edition}の地図。分筆などで変わることがあります
        {!!parcelOthers && <span className="block text-[#b4533c]">同じ地番の筆がほかに{parcelOthers}件あります（小字違いなど）。</span>}
      </p>
    );
  if (parcelMiss)
    return (
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
                <button key={c} onClick={() => onPick(`地番 ${matchedAddress}${c}`)} className="rounded-full bg-mist px-2 py-px font-semibold text-navy">
                  {c}
                </button>
              ))}
            </span>
          )}
        </span>
      </div>
    );
  if (approximate)
    return (
      <p className={warn}>
        <AlertIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        番地が見つからず、町の中心を表示しています。地図の「場所を直す」で物件の位置を選べます。
      </p>
    );
  if (picked && parcel)
    return (
      <p className="mt-1 text-[11px] leading-[1.6] text-steel">
        この地点の筆：{kuikiLabel(parcel.kuiki)} {chibanLabel(parcel.chibanRaw)}
        {parcelMark(parcel)}
      </p>
    );
  return <p className="mt-1 text-[10.5px] text-steel">{picked ? "※ 番地は分からないので、町名までを表示しています" : "※ 番地までは一致しないことがあります"}</p>;
}

function Section({ title, Icon, children }: { title: string; Icon: typeof HomeIcon; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[14px] font-bold text-navy-deep">
        <Icon className="h-4 w-4 text-navy" />
        {title}
      </h3>
      {children}
    </section>
  );
}

const Loading = ({ text }: { text: string }) => <p className="py-2 text-[12.5px] text-steel">{text}</p>;

// ---- 基本情報 ----

type BasicProps = {
  result: Ok;
  zoning: ReturnType<typeof useZoning>;
  parcels: ReturnType<typeof useParcelInfo>;
  building: ReturnType<typeof useBuilding>;
  landPrice: ReturnType<typeof useLandPrices>;
  stations: ReturnType<typeof useStations>;
  schools: ReturnType<typeof useSchools>;
  pois: ReturnType<typeof usePois>;
  roads: ReturnType<typeof useNearbyRoads>;
  chibanzu: ReturnType<typeof chibanzuFor>;
  onFix: () => void;
  onExpand: (opts?: MapOpen) => void;
  go: (t: Tab) => void;
};

function BasicPanel({ result, zoning, parcels, building, landPrice, stations, schools, pois, roads, chibanzu, onFix, onExpand, go }: BasicProps) {
  const m = result.municipality;
  const parcel = parcels.status === "ok" ? parcels.parcel : undefined;
  const area = parcel && /^\d/.test(parcel.chibanRaw) ? parcelAreaM2(parcel) : undefined;
  const z = zoning.status === "ok" ? zoning : undefined;
  const y = z?.zoning.youto[0];
  const zRows = z ? zoningRows(z.zoning, z.st) : [];
  const zoneRow = (label: string) => zRows.find((r) => r.label === label);
  const pending = <span className="font-normal text-steel">確認中…</span>;
  const top = landPrice.status === "ok" ? landPrice.hits[0] : undefined;

  const rows: { Icon: typeof HomeIcon; label: string; value: React.ReactNode; sub?: string }[] = [
    { Icon: PinOutlineIcon, label: "所在地", value: result.matchedAddress },
    {
      Icon: ParcelIcon,
      label: "地番",
      value:
        parcels.status === "loading" ? pending : parcel ? (
          <>
            {chibanLabel(parcel.chibanRaw)}
            {parcelMark(parcel)}
            {parcels.status === "ok" && parcels.kind === "address" && <span className="ml-1 text-[10.5px] font-normal text-steel">（住所の地点の筆・参考）</span>}
          </>
        ) : (
          <span className="font-normal text-steel">地図データに筆なし</span>
        ),
    },
    {
      Icon: ZoningIcon,
      label: "用途地域",
      value: !z ? (
        zoning.status === "error" ? <span className="font-normal text-steel">読み込めませんでした</span> : pending
      ) : y ? (
        <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px]" style={{ background: `${YOUTO_COLORS[y.code] ?? "#ddd"}55` }}>
          {y.name}
        </span>
      ) : (
        (zoneRow("用途地域")?.value ?? "指定なし")
      ),
    },
    { Icon: BuildingIcon, label: "建ぺい率", value: !z ? pending : y?.bcr ? `${y.bcr}%` : <span className="font-normal text-steel">データなし</span> },
    { Icon: BuildingIcon, label: "容積率", value: !z ? pending : y?.far ? `${y.far}%` : <span className="font-normal text-steel">データなし</span> },
    {
      Icon: ParcelIcon,
      label: "面積",
      value: parcels.status === "loading" ? pending : area ? `約${Math.round(area)}㎡（約${(area / (400 / 121)).toFixed(1)}坪）` : <span className="font-normal text-steel">—</span>,
      sub: area ? "地図の筆の形から求めた参考値。公簿の地積は謄本で" : "公簿の地積は謄本で",
    },
    {
      Icon: HomeIcon,
      label: "現況",
      value:
        building.status === "none" ? (
          <span className="font-normal text-steel">データなし</span>
        ) : building.status === "loading" ? (
          pending
        ) : building.status === "error" ? (
          <span className="font-normal text-steel">読み込めませんでした</span>
        ) : building.result.hit ? (
          "建物あり"
        ) : (
          "建物なし（データ時点）"
        ),
    },
    { Icon: MapIcon, label: "都市計画", value: !z ? pending : (zoneRow("区域")?.value ?? "—") },
    { Icon: AlertIcon, label: "防火地域", value: !z ? pending : (zoneRow("防火・準防火")?.value ?? "—") },
  ];

  const facilities: { key: string; Icon: typeof HomeIcon; color: string; name: string; meters: number; minutes?: number; routed: boolean }[] = [];
  if (stations.status === "ok" && stations.stations[0]) {
    const s = stations.stations[0];
    facilities.push({ key: "station", Icon: TrainIcon, color: "#2b63c8", name: `${s.name}駅`, meters: s.meters, minutes: s.minutes, routed: s.routed });
  }
  if (schools.status === "ok" && schools.schools.elementary) {
    const e = schools.schools.elementary;
    if (e.walk || e.distance !== undefined) facilities.push({ key: "school", Icon: SchoolIcon, color: "#2fa36b", name: e.name, meters: e.walk?.meters ?? e.distance!, minutes: e.walk?.minutes, routed: !!e.walk });
  }
  if (pois.status === "ok") for (const w of pois.pois.slice(0, 6)) facilities.push({ key: `poi${w.kind}`, Icon: ShopIcon, color: POI_COLORS[w.kind] ?? "#3a5a8a", name: w.name, meters: w.meters, minutes: w.minutes, routed: w.routed });
  const facLoading = stations.status === "loading" || pois.status === "loading";

  return (
    <div>
      <div className="grid grid-cols-[45%_1fr] gap-2.5">
        <div>
          <MapPreview lat={result.lat} lng={result.lng} className="h-[300px]" parcel={result.parcel} onFix={onFix} fixClassName="hidden" onExpand={() => onExpand()} />
          <button onClick={onFix} className="mt-2 flex w-full items-center justify-center gap-1 rounded-full border border-hairline bg-white py-1.5 text-[11.5px] font-semibold text-navy active:bg-mist">
            <PinOutlineIcon className="h-3.5 w-3.5" />
            場所を直す
          </button>
          {top && (
            <button onClick={() => go("price")} className="mt-2.5 w-full rounded-2xl bg-[#eaf1fb] p-3 text-left active:bg-mist">
              <span className="flex items-center gap-1.5 text-[10.5px] text-steel">
                <LandPriceIcon className="h-4 w-4 shrink-0 text-navy" />
                土地の参考価格（{kindText(top.kind)}）
              </span>
              <span className="mt-1 flex items-center justify-between">
                <span className={`${priceText(top.price).length > 8 ? "text-[16px]" : "text-[19px]"} whitespace-nowrap font-bold leading-none text-navy-deep`}>{priceText(top.price)}</span>
                <ChevronRightIcon className="h-4 w-4 text-navy" />
              </span>
              <span className="mt-1 block text-[10px] leading-[1.5] text-steel">
                （{tsuboText(top.price)}）{distanceText(top.distance)}・前年比 {changeText(top.change)}
              </span>
            </button>
          )}
          <div className="mt-2.5 rounded-2xl bg-[#eaf6ee] p-3">
            <span className="flex items-center gap-1.5 text-[10.5px] text-steel">
              <BarsIcon className="h-4 w-4 shrink-0 text-[#2fa36b]" />
              周辺の取引相場
            </span>
            <span className="mt-1 block text-[11px] leading-[1.5] text-steel">国の取引価格の鍵を登録すると出ます</span>
          </div>
        </div>
        <div className="min-w-0">
          <AerialPhoto lat={result.lat} lng={result.lng} className="h-[150px] rounded-xl">
            <PinIcon className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-full text-[#e8463b] drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]" />
            <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer" className="absolute bottom-1 right-1 rounded bg-black/50 px-1.5 text-[9px] text-white">
              航空写真：地理院タイル
            </a>
          </AerialPhoto>
          <dl className="mt-2 divide-y divide-hairline">
            {rows.map((r) => (
              <div key={r.label} className="flex gap-2 py-[7px]">
                <dt className="flex w-[6.6em] shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-steel">
                  <r.Icon className="h-3.5 w-3.5 shrink-0 text-navy-soft" />
                  {r.label}
                </dt>
                <dd className="min-w-0 flex-1 text-[12px] font-semibold leading-[1.45] text-navy-deep">
                  {r.value}
                  {r.sub && <span className="mt-0.5 block text-[9.5px] font-normal leading-[1.4] text-steel">{r.sub}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* 周辺の施設 */}
      <div className="mt-4 flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-navy-deep">周辺の施設</h3>
        <button onClick={() => go("around")} className="flex items-center text-[11.5px] text-navy">
          もっと見る
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {facilities.length ? (
        <ul className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          {facilities.map((f) => (
            <li key={f.key} className="w-[112px] shrink-0 rounded-xl border border-hairline bg-white p-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: f.color }}>
                <f.Icon className="h-4 w-4" />
              </span>
              <span className="mt-1.5 block truncate text-[12px] font-semibold text-navy-deep">{f.name}</span>
              <span className="mt-0.5 flex items-baseline justify-between text-[10.5px]">
                <span className={f.routed ? "font-bold text-[#d64545]" : "text-steel"}>{f.routed ? `徒歩${f.minutes}分` : "直線"}</span>
                <span className="text-steel">{f.meters >= 1000 ? `${(f.meters / 1000).toFixed(1)}km` : `${Math.round(f.meters / 10) * 10}m`}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Loading text={facLoading ? "周辺の施設を確認しています…" : "近くに、データにある施設がありません。"} />
      )}

      {/* 地番・建物 */}
      {(parcels.status !== "none" || chibanzu) && (
        <details className="mt-4 rounded-2xl border border-hairline px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-navy-deep [&::-webkit-details-marker]:hidden">
            <ParcelIcon className="h-4 w-4 text-navy" />
            謄本・公図を取るときの地番と隣地
            <ChevronRightIcon className="ml-auto h-4 w-4 text-steel" />
          </summary>
          <div className="mt-2">
            {parcels.status === "loading" && <Loading text="筆を確認しています…" />}
            {parcels.status === "none" && <Loading text="この地点の筆は、登記所の地図データにありません。" />}
            {parcels.status === "ok" && <ParcelDetail info={parcels} chibanzu={chibanzu} />}
          </div>
        </details>
      )}
      {building.status !== "none" && (
        <details className="mt-2 rounded-2xl border border-hairline px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-navy-deep [&::-webkit-details-marker]:hidden">
            <BuildingIcon className="h-4 w-4 text-navy" />
            建物（国の3D都市モデル）
            <ChevronRightIcon className="ml-auto h-4 w-4 text-steel" />
          </summary>
          <div className="mt-2">
            <BuildingDetail state={building} />
          </div>
        </details>
      )}
      <NearbyRoadsBlock state={roads} />

      {/* 次のタブへ */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => go("deals")} className="flex items-center gap-2 rounded-2xl bg-sky px-3 py-3 text-left active:bg-mist">
          <BarsIcon className="h-6 w-6 shrink-0 text-navy" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-navy-deep">取引事例</span>
            <span className="block text-[10px] text-steel">近隣の売買事例</span>
          </span>
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-navy" />
        </button>
        <button onClick={() => go("law")} className="flex items-center gap-2 rounded-2xl bg-sky px-3 py-3 text-left active:bg-mist">
          <NoteIcon className="h-6 w-6 shrink-0 text-[#7c5cd6]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-navy-deep">法令・規制</span>
            <span className="block text-[10px] text-steel">用途地域・建築制限など</span>
          </span>
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-navy" />
        </button>
      </div>

      {result.contact && (
        <div className="mt-4">
          <ContactCard contact={result.contact} city={m.name} address={result.matchedAddress} />
        </div>
      )}
    </div>
  );
}

// ---- 筆の形から求める面積（地図の筆は数mずれることがあるので参考値） ----

/** 輪を四角（経緯度）で切り抜く（タイルののりしろで重なった部分を数えないため） */
function clipRing(ring: LngLat[], [w, s, e, n]: [number, number, number, number]): LngLat[] {
  const edges: ((p: LngLat) => boolean)[] = [([x]) => x >= w, ([x]) => x <= e, ([, y]) => y >= s, ([, y]) => y <= n];
  const cross = (a: LngLat, b: LngLat, i: number): LngLat => {
    const v = [w, e, s, n][i];
    if (i < 2) {
      const t = (v - a[0]) / (b[0] - a[0]);
      return [v, a[1] + (b[1] - a[1]) * t];
    }
    const t = (v - a[1]) / (b[1] - a[1]);
    return [a[0] + (b[0] - a[0]) * t, v];
  };
  let out = ring;
  edges.forEach((inside, i) => {
    const src = out;
    out = [];
    for (let k = 0; k < src.length; k++) {
      const cur = src[k];
      const prev = src[(k + src.length - 1) % src.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur, i));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur, i));
    }
  });
  return out;
}

function ringAreaM2(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const kx = 111_320 * Math.cos((ring[0][1] * Math.PI) / 180);
  const ky = 110_950;
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * kx * y2 * ky - x2 * kx * y1 * ky;
  }
  return Math.abs(s) / 2;
}

function parcelAreaM2(parcel: Parcel): number | undefined {
  let total = 0;
  for (const piece of parcel.pieces) {
    const bounds = tileBounds(piece.tile[0], piece.tile[1]);
    for (const poly of piece.polygons) poly.forEach((ring, i) => (total += (i === 0 ? 1 : -1) * ringAreaM2(clipRing(ring, bounds))));
  }
  return total > 0 ? total : undefined;
}
