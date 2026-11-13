"use client";

// 「周辺」タブ（すりガラスのシートの中。街の模型では、駅の方向に光の道を流し、種類ごとの最寄りの施設に色の印を立てる）：
// 最寄り駅と学区の行、種類ごとの最寄り（コンビニ・スーパー・公園・病院・ドラッグストア・飲食店）の6つの札、周辺環境の目安
// （距離から出した MICHILU の目安。根拠は押すと出る）。街の模型が出せない端末では、いちばん上に施設の印の平らな地図を出す
import { ChevronRight, Cross, ShoppingCart, SquareArrowOutUpRight, Store } from "lucide-react";
import type { ReactNode } from "react";
import { livingScores, totalScore } from "@/lib/app/scores";
import { POI_SOURCES, type PoiWalk } from "@/lib/roadmap/poi";
import { schoolGaps, schoolGapShort, schoolShort } from "@/lib/roadmap/school";
import { lineLabel } from "@/lib/roadmap/walk";
import { G, GCard, GNote, GRow, NUM, TILE } from "./g-ui";
import { AwardFill, CapFill, CutleryFill, PillIcon, TrainOutline, TreeFill } from "./icons";
import { PropertyMap } from "./property-map";
import { KIND_STYLE, metersText, wayMeters } from "./shared";
import { projector } from "./tile-map";
import type { TabProps } from "./types";
import { Stars } from "./ui";

const MAP_W = 365;
const MAP_H = 140;

/** 地図に出す印（駅・学区の小学校・種類ごとの最寄り） */
type Marker = { key: string; at: [number, number]; kind: number };

/** 印がぜんぶ入るいちばん細かいズーム（14〜17） */
function fitZoom(lat: number, lng: number, markers: Marker[]): number {
  for (let z = 17; z > 14; z--) {
    const project = projector(lat, lng, z, MAP_W, MAP_H);
    if (
      markers.every((m) => {
        const [x, y] = project(m.at);
        return x > 14 && x < MAP_W - 14 && y > 14 && y < MAP_H - 14;
      })
    )
      return z;
  }
  return 14;
}

/** 種類ごとの最寄り（色は街の模型の印と同じ。components/app/shared.tsx の KIND_STYLE） */
export const CATS: { kinds: number[]; title: string; icon: ReactNode }[] = [
  { kinds: [2], title: "コンビニ", icon: <Store size={14} strokeWidth={2} absoluteStrokeWidth color="#5ee0ae" /> },
  { kinds: [1], title: "スーパー", icon: <ShoppingCart size={14} strokeWidth={2.1} absoluteStrokeWidth color="#ffad6b" /> },
  { kinds: [6], title: "公園", icon: <TreeFill size={14} color="#5ee0ae" /> },
  { kinds: [4, 5], title: "病院", icon: <Cross size={14} strokeWidth={2} absoluteStrokeWidth color="#ff8f8c" /> },
  { kinds: [3], title: "ドラッグストア", icon: <PillIcon size={14} color="#a3adff" /> },
  { kinds: [13], title: "飲食店", icon: <CutleryFill size={14} color="#ffc56b" /> },
];

/** 「徒歩6分」（道のりが分からなければ直線距離） */
function walkText(w: { routed: boolean; minutes?: number; meters?: number; straight: number }): string {
  return w.routed && w.minutes !== undefined ? `徒歩${w.minutes}分` : `直線${metersText(w.straight)}`;
}

