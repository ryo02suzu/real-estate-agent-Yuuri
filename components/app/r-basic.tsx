"use client";

// 「基本情報」タブ：いちばん上に調査の状況（6つの項目の札。押すと確認の記録）、地図、物件の要点の6つの札（用途地域・地番・面積・現況・
// 最寄り駅・小学校区）、土地の参考価格。「レポートを作成」は下部操作バー（components/app/action-bar.tsx）。
// くわしい話は札を押して下から出る画面で（地番・建物・駅・学区）。都市計画・防火などは法令・規制のタブで
import { ChevronRight, SquareArrowOutUpRight } from "lucide-react";
import { parcelAreaM2 } from "@/lib/app/area";
import { ratioHint } from "@/lib/app/ratio-hint";
import { usageShort } from "@/lib/roadmap/building";
import { chibanLabel, parcelMark } from "@/lib/roadmap/parcel";
import { schoolShort } from "@/lib/roadmap/school";
import { YOUTO_COLORS, youtoShort } from "@/lib/roadmap/zoning";
import { addressOffLot } from "../parcel-card";
import { CoinStack } from "./icons";
import { PropertyMap } from "./property-map";
import { CARD, Cell, displayAddress, Faint, LIGHT, manYen, pendingText, TEXT, yen, useLowScreen } from "./r-ui";
import { ResearchCard } from "./research";
import { metersText } from "./shared";
import { statusSummary } from "./status";
import type { TabProps } from "./types";

const TSUBO = 400 / 121;
/** 地図の高さ（1画面に収めるため） */
const MAP_H = 128;

