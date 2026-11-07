"use client";

// 「道路」タブ（すりガラスのシートの中。街の模型では前の道路に光が流れる）：前の道路（市町村の道路の地図データの種別・幅員と、
// 国土地理院の地図の道路の幅の区分）、市町村の道路種別の図がネットでどこまで見られるか、その図を開く大きなボタン（MICHILU の中心の機能）、
// 地図の色と幅員のくわしい話、問い合わせ先、窓口で確かめること。
// どれも地図のデータの参考で、建築基準法の道路か・接道の条件を満たすかは判断しない（市の図と窓口で確かめる）
import { ListChecks, Phone, Route } from "lucide-react";
import { parsePhones } from "@/lib/phone";
import { G, GBadge, GCard, GFaint, GHead, GMain, GNote, GPill, GRow, TILE, TILE_GOLD } from "./g-ui";
import { RoadIcon } from "./icons";
import type { TabProps } from "./types";

/** 市町村の道路種別の地図が、ネットでどこまで見られるか */
export const COVER: Record<string, string> = {
  full: "ネットで全種別が見られます",
  partial: "ネットでは一部の種別だけ",
  none: "ネットには非公開（窓口で）",
  outside: "都市計画区域外（窓口で）",
  unknown: "公開の有無は調査中（県か市の建築指導課で）",
};
const COVER_STEPS: { key: string; label: string }[] = [
  { key: "full", label: "全種別" },
  { key: "partial", label: "一部" },
  { key: "none", label: "非公開" },
  { key: "outside", label: "区域外" },
];

/** 窓口で確かめること（どの物件でも聞くこと） */
const ASK = ["前の道路が、建築基準法のどの道路か（種別）", "道路の幅（幅員）と、道路の中心から下がる（後退）必要があるか", "道路との境界（官民境界）が決まっているか"];