export function AroundTab({ result, data, open, expand, mapApps, has3d }: TabProps) {
  const { stations, schools, around } = data;
  const nearest = around.status === "ok" ? around.nearest : [];
  const st = stations.status === "ok" ? stations.stations : [];
  const e = schools.status === "ok" ? schools.schools.elementary : undefined;

  const scores = livingScores({
    stations: stations.status === "ok" ? stations.stations : undefined,
    pois: around.status === "ok" ? around.nearest : undefined,
    diningCount: around.status === "ok" ? around.dining : undefined,
    schools: schools.status === "ok" ? schools.schools : schools.status === "none" ? {} : undefined,
  });
  const total = totalScore(scores);
  const loading = around.status === "loading";
  const school = schoolRow(schools, result.municipality.codes[0], result.municipality.name);

  return (
    <div className="flex flex-col gap-[10px]">
      {!has3d && <FlatMap result={result} data={data} expand={expand} mapApps={mapApps} />}

      {/* 最寄り駅・学区 */}
      <GCard className="overflow-hidden">
        <GRow
          icon={<TrainOutline size={19} stroke={1.9} color="#a9d4ff" />}
          iconBg="rgba(116,187,255,0.14)"
          title={stations.status === "loading" ? "確認中…" : st[0] ? `${st[0].name}駅` : stations.status === "error" ? "駅を読み込めず" : "近くに駅がありません"}
          sub={st[0] ? st[0].lines.slice(0, 2).map((l) => lineLabel(l)).join("・") : "最寄り駅"}
          right={st[0] ? walkText(st[0]) : undefined}
          rightColor={st[0]?.routed ? G.gold : G.sub}
          minH={56}
          onClick={() => open("stations")}
        />
        <GRow
          icon={<CapFill size={19} color="#5ee0ae" />}
          iconBg="rgba(69,211,158,0.14)"
          title={school.title}
          sub={school.sub}
          right={e ? (e.walk ? `徒歩${e.walk.minutes}分` : e.distance !== undefined ? `直線${metersText(e.distance)}` : undefined) : undefined}
          rightColor={e?.walk ? G.gold : G.sub}
          minH={56}
          onClick={schools.status === "ok" || schools.status === "none" ? () => open("schools") : undefined}
        />
      </GCard>

      {/* 種類ごとの最寄り */}
      <div className="grid grid-cols-3 gap-[8px]">
        {CATS.map((c) => {
          const p = c.kinds.map((k) => nearest.find((w) => w.kind === k)).find(Boolean);
          const title = c.kinds.includes(4) && p?.kind === 5 ? "診療所" : c.title;
          const noData = c.kinds[0] === 13 && around.status === "ok" && around.dining === undefined;
          return <CatCell key={c.title} title={title} icon={c.icon} poi={p} loading={loading} noData={noData} onClick={p ? () => open("pois", c.kinds[0]) : undefined} />;
        })}
      </div>

      {/* 周辺環境の目安 */}
      <GCard onClick={() => open("scores")} className="flex items-center gap-[12px] px-[13px]" style={{ minHeight: 58 }}>
        <span className="flex shrink-0 items-center justify-center rounded-[12px]" style={{ width: 36, height: 36, background: "rgba(255,201,74,0.14)" }}>
          <AwardFill size={18} color={G.gold} />
        </span>
        <span className="min-w-0 flex-1 py-[9px]">
          <span className="block truncate leading-none" style={{ fontSize: 11.5, color: G.faint }}>
            周辺環境の目安（駅・お店・病院までの距離）
          </span>
          <span className="mt-[6px] flex items-center gap-[8px] leading-none">
            <b className="font-semibold" style={{ fontSize: 20, color: G.text, ...NUM }}>
              {total === null ? "―" : total.toFixed(1)}
            </b>
            <span style={{ fontSize: 12, color: G.faint }}>/5.0</span>
            <Stars value={total} size={15} gap={1} color="#ffd36b" />
          </span>
        </span>
        <span className="flex shrink-0 items-center font-semibold leading-none" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.8)" }}>
          根拠
          <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth />
        </span>
      </GCard>
      <GNote>
        施設：{POI_SOURCES}。駅・学区：国土数値情報（駅の出入口は © OpenStreetMap contributors）。徒歩は道路距離80mを1分とした、施設の位置・駅の出入口（分からない駅はホーム）までの目安です。今もあるかと実際の道のりは確かめてください。模型の印の色は、上の札と同じ種類です。
      </GNote>
    </div>
  );
}

/**
 * 学区の行の見出しと小さな字。小学校区が無い（利用条件で出せない市・国のデータに無い市・地点の区域が無い）ときは「学区なし」とは
 * 書かず、データが無いことと確かめる先を書く（押すと、わけと通学区域を探すリンクのシート）
 */
function schoolRow(schools: TabProps["data"]["schools"], muniCd: string, city: string): { title: string; sub: string } {
  const any = "学区（小学校・中学校）";
  if (schools.status === "loading") return { title: "確認中…", sub: any };
  if (schools.status === "error") return { title: "学区を読み込めず", sub: any };
  const s = schools.status === "ok" ? schools.schools : null;
  const e = s?.elementary;
  const j = s?.junior;
  if (e) return { title: schoolShort(e.name), sub: `小学校区・中学校区は${j ? schoolShort(j.name) : "データなし"}` };
  if (j) return { title: "小学校区はデータなし", sub: `中学校区は${schoolShort(j.name)}・小学校は教育委員会で確認` };
  const why = schoolGaps(muniCd, s).find((g) => g.key === "es")?.why ?? "outside";
  return { title: "学区のデータなし", sub: `${schoolGapShort(why, city)}・教育委員会で確認` };
}

