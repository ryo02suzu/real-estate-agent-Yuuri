"use client";

// 「ハザード」タブ（すりガラスのシートの中。街の模型では、選んだ種類のハザードマップの色を地面に敷き、浸水の想定があれば
// 土地にその深さ（区分の下限）まで水を入れて目盛りの柱を立てる）：選んだ種類の読み取り（区分・深さの目盛り・凡例）、
// 種類ごとの印（洪水・内水・高潮・津波・土砂災害は国の重ねるハザードマップの色から読んだ区分。押すと選ぶ。液状化は国の地点データ）、
// 近い避難場所、総合の目安（MICHILU の目安）、市区町村のハザードマップと国の地震の地図。
// 重要事項説明には市区町村のハザードマップを使うよう、案内を添える。街の模型が出せない端末では、平らな地図に色を重ねる
import { ChevronRight, SquareArrowOutUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { classAt, hazardCards, hazardTotal, type HazardCardInfo, type Tone } from "@/lib/app/hazard-level";
import { depthFloor } from "@/lib/app/town-model";
import { groupHazardMaps, HAZARD_MAP_LABELS, HAZARDS, hazardTileUrl, wagamachiUrl } from "@/lib/roadmap/hazard";
import { G, GBadge, GCard, GNote, GPill, GRow, NUM, TILE, TILE_BLUE } from "./g-ui";
import { HoldHeight } from "./hold-height";
import { Gauge, Landslide, Liquefaction, Quake, RainCloud, Runner, WavesFill } from "./icons";
import { PropertyMap } from "./property-map";
import { metersText } from "./shared";
import type { HazardPick, TabProps } from "./types";

const ICONS: Record<HazardPick | "ekijo", ReactNode> = {
  flood: <WavesFill size={19} color="#8ec5ff" />,
  naisui: <RainCloud size={20} color="#a9d4ff" />,
  takashio: <WavesFill size={19} color="#79b2ff" />,
  tsunami: <WavesFill size={19} color="#6aa0ff" />,
  dosha: <Landslide size={20} color="#ffc58f" />,
  ekijo: <Liquefaction size={20} color="#e0c8a8" />,
};

const LEVEL_COLOR: Record<string, string> = { out: "#8ff0c8", caution: "#ffe08a", mid: "#ffc58f", high: "#ffb4a6" };

/** 液状化の発生傾向の区分 → 印の短い言い方と色（正式な区分の名前は「根拠」の画面に） */
const LIQ_CHIP: Record<number, [string, Tone]> = {
  1: ["かなり高い", "high"],
  2: ["高い", "high"],
  3: ["やや高い", "mid"],
  4: ["やや低い", "out"],
  5: ["低い", "out"],
  6: ["対象外", "none"],
};

/** 避難場所を「近く」と言える道のり（m） */
const EVAC_NEAR_M = 1000;

/** 浸水深の区分の幅（m）。「5〜10m」→ [5, 10]、「20m以上」→ [20, 25]、「0.5m未満」→ [0, 0.5] */
function depthRange(label: string): [number, number] | null {
  const n = label.normalize("NFKC");
  const r = n.match(/([\d.]+)\s*[〜~-]\s*([\d.]+)\s*m/);
  if (r) return [Number(r[1]), Number(r[2])];
  const over = n.match(/([\d.]+)\s*m以上/);
  if (over) return [Number(over[1]), Number(over[1]) + 5];
  const under = n.match(/([\d.]+)\s*m未満/);
  if (under) return [0, Number(under[1])];
  return null;
}

export function HazardTab({ result, data, open, expand, has3d, hazard: shown, setHazard }: TabProps) {
  const { hazard, evac, liq } = data;
  const liqHit = liq.status === "ok" ? liq.value : null;
  const ok = hazard.status === "ok" ? hazard : undefined;
  const cards: HazardCardInfo[] = ok
    ? hazardCards(ok.report)
    : (["flood", "naisui", "takashio", "tsunami", "dosha"] as HazardPick[]).map((k) => ({
        kind: k,
        title: k === "dosha" ? "土砂災害" : HAZARDS[k].short,
        chip: hazard.status === "error" ? "読み込めず" : "確認中",
        tone: "none" as Tone,
        lines: [],
      }));
  const total = ok ? hazardTotal(ok.report) : null;
  const site = evac.status === "ok" ? evac.sites[0] : undefined;
  const siteM = site ? (site.walk?.meters ?? site.straight) : undefined;
  const ekijo = ok?.ground.find((g) => g.kind === "ekijo");
  const layers = HAZARDS[shown].layers;
  const main = layers[0].classes.filter((c) => !c.sub);
  // 凡例：浸水深は深い方の4区分、土砂災害は特別警戒・警戒
  const legend = shown === "dosha" ? main.slice(0, 2) : main.slice(0, 5).reverse();
  const ll = `${result.lat.toFixed(6)},${result.lng.toFixed(6)}`;
  const disaportal = `https://disaportal.gsi.go.jp/maps/?ll=${ll}&z=16&base=pale&vs=c1j0l0u0t0h0z0`;
  const groups = ok ? groupHazardMaps(ok.maps) : [];
  const name = result.municipality.name;
  const sel = cards.find((c) => c.kind === shown);
  const at = ok ? classAt(ok.report, shown) : undefined;
  const range = at && shown !== "dosha" ? depthRange(at.label) : null;

  return (
    <div className="flex flex-col gap-[10px]">
      {!has3d && (
        <div className="overflow-hidden rounded-[18px]" style={TILE}>
          <PropertyMap
            lat={result.lat}
            lng={result.lng}
            width={365}
            height={140}
            z={15}
            overlay={layers.map((l) => hazardTileUrl(l.id))}
            overlayOpacity={0.72}
            pinScale={0.85}
            onExpand={() => expand({ hazard: shown })}
            pill={{ icon: <SquareArrowOutUpRight size={15} strokeWidth={1.8} absoluteStrokeWidth color="#1c3a63" />, label: "ハザードマップで見る", href: disaportal }}
          />
        </div>
      )}

      {/* 選んだ種類の読み取り（深さの目盛りと凡例）。種類を変えても板の大きさが変わらない（下の印の並びが動かない）よう、
          いちど広がった高さより縮めない（components/app/hold-height.tsx） */}
      <HoldHeight className="rounded-[18px]" style={shown === "dosha" ? TILE : TILE_BLUE} resetKey={result.matchedAddress}>
      <div className="flex gap-[14px] px-[13px] py-[12px]">
        {range && <DepthGauge range={range} />}
        <div className="min-w-0 flex-1">
          <p className="flex items-center justify-between gap-[8px] leading-none">
            <span className="flex items-center gap-[7px] font-semibold" style={{ fontSize: 13, letterSpacing: 0.6, color: "#cfe5ff" }}>
              <span className="flex w-[20px] justify-center">{ICONS[shown]}</span>
              {HAZARDS[shown].short}の想定
            </span>
            {sel && <GBadge tone={sel.tone}>{sel.chip}</GBadge>}
          </p>
          {range ? (
            <p className="mt-[10px] font-semibold leading-none" style={{ fontSize: 30, color: G.text, ...NUM }}>
              {at!.label}
            </p>
          ) : (
            <p className="mt-[10px] font-bold leading-[1.3]" style={{ fontSize: 18, color: G.text }}>
              {at ? at.label : sel?.chip === "区域外" ? "想定区域の外" : (sel?.chip ?? "確認中")}
            </p>
          )}
          {sel?.lines.map((l) => (
            <p key={l} className="mt-[6px] leading-[1.5]" style={{ fontSize: 12.5, color: G.sub }}>
              {l}
            </p>
          ))}
          <p className="mt-[8px] flex flex-wrap items-center gap-x-[8px] gap-y-[4px] leading-none" style={{ fontSize: 10.5, color: G.faint }}>
            {legend.map((c) => (
              <span key={c.label} className="flex items-center gap-[3px]">
                <span className="rounded-[2px]" style={{ width: 9, height: 11, background: c.color }} />
                {c.short}
              </span>
            ))}
          </p>
          {has3d && range && (
            <p className="mt-[8px] leading-[1.45]" style={{ fontSize: 11, color: G.faint }}>
              {/未満/.test(at!.label.normalize("NFKC")) ? `模型の水は${at!.label}の目安として${depthFloor(at!.label)}m。` : `模型の水は区分の下限（${depthFloor(at!.label)}m）まで。`}
              目盛りは1mごと
            </p>
          )}
        </div>
      </div>
      </HoldHeight>

      {/* 種類ごとの印（押すと地面の色と読み取りを切り替える） */}
      <div className="grid grid-cols-2 gap-[8px]">
        {cards.map((c) => (
          <HazCell key={c.kind} icon={ICONS[c.kind as HazardPick]} title={c.title} chip={c.chip} tone={c.tone} active={shown === c.kind} onClick={() => setHazard(c.kind as HazardPick)} />
        ))}
        <HazCell icon={ICONS.ekijo} title="液状化" chip={liqHit ? (LIQ_CHIP[liqHit.level]?.[0] ?? liqHit.label) : "地図で確認"} tone={liqHit ? (LIQ_CHIP[liqHit.level]?.[1] ?? "none") : "map"} href={ekijo?.url ?? `https://disaportal.gsi.go.jp/maps/?ll=${ll}&z=15&base=pale&ls=ekijouka_zenkoku%2C0.8&disp=1&vs=c1j0l0u0t0h0z0`} />
      </div>

      <GCard className="overflow-hidden">
        {/* 近い避難場所 */}
        <GRow
          icon={<Runner size={20} color="#8ff0c8" />}
          iconBg="rgba(69,211,158,0.14)"
          title={`避難場所${site ? `：${site.name}` : ""}`}
          right={<GBadge tone={siteM !== undefined && siteM <= EVAC_NEAR_M ? "near" : "none"}>{evac.status === "loading" ? "確認中" : evac.status === "error" ? "読み込めず" : site ? (site.walk ? `徒歩${site.walk.minutes}分` : `直線${metersText(site.straight)}`) : "3km以内になし"}</GBadge>}
          onClick={() => open("evac")}
          minH={52}
        />
        {/* 総合の目安 */}
        <button onClick={() => open("hazard")} className="flex w-full items-center gap-[10px] border-t border-white/10 px-[12px] text-left active:bg-white/5" style={{ minHeight: 58 }}>
          <Gauge style={{ width: 54, height: 32, flexShrink: 0 }} needle={total?.needle} dark />
          <span className="min-w-0 flex-1">
            <span className="block truncate leading-none" style={{ fontSize: 11.5, color: G.faint }}>
              総合ハザード評価（MICHILUの目安）
            </span>
            <span className="mt-[5px] flex items-baseline gap-[8px] leading-none">
              <b className="shrink-0 font-bold" style={{ fontSize: 17, color: total ? LEVEL_COLOR[total.tone] : G.faint }}>
                {total ? total.level : hazard.status === "error" ? "読み込めず" : "確認中"}
              </b>
              <span className="truncate" style={{ fontSize: 12, color: G.sub }}>
                {total ? total.comment : "国のデータを読んでいます"}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center font-semibold leading-none" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.8)" }}>
            根拠
            <ChevronRight size={15} strokeWidth={2} absoluteStrokeWidth />
          </span>
        </button>
      </GCard>

      {/* 重要事項説明は市区町村のハザードマップで。地震は国の地図 */}
      <div className="no-scrollbar -mx-[14px] flex gap-[6px] overflow-x-auto px-[14px]">
        {groups.map((g) => (
          <GPill key={g.url} href={g.url}>
            {name}：{g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}
          </GPill>
        ))}
        {ok && <GPill href={wagamachiUrl(ok.muniCd)}>わがまちハザードマップ</GPill>}
        <GPill href="https://www.j-shis.bosai.go.jp/map/" icon={<Quake size={14} color="#fff" />}>
          地震（J-SHIS）
        </GPill>
        <GPill href={disaportal}>
          重ねるハザードマップ
        </GPill>
      </div>
      <GNote>
        重要事項説明は{name}のハザードマップで。上の印と模型の地面の色は、国の重ねるハザードマップの色を読んだ参考です。
        {ok?.elevation?.value !== undefined && `標高 約${ok.elevation.value.toFixed(1)}m。`}
      </GNote>
    </div>
  );
}

