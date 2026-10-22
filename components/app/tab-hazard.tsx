"use client";

// 「ハザード」タブ（デザインの絵の4枚目）：ハザードマップを重ねた地図と凡例、種類ごとのカード（洪水・内水・高潮・津波・土砂災害は
// 国の重ねるハザードマップの色から読んだ区分。液状化・地震は読み取れないので国の地図を物件の場所で開く）、総合の目安（MICHILU の目安）、
// 近くの指定緊急避難場所。重要事項説明には市区町村のハザードマップを使うよう、案内を添える
import { ChevronRight, CircleHelp, ExternalLink, FileText, Map as MapIcon, MapPin, SquareArrowOutUpRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { hazardCards, hazardTotal, type HazardCardInfo, type Tone } from "@/lib/app/hazard-level";
import { EVAC_KINDS } from "@/lib/roadmap/evac";
import { groupHazardMaps, HAZARD_MAP_LABELS, HAZARDS, hazardTileUrl, wagamachiUrl } from "@/lib/roadmap/hazard";
import { LIQ_CREDIT } from "@/lib/roadmap/liquefaction";
import { REINFOLIB_NOTE } from "@/lib/roadmap/reinfolib";
import { Gauge, Landslide, Liquefaction, Quake, RainCloud, Runner, WavesFill } from "./icons";
import { MiniMap, PropertyMap } from "./property-map";
import { useLiquefaction } from "./use-national";
import { metersText } from "./shared";
import type { TabProps } from "./types";
import { NAVY, SUB, TONE } from "./ui";

const MAP_W = 177.7;
const CARD_H = 82;
const GAP = 5.7;

type Kind = "flood" | "naisui" | "takashio" | "tsunami" | "dosha";

const ICONS: Record<Kind | "ekijo" | "quake" | "evac", ReactNode> = {
  flood: <WavesFill size={20} />,
  naisui: <RainCloud size={22.5} />,
  takashio: <WavesFill size={20} color="#3a7bd5" />,
  tsunami: <WavesFill size={20} color="#0b4fb3" />,
  dosha: <Landslide size={22} />,
  ekijo: <Liquefaction size={21.5} />,
  quake: <Quake size={18.5} />,
  evac: <Runner size={19.5} />,
};

const LEVEL_COLOR: Record<string, string> = { out: "#1e9e55", caution: "#c99700", mid: "#f7a20c", high: "#e0452f" };

/** 液状化の発生傾向の区分 → 印の短い言い方と色 */
const LIQ_CHIP: Record<number, [string, Tone]> = {
  1: ["非常にしやすい", "high"],
  2: ["しやすい", "high"],
  3: ["ややしやすい", "mid"],
  4: ["ややしにくい", "out"],
  5: ["しにくい", "out"],
  6: ["評価対象外", "none"],
};

/** 避難場所を「近く」と言える道のり（m） */
const EVAC_NEAR_M = 1000;

export function HazardTab({ result, data, open, expand }: TabProps) {
  const { hazard, evac } = data;
  const liq = useLiquefaction(result.lat, result.lng);
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
        lines: [hazard.status === "error" ? "通信のよい所で開き直してください" : "読み込んでいます"],
      }));
  const total = ok ? hazardTotal(ok.report) : null;
  const site = evac.status === "ok" ? evac.sites[0] : undefined;
  const siteM = site ? (site.walk?.meters ?? site.straight) : undefined;
  // 近い場所がどれも別の市区町村なら、物件の市区町村が指定する場所は、その市区町村の資料で確かめる
  const muni = result.municipality.name;
  const otherMuni = evac.status === "ok" && evac.sites.length > 0 && !evac.sites.some((s) => s.address?.includes(muni));
  const ekijo = ok?.ground.find((g) => g.kind === "ekijo");
  const mapH = 4 * CARD_H + 3 * GAP;
  const layers = HAZARDS[shown].layers;
  // 浸水深は浅い方の5区分（いちばん上は「10m以上」にまとめる）、土砂災害は特別警戒・警戒
  const main = layers[0].classes.filter((c) => !c.sub);
  const legend = shown === "dosha" ? main.slice(0, 2) : main.slice(-5).map((c, i) => (i === 0 ? { ...c, short: "10m以上" } : c));
  const disaportal = `https://disaportal.gsi.go.jp/maps/?ll=${result.lat.toFixed(6)},${result.lng.toFixed(6)}&z=16&base=pale&vs=c1j0l0u0t0h0z0`;

  return (
    <div className="mt-[7.8px] pl-[8.8px] pr-[8.6px]">
      <div className="flex gap-[7.9px]">
        {/* 地図（選んだ種類のハザードマップを重ねる） */}
        <div className="relative shrink-0" style={{ width: MAP_W, height: mapH }}>
          <PropertyMap
            lat={result.lat}
            lng={result.lng}
            width={MAP_W}
            height={mapH}
            z={15}
            overlay={layers.map((l) => hazardTileUrl(l.id))}
            overlayOpacity={0.72}
            pinScale={0.95}
            bubble={result.matchedAddress.replace(/^(東京都|.{2,3}県)/, "")}
            onExpand={() => expand({ hazard: shown })}
            pill={{ icon: <SquareArrowOutUpRight size={10} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" />, label: "ハザードマップで見る", href: disaportal }}
          />
          <div className="absolute rounded-[7px] bg-white/95 px-[6px] pb-[6px] pt-[6px] shadow-[0_1px_5px_rgba(10,30,60,0.12)]" style={{ left: 5.7, top: 17 }}>
            <p className="font-bold leading-none" style={{ fontSize: 6.3, color: "#1c2740" }}>
              {HAZARDS[shown].short}
            </p>
            {shown !== "dosha" && (
              <p className="mt-[3.4px] leading-none" style={{ fontSize: 6, color: SUB }}>
                浸水深
              </p>
            )}
            {legend.map((c) => (
              <p key={c.label} className="mt-[3.6px] flex items-center gap-[5px] leading-none">
                <span className="rounded-[1.5px]" style={{ width: 6.4, height: 9, background: c.color }} />
                <span className="font-latin" style={{ fontSize: 5.9, color: "#3f4a5f" }}>
                  {c.short}
                </span>
              </p>
            ))}
          </div>
        </div>

        {/* 種類ごとのカード（押すと地図に重ねる） */}
        <div className="grid min-w-0 flex-1 grid-cols-2 content-start" style={{ gap: GAP }}>
          {cards.map((c) => (
            <HazCard key={c.kind} icon={ICONS[c.kind as Kind]} title={c.title} chip={c.chip} tone={c.tone} lines={c.lines} active={shown === c.kind} onClick={() => setShown(c.kind as Kind)} />
          ))}
          <HazCard
            icon={ICONS.ekijo}
            title="液状化"
            chip={liqHit ? LIQ_CHIP[liqHit.level]?.[0] ?? liqHit.label : "地図で確認"}
            tone={liqHit ? LIQ_CHIP[liqHit.level]?.[1] ?? "none" : "map"}
            lines={liqHit ? [`${liqHit.landform}。地形から見た目安で、揺れの強さは見ていません。`] : ["国の地図（液状化の発生傾向）を物件の場所で開きます。"]}
            href={ekijo?.url ?? `https://disaportal.gsi.go.jp/maps/?ll=${result.lat.toFixed(6)},${result.lng.toFixed(6)}&z=15&base=pale&ls=ekijouka_zenkoku%2C0.8&disp=1&vs=c1j0l0u0t0h0z0`}
          />
          <HazCard icon={ICONS.quake} title="地震" chip="地図で確認" tone="map" lines={["J-SHIS（防災科研）で揺れやすさと30年以内の確率を確認できます。"]} href="https://www.j-shis.bosai.go.jp/map/" />
          <HazCard
            icon={ICONS.evac}
            title="避難場所"
            chip={evac.status === "loading" ? "確認中" : evac.status === "error" ? "読み込めず" : site ? (site.walk ? `徒歩${site.walk.minutes}分` : `直線${metersText(site.straight)}`) : "3km以内になし"}
            tone={siteM !== undefined && siteM <= EVAC_NEAR_M ? "near" : "none"}
            lines={
              site
                ? [`${site.name}まで${site.walk ? `徒歩約${site.walk.minutes}分（${metersText(site.walk.meters)}）` : `直線${metersText(site.straight)}`}。`, otherMuni ? `${muni}の指定は${muni}の防災マップで確認。` : ""]
                : [evac.status === "error" ? "読み込めませんでした" : "市区町村の防災のページで確認してください。"]
            }
            onClick={() => open("evac")}
          />
        </div>
      </div>

      {/* 総合ハザード評価（MICHILU の目安） */}
      <div className="relative mt-[6.3px] rounded-[8px] bg-[#f0f6fd]" style={{ minHeight: 82.2 }}>
        <Gauge style={{ position: "absolute", left: 5.8, top: 17.6, width: 63.2, height: 36 }} needle={total?.needle} />
        <div className="pb-[10px] pl-[80.3px] pr-[112px] pt-[13.5px]">
          <p className="flex items-center gap-[4px] font-bold leading-none" style={{ fontSize: 7.95, color: "#1c2740" }}>
            総合ハザード評価
            <button onClick={() => open("hazard")} aria-label="評価の根拠">
              <CircleHelp size={9.5} strokeWidth={1.2} absoluteStrokeWidth color="#2a4f8f" />
            </button>
            <span className="font-normal" style={{ fontSize: 5.6, color: "#7d8aa0" }}>
              MICHILUの目安
            </span>
          </p>
          <p className="mt-[5.5px] font-bold leading-none" style={{ fontSize: 17.05, color: total ? LEVEL_COLOR[total.tone] : "#8a95a6" }}>
            {total ? total.level : hazard.status === "error" ? "読み込めず" : "確認中"}
          </p>
          <p className="mt-[6.5px] leading-[1.55]" style={{ fontSize: 7, color: "#4f5b70" }}>
            {total ? total.comment : "国のハザードマップのデータを読んでいます。"}
          </p>
        </div>
        <button onClick={() => open("hazard")} className="absolute flex items-center justify-center gap-[5px] rounded-[9px] border-[1.2px] border-[#1c3a6a] bg-white active:bg-[#f2f5f9]" style={{ right: 7, top: 15.4, width: 99.7, height: 22.7 }}>
          <FileText size={11.5} strokeWidth={1.5} absoluteStrokeWidth color="#1f5fd1" />
          <span className="font-bold leading-none" style={{ fontSize: 7.3, color: "#1c2740" }}>
            評価の根拠を見る
          </span>
          <ChevronRight size={7.5} strokeWidth={1.5} absoluteStrokeWidth color="#1c2740" />
        </button>
      </div>

      {/* 避難情報 */}
      <div className="mt-[7.5px] flex items-center gap-[6px]">
        <Runner size={13} />
        <span className="font-bold leading-none" style={{ fontSize: 8.37, color: "#1c2740" }}>
          避難情報
        </span>
        <span className="leading-none" style={{ fontSize: 5.8, color: "#7d8aa0" }}>
          指定緊急避難場所（国土地理院のデータ）
        </span>
      </div>
      {evac.status === "loading" && <p className="mt-[6px]" style={{ fontSize: 6.6, color: "#8a95a6" }}>確認中…</p>}
      {evac.status === "error" && <p className="mt-[6px]" style={{ fontSize: 6.6, color: "#8a95a6" }}>避難場所のデータを読み込めませんでした。</p>}
      {evac.status === "ok" && evac.sites.length === 0 && <p className="mt-[6px]" style={{ fontSize: 6.6, color: "#8a95a6" }}>3km以内に、データにある指定緊急避難場所がありません。市区町村の防災のページで確認してください。</p>}
      {evac.status === "ok" &&
        evac.sites.slice(0, 2).map((s) => (
          <div key={`${s.name}|${s.at.join()}`} className="mt-[5px] flex items-center gap-[6.7px]">
            <MiniMap at={s.at} width={79.7} height={48.3} className="rounded-[5px]" color="#169b4f" z={16} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-[5px] gap-y-[2px]">
                <span className="font-bold leading-[1.25]" style={{ fontSize: 8, color: "#1c2740" }}>
                  {s.name}
                </span>
                <span className="rounded-[4px] bg-[#d6f1e1] px-[4px] py-[2.5px] font-bold leading-none" style={{ fontSize: 6.2, color: "#169b4f" }}>
                  指定緊急避難場所
                </span>
              </p>
              <p className="mt-[3px] flex items-center gap-[3px] leading-none" style={{ fontSize: 7.2, color: "#4f5b70" }}>
                <MapPin size={9} strokeWidth={1.3} absoluteStrokeWidth color="#1f5fd1" />
                {s.walk ? `${metersText(s.walk.meters)}（徒歩${s.walk.minutes}分）` : `直線${metersText(s.straight)}`}
              </p>
              <p className="mt-[3px] truncate leading-none" style={{ fontSize: 6.4, color: "#6b7486" }}>
                {s.kinds.length ? `対象：${s.kinds.map((k) => EVAC_KINDS[k]).join("・")}` : s.address ?? ""}
              </p>
            </div>
            <a
              href={`https://www.google.com/maps/dir/?api=1&origin=${result.lat},${result.lng}&destination=${s.at[1]},${s.at[0]}&travelmode=walking`}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-[4px] rounded-[9px] border-[1.2px] border-[#1c3a6a] bg-white px-[8px] active:bg-[#f2f5f9]"
              style={{ height: 23.7 }}
            >
              <MapIcon size={11} strokeWidth={1.4} absoluteStrokeWidth color="#1c3a6a" />
              <span className="font-bold leading-none" style={{ fontSize: 7, color: "#1c2740" }}>
                道順
              </span>
              <ChevronRight size={7.5} strokeWidth={1.5} absoluteStrokeWidth color="#1c2740" />
            </a>
          </div>
        ))}

      {/* 重要事項説明は市区町村のハザードマップで */}
      {ok && <CityMaps city={result.municipality.name} maps={ok.maps} muniCd={ok.muniCd} elevation={ok.elevation?.value} />}
      <p className="mt-[4px] leading-[1.5]" style={{ fontSize: 5.6, color: "#8a95a6" }}>
        出典：ハザードマップポータルサイト（国土交通省・国土地理院）・指定緊急避難場所データ（国土地理院）を加工して作成。国のデータを地点の色から読んだ参考値で、重要事項説明には使えません。
        {liqHit && `液状化の${LIQ_CREDIT}。${REINFOLIB_NOTE}。`}
      </p>
    </div>
  );
}

function HazCard({ icon, title, chip, tone, lines, active, onClick, href }: { icon: ReactNode; title: string; chip: string; tone: Tone; lines: string[]; active?: boolean; onClick?: () => void; href?: string }) {
  const t = TONE[tone];
  const body = (
    <>
      <span className="flex items-center">
        <span className="flex w-[22px] shrink-0 justify-center">{icon}</span>
        <span className="ml-[5.8px] font-bold leading-none" style={{ fontSize: 8.6, color: "#141b2b" }}>
          {title}
        </span>
        {href && <ExternalLink size={7.5} strokeWidth={1.4} absoluteStrokeWidth color="#1f5fd1" className="ml-auto" />}
      </span>
      <span className="mt-[6.4px] flex items-center">
        <span className="flex items-center justify-center rounded-full px-[6px] font-bold leading-none" style={{ minWidth: 58.3, height: 15.6, fontSize: chip.length > 5 ? 7 : 8.4, background: t.bg, color: t.fg }}>
          {chip}
        </span>
        <ChevronRight size={7} strokeWidth={1.5} absoluteStrokeWidth color="#1f5fd1" className="ml-auto" />
      </span>
      <span className="mt-[5.5px] line-clamp-3 leading-[1.48]" style={{ fontSize: 6.9, color: "#4f5b70" }}>
        {lines.join("")}
      </span>
    </>
  );
  const cls = `flex flex-col overflow-hidden rounded-[8px] border bg-white px-[6.5px] pb-[5px] pt-[7.5px] text-left ${active ? "border-[#1f5fd1] shadow-[0_0_0_1px_#1f5fd1]" : "border-[#edf1f6]"}`;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls} style={{ height: CARD_H }}>
      {body}
    </a>
  ) : (
    <button onClick={onClick} className={`${cls} active:bg-[#f7f9fd]`} style={{ height: CARD_H }}>
      {body}
    </button>
  );
}