/** 街の模型が出せない端末の、施設の印の平らな地図 */
function FlatMap({ result, data, expand, mapApps }: Pick<TabProps, "result" | "data" | "expand" | "mapApps">) {
  const st = data.stations.status === "ok" ? data.stations.stations : [];
  const e = data.schools.status === "ok" ? data.schools.schools.elementary : undefined;
  const nearest = data.around.status === "ok" ? data.around.nearest : [];
  const markers: Marker[] = [];
  for (const s of st) if (s.at && s.straight < 1500) markers.push({ key: `st${s.name}`, at: s.at, kind: 0 });
  if (e?.point && (e.distance ?? 9999) < 1500) markers.push({ key: "school", at: e.point, kind: -1 });
  for (const p of nearest) if (p.straight <= 800) markers.push({ key: `p${p.kind}`, at: p.at, kind: p.kind });
  // いちばん近い駅・コンビニ・スーパー・公園（600m 以内）が入るズーム。遠い印は地図の外になってよい
  const near = (m: Marker) => {
    const s = m.kind === 0 ? st.find((x) => x.at === m.at) : nearest.find((p) => p.kind === m.kind);
    return (s?.straight ?? 9999) <= 600;
  };
  const z = Math.max(16, fitZoom(result.lat, result.lng, markers.filter((m) => (m.key === `st${st[0]?.name}` || [1, 2, 6].includes(m.kind)) && near(m))));
  return (
    <div className="overflow-hidden rounded-[18px]" style={TILE}>
      <PropertyMap
        lat={result.lat}
        lng={result.lng}
        width={MAP_W}
        height={MAP_H}
        z={z}
        pinScale={0.9}
        onExpand={() => expand()}
        pill={{ icon: <SquareArrowOutUpRight size={15} strokeWidth={1.8} absoluteStrokeWidth color="#1c3a63" />, label: "地図アプリで開く", onClick: mapApps }}
      >
        {(project) =>
          markers.map((m) => {
            const [x, y] = project(m.at);
            const { Icon, color } = KIND_STYLE[m.kind];
            const d = m.kind === 0 ? 24 : 22;
            return (
              <span key={m.key} className="absolute flex items-center justify-center rounded-full border-[1.5px] border-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]" style={{ left: x - d / 2, top: y - d / 2, width: d, height: d, background: m.kind === 0 ? "#fff" : color }}>
                <Icon size={12} strokeWidth={2} absoluteStrokeWidth color={m.kind === 0 ? "#1d3264" : "#fff"} />
              </span>
            );
          })
        }
      </PropertyMap>
    </div>
  );
}

/**
 * 「セブン-イレブン 渋谷神南1丁目店」→「セブン-イレブン」（後ろの支店名だけ外す）。「中華 一番」のように
 * 空白のあとが支店名でない名前は、そのまま（名前の前半だけにすると、別の名前に見える）
 */
export function shortName(name: string): string {
  const m = name.match(/^(.+?)[ 　]+\S*(?:店|支店|営業所)$/);
  return m ? m[1] : name;
}

function CatCell({ title, icon, poi, loading, noData, onClick }: { title: string; icon: ReactNode; poi?: PoiWalk; loading: boolean; noData?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="flex items-center gap-[5px]" style={{ height: 14 }}>
        <span className="flex w-[16px] shrink-0 justify-center">{icon}</span>
        <span className="truncate leading-none" style={{ fontSize: 11, color: G.faint }}>
          {title}
        </span>
      </span>
      <span className="mt-[5px] block truncate font-semibold leading-[1.15]" style={{ fontSize: 13.5, color: poi ? G.text : G.faint }}>
        {/* 施設は OpenStreetMap にあるものだけ（載っていない店もある）ので、「無い」とは言い切らない */}
        {poi ? shortName(poi.name) : loading ? "確認中…" : noData ? "準備中" : "データになし"}
      </span>
      <span className="mt-[3px] block truncate leading-none" style={{ fontSize: 10.5, color: poi?.routed ? G.gold : G.faint, minHeight: 11 }}>
        {poi ? `${walkText(poi)}・${metersText(wayMeters(poi))}` : loading ? "" : "約1.2km以内"}
      </span>
    </>
  );
  const cls = "relative block min-w-0 overflow-hidden rounded-[16px] px-[10px] text-left";
  const style = { ...TILE, height: 62, paddingTop: 8, paddingBottom: 6 };
  return onClick ? (
    <button onClick={onClick} className={`${cls} press-soft w-full active:brightness-125`} style={style}>
      {body}
    </button>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}