export function RoadTab({ result, data, open, front, pick }: TabProps) {
  const m = result.municipality;
  const roads = data.roads;
  const list = roads.status === "ok" ? roads.roads.slice(0, 3) : [];
  const offline = m.coverage === "none" || m.coverage === "outside" || m.coverage === "unknown";
  const mapLink = result.links[0];
  const contact = result.contact;
  const phones = contact?.phone ? parsePhones(contact.phone) : [];
  const dept = contact ? (/^(東京都|\S{2,3}県)\s/.test(contact.dept) ? contact.dept : `${m.name} ${contact.dept}`) : "";
  // 幅員：市の地図のデータに幅員があればそれを出す。無いときは「記録なし」と書き、同じ向きで土地に接する道路の
  // 国土地理院の地図の幅の区分（地図の描き分けの目安。測った幅員ではない）を添える（「現地で確認」と書いた横に幅が出て食い違って見えないように）
  const gsiWidth = (dir: string) => front?.find((f) => f.direction === dir && f.width)?.width;
  const widthText = (r: { width?: string; direction: string }) => {
    if (r.width) return `幅員 ${r.width}`;
    const g = gsiWidth(r.direction);
    return g ? `幅員の記録なし（地図の幅の区分は ${g}）` : "幅員の記録なし";
  };
  // 地番の地図で土地に接する水路の筆（上に道路があっても、建築基準法の道路とは限らない）
  const plan = pick.plan;
  const waterSides = plan?.status === "ok" ? [...new Set(plan.roads.filter((r) => r.kind === "water" && r.side).map((r) => r.side!.dir))] : [];

  return (
    <div className="flex flex-col gap-[10px]">
      {/* 前の道路（地図のデータ） */}
      <div className="rounded-[18px] px-[13px] pb-[12px] pt-[12px]" style={TILE_GOLD}>
        <div className="flex items-center justify-between gap-[8px]">
          <p className="font-semibold leading-none" style={{ fontSize: 13, letterSpacing: 0.6, color: "#ffe2a3" }}>
            前の道路（地図のデータ）
          </p>
          <GBadge tone="map" size={11}>
            参考
          </GBadge>
        </div>
        <ul className="mt-[8px] flex flex-col">
          {list.map((r) => (
            <li key={`${r.label}|${r.direction}|${r.distance}`} className="flex items-center gap-[10px] border-t border-white/10 py-[8px] first:border-t-0">
              <span aria-hidden className="h-[6px] w-[22px] shrink-0 rounded-full" style={{ background: r.color ?? "#bbb", boxShadow: "0 0 0 1px rgba(0,0,0,0.25)" }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 15.5, color: G.text }}>
                  {r.direction}側・{r.short}
                </span>
                <span className="mt-[2px] block leading-[1.35]" style={{ fontSize: 12, color: G.sub }}>
                  約{Math.max(1, Math.round(r.distance))}m・{widthText(r)}
                </span>
              </span>
            </li>
          ))}
          {roads.status === "loading" && (
            <li className="py-[8px]" style={{ fontSize: 14 }}>
              <GFaint>市町村の道路の地図を読んでいます…</GFaint>
            </li>
          )}
          {roads.status === "ok" && !list.length && (
            <li className="py-[8px] leading-[1.5]" style={{ fontSize: 13, color: G.sub }}>
              地点から50m以内に、市町村の地図で色の付いた道路はありません。
            </li>
          )}
          {roads.status === "none" && (
            <li className="py-[8px] leading-[1.5]" style={{ fontSize: 13, color: G.sub }}>
              {m.name}の道路の種別は、MICHILU では読めません。下のボタンから市の図を開いて確かめてください。
            </li>
          )}
          {roads.status === "error" && (
            <li className="py-[8px] leading-[1.5]" style={{ fontSize: 13, color: G.sub }}>
              市町村の道路の地図を読み込めませんでした。
            </li>
          )}
        </ul>
        {/* 国土地理院の地図の道路（土地に接する道路の幅の区分） */}
        {front && front.length > 0 && (
          <div className="mt-[6px] rounded-[12px] px-[10px] py-[8px]" style={{ background: "rgba(0,0,0,0.16)" }}>
            <p className="leading-[1.35]" style={{ fontSize: 11, color: G.faint }}>
              国土地理院の地図で土地に接する道路（幅の区分は地図の描き分けの目安で、測った幅員ではありません）
            </p>
            <p className="mt-[6px] flex flex-wrap gap-x-[12px] gap-y-[4px] leading-[1.35]" style={{ fontSize: 13, color: G.text }}>
              {front.map((f, i) => (
                <span key={i}>
                  <b className="font-semibold">{f.direction}側</b>
                  <span style={{ color: G.sub }}>{f.width ? `・幅の区分 ${f.width}` : "・幅の区分なし"}</span>
                </span>
              ))}
            </p>
          </div>
        )}
        {/* 地番の地図で接する水路の筆（道路の地図とは別のデータ） */}
        {waterSides.length > 0 && (
          <p className="mt-[6px] rounded-[12px] px-[10px] py-[8px] leading-[1.45]" style={{ fontSize: 12, color: "#ffd9a0", background: "rgba(0,0,0,0.16)" }}>
            地番の地図では、{waterSides.join("・")}側に接しているのは水路の筆です。水路の上を道路として使っていても、建築基準法の道路とは限りません（窓口で確認）。
          </p>
        )}
        {/* 市町村の道路種別の図がネットでどこまで見られるか */}
        <div className="mt-[12px] flex gap-[6px]" aria-label={COVER[m.coverage] ?? COVER.none}>
          {COVER_STEPS.map((c) => {
            const on = c.key === (m.coverage ?? "none");
            return (
              <span key={c.key} className="flex-1 rounded-[10px] py-[6px] text-center leading-none transition-colors" style={{ fontSize: 11.5, background: on ? "rgba(255,201,74,0.2)" : "rgba(255,255,255,0.05)", color: on ? "#ffe2a3" : G.faint, border: `1px solid ${on ? "rgba(255,201,74,0.5)" : "rgba(255,255,255,0.06)"}`, fontWeight: on ? 700 : 400 }}>
                {c.label}
              </span>
            );
          })}
        </div>
        <p className="mt-[8px] leading-[1.5]" style={{ fontSize: 12, color: G.sub }}>
          {m.name}の道路種別の図：{COVER[m.coverage] ?? COVER.none}
        </p>
      </div>

      {/* 市町村の道路種別の図（いちばん使う操作） */}
      {mapLink ? (
        <GMain href={mapLink.url} icon={<Route size={19} strokeWidth={1.9} absoluteStrokeWidth />} title={offline ? "参考の地図を開く" : `${m.name}の道路種別の図を開く`} sub={mapLink.label} />
      ) : (
        <GMain onClick={() => open("contact")} icon={<Phone size={18} strokeWidth={1.9} absoluteStrokeWidth />} title="道路の種別は窓口で" sub={`${m.name}の担当の問い合わせ先`} />
      )}
      {result.links.length > 1 && (
        <div className="no-scrollbar -mx-[14px] flex gap-[6px] overflow-x-auto px-[14px]">
          {result.links.slice(1).map((l) => (
            <GPill key={l.url} href={l.url}>
              {l.label}
            </GPill>
          ))}
        </div>
      )}

      <GCard className="overflow-hidden">
        <GRow icon={<RoadIcon size={18} stroke={1.7} color="#fff" />} title="地図の色と幅員のくわしい話" sub="近くの道路の種別・市町村の地図の色の見方" onClick={() => open("roads")} minH={56} />
        {contact && (
          <GRow
            icon={<Phone size={17} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />}
            title={dept}
            sub={contact.hours ? `受付：${contact.hours}` : "窓口で聞くことのメモを見る"}
            right={
              phones[0] && !contact.noPhoneInquiry ? (
                <a href={`tel:${phones[0].number.replace(/-/g, "")}`} onClick={(e) => e.stopPropagation()} className="flex h-[32px] items-center gap-[4px] rounded-full px-[12px] font-semibold" style={{ fontSize: 12.5, color: "#1b3f73", background: "rgba(255,255,255,0.94)" }}>
                  <Phone size={13} strokeWidth={2} absoluteStrokeWidth />
                  電話
                </a>
              ) : undefined
            }
            onClick={() => open("contact")}
            minH={56}
          />
        )}
      </GCard>

      {/* 窓口で確かめること */}
      <section>
        <GHead title="窓口で確かめること" />
        <div className="rounded-[18px] px-[13px] py-[11px]" style={TILE}>
          <ol className="flex flex-col gap-[8px]">
            {ASK.map((a, i) => (
              <li key={a} className="flex items-start gap-[10px] leading-[1.5]" style={{ fontSize: 13, color: G.text }}>
                <span className="mt-[1px] flex shrink-0 items-center justify-center rounded-full font-semibold leading-none" style={{ width: 20, height: 20, fontSize: 11, background: "rgba(255,255,255,0.12)" }}>
                  {i + 1}
                </span>
                {a}
              </li>
            ))}
          </ol>
          <p className="mt-[10px] flex items-start gap-[6px] border-t border-white/10 pt-[9px] leading-[1.5]" style={{ fontSize: 12, color: G.sub }}>
            <ListChecks size={14} strokeWidth={1.9} absoluteStrokeWidth className="mt-[2px] shrink-0" />
            {contact?.noPhoneInquiry ? "この担当は電話では答えていません。地番と案内図を持って窓口で確かめてください。" : "地番と案内図があると早く確かめられます。"}
          </p>
        </div>
      </section>

      <GNote>
        道路の種別・幅員は、{m.name}の地図のデータと国土地理院の地図から読んだ参考です（線の位置は数mずれることがあります）。建築基準法の道路か・接道の条件を満たすかは、この画面では判断しません。
        {mapLink ? "市の図と窓口で確かめてください。" : "窓口で確かめてください。"}
      </GNote>
    </div>
  );
}
