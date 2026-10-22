"use client";

// 「もっと見る」などで下から出す詳しい画面。今までの詳しい部品（地番・用途地域・ハザード・地価・駅・学区・建物・問い合わせ先）を
// 紺の色で出し、新しい画面（施設の一覧・評価の根拠・建築時の注意点・道路の色の見方・避難場所・価格の事例）を足す。
// シートは拡大・縮小しない（ふつうの文字の大きさで読める）
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { buildingNotes } from "@/lib/app/legal";
import { livingScores, SCORE_METHOD } from "@/lib/app/scores";
import { chibanzuFor } from "@/lib/roadmap/chibanzu";
import { EVAC_CREDIT, EVAC_KINDS } from "@/lib/roadmap/evac";
import { asOfText, changeText, distanceText, kindText, landPriceRows, priceText, tsuboText } from "@/lib/roadmap/land-price";
import { POI_CREDIT, POI_KINDS, POI_ORDER, POI_SOURCES } from "@/lib/roadmap/poi";
import { ROAD_RADIUS_M } from "@/lib/roadmap/road-read";
import { BuildingDetail } from "../building-card";
import { ContactCard } from "../contact-card";
import { HazardDetail } from "../hazard-card";
import { LandPriceDetail } from "../land-price-card";
import { LegendList } from "../legend";
import { Notes } from "../notes";
import { ParcelDetail } from "../parcel-card";
import { SchoolDetail } from "../school-card";
import { Sheet } from "../sheet";
import { StationList } from "../station-card";
import { ZoningDetail } from "../zoning-card";
import { KIND_STYLE, metersText } from "./shared";
import type { MapOpen, SheetKind } from "./types";
import type { Ok, PropertyData } from "./use-property";

const TITLES: Record<SheetKind, string> = {
  parcel: "地番（謄本・公図の請求用）",
  zoning: "法令・規制の詳細",
  hazard: "災害リスクの根拠",
  landPrice: "近くの地価",
  stations: "最寄り駅",
  schools: "学区（小学校・中学校）",
  pois: "周辺の施設",
  scores: "周辺環境の評価の根拠",
  notes: "建築時の注意点",
  building: "建物（PLATEAU）",
  roads: "道路の種別",
  evac: "近くの指定緊急避難場所",
  contact: "問い合わせ先",
  deal: "価格の事例",
};

function Loading({ state }: { state: { status: string } }) {
  return <p className="py-2 text-[13px] text-muted">{state.status === "loading" ? "読み込んでいます…" : state.status === "error" ? "読み込めませんでした。時間をおいて調べ直してください。" : "この地点のデータはありません。"}</p>;
}

