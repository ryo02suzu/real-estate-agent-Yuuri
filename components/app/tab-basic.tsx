"use client";

// 「基本情報」タブ（デザインの絵の1枚目）：地図と航空写真、物件の要点の表、土地の参考価格（公示地価・基準地価）、
// 周辺の地価の幅、周辺の施設、取引事例・法令の詳細への入口
import {
  Building,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Flame,
  Landmark,
  LandPlot,
  Map as MapIcon,
  MapPin,
  School,
  Settings,
  SquareArrowOutUpRight,
  TrainFront,
  Triangle,
} from "lucide-react";
import { useState } from "react";
import { areaText, parcelAreaM2 } from "@/lib/app/area";
import { ratioHint } from "@/lib/app/ratio-hint";
import { usageShort } from "@/lib/roadmap/building";
import { schoolShort } from "@/lib/roadmap/school";
import { chibanLabel, parcelMark } from "@/lib/roadmap/parcel";
import { YOUTO_COLORS, youtoShort } from "@/lib/roadmap/zoning";
import { CoinStack, GrowthChart } from "./icons";
import { MiniMap, PropertyMap } from "./property-map";
import { InfoRow, KIND_STYLE, metersText, Pending, walkLabel, wayMeters } from "./shared";
import { TileMap } from "./tile-map";
import type { TabProps } from "./types";
import { INK, More } from "./ui";

const ICON = { size: 8.2, strokeWidth: 1.1, absoluteStrokeWidth: true, color: "#5a6b81" } as const;
const TSUBO = 400 / 121;
const yen = (v: number) => v.toLocaleString("ja-JP");