/** 深さの目盛り（区分の幅を帯で、下限まで水を入れる） */
function DepthGauge({ range }: { range: [number, number] }) {
  const max = range[1] > 10 ? 25 : 10;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div aria-hidden className="relative w-[46px] shrink-0 overflow-hidden rounded-[10px]" style={{ background: "rgba(255,255,255,0.06)", minHeight: 132 }}>
      <span className="pv-water absolute inset-x-0 bottom-0" style={{ height: pct(range[0]), background: "linear-gradient(180deg, rgba(116,187,255,0.85), rgba(60,130,220,0.9))" }} />
      <span className="absolute inset-x-0" style={{ bottom: pct(range[0]), height: `calc(${pct(range[1])} - ${pct(range[0])})`, borderTop: "1px dashed rgba(255,255,255,0.55)", borderBottom: "1px dashed rgba(255,255,255,0.55)", background: "rgba(255,141,121,0.16)" }} />
      {[0, max / 2, max].map((v) => (
        <span key={v} className="absolute left-[4px] leading-none" style={{ bottom: v === max ? "auto" : `calc(${pct(v)} + 2px)`, top: v === max ? 3 : "auto", fontSize: 9.5, color: "rgba(255,255,255,0.75)", ...NUM }}>
          {v}m
        </span>
      ))}
    </div>
  );
}

function HazCell({ icon, title, chip, tone, active, onClick, href }: { icon: ReactNode; title: string; chip: string; tone: Tone; active?: boolean; onClick?: () => void; href?: string }) {
  const body = (
    <>
      <span className="flex w-[22px] shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-semibold leading-none" style={{ fontSize: 14, color: G.text }}>
        {title}
      </span>
      <GBadge tone={tone} size={chip.length > 5 ? 10.5 : 11.5}>
        {chip}
      </GBadge>
    </>
  );
  const cls = "press-soft flex items-center gap-[6px] rounded-[14px] px-[10px] text-left transition-[background,border-color,box-shadow] duration-300";
  const style = { height: 46, ...(active ? { background: "rgba(116,187,255,0.18)", border: "1px solid rgba(160,205,255,0.7)", boxShadow: "0 0 0 1px rgba(160,205,255,0.35)" } : TILE) };
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>
      {body}
    </a>
  ) : (
    <button onClick={onClick} aria-pressed={active} className={cls} style={style}>
      {body}
    </button>
  );
}
