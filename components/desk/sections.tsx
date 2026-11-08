"use client";

// PC のカルテの項目（概要・道路・法令・ハザード・周辺・相場・筆と隣地）。中身は今までの PC の部品（components/*-card.tsx の
// くわしいカード）と、スマホにあって PC に無かったもの（調査の状況・取引事例・国の地点データ・避難場所・隣地の配置図と選んでコピー・
// 道路の筆と接する所）を、同じ lib の決まり（lib/app/*・lib/roadmap/*）で出す。判定はしない（確認先と、データからの目安だけ）
import { ChevronRight, ClipboardList, ExternalLink, FileText, Map as MapIcon, Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DEAL_CHIP, dealFacts, dealWhen } from "@/lib/app/deal-view";
import { hazardTotal } from "@/lib/app/hazard-level";
import { refLandPoint } from "@/lib/app/ratio-hint";
import type { PropertyRecords, RecordTopic } from "@/lib/records";
import { DEALS_CREDIT, DEALS_DATA, DEALS_NOTE, dealKind, totalText, unitPrice, type DealRecord } from "@/lib/roadmap/deals";
import { HAZARD_MAP_LABELS, groupHazardMaps, wagamachiUrl, type HazardKind } from "@/lib/roadmap/hazard";
import { distanceText } from "@/lib/roadmap/land-price";
import { LIQ_CREDIT } from "@/lib/roadmap/liquefaction";
import { chibanzuFor } from "@/lib/roadmap/chibanzu";
import { rirekiLine } from "@/lib/roadmap/rireki";
import { roadShort } from "@/lib/roadmap/road-read";
import { youtoShort } from "@/lib/roadmap/zoning";
import { zouseiText } from "@/lib/roadmap/zousei";
import { BuildingCard } from "../building-card";
import { ContactCard } from "../contact-card";
import { COVERAGE, CoveragePill } from "../coverage";
import { HazardCard, HazardLine } from "../hazard-card";
import { LandPriceCard, LandPriceLine } from "../land-price-card";
import { NearbyRoadsBlock } from "../nearby-roads";
import { ParcelButton, ParcelCard, ParcelDetail, registryNeighbors, type ParcelPick } from "../parcel-card";
import { PoiCard } from "../poi-card";
import { MapButton } from "../result-view";
import { SchoolButton, SchoolCard } from "../school-card";
import { StationCard, StationLine } from "../station-card";
import { ZoningCard, ZoningLine } from "../zoning-card";
import type { NeighborPlan } from "../app/neighbor-plan";
import type { TopicStatus } from "../app/status";
import type { FrontRoad } from "../app/types";
import type { Ok, PropertyData } from "../app/use-property";

export type SectionKey = "basic" | "road" | "law" | "hazard" | "around" | "price" | "parcel";

/** カルテの項目の並び（頭の字・名前・読み上げの名前） */
export const SECTIONS: { key: SectionKey; ico: string; name: string; topic?: RecordTopic }[] = [
  { key: "basic", ico: "概", name: "概要" },
  { key: "road", ico: "道", name: "道路", topic: "road" },
  { key: "law", ico: "法", name: "法令", topic: "zoning" },
  { key: "hazard", ico: "災", name: "ハザード", topic: "hazard" },
  { key: "around", ico: "周", name: "周辺", topic: "around" },
  { key: "price", ico: "¥", name: "相場" },
  { key: "parcel", ico: "筆", name: "筆・隣地", topic: "parcel" },
];

/** 地図に重ねる種類（地図に切り替えて重ねる） */
export type MapLayer = "parcels" | "zoning" | "hazard" | "landPrice" | "places" | "roads";

