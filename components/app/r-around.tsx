"use client";

// 「周辺環境」タブ：施設の印の地図、最寄り駅と学区の行、種類ごとの最寄り（コンビニ・スーパー・公園・病院・ドラッグストア・飲食店）の
// 6つの札、周辺環境の目安（距離から出した MICHILU の目安。根拠は押すと出る）。1画面に収める
import { Cross, ShoppingCart, SquareArrowOutUpRight, Store } from "lucide-react";
import type { ReactNode } from "react";
import { livingScores, totalScore } from "@/lib/app/scores";
import type { PoiWalk } from "@/lib/roadmap/poi";
import { schoolShort } from "@/lib/roadmap/school";
import { lineLabel } from "@/lib/roadmap/walk";
import { AwardFill, CapFill, CutleryFill, PillIcon, TrainOutline, TreeFill } from "./icons";
import { PropertyMap } from "./property-map";
import { CARD, LIGHT, Note, RED, Row, TEXT, useLowScreen } from "./r-ui";
import { KIND_STYLE, metersText, wayMeters } from "./shared";
import { projector } from "./tile-map";
import type { TabProps } from "./types";
import { Stars } from "./ui";

const MAP_W = 361;
/** 地図の高さ（1画面に収めるため） */
const MAP_H = 116;

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

const CATS: { kinds: number[]; title: string; icon: ReactNode }[] = [
  { kinds: [2], title: "コンビニ", icon: <Store size={14} strokeWidth={2} absoluteStrokeWidth color="#ef4444" /> },
  { kinds: [1], title: "スーパー", icon: <ShoppingCart size={14} strokeWidth={2.1} absoluteStrokeWidth color="#f59a23" /> },
  { kinds: [6], title: "公園", icon: <TreeFill size={14} color="#1e9e55" /> },
  { kinds: [4, 5], title: "病院", icon: <Cross size={14} strokeWidth={2} absoluteStrokeWidth color="#e8423f" /> },
  { kinds: [3], title: "ドラッグストア", icon: <PillIcon size={14} color="#5b6df2" /> },
  { kinds: [13], title: "飲食店", icon: <CutleryFill size={14} color="#f59a23" /> },
];

/** 「徒歩6分」（道のりが分からなければ直線距離） */
function walkText(w: { routed: boolean; minutes?: number; meters?: number; straight: number }): string {
  return w.routed && w.minutes !== undefined ? `徒歩${w.minutes}分` : `直線${metersText(w.straight)}`;
}

