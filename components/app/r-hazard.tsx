"use client";

// 「ハザード」タブ：ハザードマップを重ねた地図（押した種類）、種類ごとの印（洪水・内水・高潮・津波・土砂災害は国の重ねるハザードマップの
// 色から読んだ区分。液状化は国の地点データ）、近い避難場所、総合の目安（MICHILU の目安）、市区町村のハザードマップと国の地震の地図。
// 1画面に収める。重要事項説明には市区町村のハザードマップを使うよう、案内を添える
import { ChevronRight, ExternalLink, SquareArrowOutUpRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { hazardCards, hazardTotal, type HazardCardInfo, type Tone } from "@/lib/app/hazard-level";
import { groupHazardMaps, HAZARD_MAP_LABELS, HAZARDS, hazardTileUrl, wagamachiUrl } from "@/lib/roadmap/hazard";
import { Gauge, Landslide, Liquefaction, Quake, RainCloud, Runner, WavesFill } from "./icons";
import { PropertyMap } from "./property-map";
import { Badge, CARD, LIGHT, Note, TEXT } from "./r-ui";
import { metersText } from "./shared";
import type { TabProps } from "./types";

type Kind = "flood" | "naisui" | "takashio" | "tsunami" | "dosha";

const ICONS: Record<Kind | "ekijo", ReactNode> = {
  flood: <WavesFill size={19} />,
  naisui: <RainCloud size={20} />,
  takashio: <WavesFill size={19} color="#3a7bd5" />,
  tsunami: <WavesFill size={19} color="#0b4fb3" />,
  dosha: <Landslide size={20} />,
  ekijo: <Liquefaction size={20} />,
};

const LEVEL_COLOR: Record<string, string> = { out: "#1e9e55", caution: "#c99700", mid: "#f7a20c", high: "#e0452f" };

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
/** 地図の高さ（1画面に収めるため） */
const MAP_H = 116;
/** 外のページを開く印（市区町村の地図・国の地図） */
const LINK_CHIP = "flex h-[36px] shrink-0 items-center gap-[4px] rounded-full bg-white px-[11px] font-semibold leading-none shadow-[0_2px_8px_rgba(20,45,85,0.06)] active:bg-[#f5f8fc]";

export function HazardTab({ result, data, open, expand }: TabProps) {
  const { hazard, evac, liq } = data;
  const liqHit = liq.status === "ok" ? liq.value : null;
  const [shown, setShown] = useState<Kind>("flood");
  const ok = hazard.status === "ok" ? hazard : undefined;
  const cards: HazardCardInfo[] = ok
    ? hazardCards(ok.report)
    : (["flood", "naisui", "takashio", "tsunami", "dosha"] as Kind[]).map((k) => ({
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
  // 浸水深は深い方の3区分、土砂災害は特別警戒・警戒
  const legend = shown === "dosha" ? main.slice(0, 2) : main.slice(-3).map((c, i) => (i === 0 ? { ...c, short: "10m以上" } : c));
  const ll = `${result.lat.toFixed(6)},${result.lng.toFixed(6)}`;
  const disaportal = `https://disaportal.gsi.go.jp/maps/?ll=${ll}&z=16&base=pale&vs=c1j0l0u0t0h0z0`;
  const groups = ok ? groupHazardMaps(ok.maps) : [];
  const name = result.municipality.name;

  return (
    <div>
      <div className={`relative overflow-hidden ${CARD}`}>
        <PropertyMap
          lat={result.lat}
          lng={result.lng}
          width={361}
          height={MAP_H}
          z={15}
          overlay={layers.map((l) => hazardTileUrl(l.id))}
          overlayOpacity={0.72}
          pinScale={0.85}
          onExpand={() => expand({ hazard: shown })}
          pill={{ icon: <SquareArrowOutUpRight size={15} strokeWidth={1.8} absoluteStrokeWidth color="#1c3a63" />, label: "ハザードマップで見る", href: disaportal }}
        />
        {/* 重ねている種類と凡例 */}
        <div className="absolute flex items-center gap-[8px] rounded-full bg-white/95 py-[5px] pl-[10px] pr-[12px] shadow-[0_1px_5px_rgba(10,30,60,0.12)]" style={{ left: 8, top: 8 }}>
          <span className="font-bold leading-none" style={{ fontSize: 12, color: TEXT }}>
            {HAZARDS[shown].short}
          </span>
          {legend.map((c) => (
            <span key={c.label} className="flex items-center gap-[3px] leading-none" style={{ fontSize: 10.5, color: "#3f4a5f" }}>
              <span className="rounded-[2px]" style={{ width: 9, height: 11, background: c.color }} />
              {c.short}
            </span>
          ))}
        </div>
      </div>

      {/* 種類ごとの印（押すと地図に重ねる） */}
      <div className="mt-[8px] grid grid-cols-2 gap-[8px]">
        {cards.map((c) => (
          <HazCell key={c.kind} icon={ICONS[c.kind as Kind]} title={c.title} chip={c.chip} tone={c.tone} active={shown === c.kind} onClick={() => setShown(c.kind as Kind)} />
        ))}
        <HazCell icon={ICONS.ekijo} title="液状化" chip={liqHit ? (LIQ_CHIP[liqHit.level]?.[0] ?? liqHit.label) : "地図で確認"} tone={liqHit ? (LIQ_CHIP[liqHit.level]?.[1] ?? "none") : "map"} href={ekijo?.url ?? `https://disaportal.gsi.go.jp/maps/?ll=${ll}&z=15&base=pale&ls=ekijouka_zenkoku%2C0.8&disp=1&vs=c1j0l0u0t0h0z0`} />
      </div>

      {/* 近い避難場所 */}
      <button onClick={() => open("evac")} className={`mt-[8px] flex w-full items-center gap-[8px] px-[12px] text-left active:bg-[#f5f8fc] ${CARD}`} style={{ height: 42 }}>
        <span className="flex w-[22px] shrink-0 justify-center">
          <Runner size={20} />
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold leading-none" style={{ fontSize: 14, color: TEXT }}>
          避難場所{site ? `：${site.name}` : ""}
        </span>
        <Badge tone={siteM !== undefined && siteM <= EVAC_NEAR_M ? "near" : "none"}>{evac.status === "loading" ? "確認中" : evac.status === "error" ? "読み込めず" : site ? (site.walk ? `徒歩${site.walk.minutes}分` : `直線${metersText(site.straight)}`) : "3km以内になし"}</Badge>
        <ChevronRight size={16} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />
      </button>

      {/* 総合の目安 */}
      <button onClick={() => open("hazard")} className={`mt-[8px] flex w-full items-center gap-[10px] px-[12px] text-left active:bg-[#f5f8fc] ${CARD}`} style={{ height: 52 }}>
        <Gauge style={{ width: 54, height: 32, flexShrink: 0 }} needle={total?.needle} />
        <span className="min-w-0 flex-1">
          <span className="block truncate leading-none" style={{ fontSize: 12, color: LIGHT }}>
            総合ハザード評価（MICHILUの目安）
          </span>
          <span className="mt-[4px] flex items-baseline gap-[8px] leading-none">
            <b className="shrink-0 font-bold" style={{ fontSize: 17, color: total ? LEVEL_COLOR[total.tone] : "#8a95a6" }}>
              {total ? total.level : hazard.status === "error" ? "読み込めず" : "確認中"}
            </b>
            <span className="truncate" style={{ fontSize: 12, color: LIGHT }}>
              {total ? total.comment : "国のデータを読んでいます"}
            </span>
          </span>
        </span>
        <span className="shrink-0 font-semibold leading-none" style={{ fontSize: 13, color: "#1f5fbf" }}>
          根拠
        </span>
      </button>

      {/* 重要事項説明は市区町村のハザードマップで。地震は国の地図 */}
      <div className="no-scrollbar -mx-[16px] mt-[8px] flex gap-[6px] overflow-x-auto px-[16px]">
        <span className="flex h-[36px] shrink-0 items-center leading-none" style={{ fontSize: 12.5, color: LIGHT }}>
          {name}の地図：
        </span>
        {groups.map((g) => (
          <a key={g.url} href={g.url} target="_blank" rel="noreferrer" className={LINK_CHIP} style={{ fontSize: 12.5, color: "#133664" }}>
            <ExternalLink size={12} strokeWidth={1.8} absoluteStrokeWidth />
            {g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}
          </a>
        ))}
        {ok && (
          <a href={wagamachiUrl(ok.muniCd)} target="_blank" rel="noreferrer" className={LINK_CHIP} style={{ fontSize: 12.5, color: "#133664" }}>
            <ExternalLink size={12} strokeWidth={1.8} absoluteStrokeWidth />
            わがまちハザードマップ
          </a>
        )}
        <a href="https://www.j-shis.bosai.go.jp/map/" target="_blank" rel="noreferrer" className={LINK_CHIP} style={{ fontSize: 12.5, color: "#133664" }}>
          <Quake size={14} />
          地震（J-SHIS）
        </a>
      </div>
      <Note className="mt-[8px]">
        重要事項説明は{name}のハザードマップで。上の印は国のマップの色を地点で読んだ参考値です。
        {ok?.elevation?.value !== undefined && `標高 約${ok.elevation.value.toFixed(1)}m。`}
      </Note>
    </div>
  );
}

function HazCell({ icon, title, chip, tone, active, onClick, href }: { icon: ReactNode; title: string; chip: string; tone: Tone; active?: boolean; onClick?: () => void; href?: string }) {
  const body = (
    <>
      <span className="flex w-[22px] shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-semibold leading-none" style={{ fontSize: 14, color: TEXT }}>
        {title}
      </span>
      <Badge tone={tone} size={chip.length > 5 ? 11 : 12}>
        {chip}
      </Badge>
    </>
  );
  const cls = `flex items-center gap-[6px] rounded-[14px] bg-white px-[10px] text-left shadow-[0_2px_8px_rgba(20,45,85,0.06)] ${active ? "ring-2 ring-[#1f5fd1]" : ""}`;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} style={{ height: 42 }}>
      {body}
    </a>
  ) : (
    <button onClick={onClick} className={`${cls} active:bg-[#f5f8fc]`} style={{ height: 42 }}>
      {body}
    </button>
  );
}