export type SectionCtx = {
  result: Ok;
  data: PropertyData;
  statuses: TopicStatus[];
  records: PropertyRecords;
  pick: ParcelPick;
  plan: NeighborPlan;
  front: FrontRoad[] | null;
  /** 地図に切り替えて、その種類を重ねる（ハザードは種類、地価は見せる地点） */
  onMap: (layer?: MapLayer, arg?: HazardKind | [number, number]) => void;
  /** 別の項目を開く */
  go: (k: SectionKey) => void;
  openDocs: (kind: string) => void;
  openTriage: () => void;
  openDeals: () => void;
  openRecord: (t: RecordTopic) => void;
  /** 場所を直す（地図に切り替えて、ピンを動かす案内を出す） */
  onFix: () => void;
};

/** 項目の見出しの右の一言 */
export function sectionSummary(k: SectionKey, c: Pick<SectionCtx, "result" | "data" | "statuses">): string {
  const { result, data } = c;
  const m = result.municipality;
  switch (k) {
    case "basic":
      return data.triage.pending.length ? "確認中…" : data.triage.headline;
    case "road": {
      if (data.roads.status === "ok" && data.roads.roads[0]) {
        const r = data.roads.roads[0];
        return `${r.direction}側 ${roadShort(r.label)}${r.width ? `・幅員 ${r.width}` : ""}`;
      }
      return `${m.name}・${COVERAGE[m.coverage].short}`;
    }
    case "law": {
      if (data.zoning.status !== "ok") return data.zoning.status === "loading" ? "確認中…" : "読み込めず";
      const y = data.zoning.zoning.youto[0];
      if (!y) return data.zoning.zoning.senbiki ?? "用途地域の指定なし";
      return `${youtoShort(y.name)}${y.bcr && y.far ? ` ${y.bcr}/${y.far}` : ""}`;
    }
    case "hazard": {
      if (data.hazard.status !== "ok") return data.hazard.status === "loading" ? "確認中…" : data.hazard.status === "error" ? "読み込めず" : "国のデータなし";
      const t = hazardTotal(data.hazard.report);
      return t ? `目安：${t.level}` : "確認中…";
    }
    case "around": {
      const st = data.stations.status === "ok" ? data.stations.stations[0] : undefined;
      const es = data.schools.status === "ok" ? data.schools.schools.elementary : undefined;
      return [st ? `${st.name}駅${st.routed ? ` 徒歩${st.minutes}分` : ""}` : data.stations.status === "loading" ? "確認中…" : "", es?.name ?? ""].filter(Boolean).join("・") || "—";
    }
    case "price": {
      if (data.landPrice.status !== "ok") return data.landPrice.status === "loading" ? "確認中…" : "読み込めず";
      const y = data.zoning.status === "ok" ? data.zoning.zoning.youto[0]?.name : undefined;
      const top = refLandPoint(data.landPrice.hits, y).top;
      return top ? `${top.kind === "公示" ? "公示" : "調査"} ${(top.price / 10000).toFixed(1)}万円/㎡・${distanceText(top.distance)}` : "近くに地点なし";
    }
    case "parcel": {
      const p = data.parcels;
      if (p.status === "loading") return "確認中…";
      if (p.status !== "ok") return p.status === "error" ? "読み込めず" : "筆のデータなし";
      return `隣地 ${registryNeighbors(p).length}筆`;
    }
  }
}

/** 項目の中身 */
export function SectionBody({ k, ctx }: { k: SectionKey; ctx: SectionCtx }) {
  switch (k) {
    case "basic":
      return <Basic ctx={ctx} />;
    case "road":
      return <Road ctx={ctx} />;
    case "law":
      return <Law ctx={ctx} />;
    case "hazard":
      return <Hazard ctx={ctx} />;
    case "around":
      return <Around ctx={ctx} />;
    case "price":
      return <Price ctx={ctx} />;
    case "parcel":
      return <Parcel ctx={ctx} />;
  }
}

function Row({ children }: { children: ReactNode }) {
  return <div className="desk-btnrow">{children}</div>;
}