export function BasicTab({ result, data, go, open, expand, mapApps }: TabProps) {
  const { zoning, parcels, building, stations, schools, around } = data;
  const parcel = parcels.status === "ok" ? parcels.parcel : undefined;
  const z = zoning.status === "ok" ? zoning.zoning : undefined;
  const y = z?.youto[0];
  const zPending = zoning.status === "loading" ? <Pending /> : <Pending>データなし</Pending>;
  const area = parcel && /^\d/.test(parcel.chibanRaw) ? parcelAreaM2(parcel) : undefined;
  const st = stations.status === "ok" ? stations.stations[0] : undefined;
  const school = schools.status === "ok" ? schools.schools.elementary : undefined;
  const hit = building.status === "ok" ? building.result.hit : undefined;
  // 用途地域のデータに建ぺい率・容積率が無い市は、近くの同じ用途地域の地価公示などの値を参考に出す
  const hint = y && (!y.bcr || !y.far) && data.landPrice.status === "ok" ? ratioHint(y.name, data.landPrice.hits) : undefined;

  return (
    <div className="mt-[8.5px] pl-[9.2px] pr-[8.3px]">
      <div className="flex gap-[7.8px]">
        {/* 左：地図・土地の参考価格・周辺の地価の幅 */}
        <div className="flex shrink-0 flex-col" style={{ width: 179.5 }}>
          <PropertyMap
            lat={result.lat}
            lng={result.lng}
            width={179.5}
            height={208}
            z={parcel ? 18 : 17}
            parcel={parcel}
            bubble={result.matchedAddress.replace(/^(東京都|.{2,3}県)/, "")}
            onExpand={() => expand()}
            pill={{ icon: <SquareArrowOutUpRight size={9.5} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" />, label: "地図アプリで開く", onClick: mapApps }}
          />
          <LandPriceMini data={data} onClick={() => go("price")} />
          <PriceRange data={data} onClick={() => go("deals")} />
        </div>

        {/* 右：航空写真・要点の表 */}
        <div className="min-w-0 flex-1">
          <Photos lat={result.lat} lng={result.lng} />
          <div className="mt-[6.3px] pl-[5.3px]">
            <InfoRow icon={<MapPin {...ICON} />} label="所在地">
              {result.matchedAddress}
              {result.approximate && <span className="text-[#8a4f3a]">（町の中心）</span>}
            </InfoRow>
            <InfoRow icon={<LandPlot {...ICON} />} label="地番" onClick={() => open("parcel")}>
              {parcels.status === "loading" ? (
                <Pending />
              ) : parcel ? (
                <>
                  {chibanLabel(parcel.chibanRaw).replace(/^地番 /, "")}
                  {parcelMark(parcel) && <span className="text-[#8a4f3a]">{parcelMark(parcel)}</span>}
                  {parcels.status === "ok" && parcels.kind === "address" && <span className="block text-[5.9px] text-[#6b7486]">住所の地点の筆（参考）</span>}
                </>
              ) : (
                <Pending>地図データなし</Pending>
              )}
            </InfoRow>
            <InfoRow icon={<MapIcon {...ICON} />} label="用途地域" onClick={() => go("law")}>
              {y ? <ZoneChip name={y.name} code={y.code} /> : z ? (z.senbiki === "市街化調整区域" ? "指定なし（調整区域）" : !z.tokei && !z.jyuntoshi ? "都市計画区域外" : "指定なし") : zPending}
            </InfoRow>
            <InfoRow icon={<Triangle {...ICON} />} label="建ぺい率" sub={!y?.bcr && hint ? "近くの同じ用途地域の地点の値" : undefined}>
              {y?.bcr ? <Num>{y.bcr}%</Num> : hint ? <Num>{hint.bcr}%（参考）</Num> : z ? <Pending>データなし</Pending> : zPending}
            </InfoRow>
            <InfoRow icon={<Settings {...ICON} />} label="容積率" sub={!y?.far && hint ? "市の窓口で確認してください" : undefined}>
              {y?.far ? <Num>{y.far}%</Num> : hint ? <Num>{hint.far}%（参考）</Num> : z ? <Pending>データなし</Pending> : zPending}
            </InfoRow>
            <InfoRow icon={<Building {...ICON} />} label="面積（図面上）" onClick={parcel ? () => open("parcel") : undefined}>
              {parcels.status === "loading" ? (
                <Pending />
              ) : area ? (
                <>
                  <Num>{areaText(area)}</Num>
                  {parcels.status === "ok" && parcels.kind === "address" && <span className="block text-[5.9px] text-[#6b7486]">住所の地点の筆（参考）・公簿は登記で確認</span>}
                </>
              ) : (
                <Pending>登記で確認</Pending>
              )}
            </InfoRow>
            <InfoRow icon={<Building2 {...ICON} />} label="現況（建物）" onClick={building.status !== "none" ? () => open("building") : undefined}>
              {building.status === "loading" ? (
                <Pending />
              ) : building.status === "none" ? (
                <Pending>データなし</Pending>
              ) : building.status === "error" ? (
                <Pending>読み込めず</Pending>
              ) : hit ? (
                <>
                  建物あり
                  <span className="text-[#6b7486]">（{[usageShort(hit.building.usage) || "用途不明", hit.building.above ? `${hit.building.above}階` : "", hit.building.year ? `${hit.building.year}年` : ""].filter(Boolean).join("・")}）</span>
                </>
              ) : (
                "建物なし（データ上）"
              )}
            </InfoRow>
            <InfoRow icon={<TrainFront {...ICON} />} label="最寄り駅" onClick={() => open("stations")}>
              {stations.status === "loading" ? <Pending /> : st ? `${st.name}駅 ${st.routed ? `徒歩${st.minutes}分` : metersText(st.straight)}` : <Pending>近くに駅なし</Pending>}
            </InfoRow>
            <InfoRow icon={<School {...ICON} />} label="小学校区" onClick={schools.status === "ok" ? () => open("schools") : undefined}>
              {schools.status === "loading" ? <Pending /> : school ? schoolShort(school.name) : <Pending>データなし</Pending>}
            </InfoRow>
            <InfoRow icon={<Landmark {...ICON} />} label="都市計画">
              {z ? (z.senbiki ?? (z.tokei ? "都市計画区域" : z.jyuntoshi ? "準都市計画区域" : "都市計画区域外")) : zPending}
            </InfoRow>
            <InfoRow icon={<Flame {...ICON} />} label="防火地域" line={false}>
              {z ? (z.bouka ?? (z.tokei || z.jyuntoshi ? "指定なし" : "―")) : zPending}
            </InfoRow>
          </div>
        </div>
      </div>

      {/* 周辺の施設 */}
      <div className="mt-[8px] flex items-center justify-between">
        <h3 className="font-bold leading-none" style={{ fontSize: 9.8, color: INK }}>
          周辺の施設
        </h3>
        <More onClick={() => go("around")} size={7.6} />
      </div>
      <Facilities data={data} />

      {/* 取引事例・法令の詳細 */}
      <div className="mt-[8.4px] grid grid-cols-2 gap-[7px]">
        <LinkCard icon={<GrowthChart size={20} color="#1a3263" />} title="周辺の取引事例" sub="近くの地価公示などの価格事例" onClick={() => go("deals")} />
        <LinkCard icon={<FileText size={21} strokeWidth={1.7} absoluteStrokeWidth color="#6d32f2" />} title="法令・規制の詳細" sub="用途地域・建築制限などを確認" onClick={() => go("law")} />
      </div>
      {around.status === "error" && <p className="mt-1 text-[6px] text-[#8a95a6]">周辺施設のデータを読み込めませんでした。</p>}
    </div>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 6.98 }}>{children}</span>;
}

/** 用途地域の色の札（長い名前は短く） */
export function ZoneChip({ name, code, size = 7.4 }: { name: string; code: number; size?: number }) {
  const n = name.normalize("NFKC");
  const label = n.length <= 6 ? n : youtoShort(n);
  const color = YOUTO_COLORS[code] ?? "#cccccc";
  return (
    <span className="inline-flex items-center rounded-[4px] px-[5px] py-[2.6px] font-medium leading-none" style={{ background: `${color}40`, color: "#3c2a4d", fontSize: size }} title={n}>
      <span className="mr-[3px] inline-block rounded-[1.5px]" style={{ width: 5, height: 5, background: color }} />
      {label}
    </span>
  );
}

/** 航空写真・地図（広め）・用途地域の3枚を切り替える（物件の写真の代わり） */
function Photos({ lat, lng }: { lat: number; lng: number }) {
  const [i, setI] = useState(0);
  const slides = [
    { label: "航空写真", el: <TileMap lat={lat} lng={lng} width={176.2} height={90.4} z={18} layer="photo" credit={false} /> },
    { label: "地図（広域）", el: <TileMap lat={lat} lng={lng} width={176.2} height={90.4} z={15} layer="std" credit={false} /> },
    { label: "用途地域", el: <TileMap lat={lat} lng={lng} width={176.2} height={90.4} z={16} zoning credit={false} /> },
  ];
  const s = slides[i];
  const step = (d: number) => setI((v) => (v + d + slides.length) % slides.length);
  return (
    <div className="relative overflow-hidden rounded-[8px] bg-[#e9eef4]" style={{ height: 90.4 }}>
      {s.el}
      {/* 物件の地点 */}
      <span className="pointer-events-none absolute rounded-full border-[1.5px] border-white bg-[#f0263a] shadow-[0_0_0_1px_rgba(0,0,0,0.2)]" style={{ left: 88.1 - 4, top: 45.2 - 4, width: 8, height: 8 }} />
      <span className="absolute left-[5px] top-[5px] rounded-full bg-black/45 px-[5px] py-[2.5px] leading-none text-white" style={{ fontSize: 5.6 }}>
        {s.label}
      </span>
      <button onClick={() => step(-1)} aria-label="前の写真" className="absolute flex items-center justify-center rounded-full bg-white/80" style={{ left: 5, top: 70.2, width: 15.3, height: 15.3 }}>
        <ChevronLeft size={9} strokeWidth={1.5} absoluteStrokeWidth color="#26344a" />
      </button>
      <button onClick={() => step(1)} aria-label="次の写真" className="absolute flex items-center justify-center rounded-full bg-white/80" style={{ left: 155.5, top: 70.2, width: 15.3, height: 15.3 }}>
        <ChevronRight size={9} strokeWidth={1.5} absoluteStrokeWidth color="#26344a" />
      </button>
      <span className="font-latin absolute leading-none text-white" style={{ left: 134, top: 74.5, fontSize: 7.6, letterSpacing: 1.15, textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}>
        {i + 1}/{slides.length}
      </span>
    </div>
  );
}

/** 土地の参考価格（いちばん近い地価公示・地価調査の地点） */
function LandPriceMini({ data, onClick }: { data: TabProps["data"]; onClick: () => void }) {
  const lp = data.landPrice;
  const top = lp.status === "ok" ? lp.hits[0] : undefined;
  return (
    <button onClick={onClick} className="relative ml-[0.5px] mt-[7px] rounded-[6px] bg-[#ebf4fd] text-left active:bg-[#e1edfb]" style={{ width: 179, height: 49.4 }}>
      <CoinStack size={19} color="#1c3a6a" style={{ position: "absolute", left: 9.1, top: 9.6 }} />
      <span className="absolute whitespace-nowrap font-medium leading-none" style={{ left: 39.3, top: 6.9, fontSize: 7.49, color: "#1a2333" }}>
        土地の参考価格<span style={{ color: "#6b7a8f", fontWeight: 400 }}>（{top ? (top.kind === "公示" ? "公示地価" : "基準地価") : "公示地価"}）</span>
      </span>
      {top ? (
        <>
          <span className="font-latin absolute whitespace-nowrap font-bold leading-none" style={{ left: 38.8, top: 18.4, fontSize: 14, color: "#0f1623" }}>
            {yen(top.price)}
            <span className="font-medium" style={{ fontSize: 9.6, marginLeft: 4, color: "#1a2232" }}>
              円/㎡
            </span>
          </span>
          <span className="absolute whitespace-nowrap leading-none" style={{ left: 39.3, top: 35.5, fontSize: 7, color: "#66758a" }}>
            (約{yen(Math.round(top.price * TSUBO))}円/坪)・{metersText(top.distance)}先
          </span>
        </>
      ) : (
        <span className="absolute leading-[1.4]" style={{ left: 39.3, top: 21, fontSize: 7, color: "#66758a" }}>
          {lp.status === "loading" ? "確認中…" : lp.status === "error" ? "読み込めませんでした" : "近くに地価の地点がありません"}
        </span>
      )}
      <ChevronRight size={10} strokeWidth={1.5} absoluteStrokeWidth color="#1c3460" style={{ position: "absolute", left: 160.8, top: 20.2 }} />
    </button>
  );
}

/** 周辺の地価の幅（近くの地点の安い〜高い。点はいちばん近い地点） */
function PriceRange({ data, onClick }: { data: TabProps["data"]; onClick: () => void }) {
  const lp = data.landPrice;
  // 用途（住宅地・商業地）が同じ、2km 以内の近い6地点
  const all = lp.status === "ok" ? lp.hits : [];
  const hits = all.filter((h) => h.usage === all[0]?.usage && h.distance <= 2000).slice(0, 6);
  const prices = hits.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pos = hits.length > 1 && max > min ? (hits[0].price - min) / (max - min) : 0.5;
  return (
    <button onClick={onClick} className="relative mt-[5.9px] rounded-[6px] bg-[#eef8f2] text-left active:bg-[#e3f3ea]" style={{ width: 179.5, height: 47.5 }}>
      <GrowthChart size={18} color="#12b076" style={{ position: "absolute", left: 10.3, top: 9.9 }} />
      <span className="absolute whitespace-nowrap font-medium leading-none" style={{ left: 40.3, top: 7.7, fontSize: 7.66, color: "#1a2333" }}>
        周辺の地価の幅{hits.length > 1 ? `（${hits[0].usage}・${hits.length}地点）` : ""}
      </span>
      {hits.length > 1 ? (
        <>
          <span className="font-latin absolute whitespace-nowrap font-semibold leading-none" style={{ left: 40.3, top: 21.1, fontSize: max >= 1e7 ? 8.4 : 9.89, color: INK }}>
            {yen(min)} 〜 {yen(max)}
            <span className="font-medium" style={{ fontSize: 8, marginLeft: 3 }}>
              円/㎡
            </span>
          </span>
          <span className="absolute rounded-full bg-[#d5eee2]" style={{ left: 39.8, top: 36.9, width: 130, height: 2.6 }} />
          <span className="absolute rounded-full bg-[#71d3ab]" style={{ left: 39.8, top: 36.9, width: Math.max(2.6, 130 * pos), height: 2.6 }} />
          <span className="absolute rounded-full bg-[#08a86f]" style={{ left: 39.8 + 130 * pos - 2.8, top: 35.2, width: 5.6, height: 5.6 }} />
        </>
      ) : (
        <span className="absolute leading-[1.4]" style={{ left: 40.3, top: 22, fontSize: 7, color: "#66758a" }}>
          {lp.status === "loading" ? "確認中…" : "比べる地点が近くにありません"}
        </span>
      )}
    </button>
  );
}

type Facility = { key: string; name: string; meters: number; walk: string; kind: number; at?: [number, number] };

/** 周辺の施設（駅・学区の小学校・コンビニ・スーパー・公園。無い種類はほかの施設で埋める） */
function Facilities({ data }: { data: TabProps["data"] }) {
  const { stations, schools, around } = data;
  const list: Facility[] = [];
  if (stations.status === "ok" && stations.stations[0]) {
    const s = stations.stations[0];
    list.push({ key: "st", name: `${s.name}駅`, meters: s.routed ? s.meters : s.straight, walk: walkLabel(s), kind: 0, at: s.at });
  }
  const e = schools.status === "ok" ? schools.schools.elementary : undefined;
  if (e && e.distance !== undefined) list.push({ key: "sc", name: schoolShort(e.name), meters: e.walk?.meters ?? e.distance, walk: e.walk ? `徒歩${e.walk.minutes}分` : "直線距離", kind: -1, at: e.point });
  const nearest = around.status === "ok" ? around.nearest : [];
  for (const k of [2, 1, 6, 3, 4, 9, 5, 7, 8, 13]) {
    if (list.length >= 5) break;
    const p = nearest.find((w) => w.kind === k);
    if (p) list.push({ key: `p${k}`, name: p.name, meters: wayMeters(p), walk: walkLabel(p), kind: k, at: p.at });
  }
  const loading = stations.status === "loading" || around.status === "loading";
  return (
    <div className="mt-[7.5px] grid grid-cols-5 gap-[6.6px]">
      {list.slice(0, 5).map((f) => {
        const { Icon, color } = KIND_STYLE[f.kind];
        return (
          <div key={f.key} className="relative overflow-hidden rounded-[7px] bg-white shadow-[0_1px_5px_rgba(20,45,85,0.11)]" style={{ height: 70 }}>
            {f.at ? <MiniMap at={f.at} width={70} height={37.5} color={color} /> : <div className="h-[37.5px] bg-[linear-gradient(160deg,#d5dde7_0%,#bcc7d4_100%)]" />}
            <span className="absolute flex items-center justify-center rounded-full bg-white" style={{ left: 4.4, top: 26.2, width: 22, height: 22 }}>
              <Icon size={12} strokeWidth={1.6} absoluteStrokeWidth color={color} />
            </span>
            <span className="absolute left-[7px] right-[4px] truncate font-bold leading-none" style={{ top: 46.1, fontSize: 6.6, color: INK }}>
              {f.name}
            </span>
            <span className="absolute left-[7.1px] font-medium leading-none" style={{ top: 58.4, fontSize: 6.38, color: f.walk === "直線距離" ? "#6a7891" : "#f0232d" }}>
              {f.walk}
            </span>
            <span className="font-latin absolute right-[5.5px] leading-none text-[#6a7891]" style={{ top: 58.6, fontSize: 6.22 }}>
              {metersText(f.meters).replace("約", "")}
            </span>
          </div>
        );
      })}
      {list.length < 5 &&
        Array.from({ length: 5 - list.length }, (_, i) => (
          <div key={`empty${i}`} className="flex items-center justify-center rounded-[7px] bg-[#f7f9fd] text-center leading-[1.4]" style={{ height: 70, fontSize: 6, color: "#8a95a6" }}>
            {loading ? "確認中…" : "データなし"}
          </div>
        ))}
    </div>
  );
}

function LinkCard({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center rounded-[8px] bg-[#f1f6fc] pl-[11.3px] pr-[8px] text-left active:bg-[#e6eefa]" style={{ height: 39.2 }}>
      <span className="flex w-[24px] shrink-0 justify-center">{icon}</span>
      <span className="ml-[8.5px] min-w-0 flex-1">
        <span className="block truncate font-bold leading-none" style={{ fontSize: 9.2, color: INK }}>
          {title}
        </span>
        <span className="mt-[4.5px] block truncate leading-none" style={{ fontSize: 7.05, color: "#5f6d84" }}>
          {sub}
        </span>
      </span>
      <ChevronRight size={10} strokeWidth={1.5} absoluteStrokeWidth color="#1a2f5a" className="shrink-0" />
    </button>
  );
}
