"use client";

// 「周辺環境」タブ（デザインの絵の2枚目）：施設の印の地図、最寄り駅、学区の小学校、施設の種類ごとの最寄り（コンビニ・スーパー・公園・
// 病院・ドラッグストア・飲食店）、生活利便性と周辺環境の総合（どちらも距離から出した MICHILU の目安。根拠を画面で見られる）
import { Baby, Car, ChevronRight, Cross, FileText, MapPin, ShieldCheck, ShoppingCart, SquareArrowOutUpRight, Store, Utensils, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { livingScores, totalComment, totalScore, type ScoreKey } from "@/lib/app/scores";
import type { PoiWalk } from "@/lib/roadmap/poi";
import { lineLabel } from "@/lib/roadmap/walk";
import { schoolShort } from "@/lib/roadmap/school";
import { AwardFill, BarsFill, CapFill, CutleryFill, HospitalFill, PillIcon, TrainOutline, TreeFill, Walker } from "./icons";
import { MiniMap, PropertyMap } from "./property-map";
import { KIND_STYLE, metersText, wayMeters } from "./shared";
import { projector } from "./tile-map";
import type { TabProps } from "./types";
import { Card, INK2, More, NAVY, RED, Stars, SUB } from "./ui";

const MAP_W = 185.2;
const MAP_H = 164.4;

/** 「🚶 徒歩 6分　📍 480 m」（道のりが分からなければ直線距離だけ） */
function Walk({ minutes, meters, routed }: { minutes?: number; meters: number; routed: boolean }) {
  return (
    <span className="flex items-center whitespace-nowrap leading-none">
      {routed && minutes !== undefined ? (
        <>
          <Walker size={10.8} color={SUB} />
          <span className="ml-[-1px] font-bold" style={{ fontSize: 7.6, color: RED }}>
            徒歩<span style={{ marginLeft: 2.6 }}>{minutes}分</span>
          </span>
        </>
      ) : (
        <span style={{ fontSize: 6.7, color: SUB }}>直線</span>
      )}
      <MapPin size={8.4} strokeWidth={1.1} absoluteStrokeWidth color={SUB} className="ml-[6px]" />
      <span className="font-latin ml-[1.2px]" style={{ fontSize: 6.7, color: SUB }}>
        {metersText(meters)}
      </span>
    </span>
  );
}

/** 地図の上の施設の印 */
function Poi({ x, y, color, children, d = 12.4 }: { x: number; y: number; color: string; children: ReactNode; d?: number }) {
  return (
    <span className="absolute flex items-center justify-center rounded-full border border-white text-white shadow-[0_1px_2px_rgba(0,0,0,0.25)]" style={{ left: x - d / 2, top: y - d / 2, width: d, height: d, background: color }}>
      {children}
    </span>
  );
}

/** 地図に出す印（駅・学区の小学校・種類ごとの最寄り） */
type Marker = { key: string; at: [number, number]; kind: number };

/** 印がぜんぶ入るいちばん細かいズーム（14〜17） */
function fitZoom(lat: number, lng: number, markers: Marker[]): number {
  for (let z = 17; z > 14; z--) {
    const project = projector(lat, lng, z, MAP_W, MAP_H);
    if (markers.every((m) => {
      const [x, y] = project(m.at);
      return x > 8 && x < MAP_W - 8 && y > 8 && y < MAP_H - 8;
    }))
      return z;
  }
  return 14;
}

const CATS: { kinds: number[]; title: string; icon: ReactNode }[] = [
  { kinds: [2], title: "コンビニエンスストア", icon: <Store size={14.5} strokeWidth={2} absoluteStrokeWidth color="#ef4444" /> },
  { kinds: [1], title: "スーパーマーケット", icon: <ShoppingCart size={14.5} strokeWidth={2.2} absoluteStrokeWidth color="#f59a23" /> },
  { kinds: [6], title: "公園", icon: <TreeFill size={14} color="#1e9e55" /> },
  { kinds: [4, 5], title: "病院", icon: <HospitalFill size={14} color="#e8423f" /> },
  { kinds: [3], title: "ドラッグストア", icon: <PillIcon size={14} color="#5b6df2" /> },
  { kinds: [13], title: "飲食店", icon: <CutleryFill size={14} color="#f59a23" /> },
];

const RATING_ICONS: Record<ScoreKey, LucideIcon> = { transport: Car, shopping: ShoppingCart, dining: Utensils, medical: Cross, childcare: Baby, safety: ShieldCheck };

/** 「セブン-イレブン 渋谷神南1丁目店」→ 名前と支店名（最後の空白で分ける） */
function splitName(name: string): [string, string] {
  const m = name.match(/^(.+)[ 　](.+)$/);
  return m ? [m[1], m[2]] : [name, ""];
}

export function AroundTab({ result, data, open, expand, mapApps }: TabProps) {
  const { stations, schools, around } = data;
  const nearest = around.status === "ok" ? around.nearest : [];
  const st = stations.status === "ok" ? stations.stations : [];
  const e = schools.status === "ok" ? schools.schools.elementary : undefined;

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

  return (
    <div className="mt-[7.8px] pl-[8.8px] pr-[8.6px]">
      <div className="flex gap-[4.9px]">
        {/* 施設の印の地図 */}
        <PropertyMap
          lat={result.lat}
          lng={result.lng}
          width={MAP_W}
          height={MAP_H}
          z={z}
          pinScale={0.87}
          bubble={result.matchedAddress.replace(/^(東京都|.{2,3}県)/, "")}
          onExpand={() => expand()}
          pill={{ icon: <SquareArrowOutUpRight size={9} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" />, label: "地図アプリで開く", onClick: mapApps }}
        >
          {(project) =>
            markers.map((m) => {
              const [x, y] = project(m.at);
              const { Icon, color } = KIND_STYLE[m.kind];
              return (
                <Poi key={m.key} x={x} y={y} color={m.kind === 0 ? "#fff" : color} d={m.kind === 0 ? 13.5 : 12.4}>
                  <Icon size={7} strokeWidth={1.6} absoluteStrokeWidth color={m.kind === 0 ? "#1d3264" : "#fff"} />
                </Poi>
              );
            })
          }
        </PropertyMap>

        {/* 最寄り駅・学校 */}
        <div className="flex min-w-0 flex-1 flex-col gap-[4.5px]">
          <Card className="relative" style={{ height: 83.8 }}>
            <Head icon={<TrainOutline size={14.6} stroke={1.9} color="#5b6df2" />} title="最寄り駅" onMore={() => open("stations")} />
            {stations.status === "loading" ? (
              <Empty>確認中…</Empty>
            ) : st[0] ? (
              <div className="absolute flex gap-[6.3px]" style={{ left: 6.3, top: 23 }}>
                {st[0].at ? <MiniMap at={st[0].at} width={71.5} height={48.1} className="rounded-[4px]" color="#1f63f0" /> : <Thumb />}
                <div className="min-w-0 pt-[0.5px]" style={{ width: 82 }}>
                  <p className="truncate font-bold leading-none" style={{ fontSize: 7.5, color: INK2 }}>
                    {st[0].name}駅
                  </p>
                  {st[0].lines.slice(0, 3).map((l) => (
                    <p key={l.join()} className="mt-[2.4px] truncate leading-[1.05]" style={{ fontSize: 6.95, color: "#6b7486" }}>
                      {lineLabel(l)}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <Empty>近くに駅がありません</Empty>
            )}
            {st[0] && (
              <span className="absolute" style={{ left: 86.8, top: 65.6 }}>
                <Walk minutes={st[0].minutes} meters={st[0].routed ? st[0].meters : st[0].straight} routed={st[0].routed} />
              </span>
            )}
          </Card>
          <Card className="relative" style={{ height: 76.1 }}>
            <Head icon={<CapFill size={15.5} color="#169b5d" />} title="学校（学区）" onMore={() => open("schools")} />
            {schools.status === "loading" ? (
              <Empty>確認中…</Empty>
            ) : e ? (
              <div className="absolute flex gap-[6.3px]" style={{ left: 6.3, top: 22.4 }}>
                {e.point ? <MiniMap at={e.point} width={71.5} height={48.1} className="rounded-[4px]" color="#169b5d" /> : <Thumb />}
                <div className="min-w-0 pt-[3px]" style={{ width: 82 }}>
                  <p className="truncate font-bold leading-none" style={{ fontSize: 7.6, color: INK2 }}>
                    {schoolShort(e.name)}
                  </p>
                  <p className="mt-[3.4px] truncate leading-none" style={{ fontSize: 6.7, color: "#6b7486" }}>
                    {e.owner ? `${e.owner}${e.name}` : "小学校区"}
                  </p>
                </div>
              </div>
            ) : (
              <Empty>{schools.status === "none" ? "この地域の学区データがありません" : "学区を読み込めませんでした"}</Empty>
            )}
            {e && (e.walk || e.distance !== undefined) && (
              <span className="absolute" style={{ left: 86.8, top: 56.2 }}>
                <Walk minutes={e.walk?.minutes} meters={e.walk?.meters ?? e.distance!} routed={!!e.walk} />
              </span>
            )}
          </Card>
        </div>
      </div>

      {/* 施設の種類ごとの最寄り（2列×3段） */}
      <div className="mt-[6.3px] grid grid-cols-2 gap-x-[5px] gap-y-[4.5px]">
        {CATS.map((c) => {
          const p = c.kinds.map((k) => nearest.find((w) => w.kind === k)).find(Boolean);
          const title = c.kinds.includes(4) && p?.kind === 5 ? "診療所" : c.title;
          return <CatCard key={c.title} title={title} icon={c.icon} poi={p} loading={around.status === "loading"} noData={c.kinds[0] === 13 && around.status === "ok" && around.dining === undefined} onMore={() => open("pois", c.kinds[0])} />;
        })}
      </div>

      {/* 生活利便性・周辺環境総合評価 */}
      <div className="mt-[5.3px] grid gap-[5.9px]" style={{ gridTemplateColumns: "172.7px 1fr" }}>
        <div className="relative rounded-[8px] bg-[#eef4fb]" style={{ height: 101.6 }}>
          <BarsFill size={11.5} color="#7e8fb0" style={{ position: "absolute", left: 6.5, top: 6.1 }} />
          <span className="absolute font-bold leading-none" style={{ left: 27.5, top: 5.3, fontSize: 8.15, color: "#1c2740" }}>
            生活利便性
          </span>
          <button onClick={() => open("scores")} aria-label="点の付け方" className="absolute flex items-center justify-center rounded-full bg-[#aab5c7] text-white" style={{ left: 71.8, top: 6.1, width: 9, height: 9 }}>
            <span className="font-bold leading-none" style={{ fontSize: 6.4 }}>
              ?
            </span>
          </button>
          <span className="absolute leading-none" style={{ right: 6, top: 6.8, fontSize: 5.6, color: "#7d8aa0" }}>
            MICHILUの目安
          </span>
          <button onClick={() => open("scores")} className="absolute rounded-[7px] bg-white text-left" style={{ left: 2.9, top: 20.6, width: 167, height: 79.6 }}>
            {scores.map((r, i) => {
              const Icon = RATING_ICONS[r.key];
              return (
                <span key={r.key} className="absolute flex items-center" style={{ left: 7, top: 3.6 + i * 12.35, height: 10 }}>
                  <Icon size={9.5} strokeWidth={1.3} absoluteStrokeWidth color="#1d2b48" />
                  <span className="ml-[8.3px] w-[58px] leading-none" style={{ fontSize: 6.6, color: "#4d576b" }}>
                    {r.label}
                  </span>
                  <Stars value={r.value} size={6.4} gap={1.85} />
                  <span className="font-latin ml-[6.3px] leading-none" style={{ fontSize: 6.95, color: "#4d576b" }}>
                    {r.value === null ? "―" : r.value.toFixed(1)}
                  </span>
                </span>
              );
            })}
          </button>
        </div>

        <div className="relative rounded-[8px] bg-[#e9f2fc]" style={{ height: 101.6 }}>
          <span className="absolute flex items-center justify-center rounded-full bg-[#d8e7f8]" style={{ left: 9.3, top: 7.8, width: 25.6, height: 25.6 }}>
            <AwardFill size={14} color="#1f6fe0" />
          </span>
          <span className="absolute whitespace-nowrap font-bold leading-none" style={{ left: 39.4, top: 7, fontSize: 7.85, color: "#1d2a44" }}>
            周辺環境総合評価
            <span className="ml-[4px] font-normal" style={{ fontSize: 5.6, color: "#7d8aa0" }}>
              MICHILUの目安
            </span>
          </span>
          <span className="font-latin absolute font-bold leading-none" style={{ left: 37.5, top: 17.8, fontSize: 24, color: "#13284e" }}>
            {total === null ? "―" : total.toFixed(1)}
          </span>
          <span className="font-latin absolute leading-none" style={{ left: 79, top: 29, fontSize: 11.75, color: "#1d2a44" }}>
            /5.0
          </span>
          <span className="absolute" style={{ left: 107, top: 27.3 }}>
            <Stars value={total} size={11.2} gap={-1.3} color="#13284e" />
          </span>
          <span className="absolute leading-[1.37]" style={{ left: 40.1, right: 6, top: 47.2, fontSize: 7.17, color: "#4f5b70" }}>
            {totalComment(total)}
          </span>
          <button onClick={() => open("scores")} className="absolute flex items-center justify-center gap-[6px] rounded-full active:opacity-90" style={{ left: 5.7, top: 71.8, width: 174.3, height: 24.2, background: NAVY }}>
            <FileText size={11} strokeWidth={1.4} absoluteStrokeWidth color="#fff" />
            <span className="font-semibold leading-none text-white" style={{ fontSize: 8.04 }}>
              評価の根拠・施設の一覧を見る
            </span>
            <ChevronRight size={9} strokeWidth={1.6} absoluteStrokeWidth color="#fff" />
          </button>
        </div>
      </div>
      <p className="mt-[4px] leading-[1.5]" style={{ fontSize: 5.6, color: "#8a95a6" }}>
        施設：© OpenStreetMap contributors（ODbL）・駅：国土数値情報・学区：国土数値情報。徒歩は道路距離80mを1分とした目安です。
      </p>
    </div>
  );
}

function Head({ icon, title, onMore }: { icon: ReactNode; title: string; onMore?: () => void }) {
  return (
    <div className="absolute flex items-center" style={{ left: 7, right: 6, top: 4.3, height: 16 }}>
      <span className="flex w-[17px] shrink-0 justify-center">{icon}</span>
      <span className="ml-[6.5px] min-w-0 flex-1 truncate font-bold leading-none" style={{ fontSize: 7.5, color: INK2, fontFeatureSettings: '"palt"' }}>
        {title}
      </span>
      {onMore && <More onClick={onMore} size={6.7} />}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="absolute leading-[1.5]" style={{ left: 8, right: 8, top: 30, fontSize: 6.6, color: "#8a95a6" }}>
      {children}
    </p>
  );
}

function Thumb() {
  return <span className="block shrink-0 rounded-[4px] bg-[linear-gradient(160deg,#d5dde7_0%,#bcc7d4_100%)]" style={{ width: 71.5, height: 48.1 }} />;
}

function CatCard({ title, icon, poi, loading, noData, onMore }: { title: string; icon: ReactNode; poi?: PoiWalk; loading: boolean; noData?: boolean; onMore: () => void }) {
  const [name, sub] = poi ? splitName(poi.name) : ["", ""];
  const color = poi ? KIND_STYLE[poi.kind].color : "#8a95a6";
  return (
    <Card className="relative" style={{ height: 72 }}>
      <Head icon={icon} title={title} onMore={poi ? onMore : undefined} />
      {poi ? (
        <>
          <span className="absolute" style={{ left: 6.3, top: 22.7 }}>
            <MiniMap at={poi.at} width={76.8} height={44.3} className="rounded-[4px]" color={color} />
          </span>
          <span className="absolute min-w-0" style={{ left: 90, right: 6, top: 24.4 }}>
            <span className="block truncate font-bold leading-none" style={{ fontSize: 7.65, color: INK2 }}>
              {name}
            </span>
            <span className="mt-[3.6px] block truncate leading-none" style={{ fontSize: 6.85, color: "#6b7486" }}>
              {sub || poi.label}
            </span>
          </span>
          <span className="absolute" style={{ left: 86.1, top: 54.4 }}>
            <Walk minutes={poi.minutes} meters={wayMeters(poi)} routed={poi.routed} />
          </span>
        </>
      ) : (
        <Empty>{loading ? "確認中…" : noData ? "飲食店のデータを準備中です" : "歩いて行ける範囲（約1.2km）にありません"}</Empty>
      )}
    </Card>
  );
}
