"use client";

// 「法令・規制」タブ（デザインの絵の3枚目）：用途地域の色の地図と凡例、法令の表（用途地域・建ぺい率・容積率・高度地区・防火・区域・
// 接道・幅員・斜線・日影・地区計画）、建築時の注意点、既存不適格の確認。その下に MICHILU の中心の「道路種別」（市町村の地図を物件の場所で開く・
// 近くの道路の種別）、その他の法令・上下水道、問い合わせ先。斜線・日影・注意点は建築基準法などの一般的なルールの目安で、
// この土地に建てられるかの判断ではない（画面に「目安」と「役所・建築士で確認」を添える）
import { Building, Building2, ChevronRight, ExternalLink, Flame, House, Layers, Map as MapIcon, Phone, Route, Sun, TreePine, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { buildingNotes, roadWidthOf, shadeRule, slopeRule, zoneGroup, type NoteIcon } from "@/lib/app/legal";
import { ratioHint } from "@/lib/app/ratio-hint";
import { parsePhones } from "@/lib/phone";
import { houreiGroups } from "@/lib/roadmap/hourei";
import { moridoValue } from "@/lib/roadmap/morido";
import { tochiLine } from "@/lib/roadmap/tochi";
import { YOUTO_COLORS, type Youto } from "@/lib/roadmap/zoning";
import { linkTexts } from "../result-view";
import { AlertFill, CheckFill, DocFill, RoadIcon, SlopeIcon, SunFill, TowersFill, WidthIcon } from "./icons";
import { PropertyMap } from "./property-map";
import { Pending } from "./shared";
import type { TabProps } from "./types";
import { BLUE, More, NAVY, SUB } from "./ui";

const INK = "#1a2232";
const LABEL = "#4d576b";
const ICON = "#1d3264";

const NOTE_ICON: Record<NoteIcon, ReactNode> = {
  fire: <AlertFill size={13} />,
  warn: <AlertFill size={13} color="#e8622c" />,
  volume: <TowersFill size={14} />,
  sun: <SunFill size={15} />,
  plan: <DocFill size={14} />,
  road: <RoadIcon size={14} color="#173a6e" />,
  old: <Building2 size={14} strokeWidth={1.6} absoluteStrokeWidth color="#173a6e" />,
};

const COVER: Record<string, { label: string; bg: string; fg: string }> = {
  full: { label: "ネットで全種別が分かります", bg: "#e3edfb", fg: "#1f5fd1" },
  partial: { label: "ネットで分かるのは一部だけ", bg: "#fff3c4", fg: "#5c4a00" },
  none: { label: "ネットでは非公開（窓口へ）", bg: "#eef1f5", fg: "#5d6880" },
  outside: { label: "都市計画区域外", bg: "#eef1f5", fg: "#5d6880" },
};
const COVER_LONG: Record<string, string> = {
  full: "市町村の地図で、建築基準法上の道路種別がすべて分かります。",
  partial: "ネットで分かるのは位置指定道路など一部だけです。地図に載っていない道路は窓口で確認してください。",
  none: "道路種別はネットで公開されていません。下の窓口に問い合わせてください。",
  outside: "都市計画区域が無い市町村です。接道義務（43条）は原則かかりませんが、条例や開発の条件があるため窓口で確認してください。",
};

function Row({ Icon, icon, label, value, sub, onClick, line = true }: { Icon?: LucideIcon; icon?: ReactNode; label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void; line?: boolean }) {
  // 押しても何も開かない行はボタンにしない（読み上げで「ボタン」と言わない）
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`flex w-full items-start py-[5.2px] text-left ${line ? "border-b-[0.6px] border-[#eef2f6]" : ""} ${onClick ? "active:bg-[#f7f9fd]" : ""}`}>
      <span className="flex w-[25.9px] shrink-0 justify-start pt-[1px]">{icon ?? (Icon && <Icon size={12} strokeWidth={1.3} absoluteStrokeWidth color={ICON} />)}</span>
      <span className="w-[52.7px] shrink-0 pt-[1.5px] leading-[1.3]" style={{ fontSize: 6.9, color: LABEL }}>
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words">
        <span className="block font-semibold leading-[1.3]" style={{ fontSize: 7.5, color: INK }}>
          {value}
        </span>
        {sub && (
          <span className="mt-[1.5px] block leading-[1.35]" style={{ fontSize: 6.4, color: "#6b7486", fontFeatureSettings: '"palt"' }}>
            {sub}
          </span>
        )}
      </span>
      {onClick && <ChevronRight size={7.5} strokeWidth={1.15} absoluteStrokeWidth color="#1d2b48" className="mt-[2px] shrink-0" />}
    </Tag>
  );
}