/** 状態の札の色 */
const TONE: Record<TopicStatus["status"], string> = { confirmed: "ok", partial: "info", auto: "gold", official: "gold", unconfirmed: "warn", failed: "warn", loading: "" };

function Basic({ ctx }: { ctx: SectionCtx }) {
  const { result, data, statuses } = ctx;
  const m = result.municipality;
  const chibanzu = chibanzuFor(m, result.lat, result.lng);
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <ZoningLine state={data.zoning} city={m.name} onOpen={() => ctx.go("law")} />
          <ParcelButton info={data.parcels} onOpen={() => ctx.go("parcel")} chibanzu={chibanzu} />
        </div>
        <div className="flex">
          <HazardLine state={data.hazard} city={m.name} onOpen={() => ctx.go("hazard")} />
        </div>
        {!(data.landPrice.status === "ok" && data.landPrice.hits.length === 0) && (
          <div className="flex">
            <LandPriceLine state={data.landPrice5} onOpen={() => ctx.go("price")} />
          </div>
        )}
        {!(data.stations.status === "ok" && data.stations.stations.length === 0) && (
          <div className="flex">
            <StationLine state={data.stations} onOpen={() => ctx.go("around")} />
          </div>
        )}
        {(data.schools.status === "ok" || data.schools.status === "loading") && (
          <div className="flex">
            <SchoolButton state={data.schools} onOpen={() => ctx.go("around")} />
          </div>
        )}
      </div>

      <p className="desk-subhead">調査の状況（押すと確認の記録）</p>
      <div className="flex flex-col gap-1.5">
        {statuses.map((s) => (
          <button key={s.topic} type="button" className="desk-stat w-full cursor-pointer text-left hover:border-[var(--gold)]" onClick={() => ctx.openRecord(s.topic)}>
            <span className={`chip st ${TONE[s.status]}`}>{s.chip}</span>
            <span className="v">
              <b className="font-semibold">{s.label}</b>：{s.value}
              <small>{s.hint}</small>
            </span>
          </button>
        ))}
      </div>
      <Row>
        <button type="button" className="btn small" onClick={ctx.openTriage}>
          <ClipboardList size={15} aria-hidden />
          要注意点と次にやること
        </button>
        <button type="button" className="btn small" onClick={ctx.onFix}>
          <MapIcon size={15} aria-hidden />
          場所を直す（地図で）
        </button>
        <a className="btn small" href={`https://maps.gsi.go.jp/#17/${result.lat.toFixed(6)}/${result.lng.toFixed(6)}/`} target="_blank" rel="noreferrer">
          地理院地図で開く
          <ExternalLink size={13} aria-hidden />
        </a>
      </Row>
    </>
  );
}

