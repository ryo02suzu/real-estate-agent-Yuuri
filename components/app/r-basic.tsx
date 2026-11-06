"use client";

// 「概要」タブ（すりガラスのシートの中）：いちばん上に要注意点と次にやること（押すとその場で広がり、済んだ印を付けられる）、
// 物件の要点の6つの札（用途地域・地番・面積・現況・最寄り駅・小学校区）、土地の参考価格、隣の土地（街の模型に金色で出せる）、
// 調査の状況（6つの項目の札。押すと確認の記録）、地図のボタン。「レポートを作成」は下の操作バー（components/app/action-bar.tsx）。
// くわしい話は札を押して下から出る画面で（地番・建物・駅・学区）。都市計画・防火などは法令のタブで。
// 街の模型が出せない端末では、いちばん上に平らな地図を出す
import { Check, ChevronRight, Copy, Eye, EyeOff, ListChecks, Map as MapIcon, SquareArrowOutUpRight, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { parcelAreaM2 } from "@/lib/app/area";
import { ratioHint, refLandPoint } from "@/lib/app/ratio-hint";
import type { Triage } from "@/lib/app/triage";
import { usageShort } from "@/lib/roadmap/building";
import { bySide, sideText } from "@/lib/app/neighbor-plan";
import { chibanLabel, isLotChiban, kuikiLabelFrom, parcelMark, pickedChibanText, type Neighbor } from "@/lib/roadmap/parcel";
import { schoolGaps, schoolGapShort, schoolShort } from "@/lib/roadmap/school";
import { noCityPlanning } from "@/lib/roadmap/municipalities";
import { noneLabel, YOUTO_COLORS, youtoShort, zoningArea } from "@/lib/roadmap/zoning";
import { addressOffLot, pickKey, registryNeighbors } from "../parcel-card";
import { useCopy } from "../use-copy";
import { G, GCard, GCell, GFaint, GHead, GPill, NUM, TILE, TILE_GOLD, TILE_WARN } from "./g-ui";
import { CoinStack } from "./icons";
import { NeighborPlanSkeleton, NeighborPlanView } from "./neighbor-plan";
import { PropertyMap } from "./property-map";
import { displayAddress, manYen, pendingText, yen } from "./r-ui";
import { Expand, ResearchCard } from "./research";
import { metersText } from "./shared";
import { statusSummary } from "./status";
import type { TabProps } from "./types";

const TSUBO = 400 / 121;

export function BasicTab({ result, data, go, open, expand, mapApps, statuses, record, triage, checklist, has3d, neighbors, setNeighbors, pick, motion }: TabProps) {
  const { zoning, parcels, building, stations, schools, landPrice } = data;
  const parcel = parcels.status === "ok" ? parcels.parcel : undefined;
  const z = zoning.status === "ok" ? zoning.zoning : undefined;
  const zst = zoning.status === "ok" ? zoning.st : undefined;
  const y = z?.youto[0];
  // 番地まで見つからず町の中心を出しているときは、地点の筆・建物は物件と関係ないので出さない
  const townCenter = parcels.status === "none" && parcels.approximate;
  // 住所の地点の筆が、隣地のとても多い筆（地番の付いた公道など）なら、その面積は物件の土地のものではないので出さない
  const offLot = addressOffLot(parcels) === "large";
  const area = parcel && isLotChiban(parcel.chibanRaw) && !offLot ? parcelAreaM2(parcel) : undefined;
  // 公図から推定した筆・市の地番参考図の筆は、形から測った面積が地積と大きく違うことがあるので、10㎡単位の目安にする
  const roughArea = !!parcel && !!(parcel.estimated || parcel.sanko);
  const st = stations.status === "ok" ? stations.stations[0] : undefined;
  const school = schools.status === "ok" ? schools.schools.elementary : undefined;
  // 小学校区が無いわけ（利用条件で出せない市・国のデータに無い市・地点の区域が無い）
  const schoolWhy =
    !school && (schools.status === "ok" || schools.status === "none")
      ? schoolGaps(result.municipality.codes[0], schools.status === "ok" ? schools.schools : null).find((g) => g.key === "es")?.why
      : undefined;
  const hit = building.status === "ok" ? building.result.hit : undefined;
  // 建物が共同住宅（マンション）なら、筆の面積は敷地全体（部屋の面積ではない）
  const condo = !!hit && /共同住宅/.test(hit.building.usage ?? "");
  // 用途地域のデータに建ぺい率・容積率が無い市は、近くの同じ用途地域の地価公示などの値を参考に出す
  const hint = y && (!y.bcr || !y.far) && landPrice.status === "ok" ? ratioHint(y.name, landPrice.hits) : undefined;
  const bcr = y?.bcr ? `${y.bcr}%` : hint ? `${hint.bcr}%（参考）` : undefined;
  const far = y?.far ? `${y.far}%` : hint ? `${hint.far}%（参考）` : undefined;
  // 土地の参考価格：物件の用途地域に合う用途（住宅地・商業地など）の、いちばん近い地点
  const top = landPrice.status === "ok" ? refLandPoint(landPrice.hits, y?.name).top : undefined;
  // 筆の出どころ（地番で探した・地図で選んだ・住所の地点）
  const parcelSub = parcel
    ? `${parcels.status === "ok" && parcels.kind === "chiban" ? "地番で探した筆" : parcels.status === "ok" && parcels.kind === "picked" ? "地図で選んだ地点の筆" : offLot ? "住所の地点の筆（道路などの可能性）" : "住所の地点の筆（参考）"}${result.parcelOthers ? `・同じ地番がほかに${result.parcelOthers}件` : ""}`
    : undefined;

  return (
    <div className="flex flex-col gap-[10px]">
      {!has3d && (
        <div className="overflow-hidden rounded-[18px]" style={TILE}>
          <PropertyMap
            lat={result.lat}
            lng={result.lng}
            width={365}
            height={150}
            z={parcel ? 18 : 17}
            parcel={parcel}
            bubble={displayAddress(result.matchedAddress)}
            onExpand={() => expand()}
            pill={{ icon: <SquareArrowOutUpRight size={15} strokeWidth={1.8} absoluteStrokeWidth color="#1c3a63" />, label: "地図アプリで開く", onClick: mapApps }}
          />
        </div>
      )}

      <TriageCard triage={data.triage} checklist={checklist} onAll={triage} />

      <section>
        <GHead title="物件の要点" />
        <div className="grid grid-cols-2 gap-[8px]">
          <GCell
            label="用途地域"
            value={
              y ? (
                <ZoneChip name={y.name} code={y.code} />
              ) : z ? (
                // 「指定なし」「都市計画区域外」と言えるのは、その市のデータがあるときだけ（PC の行と同じ）
                z.senbiki === "市街化調整区域" ? "指定なし（調整区域）" : !z.tokei && !z.jyuntoshi ? zoningArea(z, zst, noCityPlanning(result.municipality)) : noneLabel(zst, "youto")
              ) : (
                <GFaint>{pendingText(zoning.status)}</GFaint>
              )
            }
            sub={bcr || far ? `建ぺい${bcr ?? "―"}・容積${far ?? "―"}` : z ? (z.senbiki ?? "都市計画で確認") : ""}
            onClick={() => go("law")}
          />
          <GCell
            label="地番"
            value={
              parcels.status === "loading" ? (
                <GFaint />
              ) : parcel ? (
                <span style={NUM}>
                  {chibanLabel(parcel.chibanRaw).replace(/^地番 /, "")}
                  {parcelMark(parcel) && <span style={{ color: G.warn }}>{parcelMark(parcel)}</span>}
                </span>
              ) : (
                <GFaint>{parcels.status === "error" ? "読み込めず" : townCenter ? "場所を直すと出ます" : "地図データなし"}</GFaint>
              )
            }
            sub={parcelSub ?? (parcels.status === "ok" ? "" : "謄本・公図はここから")}
            warn={offLot}
            onClick={() => open("parcel")}
          />
          <GCell
            label={condo ? "敷地全体の面積（図面上）" : "面積（図面上）"}
            value={parcels.status === "loading" ? <GFaint /> : area ? <span style={NUM}>約{areaLabel(area, roughArea)}㎡</span> : <GFaint>{parcels.status === "error" ? "読み込めず" : townCenter || offLot ? "場所を直すと出ます" : "登記で確認"}</GFaint>}
            sub={area ? (roughArea ? `公図の形からの目安・約${Math.round(area / TSUBO)}坪` : parcels.status === "ok" && parcels.kind === "address" ? `住所の地点の筆（参考）・約${(area / TSUBO).toFixed(1)}坪` : `約${(area / TSUBO).toFixed(1)}坪・公簿は登記で確認`) : ""}
            onClick={parcel ? () => open("parcel") : undefined}
          />
          <GCell
            label="現況（建物）"
            value={townCenter ? <GFaint>場所を直すと出ます</GFaint> : building.status === "loading" ? <GFaint /> : building.status === "none" ? <GFaint>データなし</GFaint> : building.status === "error" ? <GFaint>読み込めず</GFaint> : hit ? "建物あり" : "建物なし（データ上）"}
            sub={hit ? [usageShort(hit.building.usage) || "用途不明", hit.building.above ? `${hit.building.above}階` : "", hit.building.year ? `${hit.building.year}年` : ""].filter(Boolean).join("・") : building.status === "ok" ? "PLATEAU（国交省）のデータ" : ""}
            onClick={building.status !== "none" ? () => open("building") : undefined}
          />
          <GCell
            label="最寄り駅"
            value={stations.status === "loading" ? <GFaint /> : st ? `${st.name}駅` : <GFaint>{stations.status === "error" ? "読み込めず" : "近くに駅なし"}</GFaint>}
            sub={st ? (st.routed ? `徒歩${st.minutes}分・${metersText(st.meters)}` : `直線${metersText(st.straight)}`) : ""}
            onClick={() => open("stations")}
          />
          <GCell
            label="小学校区"
            value={schools.status === "loading" ? <GFaint /> : school ? schoolShort(school.name) : <GFaint>{schools.status === "error" ? "読み込めず" : "データなし"}</GFaint>}
            sub={school ? (school.walk ? `徒歩${school.walk.minutes}分` : school.owner ? `${school.owner}立` : "小学校区") : schoolWhy ? schoolGapShort(schoolWhy, result.municipality.name) : ""}
            onClick={schools.status === "ok" || schools.status === "none" ? () => open("schools") : undefined}
          />
        </div>
      </section>

      {/* 土地の参考価格（いちばん近い地価公示・地価調査の地点） */}
      <GCard onClick={() => go("price")} className="flex items-center gap-[12px] px-[13px]" style={{ minHeight: 58 }}>
        <span className="flex shrink-0 items-center justify-center rounded-[12px]" style={{ width: 36, height: 36, background: "rgba(255,201,74,0.14)" }}>
          <CoinStack size={20} color={G.gold} />
        </span>
        <span className="min-w-0 flex-1 py-[9px]">
          <span className="block truncate leading-none" style={{ fontSize: 11.5, color: G.faint }}>
            土地の参考価格（{top ? `${top.kind === "公示" ? "公示地価" : "基準地価"}・${top.usage}` : "公示地価"}）
          </span>
          {top ? (
            <span className="mt-[6px] block truncate leading-none" style={{ fontSize: 17, color: G.text, ...NUM }}>
              <b className="font-semibold">{yen(top.price)}</b>
              <span className="ml-[2px]" style={{ fontSize: 12, color: G.sub }}>
                円/㎡
              </span>
              <span className="ml-[8px]" style={{ fontSize: 12, color: G.faint }}>
                坪 約{manYen(top.price * TSUBO)}・{metersText(top.distance)}先
              </span>
            </span>
          ) : (
            <span className="mt-[6px] block leading-none" style={{ fontSize: 14, color: G.faint }}>
              {landPrice.status === "loading" ? "確認中…" : landPrice.status === "error" ? "読み込めませんでした" : "近くに地価の地点がありません"}
            </span>
          )}
        </span>
        <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color={G.chevron} className="shrink-0" />
      </GCard>

      <NeighborsCard data={data} open={open} has3d={has3d} neighbors={neighbors} setNeighbors={setNeighbors} pick={pick} motion={motion} />

      <ResearchCard statuses={statuses} summary={statusSummary(statuses)} onTopic={record} />

      <div className="flex gap-[8px]">
        <GPill onClick={() => expand()} icon={<MapIcon size={15} strokeWidth={1.8} absoluteStrokeWidth />} className="flex-1 justify-center">
          大きな地図で見る
        </GPill>
        <GPill onClick={mapApps} icon={<SquareArrowOutUpRight size={14} strokeWidth={1.8} absoluteStrokeWidth />} className="flex-1 justify-center">
          地図アプリで開く
        </GPill>
      </div>
    </div>
  );
}

/** 次にやることの優先の札 */
const PRIORITY: Record<1 | 2 | 3, { label: string; bg: string; fg: string }> = {
  1: { label: "必ず", bg: "#ffc27a", fg: "#2a1a04" },
  2: { label: "この物件", bg: "rgba(255,255,255,0.18)", fg: "#fff" },
  3: { label: "念のため", bg: "rgba(255,255,255,0.1)", fg: "rgba(255,255,255,0.8)" },
};

/**
 * 要注意点と次にやること：要注意・要確認の数と、いちばん上の注意。押すとその場で広がり、次にやること（4つまで）に済んだ印を付けられる
 * （印は「要注意点と次にやること」の画面と同じ。端末に保存）。全部は下の「すべて見る」から
 */
function TriageCard({ triage, checklist, onAll }: { triage: Triage; checklist: TabProps["checklist"]; onAll: () => void }) {
  const [open, setOpen] = useState(false);
  const warns = triage.issues.filter((i) => i.level === "warn");
  const checks = triage.issues.filter((i) => i.level === "check");
  const loading = triage.pending.length > 0 && !triage.issues.length;
  const titles = triage.issues
    .slice(0, 2)
    .map((i) => i.title)
    .join("・");
  const left = triage.actions.filter((a) => !checklist.done.has(a.id)).length;
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="press-soft flex w-full items-center gap-[11px] rounded-[18px] px-[13px] py-[11px] text-left" style={warns.length ? TILE_WARN : TILE}>
        <span className="flex shrink-0 items-center justify-center rounded-full" style={{ width: 38, height: 38, background: warns.length ? "rgba(255,183,94,0.18)" : "rgba(255,255,255,0.1)", border: `1px solid ${warns.length ? "rgba(255,196,120,0.5)" : "rgba(255,255,255,0.16)"}`, color: warns.length ? G.warn : "#fff" }}>
          <TriangleAlert size={18} strokeWidth={2} absoluteStrokeWidth />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate leading-[1.3]" style={{ fontSize: 15, color: G.text }}>
            {loading ? (
              <b className="font-semibold">確認中…</b>
            ) : (
              <>
                <b className="font-bold">{`要注意 ${warns.length}`}</b>
                <span style={{ color: G.sub }}>・要確認 {checks.length}</span>
              </>
            )}
          </span>
          <span className="mt-[2px] block truncate leading-[1.35]" style={{ fontSize: 12, color: G.sub }}>
            {loading ? `${triage.pending.join("・")}を読んでいます` : titles || "データで見つかった注意はありません"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-[2px] font-semibold" style={{ fontSize: 12, color: warns.length ? G.warn : "rgba(255,255,255,0.8)" }}>
          次にやること
          <ChevronRight size={15} strokeWidth={2.2} absoluteStrokeWidth className="transition-transform duration-300" style={{ transform: open ? "rotate(90deg)" : "none" }} />
        </span>
      </button>
      <Expand open={open}>
        <div>
          <ul className="flex flex-col gap-[6px] pt-[6px]">
            {triage.actions.slice(0, 4).map((a) => {
              const done = checklist.done.has(a.id);
              const p = PRIORITY[a.priority];
              return (
                <li key={a.id}>
                  <button onClick={() => checklist.toggle(a.id)} aria-pressed={done} className="press-soft flex w-full items-start gap-[10px] rounded-[14px] px-[12px] py-[10px] text-left" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span className="mt-[1px] flex shrink-0 items-center justify-center rounded-[6px] transition-colors duration-200" style={{ width: 20, height: 20, background: done ? "#45d39e" : "transparent", border: `1.5px solid ${done ? "#45d39e" : "rgba(255,255,255,0.45)"}` }}>
                      {done && <Check size={14} strokeWidth={3} absoluteStrokeWidth color="#08261a" className="pv-check" />}
                    </span>
                    <span className="min-w-0 flex-1 leading-[1.45]" style={{ fontSize: 13, color: done ? G.faint : G.text, textDecoration: done ? "line-through" : "none", textDecorationColor: "rgba(255,255,255,0.35)" }}>
                      <span className="mr-[6px] inline-block rounded-full px-[7px] py-[1px] align-[1px] font-semibold" style={{ fontSize: 10.5, background: p.bg, color: p.fg, textDecoration: "none" }}>
                        {p.label}
                      </span>
                      {a.title}
                      <span className="mt-[2px] block truncate" style={{ fontSize: 11, color: G.faint, textDecoration: "none" }}>
                        {a.where}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button onClick={onAll} className="press flex h-[42px] w-full items-center justify-center gap-[6px] rounded-[14px] font-semibold" style={{ fontSize: 13, color: "#fff", ...TILE }}>
                <ListChecks size={15} strokeWidth={1.9} absoluteStrokeWidth />
                すべての注意と次にやること{triage.actions.length ? `（残り${left}件）` : ""}
              </button>
            </li>
          </ul>
        </div>
      </Expand>
    </div>
  );
}

/**
 * 隣の土地（謄本・公図を取るときの隣地。地番のある筆）。北が上の配置図（components/app/neighbor-plan.tsx）に、物件の筆と隣の筆・道路を描き、
 * 札には方角を付けて北から時計回りに並べる。札か図の筆を押すと選び（もう一度押すと外す）、選んだ地番だけを「、」区切りでコピーできる
 * （地番の詳しい画面・街の模型・拡大した地図で選んだものと同じ）。押した筆は図と街の模型で光り、下の行に方角と接する長さを出す
 */
function NeighborsCard({ data, open, has3d, neighbors, setNeighbors, pick, motion }: Pick<TabProps, "data" | "open" | "has3d" | "neighbors" | "setNeighbors" | "pick"> & { motion: boolean }) {
  const copied = useCopy();
  const [focus, setFocus] = useState<string | null>(null);
  const info = data.parcels;
  // 住所の地点の筆が道路・水路や、隣地のとても多い筆（物件の土地ではなさそう）のときは出さない
  if (info.status !== "ok" || !isLotChiban(info.parcel.chibanRaw) || addressOffLot(info) !== undefined) return null;
  const plan = pick.plan;
  const sides = plan?.status === "ok" ? plan.sides : undefined;
  // 方角が分かれば北から時計回り（同じ方角は接する長さの長い順）
  const list = bySide(registryNeighbors(info).map((n) => ({ n, side: sides?.get(pickKey(n)) ?? null }))).map((x) => x.n);
  const roads = info.neighbors.filter((n) => !isLotChiban(n.chiban)).length;
  const base = info.parcel.kuiki;
  const chosen = new Set(pick.list.map(pickKey));
  const text = pickedChibanText(pick.list, base);
  const SHOW = 12;
  const tap = (n: Neighbor) => {
    pick.toggle(n);
    pick.flash?.(n);
    setFocus(pickKey(n));
  };
  const focused = focus ? list.find((n) => pickKey(n) === focus) : undefined;
  const focusSide = focused ? sides?.get(pickKey(focused)) : undefined;
  const roadSides = plan?.status === "ok" ? plan.roads : [];
  return (
    <div className="rounded-[18px] transition-[background,border-color] duration-300" style={neighbors ? TILE_GOLD : TILE}>
      <div className="flex items-center gap-[10px] px-[13px] pt-[11px]">
        <button onClick={() => open("parcel")} className="min-w-0 flex-1 text-left">
          <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 15, color: G.text }}>
            隣の土地 {list.length}筆{roads ? <span style={{ color: G.sub, fontWeight: 500 }}>・道路と水路 {roads}</span> : null}
          </span>
          <span className="mt-[2px] block truncate leading-[1.35]" style={{ fontSize: 11.5, color: G.faint }}>
            謄本・公図を取るときの隣地（地図データ）
          </span>
        </button>
        {has3d && list.length > 0 && (
          <button onClick={() => setNeighbors(!neighbors)} aria-pressed={neighbors} className="press flex h-[32px] shrink-0 items-center gap-[5px] rounded-full px-[11px] font-semibold leading-none" style={{ fontSize: 12, color: neighbors ? "#2a1a04" : "#fff", background: neighbors ? "#ffd36b" : "rgba(255,255,255,0.1)", border: `1px solid ${neighbors ? "#ffd36b" : "rgba(255,255,255,0.16)"}` }}>
            {neighbors ? <EyeOff size={13} strokeWidth={2} absoluteStrokeWidth /> : <Eye size={13} strokeWidth={2} absoluteStrokeWidth />}
            {neighbors ? "模型から外す" : "模型で見る"}
          </button>
        )}
      </div>
      {/* 配置図（北が上）。図の筆を押しても選べる */}
      {plan && plan.status !== "none" && list.length > 0 && (
        <div className="px-[13px] pt-[10px]">
          {plan.status === "ok" ? (
            <NeighborPlanView
              plan={plan}
              picked={chosen}
              flash={pick.flashed}
              motion={motion}
              onTap={(l) => {
                const n = list.find((x) => pickKey(x) === l.key);
                if (n) tap(n);
              }}
            />
          ) : (
            <NeighborPlanSkeleton />
          )}
          {/* 押した筆の方角と接する長さ（無ければ図の見方） */}
          <p className="mt-[7px] min-h-[17px] truncate leading-[1.4]" style={{ fontSize: 11.5, color: focusSide ? G.text : G.faint }}>
            {focused && focusSide ? (
              <>
                <b className="font-semibold" style={{ ...NUM, color: "#ffe2a3" }}>
                  {focused.kuiki === base ? focused.chiban : `${kuikiLabelFrom(focused.kuiki, base)} ${focused.chiban}`}
                </b>
                ：{sideText(focusSide)}
                <span style={{ color: G.faint }}>（地図データの目安）</span>
              </>
            ) : (
              "北が上。青が物件、金色が隣の筆。図か札を押すと選べます"
            )}
          </p>
          {roadSides.length > 0 && (
            <p className="truncate leading-[1.4]" style={{ fontSize: 11.5, color: G.sub }}>
              接する{roadSides.some((r) => r.kind === "road") ? (roadSides.some((r) => r.kind === "water") ? "道路・水路" : "道路") : "水路"}の筆：
              {roadSides.map((r) => `${r.side!.dir} ${r.kind === "water" && roadSides.some((x) => x.kind === "road") ? "水路 " : ""}${r.side!.length < 1.2 ? "角" : `約${r.side!.length < 10 ? r.side!.length.toFixed(1) : Math.round(r.side!.length)}m`}`).join("・")}
              <span style={{ color: G.faint }}>（地図データの目安）</span>
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-[6px] px-[13px] pb-[10px] pt-[10px]">
        {list.slice(0, SHOW).map((n) => {
          const on = chosen.has(pickKey(n));
          const side = sides?.get(pickKey(n));
          return (
            <button
              key={`${n.kuiki}|${n.chiban}`}
              onClick={() => tap(n)}
              aria-pressed={on}
              aria-label={`${side ? `${side.dir}側の` : ""}${n.chiban}${on ? "（選択中）" : ""}`}
              className="press flex items-center gap-[4px] rounded-full px-[9px] py-[3px] transition-colors duration-200"
              style={{ fontSize: 12.5, ...NUM, background: on ? "#ffd36b" : neighbors ? "rgba(255,201,74,0.16)" : "rgba(255,255,255,0.07)", border: `1px solid ${on ? "#ffd36b" : neighbors ? "rgba(255,201,74,0.45)" : "rgba(255,255,255,0.1)"}`, color: on ? "#2a1a04" : neighbors ? "#ffe2a3" : G.text, fontWeight: on ? 600 : 400 }}
            >
              {/* 選んでも札の幅が変わらない（並びが折り返し直さず、板の高さが変わらない）よう、印の場所はいつも取っておく */}
              <Check size={11} strokeWidth={3} absoluteStrokeWidth className={on ? "" : "opacity-0"} />
              {side && (
                <span className="font-medium" style={{ fontSize: 10.5, opacity: on ? 0.75 : 0.62 }}>
                  {side.dir}
                </span>
              )}
              {n.kuiki === base ? n.chiban : `${kuikiLabelFrom(n.kuiki, base)} ${n.chiban}`}
            </button>
          );
        })}
        {list.length > SHOW && (
          <button onClick={() => open("parcel")} className="px-[4px] py-[3px] underline-offset-2 active:underline" style={{ fontSize: 12, color: G.sub }}>
            ほか{list.length - SHOW}筆 ›
          </button>
        )}
        {!list.length && (
          <span style={{ fontSize: 12.5, color: G.faint }} className="py-[3px]">
            地番のある隣の筆は、地図データにありません
          </span>
        )}
      </div>
      {list.length > 0 && (
        <div className="flex items-center gap-[8px] border-t px-[13px] py-[9px]" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          {/* 選んだ数で1行・2行と変わって板の高さが動かないよう、2行分の高さを取っておく */}
          <p className="flex min-h-[2.8em] min-w-0 flex-1 items-center leading-[1.4]" style={{ fontSize: 11.5, color: text ? G.sub : G.faint }}>
            {text ? (
              <span className="line-clamp-2 break-all" style={{ color: G.text }}>
                {text}
              </span>
            ) : (
              "選んだ地番だけを「、」区切りでコピーできます"
            )}
          </p>
          {text ? (
            <>
              <button onClick={() => pick.set([])} className="press h-[32px] shrink-0 rounded-full px-[10px]" style={{ fontSize: 12, color: G.sub }}>
                外す
              </button>
              <button onClick={() => copied.copy(text)} className="press flex h-[32px] shrink-0 items-center gap-[5px] rounded-full px-[12px] font-semibold" style={{ fontSize: 12.5, color: "#2a1a04", background: "#ffd36b" }}>
                {copied.done ? <Check size={13} strokeWidth={2.4} absoluteStrokeWidth /> : <Copy size={13} strokeWidth={2} absoluteStrokeWidth />}
                {copied.done ? "コピーしました" : `${chosen.size}筆をコピー`}
              </button>
            </>
          ) : (
            <button onClick={() => pick.set([...pick.list, ...list.filter((n) => !chosen.has(pickKey(n)))])} className="press h-[32px] shrink-0 rounded-full px-[11px] font-semibold" style={{ fontSize: 12, color: "#fff", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.16)" }}>
              すべて選ぶ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 図面上の面積の数字（㎡）。登記所備付地図の筆は1㎡単位（地図の座標と面積の測り方の誤差より細かい桁は出さない）。
 * 公図から推定した筆・市の地番参考図の筆は10㎡単位の目安
 */
export function areaLabel(m2: number, rough: boolean): string {
  return (rough ? Math.round(m2 / 10) * 10 : Math.round(m2)).toLocaleString("ja-JP");
}

/** 用途地域の色の札（長い名前は短く。暗い地の上） */
export function ZoneChip({ name, code, size = 14 }: { name: string; code: number; size?: number }) {
  const n = name.normalize("NFKC");
  const label = n.length <= 8 ? n : youtoShort(n);
  const color = YOUTO_COLORS[code] ?? "#cccccc";
  return (
    <span className="inline-flex max-w-full items-center leading-none" style={{ fontSize: size, color: G.text }} title={n}>
      <span className="mr-[6px] inline-block shrink-0 rounded-[3px]" style={{ width: 9, height: 9, background: color, boxShadow: `0 0 0 2px ${color}40` }} />
      <span className="truncate font-semibold">{label}</span>
    </span>
  );
}