export function LawTab({ result, data, open, expand }: TabProps) {
  const { zoning, roads, building } = data;
  const [legend, setLegend] = useState<Youto[]>([]);
  const m = result.municipality;
  const z = zoning.status === "ok" ? zoning.zoning : undefined;
  const y = z?.youto[0];
  const g = zoneGroup(y?.name);
  const pending = zoning.status === "loading" ? <Pending /> : <Pending>読み込めませんでした</Pending>;
  const roadList = roads.status === "ok" ? roads.roads : [];
  const road = roadList[0];
  const widthRoad = roadList.find((r) => roadWidthOf(r.width) !== undefined);
  const w = roadWidthOf(widthRoad?.width);
  const k = ["low", "midHigh", "res"].includes(g) ? 0.4 : 0.6;
  const hit = building.status === "ok" ? building.result.hit : undefined;
  const hint = y && (!y.bcr || !y.far) && data.landPrice.status === "ok" ? ratioHint(y.name, data.landPrice.hits) : undefined;
  const notes = z
    ? buildingNotes({
        zoning: z,
        morido: zoning.status === "ok" ? zoning.morido : undefined,
        hourei: zoning.status === "ok" ? zoning.hourei : undefined,
        tochi: zoning.status === "ok" ? zoning.tochi : undefined,
        roads: roadList,
        buildingYear: hit?.building.year,
      })
    : [];
  const plans = z?.others.filter((o) => o.layer === "chikukei") ?? [];
  const area = !z ? undefined : z.tokei ? (z.senbiki ?? "都市計画区域") : z.jyuntoshi ? "準都市計画区域" : "都市計画区域外";

  return (
    <div className="mt-[7.8px] pl-[8.8px] pr-[8.6px]">
      <div className="flex gap-[7.3px]">
        {/* 左：用途地域の地図と凡例 */}
        <div className="flex shrink-0 flex-col gap-[5.5px]" style={{ width: 177.7 }}>
          <PropertyMap
            lat={result.lat}
            lng={result.lng}
            width={177.7}
            height={200.4}
            z={16}
            zoning
            onZoning={setLegend}
            pinScale={0.9}
            bubble={result.matchedAddress.replace(/^(東京都|.{2,3}県)/, "")}
            onExpand={() => expand()}
            pill={{ icon: <MapIcon size={9.5} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" />, label: "広い地図で確認する", onClick: () => expand() }}
          />
          <div className="flex-1 rounded-[8px] bg-[#eef4fb] px-[9.8px] pb-[7px] pt-[7px]">
            <p className="font-bold leading-none" style={{ fontSize: 7.72, color: "#1c2740" }}>
              用途地域<span style={{ fontSize: 6.9, fontWeight: 400, color: SUB }}>（地図の凡例）</span>
            </p>
            <div className="mt-[6.5px] grid grid-cols-2 gap-x-[6px] gap-y-[6.8px]">
              {legend.length === 0 && <span style={{ fontSize: 6.27, color: "#8a95a6" }}>{zoning.status === "loading" ? "確認中…" : "地図の範囲に用途地域はありません"}</span>}
              {legend.slice(0, 6).map((l) => (
                <span key={`${l.code}|${l.name}`} className="flex min-w-0 items-center gap-[5px]">
                  <span className="shrink-0 rounded-[3px]" style={{ width: 16, height: 10.5, background: YOUTO_COLORS[l.code] ?? "#ccc", opacity: 0.85 }} />
                  <span className="min-w-0 leading-[1.2]" style={{ fontSize: 6, color: "#3f4a5f" }}>
                    {l.name}
                    {(l.bcr || l.far) && <span className="block text-[#6b7486]">{`${l.bcr ?? "―"}/${l.far ?? "―"}%`}</span>}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 右：法令の表 */}
        <div className="min-w-0 flex-1 rounded-[7px] border border-[#e9eef4] bg-white px-[6.2px] py-[1px]">
          <Row
            Icon={Building2}
            label="用途地域"
            onClick={zoning.status === "ok" ? () => open("zoning") : undefined}
            value={
              y ? (
                <span className="inline-flex items-center rounded-[4px] px-[5px] py-[3px] font-bold leading-[1.15]" style={{ background: `${YOUTO_COLORS[y.code] ?? "#ccc"}38`, color: "#7a1a5e", fontSize: 7.3 }}>
                  {z!.youto.map((o) => o.name).join("／")}
                </span>
              ) : z ? (
                z.senbiki === "市街化調整区域" ? "指定なし（調整区域）" : "指定なし"
              ) : (
                pending
              )
            }
          />
          <Row
            Icon={House}
            label="建ぺい率"
            value={y?.bcr ? `${y.bcr}%` : hint ? `${hint.bcr}%（参考）` : z ? <Pending>データなし</Pending> : pending}
            sub={y?.bcr ? (z?.bouka === "防火地域" ? "防火地域の耐火建築物等は緩和あり" : undefined) : hint ? `近くの同じ用途地域の地点（${hint.label}）の値。市で確認` : undefined}
          />
          <Row
            Icon={Layers}
            label="容積率"
            value={y?.far ? `${y.far}%` : hint ? `${hint.far}%（参考）` : z ? <Pending>データなし</Pending> : pending}
            sub={y?.far && w !== undefined && w < 12 ? `前面道路${w}mなら上限${Math.min(y.far, Math.round(w * k * 100))}%の目安` : y?.far ? "前面道路が12m未満なら道路の幅で制限" : undefined}
          />
          <Row Icon={Building} label="高度地区" value={z ? (z.koudoti ? "指定あり" : "指定なし") : pending} sub={z?.koudoti ? "種類・高さは都市計画図で確認" : undefined} />
          <Row Icon={Flame} label="防火地域" value={z ? (z.bouka ?? "指定なし") : pending} sub={z && !z.bouka && (z.tokei || z.jyuntoshi) ? "法22条区域かは市で確認" : undefined} />
          <Row Icon={MapIcon} label="都市計画" value={area ?? pending} sub={z && !z.tokei && !z.jyuntoshi ? "接道義務は原則かからない" : undefined} />
          <Row
            icon={<RoadIcon size={12} stroke={1.6} color={ICON} />}
            label="接道"
            onClick={() => open("roads")}
            value={roads.status === "loading" ? <Pending /> : road ? `${road.direction}側・${road.short}` : roads.status === "none" ? "道路種別の地図で確認" : "近くに色の付いた道路なし"}
            sub={road ? `いちばん近い道路（約${Math.max(1, Math.round(road.distance))}m・地図データ）` : roads.status === "none" ? "下の「道路種別」から市の地図を開けます" : undefined}
          />
          <Row icon={<WidthIcon size={12} stroke={1.4} color={ICON} />} label="道路幅員" onClick={() => open("roads")} value={widthRoad?.width ? `約${widthRoad.width}` : "現地・窓口で確認"} sub={widthRoad?.width ? "地図データの幅員（参考）" : undefined} />
          <Row icon={<SlopeIcon size={12} stroke={1.4} color={ICON} />} label="斜線制限" value={z ? slopeRule(g, z.koudoti).value : pending} sub={z ? slopeRule(g, z.koudoti).sub : undefined} />
          <Row Icon={Sun} label="日影規制" value={z ? shadeRule(g).value : pending} sub={z ? shadeRule(g).sub : undefined} />
          <Row Icon={TreePine} label="地区計画" line={false} value={z ? (plans.length ? plans.map((p) => p.name ?? "区域内").join("／") : "指定なし") : pending} sub={plans.length ? "独自のルールあり。市の図書で確認" : undefined} onClick={zoning.status === "ok" ? () => open("zoning") : undefined} />
        </div>
      </div>

      {/* 建築時の注意点 */}
      <div className="mt-[6px] rounded-[8px] bg-[#eef4fb] px-[4.6px] pb-[4.6px] pt-[7.6px]">
        <div className="flex items-center pl-[3.7px] pr-[6px]">
          <DocFill size={15.5} />
          <span className="ml-[10px] min-w-0 flex-1 font-bold leading-none" style={{ fontSize: 8.95, color: "#1c2740" }}>
            建築時の注意点
            <span className="ml-[5px] font-normal" style={{ fontSize: 6, color: "#7d8aa0" }}>
              一般的なルールの目安
            </span>
          </span>
          {notes.length > 0 && <More onClick={() => open("notes")} size={7} />}
        </div>
        <div className="mt-[8px] grid grid-cols-3 gap-[5.7px]">
          {notes.slice(0, 3).map((n) => (
            <div key={n.title} className="rounded-[7px] bg-white px-[8px] pb-[7px] pt-[8px]">
              <div className="flex items-center gap-[6px]">
                <span className="flex w-[15px] shrink-0 justify-center">{NOTE_ICON[n.icon]}</span>
                <span className="min-w-0 font-bold leading-[1.2]" style={{ fontSize: 7.2, color: n.warn ? "#b23a1e" : "#1c2740" }}>
                  {n.title}
                </span>
              </div>
              <p className="mt-[6px] line-clamp-5 leading-[1.5]" style={{ fontSize: 6.6, color: SUB }}>
                {n.body}
              </p>
            </div>
          ))}
          {notes.length === 0 && <p className="col-span-3 px-[4px] pb-[4px]" style={{ fontSize: 6.6, color: "#8a95a6" }}>{zoning.status === "loading" ? "確認中…" : "都市計画のデータが無いため、注意点を出せません。市の窓口で確認してください。"}</p>}
        </div>
      </div>

      {/* 既存不適格の確認 */}
      <div className="mt-[5.6px] flex items-start rounded-[8px] bg-[#edf7f1] px-[7.3px] py-[8.4px]">
        <CheckFill size={14.5} />
        <div className="ml-[8.5px] min-w-0 flex-1">
          <p className="font-bold leading-none" style={{ fontSize: 7.2, color: "#1c2740" }}>
            既存不適格の確認
          </p>
          <p className="mt-[4.4px] leading-[1.5]" style={{ fontSize: 6.53, color: SUB }}>
            建築時期や増改築の履歴により、既存不適格となる可能性があります。現地・台帳（建築計画概要書）で確認してください。
            {hit?.building.year && `データ上の建築年は${hit.building.year}年${hit.building.year <= 1981 ? "（旧耐震基準の可能性）" : ""}です。`}
          </p>
        </div>
      </div>

      <RoadSection result={result} data={data} open={open} expand={expand} />
      <OtherLaws data={data} open={open} city={m.name} />
      {result.contact && <ContactMini contact={result.contact} city={m.name} onMore={() => open("contact")} />}
      <p className="mt-[4px] leading-[1.5]" style={{ fontSize: 5.6, color: "#8a95a6" }}>
        用途地域など：国土交通省「都市計画決定GISデータ」を加工して作成（概ねの位置・参考）。最終確認は{m.name}の窓口・都市計画図で行ってください。
      </p>
    </div>
  );
}

/** 道路種別：市町村の地図（物件の場所で開く）と、近くの道路の種別 */
function RoadSection({ result, data, open, expand }: Pick<TabProps, "result" | "data" | "open" | "expand">) {
  const m = result.municipality;
  const offline = m.coverage === "none" || m.coverage === "outside";
  const links = result.links;
  const roads = data.roads;
  const cover = COVER[m.coverage];
  return (
    <section className="mt-[6px] rounded-[8px] border border-[#e9eef4] bg-white px-[8px] pb-[8px] pt-[8px]">
      <div className="flex flex-wrap items-center gap-x-[6px] gap-y-[4px]">
        <Route size={13} strokeWidth={1.6} absoluteStrokeWidth color={NAVY} />
        <h3 className="font-bold leading-none" style={{ fontSize: 8.95, color: "#1c2740" }}>
          {m.name}の道路種別
        </h3>
        <span className="rounded-full px-[6px] py-[2.5px] font-bold leading-none" style={{ fontSize: 6.2, background: cover.bg, color: cover.fg }}>
          {cover.label}
        </span>
      </div>
      <p className="mt-[5px] leading-[1.5]" style={{ fontSize: 6.5, color: SUB }}>
        {m.note ?? COVER_LONG[m.coverage]}
      </p>
      {links.length > 0 && (
        <div className="mt-[6px] space-y-[4.5px]">
          {offline && <p style={{ fontSize: 6.3, color: "#8a4f3a" }}>参考：公道（市道）かどうかの地図</p>}
          {links.map((l, i) => {
            const primary = !offline && i === 0;
            const { sub, tip } = linkTexts(l, l.pinpoint && !l.tip, "物件の欄の住所を押してコピーし、地図の住所検索に貼り付けてください。");
            return (
              <div key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center gap-[7px] rounded-[7px] px-[9px] py-[7px] active:opacity-90 ${primary ? "text-white" : "border border-[#e3e8ef] bg-white text-[#1c2740]"}`}
                  style={primary ? { background: `linear-gradient(135deg, #1b4280 0%, ${NAVY} 60%, #0a2248 100%)` } : undefined}
                >
                  <MapIcon size={13} strokeWidth={1.5} absoluteStrokeWidth color={primary ? "#fff" : NAVY} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-[1.25]" style={{ fontSize: 7.6 }}>
                      {l.label}
                    </span>
                    <span className="mt-[2px] block leading-[1.3]" style={{ fontSize: 6.2, opacity: primary ? 0.85 : 0.7 }}>
                      {sub}
                    </span>
                  </span>
                  <ExternalLink size={9} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 opacity-80" />
                </a>
                {(tip || l.legend) && (
                  <p className="mt-[2.5px] flex gap-[3px] px-[2px] leading-[1.45]" style={{ fontSize: 6.2, color: BLUE }}>
                    <span className="shrink-0">▶︎</span>
                    <span>
                      {tip}
                      {l.sheet?.neighbor && (
                        <>
                          {" "}
                          端に近いので、隣の図
                          <a href={l.sheet.neighbor.url} target="_blank" rel="noreferrer" className="mx-[2px] underline">
                            {l.sheet.neighbor.label}
                          </a>
                          も確認してください。
                        </>
                      )}
                      {l.legend && (
                        <button onClick={() => open("roads")} className="ml-[4px] font-bold underline">
                          色の見方
                        </button>
                      )}
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {roads.status !== "none" && (
        <div className="mt-[7px] rounded-[7px] bg-[#f4f7fb] px-[8px] py-[6px]">
          <div className="flex items-center">
            <span className="min-w-0 flex-1 font-bold leading-none" style={{ fontSize: 7, color: "#1c2740" }}>
              物件のまわりの道路（地図データ）
            </span>
            {roads.status === "ok" && roads.roads.length > 0 && <More onClick={() => expand({ roads: true })} label="地図に重ねる" size={6.4} />}
          </div>
          {roads.status === "loading" && <p className="mt-[4px]" style={{ fontSize: 6.4, color: "#8a95a6" }}>地図のデータを読んでいます…</p>}
          {roads.status === "error" && <p className="mt-[4px]" style={{ fontSize: 6.4, color: "#8a95a6" }}>読み込めませんでした。上のボタンで地図を開いて確かめてください。</p>}
          {roads.status === "ok" &&
            (roads.roads.length === 0 ? (
              <p className="mt-[4px] leading-[1.5]" style={{ fontSize: 6.4, color: SUB }}>
                近くに地図で色の付いた道路はありません。色の無い道の種別は窓口で確かめてください。
              </p>
            ) : (
              <ul className="mt-[4px] space-y-[3.5px]">
                {roads.roads.slice(0, 4).map((r) => (
                  <li key={`${r.label}|${r.direction}|${r.distance}`} className="flex items-start gap-[5px]">
                    <span className="mt-[2.5px] h-[5px] w-[12px] shrink-0 rounded-full border border-black/10" style={{ background: r.color ?? "#bbb" }} />
                    <span className="min-w-0 flex-1 leading-[1.35]" style={{ fontSize: 6.6, color: "#1c2740" }}>
                      <b className="font-bold">{r.label}</b>
                      <span style={{ color: SUB }}>
                        {" "}
                        {r.direction}側・約{Math.max(1, Math.round(r.distance))}m{r.width ? `・幅員${r.width}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </section>
  );
}

/** その他の法令・上下水道（押すと詳しい画面） */
function OtherLaws({ data, open, city }: { data: TabProps["data"]; open: TabProps["open"]; city: string }) {
  const z = data.zoning;
  if (z.status !== "ok") return null;
  const groups = z.hourei ? houreiGroups(z.hourei.hits) : [];
  const rows: { label: string; value: string; warn?: boolean; tab: number }[] = [];
  if (z.morido) rows.push({ label: "盛土規制法", value: moridoValue(z.morido), warn: !!z.morido.area, tab: 1 });
  if (z.hourei) rows.push({ label: "土砂災害等の区域", value: groups.length ? groups.map((x) => x.kind).join("・") : "区域外（国のデータ）", warn: groups.length > 0, tab: 1 });
  if (z.tochi) rows.push({ label: "自然公園・農振・森林", value: tochiLine(z.tochi), warn: !!(z.tochi.park || z.tochi.agri || z.tochi.forest), tab: 1 });
  if (z.iseki) rows.push({ label: "埋蔵文化財", value: z.iseki.map ? "遺跡地図で確認" : `${z.iseki.city}の教育委員会で確認`, tab: 1 });
  rows.push({ label: "上下水道・ガス", value: z.suido?.length ? "台帳の地図で確認" : `${city}の担当で確認`, tab: 2 });
  return (
    <section className="mt-[6px] rounded-[8px] border border-[#e9eef4] bg-white px-[8px] pb-[4px] pt-[8px]">
      <div className="flex items-center gap-[6px]">
        <DocFill size={13} />
        <h3 className="min-w-0 flex-1 font-bold leading-none" style={{ fontSize: 8.6, color: "#1c2740" }}>
          その他の法令・上下水道
          <span className="ml-[5px] font-normal" style={{ fontSize: 6, color: "#7d8aa0" }}>
            重説の下調べ（国のデータ・参考）
          </span>
        </h3>
      </div>
      <div className="mt-[4px]">
        {rows.map((r, i) => (
          <button key={r.label} onClick={() => open("zoning", r.tab)} className={`flex w-full items-center py-[5.5px] text-left active:bg-[#f7f9fd] ${i < rows.length - 1 ? "border-b-[0.6px] border-[#eef2f6]" : ""}`}>
            <span className="w-[78px] shrink-0 leading-[1.3]" style={{ fontSize: 6.6, color: LABEL }}>
              {r.label}
            </span>
            <span className="min-w-0 flex-1 font-semibold leading-[1.3]" style={{ fontSize: 7, color: r.warn ? "#b23a1e" : INK }}>
              {r.warn && <AlertFill size={8} color="#e8622c" style={{ display: "inline", marginRight: 3, verticalAlign: -1 }} />}
              {r.value}
            </span>
            <ChevronRight size={7.5} strokeWidth={1.15} absoluteStrokeWidth color="#1d2b48" className="shrink-0" />
          </button>
        ))}
      </div>
    </section>
  );
}

/** 問い合わせ先（電話はそのまま発信。詳しい画面に窓口で聞くことのメモ） */
function ContactMini({ contact, city, onMore }: { contact: NonNullable<TabProps["result"]["contact"]>; city: string; onMore: () => void }) {
  const phones = contact.phone ? parsePhones(contact.phone) : [];
  const dept = /^(東京都|\S{2,3}県)\s/.test(contact.dept) ? contact.dept : `${city} ${contact.dept}`;
  return (
    <section className="mt-[6px] rounded-[8px] bg-[#f1f6fc] px-[8px] pb-[8px] pt-[8px]">
      <div className="flex items-center gap-[6px]">
        <Phone size={12} strokeWidth={1.6} absoluteStrokeWidth color={NAVY} />
        <h3 className="min-w-0 flex-1 font-bold leading-none" style={{ fontSize: 8.6, color: "#1c2740" }}>
          問い合わせ先
        </h3>
        <More onClick={onMore} label="窓口で聞くこと" size={6.6} />
      </div>
      <p className="mt-[5px] font-semibold leading-[1.35]" style={{ fontSize: 7.4, color: INK }}>
        {dept}
      </p>
      {contact.hours && <p className="mt-[2px] leading-[1.35]" style={{ fontSize: 6.4, color: SUB }}>受付：{contact.hours}</p>}
      {contact.note && <p className="mt-[2px] line-clamp-2 leading-[1.4]" style={{ fontSize: 6.3, color: "#8a4f3a" }}>{contact.note}</p>}
      {phones.length > 0 && (
        <div className="mt-[6px] flex flex-wrap gap-[5px]">
          {phones.map((p, i) => (
            <a key={p.number} href={`tel:${p.number.replace(/-/g, "")}`} className={`flex items-center gap-[4px] rounded-full px-[9px] py-[5px] font-bold leading-none ${i === 0 && !contact.noPhoneInquiry ? "text-white" : "border border-[#cfd8e4] bg-white text-[#1c2740]"}`} style={{ fontSize: 7, ...(i === 0 && !contact.noPhoneInquiry ? { background: NAVY } : {}) }}>
              <Phone size={8} strokeWidth={1.8} absoluteStrokeWidth />
              {p.number}
              {p.label && <span className="font-normal opacity-80">（{p.label}）</span>}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