function Road({ ctx }: { ctx: SectionCtx }) {
  const { result, data, front, plan } = ctx;
  const m = result.municipality;
  const offline = m.coverage === "none" || m.coverage === "outside" || m.coverage === "unknown";
  const primary = result.links.filter((l) => !offline && l.kind !== "public_road");
  const others = result.links.filter((l) => offline || l.kind === "public_road");
  const roads = plan.status === "ok" ? plan.roads : [];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[13.5px]">{m.name}の道路種別</b>
        <CoveragePill coverage={m.coverage} />
      </div>
      {(m.note || m.coverage !== "full") && <p className="desk-small mt-1">{m.note ?? COVERAGE[m.coverage].long}</p>}
      {result.links.length > 0 && (
        <div className="paper mt-2 space-y-2">
          <p className="text-[12px] font-semibold">{offline ? "参考：公道（市道）かどうかの地図" : "道路種別の地図を開く（新しいタブ）"}</p>
          {primary.map((l) => (
            <MapButton key={l.url} link={l} primary desktop />
          ))}
          {others.map((l) => (
            <MapButton key={l.url} link={l} desktop />
          ))}
          <NearbyRoadsBlock state={data.roads} />
          {result.links.some((l) => l.pinpoint) && <p className="text-[11px] leading-[1.6] text-muted">利用規約に同意すると、物件の場所が地図の中央に出ます。</p>}
        </div>
      )}
      {data.roads.status === "ok" && (
        <Row>
          <button type="button" className="btn small" onClick={() => ctx.onMap("roads")}>
            <MapIcon size={15} aria-hidden />
            道路種別を地図に描く
          </button>
        </Row>
      )}
      {(front?.length || roads.length > 0) && (
        <>
          <p className="desk-subhead">土地に接する道（地図データの目安）</p>
          <dl className="desk-kv">
            {front?.map((f) => (
              <FrontRow key={`f:${f.direction}`} label={`${f.direction}側の道路`} value={f.width ? `幅の区分 ${f.width}（地理院の地図）` : "地理院の地図の道路"} />
            ))}
            {roads.map((r) => (
              <FrontRow key={r.key} label={`${r.side?.dir ?? ""}の${r.kind === "water" ? "水路" : "道路"}の筆`} value={r.side ? `接する長さ 約${r.side.length.toFixed(1)}m` : "接している"} />
            ))}
          </dl>
          <p className="desk-small">地番の無い道路・水路の筆と境界が接している長さと、地理院の地図の道路です。建築基準法の道路か・接道を満たすかは判断しません。種別と幅員は市の図・窓口・現地で確かめてください。</p>
        </>
      )}
      {result.contact && (
        <div className="mt-3">
          <ContactCard contact={result.contact} city={m.name} address={result.matchedAddress} />
        </div>
      )}
      <Row>
        <button type="button" className="btn small" onClick={() => ctx.openDocs("inquiry")}>
          <FileText size={15} aria-hidden />
          照会文を作る・送る
        </button>
        <button type="button" className="btn small" onClick={() => ctx.openRecord("road")}>
          <Pencil size={15} aria-hidden />
          確かめた幅員・種別を記録
        </button>
      </Row>
    </>
  );
}

function FrontRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function Law({ ctx }: { ctx: SectionCtx }) {
  const { result, data } = ctx;
  return (
    <>
      <div className="paper p-0">
        <ZoningCard state={data.zoning} city={result.municipality.name} />
      </div>
      <Row>
        <button type="button" className="btn small" onClick={() => ctx.onMap("zoning")}>
          <MapIcon size={15} aria-hidden />
          用途地域を地図に重ねる
        </button>
        <button type="button" className="btn small" onClick={() => ctx.openRecord("zoning")}>
          <Pencil size={15} aria-hidden />
          確かめた結果を記録
        </button>
      </Row>
    </>
  );
}