/** 市区町村のハザードマップ（重要事項説明はこちら）と、地面の高さ */
function CityMaps({ city, maps, muniCd, elevation }: { city: string; maps: Parameters<typeof groupHazardMaps>[0]; muniCd: string; elevation?: number }) {
  const groups = groupHazardMaps(maps);
  return (
    <section className="mt-[7px] rounded-[8px] border border-[#e9eef4] bg-white px-[8px] py-[7px]">
      <p className="font-bold leading-none" style={{ fontSize: 7.6, color: "#1c2740" }}>
        重要事項説明は{city}のハザードマップで
      </p>
      <div className="mt-[5px] flex flex-wrap gap-[5px]">
        {groups.map((g) => (
          <a key={g.url} href={g.url} target="_blank" rel="noreferrer" className="flex items-center gap-[3px] rounded-full border border-[#cfd8e4] px-[8px] py-[4.5px] font-semibold leading-none" style={{ fontSize: 6.8, color: NAVY }}>
            <ExternalLink size={7.5} strokeWidth={1.5} absoluteStrokeWidth />
            {g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}
          </a>
        ))}
        <a href={wagamachiUrl(muniCd)} target="_blank" rel="noreferrer" className="flex items-center gap-[3px] rounded-full border border-[#cfd8e4] px-[8px] py-[4.5px] font-semibold leading-none" style={{ fontSize: 6.8, color: NAVY }}>
          <ExternalLink size={7.5} strokeWidth={1.5} absoluteStrokeWidth />
          わがまちハザードマップ
        </a>
      </div>
      {elevation !== undefined && (
        <p className="mt-[5px] leading-none" style={{ fontSize: 6.5, color: SUB }}>
          地面の高さ（標高）：約{elevation.toFixed(1)}m
        </p>
      )}
    </section>
  );
}