export function DetailSheet({ kind, arg, onClose, result, data, expand }: { kind: SheetKind | null; arg?: number; onClose: () => void; result: Ok; data: PropertyData; expand: (o?: MapOpen) => void }) {
  if (!kind) return null;
  const m = result.municipality;
  let body: ReactNode = null;
  switch (kind) {
    case "parcel": {
      const chibanzu = chibanzuFor(m, result.lat, result.lng);
      body =
        data.parcels.status === "ok" ? (
          <ParcelDetail info={data.parcels} chibanzu={chibanzu} />
        ) : (
          <>
            <Loading state={data.parcels} />
            {chibanzu && (
              <a href={chibanzu.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-[14px] font-semibold text-brand">
                <ExternalLink className="h-4 w-4" />
                {chibanzu.name}で地番を確認
              </a>
            )}
          </>
        );
      break;
    }
    case "zoning":
      body = data.zoning.status === "ok" ? <ZoningDetail state={data.zoning} city={m.name} tabs initial={arg ?? 0} /> : <Loading state={data.zoning} />;
      break;
    case "hazard":
      body =
        data.hazard.status === "ok" ? (
          <HazardDetail
            state={data.hazard}
            city={m.name}
            onShowMap={(k) => {
              onClose();
              expand({ hazard: k });
            }}
          />
        ) : (
          <Loading state={data.hazard} />
        );
      break;
    case "landPrice":
      body =
        data.landPrice.status === "ok" ? (
          <LandPriceDetail
            hits={data.landPrice.hits}
            rosenka={data.landPrice.rosenka}
            onShowMap={(p) => {
              onClose();
              expand({ landPrice: p });
            }}
          />
        ) : (
          <Loading state={data.landPrice} />
        );
      break;
    case "stations":
      body = data.stations.status === "ok" ? data.stations.stations.length ? <StationList stations={data.stations.stations} /> : <p className="py-2 text-[13px] text-muted">近くに駅がありません。</p> : <Loading state={data.stations} />;
      break;
    case "schools":
      body = data.schools.status === "ok" ? <SchoolDetail schools={data.schools.schools} /> : <Loading state={data.schools} />;
      break;
    case "building":
      body = data.building.status === "none" ? <Loading state={data.building} /> : <BuildingDetail state={data.building} />;
      break;
    case "contact":
      body = result.contact ? <ContactCard contact={result.contact} city={m.name} address={result.matchedAddress} /> : <p className="text-[13px] text-muted">問い合わせ先が登録されていません。</p>;
      break;
    case "pois":
      body = <PoiSheet data={data} first={arg} />;
      break;
    case "scores":
      body = <ScoreSheet data={data} />;
      break;
    case "notes":
      body = <NotesSheet data={data} />;
      break;
    case "roads":
      body = <RoadsSheet result={result} data={data} />;
      break;
    case "evac":
      body = <EvacSheet result={result} data={data} />;
      break;
    case "deal":
      body = <DealSheet data={data} index={arg ?? 0} expand={expand} onClose={onClose} />;
      break;
  }
  return (
    <div className="theme-navy">
      <Sheet title={TITLES[kind]} open onClose={onClose}>
        {body}
      </Sheet>
    </div>
  );
}

/** 周辺の施設：種類ごとに近い順（最寄りは徒歩の目安つき） */
function PoiSheet({ data, first }: { data: PropertyData; first?: number }) {
  const a = data.around;
  if (a.status !== "ok") return <Loading state={a} />;
  if (!a.all.length) return <p className="py-2 text-[13px] text-muted">歩いて行ける範囲（約1.2km）に、データにある施設がありません。</p>;
  const present = [...POI_ORDER, 13].filter((k) => a.all.some((p) => p.kind === k));
  // 押したカードの種類を先頭に
  const kinds = first !== undefined && present.includes(first) ? [first, ...present.filter((k) => k !== first)] : present;
  return (
    <div>
      <div className="space-y-3">
        {kinds.map((k) => {
          const { Icon, color } = KIND_STYLE[k];
          const near = a.nearest.find((w) => w.kind === k);
          const seen = new Set<string>();
          const items = a.all.filter((p) => p.kind === k && !seen.has(p.name) && seen.add(p.name)).slice(0, 5);
          return (
            <section key={k}>
              <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
                <Icon className="h-4 w-4" style={{ color }} />
                {POI_KINDS[k]}
                {k === 13 && a.dining !== undefined && <span className="text-[12px] font-normal text-muted">（半径500m以内に{a.dining}軒）</span>}
              </h3>
              <ul className="mt-1 divide-y divide-line/70">
                {items.map((p) => (
                  <li key={`${p.name}|${p.at.join()}`} className="flex items-baseline gap-2 py-1.5 text-[13.5px]">
                    <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                    <span className="shrink-0 text-[12.5px] font-semibold text-brand">{near && near.name === p.name && near.routed ? `徒歩約${near.minutes}分（${metersText(near.meters)}）` : `直線${metersText(p.straight)}`}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <Notes lead="施設の位置までの目安です。今もあるかと実際の道のりを確かめてください。" source={POI_SOURCES}>
        <p>最寄りの施設は道路をたどった徒歩の目安（道路距離80mを1分）、ほかは直線距離です。</p>
        <p>{POI_CREDIT}</p>
      </Notes>
    </div>
  );
}

/** 生活利便性の点の根拠と付け方 */
function ScoreSheet({ data }: { data: PropertyData }) {
  const { stations, around, schools } = data;
  const scores = livingScores({
    stations: stations.status === "ok" ? stations.stations : undefined,
    pois: around.status === "ok" ? around.nearest : undefined,
    diningCount: around.status === "ok" ? around.dining : undefined,
    schools: schools.status === "ok" ? schools.schools : schools.status === "none" ? {} : undefined,
  });
  return (
    <div>
      <p className="rounded-xl bg-mint px-3 py-2 text-[12.5px] leading-[1.6] text-ink">点は公的な評価ではなく、駅・お店・病院などまでの距離から MICHILU が出した目安です。お客様への説明では、根拠の施設と距離を伝えてください。</p>
      <dl className="mt-2 divide-y divide-line/70">
        {scores.map((s) => (
          <div key={s.key} className="py-2">
            <dt className="flex items-baseline justify-between text-[14px] font-bold text-ink">
              {s.label}
              <span className="text-[15px] text-brand">{s.value === null ? "―" : `${s.value.toFixed(1)} / 5.0`}</span>
            </dt>
            <dd className="mt-0.5 space-y-0.5 text-[12.5px] leading-[1.55] text-muted">
              {s.basis.map((b) => (
                <p key={b}>{b}</p>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <Notes lead="点の付け方" source={`駅：国土数値情報・施設：${POI_SOURCES}・学区：国土数値情報`}>
        <p>{SCORE_METHOD}</p>
      </Notes>
    </div>
  );
}

/** 建築時の注意点（全部） */
function NotesSheet({ data }: { data: PropertyData }) {
  const z = data.zoning;
  if (z.status !== "ok") return <Loading state={z} />;
  const notes = buildingNotes({
    zoning: z.zoning,
    morido: z.morido,
    hourei: z.hourei,
    tochi: z.tochi,
    roads: data.roads.status === "ok" ? data.roads.roads : undefined,
    buildingYear: data.building.status === "ok" ? data.building.result.hit?.building.year : undefined,
  });
  return (
    <div>
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.title} className={`rounded-xl px-3 py-2 ${n.warn ? "bg-[#fdf1ec]" : "bg-mint"}`}>
            <p className={`text-[14px] font-bold ${n.warn ? "text-[#a3361a]" : "text-ink"}`}>{n.title}</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.6] text-ink">{n.body}</p>
          </li>
        ))}
      </ul>
      <Notes lead="建築基準法・都市計画法などの一般的なルールの目安です。この土地に何を建てられるかは、役所・建築士で確認してください。">
        <p>日影規制の時間・測定面、高度地区の高さ、地区計画の内容などは、市区町村の条例・都市計画で決まります。角地の緩和や道路の後退（セットバック）、条例の制限も含みません。</p>
      </Notes>
    </div>
  );
}

/** 道路の種別：近くの道路と、市町村の地図の色の見方 */
function RoadsSheet({ result, data }: { result: Ok; data: PropertyData }) {
  const roads = data.roads;
  const legends = result.links.filter((l) => l.legend?.length);
  return (
    <div>
      {roads.status !== "none" && (
        <section>
          <h3 className="text-[14px] font-bold text-ink">物件のまわりの道路（地図データ）</h3>
          {roads.status === "ok" ? (
            roads.roads.length ? (
              <ul className="mt-1 divide-y divide-line/70">
                {roads.roads.map((r) => (
                  <li key={`${r.label}|${r.direction}|${r.distance}`} className="flex items-start gap-2 py-2">
                    <span className="mt-[6px] h-[6px] w-5 shrink-0 rounded-full border border-black/10" style={{ background: r.color ?? "#bbb" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold text-ink">{r.label}</span>
                      <span className="block text-[12px] text-muted">
                        {r.direction}側・約{Math.max(1, Math.round(r.distance))}m{r.width ? `・幅員 ${r.width}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-ink">物件から{ROAD_RADIUS_M}m以内に、地図で色の付いた道路はありません。</p>
            )
          ) : (
            <Loading state={roads} />
          )}
        </section>
      )}
      {legends.map((l) => (
        <section key={l.url} className="mt-3">
          <h3 className="text-[14px] font-bold text-ink">地図の色の見方：{l.label}</h3>
          <LegendList legend={l.legend!} />
        </section>
      ))}
      {roads.status === "none" && legends.length === 0 && <p className="text-[13px] text-muted">この市町村は、地図の道路の種別を MICHILU で読めません。法令・規制のタブの「道路種別」から市町村の地図を開いて確認してください。</p>}
      <Notes lead="地図に色の無い道は載っていません。前面道路と幅員は、地図と現地で確かめ、最終確認は窓口で行ってください。" />
    </div>
  );
}

/** 近くの指定緊急避難場所 */
function EvacSheet({ result, data }: { result: Ok; data: PropertyData }) {
  const e = data.evac;
  if (e.status !== "ok") return <Loading state={e} />;
  return (
    <div>
      {e.sites.length === 0 && <p className="text-[13px] text-muted">3km以内に、データにある指定緊急避難場所がありません。</p>}
      <ul className="divide-y divide-line/70">
        {e.sites.map((s) => (
          <li key={`${s.name}|${s.at.join()}`} className="py-2.5">
            <p className="text-[15px] font-bold text-ink">{s.name}</p>
            <p className="text-[13px] font-semibold text-brand">{s.walk ? `徒歩約${s.walk.minutes}分（道路距離${metersText(s.walk.meters)}）` : `直線${metersText(s.straight)}`}</p>
            {s.address && <p className="text-[12px] text-muted">{s.address}</p>}
            {s.kinds.length > 0 && <p className="mt-0.5 text-[12px] text-muted">対象の災害：{s.kinds.map((k) => EVAC_KINDS[k]).join("・")}</p>}
            <a href={`https://www.google.com/maps/dir/?api=1&origin=${result.lat},${result.lng}&destination=${s.at[1]},${s.at[0]}&travelmode=walking`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-brand underline">
              <ExternalLink className="h-3 w-3" />
              道順を地図アプリで見る
            </a>
          </li>
        ))}
      </ul>
      <Notes lead="指定緊急避難場所は、災害から命を守るために逃げる場所です（避難所とは違います）。">
        <p>指定は市区町村が見直します。最新の指定と、災害の種類ごとの場所は市区町村の防災のページで確認してください。市区町村によっては国のデータに入っていないことがあり、そのときは隣の市区町村の場所だけが出ます。</p>
        <p>{EVAC_CREDIT}</p>
      </Notes>
    </div>
  );
}

/** 価格の事例（地価公示・地価調査の地点）の詳しい行 */
function DealSheet({ data, index, expand, onClose }: { data: PropertyData; index: number; expand: (o?: MapOpen) => void; onClose: () => void }) {
  const lp = data.landPrice;
  if (lp.status !== "ok") return <Loading state={lp} />;
  const h = lp.hits[index];
  if (!h) return <LandPriceDetail hits={lp.hits} rosenka={lp.rosenka} />;
  const rows = landPriceRows(h);
  return (
    <div>
      <p className="text-[12.5px] text-muted">
        {kindText(h.kind)} {h.no}・{h.usage}・物件から{h.bearing}へ{distanceText(h.distance)}
      </p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-ink">
        <b className="text-[20px] font-semibold">{priceText(h.price)}</b>
        <span className="text-[13px] text-muted">{tsuboText(h.price)}</span>
        <span className="rounded bg-mint px-1.5 text-[12px]">前年比 {changeText(h.change)}</span>
      </p>
      <p className="text-[12px] text-muted">{asOfText(h)}</p>
      <dl className="mt-2 divide-y divide-line/70">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3 py-1.5">
            <dt className="w-[6.5em] shrink-0 text-[12px] leading-[1.6] text-muted">{r.label}</dt>
            <dd className="min-w-0 flex-1 text-[13.5px] leading-[1.55] text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      <button
        onClick={() => {
          onClose();
          expand({ landPrice: h.point });
        }}
        className="mt-2 rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-brand"
      >
        地図で場所を見る
      </button>
      <Notes lead="その地域の標準的な土地の価格（公的な価格）で、取引された価格ではありません。" source="国土数値情報（地価公示データ・都道府県地価調査データ）（国土交通省）" />
    </div>
  );
}