function Hazard({ ctx }: { ctx: SectionCtx }) {
  const { result, data } = ctx;
  const m = result.municipality;
  const h = data.hazard;
  const total = h.status === "ok" ? hazardTotal(h.report) : null;
  const groups = h.status === "ok" ? groupHazardMaps(h.maps) : [];
  const liq = data.liq.status === "ok" ? data.liq.value : null;
  const zousei = data.zousei.status === "ok" ? data.zousei.value : null;
  const rireki = data.rireki.status === "ok" ? data.rireki.value : [];
  const evac = data.evac.status === "ok" ? data.evac.sites : [];
  return (
    <>
      {total && (
        <p className="desk-stat mb-2">
          <span className={`chip st ${total.tone === "out" ? "ok" : total.tone === "caution" ? "gold" : "warn"}`}>{total.level}</span>
          <span className="v">
            総合の目安（MICHILU の目安）
            <small>{total.comment}</small>
          </span>
        </p>
      )}
      <div className="paper p-0">
        <HazardCard state={h} city={m.name} onShowMap={(k) => ctx.onMap("hazard", k)} />
      </div>
      <p className="desk-subhead">国の地点データ</p>
      <dl className="desk-kv">
        <dt>液状化の発生傾向</dt>
        <dd>{data.liq.status === "loading" ? "確認中…" : liq ? `${liq.label}（${liq.landform}）` : data.liq.status === "none" ? "データ準備中" : "データなし"}</dd>
        <dt>大規模盛土造成地</dt>
        <dd>{data.zousei.status === "loading" ? "確認中…" : zousei ? zouseiText(zousei) : data.zousei.status === "none" ? "データ準備中" : "—"}</dd>
        <dt>災害履歴</dt>
        <dd>{data.rireki.status === "loading" ? "確認中…" : rireki.length ? `${rireki.length}件（${rirekiLine(rireki[0])}）` : data.rireki.status === "ok" ? "近くの記録なし" : "—"}</dd>
        <dt>避難場所</dt>
        <dd>{data.evac.status === "loading" ? "確認中…" : evac[0] ? `${evac[0].name}（${evac[0].walk ? `徒歩${evac[0].walk.minutes}分` : `直線${Math.round(evac[0].straight)}m`}）` : "3km以内になし"}</dd>
      </dl>
      <p className="desk-small">{liq ? LIQ_CREDIT : "国土交通省 不動産情報ライブラリ・国土数値情報など（参考）。"}</p>
      <Row>
        {groups.map((g) => (
          <a key={g.url} className="btn small" href={g.url} target="_blank" rel="noreferrer">
            {m.name}：{g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}
            <ExternalLink size={13} aria-hidden />
          </a>
        ))}
        {h.status === "ok" && (
          <a className="btn small" href={wagamachiUrl(h.muniCd)} target="_blank" rel="noreferrer">
            わがまちハザードマップ
            <ExternalLink size={13} aria-hidden />
          </a>
        )}
        <button type="button" className="btn small" onClick={() => ctx.openRecord("hazard")}>
          <Pencil size={15} aria-hidden />
          確かめた結果を記録
        </button>
      </Row>
      <p className="desk-small">重要事項説明は{m.name}のハザードマップで確かめてください。国の重ねるハザードマップは参考です。</p>
    </>
  );
}

function Around({ ctx }: { ctx: SectionCtx }) {
  const { data } = ctx;
  const all = data.around.status === "ok" ? data.around.all : [];
  return (
    <>
      <div className="paper flex flex-col gap-2 p-0">
        <StationCard state={data.stations} />
        <SchoolCard state={data.schools} />
        <PoiCard state={data.pois} />
      </div>
      {data.around.status === "ok" && (
        <p className="desk-small">
          歩いて行ける範囲（約1.2km）の施設 {all.length}件{data.around.dining !== undefined && `・半径500m の飲食店 ${data.around.dining}件`}。
        </p>
      )}
      <Row>
        <button type="button" className="btn small" onClick={() => ctx.onMap("places")}>
          <MapIcon size={15} aria-hidden />
          駅・学校を地図に出す
        </button>
        <button type="button" className="btn small" onClick={() => ctx.openRecord("around")}>
          <Pencil size={15} aria-hidden />
          現地で見たことを記録
        </button>
      </Row>
    </>
  );
}

function Price({ ctx }: { ctx: SectionCtx }) {
  const { data } = ctx;
  return (
    <>
      <div className="paper p-0">
        <LandPriceCard state={data.landPrice5} onShowMap={(p) => ctx.onMap("landPrice", p)} />
      </div>
      <p className="desk-subhead">実際の取引事例（不動産情報ライブラリ）</p>
      <DealsBlock data={data} limit={4} />
      {data.deals.status === "ok" && (
        <Row>
          <button type="button" className="btn small" onClick={ctx.openDeals}>
            取引事例をすべて見る
            <ChevronRight size={15} aria-hidden />
          </button>
        </Row>
      )}
    </>
  );
}