export function BasicTab({ result, data, go, open, expand, mapApps, statuses, record }: TabProps) {
  const { zoning, parcels, building, stations, schools, landPrice } = data;
  const low = useLowScreen();
  const parcel = parcels.status === "ok" ? parcels.parcel : undefined;
  const z = zoning.status === "ok" ? zoning.zoning : undefined;
  const y = z?.youto[0];
  // 番地まで見つからず町の中心を出しているときは、地点の筆・建物は物件と関係ないので出さない
  const townCenter = parcels.status === "none" && parcels.approximate;
  // 住所の地点の筆が、隣地のとても多い筆（地番の付いた公道など）なら、その面積は物件の土地のものではないので出さない
  const offLot = addressOffLot(parcels) === "large";
  const area = parcel && /^\d/.test(parcel.chibanRaw) && !offLot ? parcelAreaM2(parcel) : undefined;
  const st = stations.status === "ok" ? stations.stations[0] : undefined;
  const school = schools.status === "ok" ? schools.schools.elementary : undefined;
  const hit = building.status === "ok" ? building.result.hit : undefined;
  // 用途地域のデータに建ぺい率・容積率が無い市は、近くの同じ用途地域の地価公示などの値を参考に出す
  const hint = y && (!y.bcr || !y.far) && landPrice.status === "ok" ? ratioHint(y.name, landPrice.hits) : undefined;
  const bcr = y?.bcr ? `${y.bcr}%` : hint ? `${hint.bcr}%（参考）` : undefined;
  const far = y?.far ? `${y.far}%` : hint ? `${hint.far}%（参考）` : undefined;
  const top = landPrice.status === "ok" ? landPrice.hits[0] : undefined;
  // 筆の出どころ（地番で探した・地図で選んだ・住所の地点）
  const parcelSub = parcel
    ? `${parcels.status === "ok" && parcels.kind === "chiban" ? "地番で探した筆" : parcels.status === "ok" && parcels.kind === "picked" ? "地図で選んだ地点の筆" : offLot ? "住所の地点の筆（道路などの可能性）" : "住所の地点の筆（参考）"}${result.parcelOthers ? `・同じ地番がほかに${result.parcelOthers}件` : ""}`
    : undefined;

  return (
    <div>
      {/* 調査の状況（押すと、その項目の確認を記録） */}
      <ResearchCard statuses={statuses} summary={statusSummary(statuses)} onTopic={record} />

      <div className={`mt-[8px] overflow-hidden ${CARD}`}>
        <PropertyMap
          lat={result.lat}
          lng={result.lng}
          width={361}
          height={MAP_H - (low ? 14 : 0)}
          z={parcel ? 18 : 17}
          parcel={parcel}
          bubble={displayAddress(result.matchedAddress)}
          onExpand={() => expand()}
          pill={{ icon: <SquareArrowOutUpRight size={15} strokeWidth={1.8} absoluteStrokeWidth color="#1c3a63" />, label: "地図アプリで開く", onClick: mapApps }}
        />
      </div>

      <div className="mt-[8px] grid grid-cols-2 gap-[8px]">
        <Cell
          label="用途地域"
          value={y ? <ZoneChip name={y.name} code={y.code} /> : z ? (z.senbiki === "市街化調整区域" ? "指定なし（調整区域）" : !z.tokei && !z.jyuntoshi ? "都市計画区域外" : "指定なし") : <Faint>{pendingText(zoning.status)}</Faint>}
          sub={bcr || far ? `建ぺい${bcr ?? "―"}・容積${far ?? "―"}` : z ? (z.senbiki ?? "都市計画で確認") : ""}
          onClick={() => go("law")}
        />
        <Cell
          label="地番"
          value={
            parcels.status === "loading" ? (
              <Faint />
            ) : parcel ? (
              <>
                {chibanLabel(parcel.chibanRaw).replace(/^地番 /, "")}
                {parcelMark(parcel) && <span style={{ color: "#8a4f3a" }}>{parcelMark(parcel)}</span>}
              </>
            ) : (
              <Faint>{parcels.status === "error" ? "読み込めず" : townCenter ? "場所を直すと出ます" : "地図データなし"}</Faint>
            )
          }
          sub={parcelSub ?? (parcels.status === "ok" ? "" : "謄本・公図はここから")}
          warn={offLot}
          onClick={() => open("parcel")}
        />
        <Cell
          label="面積（図面上）"
          value={parcels.status === "loading" ? <Faint /> : area ? `約${area.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}㎡` : <Faint>{parcels.status === "error" ? "読み込めず" : townCenter || offLot ? "場所を直すと出ます" : "登記で確認"}</Faint>}
          sub={area ? `約${(area / TSUBO).toFixed(1)}坪・公簿は登記で確認` : ""}
          onClick={parcel ? () => open("parcel") : undefined}
        />
        <Cell
          label="現況（建物）"
          value={townCenter ? <Faint>場所を直すと出ます</Faint> : building.status === "loading" ? <Faint /> : building.status === "none" ? <Faint>データなし</Faint> : building.status === "error" ? <Faint>読み込めず</Faint> : hit ? "建物あり" : "建物なし（データ上）"}
          sub={hit ? [usageShort(hit.building.usage) || "用途不明", hit.building.above ? `${hit.building.above}階` : "", hit.building.year ? `${hit.building.year}年` : ""].filter(Boolean).join("・") : building.status === "ok" ? "PLATEAU（国交省）のデータ" : ""}
          onClick={building.status !== "none" ? () => open("building") : undefined}
        />
        <Cell
          label="最寄り駅"
          value={stations.status === "loading" ? <Faint /> : st ? `${st.name}駅` : <Faint>{stations.status === "error" ? "読み込めず" : "近くに駅なし"}</Faint>}
          sub={st ? (st.routed ? `徒歩${st.minutes}分・${metersText(st.meters)}` : `直線${metersText(st.straight)}`) : ""}
          onClick={() => open("stations")}
        />
        <Cell
          label="小学校区"
          value={schools.status === "loading" ? <Faint /> : school ? schoolShort(school.name) : <Faint>{schools.status === "error" ? "読み込めず" : "データなし"}</Faint>}
          sub={school ? (school.walk ? `徒歩${school.walk.minutes}分` : school.owner ? `${school.owner}立` : "小学校区") : ""}
          onClick={schools.status === "ok" ? () => open("schools") : undefined}
        />
      </div>

      {/* 土地の参考価格（いちばん近い地価公示・地価調査の地点） */}
      <button onClick={() => go("price")} className={`mt-[8px] flex w-full items-center gap-[12px] px-[14px] text-left active:bg-[#f5f8fc] ${CARD}`} style={{ height: 52 }}>
        <span className="flex shrink-0 items-center justify-center rounded-full bg-[#ebf4fd]" style={{ width: 36, height: 36 }}>
          <CoinStack size={20} color="#1c3a6a" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate leading-none" style={{ fontSize: 12, color: LIGHT }}>
            土地の参考価格（{top ? (top.kind === "公示" ? "公示地価" : "基準地価") : "公示地価"}）
          </span>
          {top ? (
            <span className="mt-[5px] block truncate leading-none" style={{ fontSize: 17, color: TEXT }}>
              <b className="font-bold">{yen(top.price)}</b>
              <span className="ml-[2px]" style={{ fontSize: 12 }}>
                円/㎡
              </span>
              <span className="ml-[8px]" style={{ fontSize: 12, color: LIGHT }}>
                坪 約{manYen(top.price * TSUBO)}・{metersText(top.distance)}先
              </span>
            </span>
          ) : (
            <span className="mt-[5px] block leading-none" style={{ fontSize: 14, color: LIGHT }}>
              {landPrice.status === "loading" ? "確認中…" : landPrice.status === "error" ? "読み込めませんでした" : "近くに地価の地点がありません"}
            </span>
          )}
        </span>
        <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />
      </button>
    </div>
  );
}

/** 用途地域の色の札（長い名前は短く） */
export function ZoneChip({ name, code, size = 14 }: { name: string; code: number; size?: number }) {
  const n = name.normalize("NFKC");
  const label = n.length <= 8 ? n : youtoShort(n);
  const color = YOUTO_COLORS[code] ?? "#cccccc";
  return (
    <span className="inline-flex max-w-full items-center rounded-[6px] px-[7px] py-[4px] font-semibold leading-none" style={{ background: `${color}40`, color: "#3c2a4d", fontSize: size }} title={n}>
      <span className="mr-[5px] inline-block shrink-0 rounded-[2px]" style={{ width: 8, height: 8, background: color }} />
      <span className="truncate">{label}</span>
    </span>
  );
}