export function AroundTab({ result, data, open, expand, mapApps }: TabProps) {
  const { stations, schools, around } = data;
  const low = useLowScreen();
  const nearest = around.status === "ok" ? around.nearest : [];
  const st = stations.status === "ok" ? stations.stations : [];
  const e = schools.status === "ok" ? schools.schools.elementary : undefined;
  const j = schools.status === "ok" ? schools.schools.junior : undefined;

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

  const scores = livingScores({
    stations: stations.status === "ok" ? stations.stations : undefined,
    pois: around.status === "ok" ? around.nearest : undefined,
    diningCount: around.status === "ok" ? around.dining : undefined,
    schools: schools.status === "ok" ? schools.schools : schools.status === "none" ? {} : undefined,
  });
  const total = totalScore(scores);
  const loading = around.status === "loading";

  return (
    <div>
      <div className={`overflow-hidden ${CARD}`}>
        <PropertyMap
          lat={result.lat}
          lng={result.lng}
          width={MAP_W}
          height={MAP_H - (low ? 14 : 0)}
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

      {/* 最寄り駅・学区 */}
      <div className={`mt-[8px] overflow-hidden ${CARD}`}>
        <Row
          icon={<TrainOutline size={19} stroke={1.9} color="#5b6df2" />}
          title={stations.status === "loading" ? "確認中…" : st[0] ? `${st[0].name}駅` : stations.status === "error" ? "駅を読み込めず" : "近くに駅がありません"}
          sub={st[0] ? st[0].lines.slice(0, 2).map((l) => lineLabel(l)).join("・") : "最寄り駅"}
          right={st[0] ? walkText(st[0]) : undefined}
          rightColor={st[0]?.routed ? RED : LIGHT}
          minH={52}
          onClick={() => open("stations")}
        />
        <Row
          icon={<CapFill size={19} color="#169b5d" />}
          title={schools.status === "loading" ? "確認中…" : e ? schoolShort(e.name) : schools.status === "none" ? "学区データなし" : schools.status === "error" ? "学区を読み込めず" : "学区なし"}
          sub={e ? `小学校区${j ? `・中学校区は${schoolShort(j.name)}` : ""}` : "学区（小学校・中学校）"}
          right={e ? (e.walk ? `徒歩${e.walk.minutes}分` : e.distance !== undefined ? `直線${metersText(e.distance)}` : undefined) : undefined}
          rightColor={e?.walk ? RED : LIGHT}
          minH={52}
          onClick={schools.status === "ok" ? () => open("schools") : undefined}
        />
      </div>

      {/* 種類ごとの最寄り */}
      <div className="mt-[8px] grid grid-cols-3 gap-[8px]">
        {CATS.map((c) => {
          const p = c.kinds.map((k) => nearest.find((w) => w.kind === k)).find(Boolean);
          const title = c.kinds.includes(4) && p?.kind === 5 ? "診療所" : c.title;
          const noData = c.kinds[0] === 13 && around.status === "ok" && around.dining === undefined;
          return <CatCell key={c.title} title={title} icon={c.icon} poi={p} loading={loading} noData={noData} onClick={p ? () => open("pois", c.kinds[0]) : undefined} />;
        })}
      </div>

      {/* 周辺環境の目安 */}
      <button onClick={() => open("scores")} className={`mt-[8px] flex w-full items-center gap-[12px] px-[14px] text-left active:bg-[#f5f8fc] ${CARD}`} style={{ height: 52 }}>
        <span className="flex shrink-0 items-center justify-center rounded-full bg-[#d8e7f8]" style={{ width: 36, height: 36 }}>
          <AwardFill size={18} color="#1f6fe0" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate leading-none" style={{ fontSize: 12, color: LIGHT }}>
            周辺環境の目安（駅・お店・病院までの距離）
          </span>
          <span className="mt-[5px] flex items-center gap-[8px] leading-none">
            <b className="font-bold" style={{ fontSize: 19, color: TEXT }}>
              {total === null ? "―" : total.toFixed(1)}
            </b>
            <span style={{ fontSize: 12, color: LIGHT }}>/5.0</span>
            <Stars value={total} size={15} gap={1} color="#13284e" />
          </span>
        </span>
        <span className="shrink-0 font-semibold leading-none" style={{ fontSize: 13, color: "#1f5fbf" }}>
          根拠
        </span>
      </button>
      <Note className="mt-[8px]">施設：© OpenStreetMap contributors（ODbL）。駅・学区・病院：国土数値情報。徒歩は道路距離80mを1分とした目安です。</Note>
    </div>
  );
}

/** 「セブン-イレブン 渋谷神南1丁目店」→ 名前（支店名は外す） */
function shortName(name: string): string {
  const m = name.match(/^(.+)[ 　](.+)$/);
  return m ? m[1] : name;
}

function CatCell({ title, icon, poi, loading, noData, onClick }: { title: string; icon: ReactNode; poi?: PoiWalk; loading: boolean; noData?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="flex items-center gap-[5px]" style={{ height: 14 }}>
        <span className="flex w-[16px] shrink-0 justify-center">{icon}</span>
        <span className="truncate leading-none" style={{ fontSize: 11.5, color: LIGHT }}>
          {title}
        </span>
      </span>
      <span className="mt-[3px] block truncate font-semibold leading-[1.15]" style={{ fontSize: 14, color: poi ? TEXT : LIGHT }}>
        {poi ? shortName(poi.name) : loading ? "確認中…" : noData ? "準備中" : "近くになし"}
      </span>
      <span className="mt-[2px] block truncate leading-none" style={{ fontSize: 10.5, color: poi?.routed ? RED : LIGHT, minHeight: 11 }}>
        {poi ? `${walkText(poi)}・${metersText(wayMeters(poi))}` : loading ? "" : "約1.2km以内"}
      </span>
    </>
  );
  const cls = "relative block min-w-0 overflow-hidden rounded-[14px] bg-white px-[10px] text-left shadow-[0_2px_8px_rgba(20,45,85,0.06)]";
  const style = { height: 57, paddingTop: 6, paddingBottom: 5 };
  return onClick ? (
    <button onClick={onClick} className={`${cls} w-full active:bg-[#f5f8fc]`} style={style}>
      {body}
    </button>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}