function Parcel({ ctx }: { ctx: SectionCtx }) {
  const { result, data, pick } = ctx;
  const chibanzu = chibanzuFor(result.municipality, result.lat, result.lng);
  const p = data.parcels;
  return (
    <>
      {p.status === "ok" ? (
        <div className="paper">
          <ParcelDetail info={p} chibanzu={chibanzu} pick={pick} />
        </div>
      ) : (
        <div className="paper p-0">
          <ParcelCard info={p} chibanzu={chibanzu} />
        </div>
      )}
      <div className="paper mt-2 p-0">
        <BuildingCard state={data.building} />
      </div>
      <Row>
        <button type="button" className="btn small" onClick={() => ctx.openDocs("parcels")}>
          <FileText size={15} aria-hidden />
          謄本・公図用の地番の一覧
        </button>
        <button type="button" className="btn small" onClick={() => ctx.onMap("parcels")}>
          <MapIcon size={15} aria-hidden />
          筆・地番を地図に重ねる
        </button>
        <button type="button" className="btn small" onClick={() => ctx.openRecord("parcel")}>
          <Pencil size={15} aria-hidden />
          確かめた結果を記録
        </button>
      </Row>
    </>
  );
}

/** 実際の取引事例の表（同じ町の事例、無ければ市区町村全体の新しい事例） */
export function DealsBlock({ data, limit }: { data: PropertyData; limit?: number }) {
  const d = data.deals;
  const [scope, setScope] = useState<"town" | "city">("town");
  if (d.status === "none") return <p className="desk-small">{DEALS_DATA.url ? "この市区町村の事例は、不動産情報ライブラリのデータにありません。" : "取引事例のデータは準備中です。"}</p>;
  if (d.status !== "ok") return <p className="desk-small">{d.status === "loading" ? "取引事例を読んでいます…" : "取引事例を読み込めませんでした。"}</p>;
  const inTown = scope === "town" && d.town.length > 0;
  const base = inTown ? d.town : d.all;
  const rows = limit ? base.slice(0, limit) : base;
  return (
    <div>
      {d.town.length > 0 && (
        <div className="seg mb-2" role="group" aria-label="事例の範囲">
          <button type="button" aria-pressed={scope === "town"} onClick={() => setScope("town")}>
            同じ町（{d.town.length}件）
          </button>
          <button type="button" aria-pressed={scope === "city"} onClick={() => setScope("city")}>
            {d.city}全体（{d.all.length}件）
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="desk-small">事例がありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="desk-board text-[12.5px]">
            <thead>
              <tr>
                <th scope="col">時期</th>
                <th scope="col">種類</th>
                {/* 同じ町だけのときは町の列を出さない（カルテの幅に収める） */}
                {!inTown && <th scope="col">町</th>}
                <th scope="col">面積</th>
                <th scope="col">総額</th>
                <th scope="col">単価</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <DealRow key={`${r.pe}|${r.d}|${r.p}|${i}`} r={r} town={!inTown} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="desk-small">
        {DEALS_CREDIT}（{DEALS_DATA.periods}）。{DEALS_NOTE}。場所は町（地区）までです。
      </p>
    </div>
  );
}

function DealRow({ r, town }: { r: DealRecord; town: boolean }) {
  const u = unitPrice(r);
  return (
    <tr title={dealFacts(r).join("・")}>
      <td className="whitespace-nowrap">{dealWhen(r.pe)}</td>
      <td className="whitespace-nowrap">
        {DEAL_CHIP[dealKind(r.t)]}
        {r.k === "成約" && <span className="ml-1 text-[11px] text-[var(--muted)]">成約</span>}
      </td>
      {town && <td className="whitespace-nowrap">{r.d ?? "—"}</td>}
      <td className="num whitespace-nowrap">{r.a ? `${r.a}㎡` : (r.as ?? "—")}</td>
      <td className="num whitespace-nowrap">{totalText(r.p)}</td>
      <td className="num whitespace-nowrap">{u ? `${(u / 10000).toFixed(1)}万/㎡` : "—"}</td>
    </tr>
  );
}
