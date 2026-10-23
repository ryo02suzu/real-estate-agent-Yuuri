"use client";

// 「法令・規制」タブ：用途地域と都市計画、建ぺい率・容積率・高度地区・防火地域の4つの札、接道（地図データ）と市町村の道路種別の地図、
// 建築時の注意点（押すと全部）、その他の法令・上下水道の印、問い合わせ先。1画面に収める。
// どれも目安で、この土地に建てられるかの判断ではない（「役所・建築士で確認」）
import { ChevronRight, ExternalLink, Phone } from "lucide-react";
import { buildingNotes, roadWidthOf } from "@/lib/app/legal";
import { ratioHint } from "@/lib/app/ratio-hint";
import { parsePhones } from "@/lib/phone";
import { houreiGroups } from "@/lib/roadmap/hourei";
import { moridoValue } from "@/lib/roadmap/morido";
import { tochiLine } from "@/lib/roadmap/tochi";
import { AlertFill, RoadIcon } from "./icons";
import { ZoneChip } from "./r-basic";
import { CARD, Cell, Faint, LIGHT, Note, pendingText, Row, TEXT, WARN } from "./r-ui";
import type { TabProps } from "./types";
import { NAVY } from "./ui";

/** 市町村の道路種別の地図が、ネットでどこまで見られるか */
const COVER: Record<string, string> = {
  full: "ネットで全種別が見られます",
  partial: "ネットでは一部の種別だけ",
  none: "ネットには非公開（窓口で）",
  outside: "都市計画区域外（窓口で）",
};

export function LawTab({ result, data, open }: TabProps) {
  const { zoning, roads, building } = data;
  const m = result.municipality;
  const z = zoning.status === "ok" ? zoning.zoning : undefined;
  const y = z?.youto[0];
  const pend = <Faint>{pendingText(zoning.status)}</Faint>;
  const roadList = roads.status === "ok" ? roads.roads : [];
  const road = roadList[0];
  const widthRoad = roadList.find((r) => roadWidthOf(r.width) !== undefined);
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
  const warnNotes = notes.filter((n) => n.warn);
  const plans = z?.others.filter((o) => o.layer === "chikukei") ?? [];
  const area = !z ? undefined : z.tokei ? (z.senbiki ?? "都市計画区域") : z.jyuntoshi ? "準都市計画区域" : "都市計画区域外";
  const cover = COVER[m.coverage] ?? COVER.none;
  const offline = m.coverage === "none" || m.coverage === "outside";
  const mapLink = result.links[0];

  // その他の法令（押すと詳しい画面の該当のタブ）
  const others: { label: string; value: string; warn?: boolean; tab: number }[] = [];
  if (zoning.status === "ok") {
    const groups = zoning.hourei ? houreiGroups(zoning.hourei.hits) : [];
    if (zoning.morido) others.push({ label: "盛土規制法", value: moridoValue(zoning.morido), warn: !!zoning.morido.area, tab: 1 });
    if (zoning.hourei) others.push({ label: "土砂災害等", value: groups.length ? groups.map((x) => x.kind).join("・") : "区域外", warn: groups.length > 0, tab: 1 });
    if (zoning.tochi) others.push({ label: "自然公園・農振・森林", value: tochiLine(zoning.tochi), warn: !!(zoning.tochi.park || zoning.tochi.agri || zoning.tochi.forest), tab: 1 });
    if (zoning.iseki) others.push({ label: "埋蔵文化財", value: zoning.iseki.map ? "遺跡地図で確認" : "教育委員会で確認", tab: 1 });
    others.push({ label: "上下水道・ガス", value: zoning.suido?.length ? "台帳の地図" : "担当で確認", tab: 2 });
  }
  const contact = result.contact;
  const phones = contact?.phone ? parsePhones(contact.phone) : [];

  return (
    <div>
      {/* 用途地域・都市計画 */}
      <button onClick={zoning.status === "ok" ? () => open("zoning") : undefined} className={`flex w-full items-center gap-[12px] px-[14px] text-left active:bg-[#f5f8fc] ${CARD}`} style={{ height: 56 }}>
        <span className="min-w-0 flex-1">
          <span className="block truncate leading-none" style={{ fontSize: 12, color: LIGHT }}>
            用途地域・都市計画
          </span>
          <span className="mt-[6px] flex min-w-0 items-center gap-[8px] leading-none">
            {y ? (
              <ZoneChip name={z!.youto.map((o) => o.name).join("／")} code={y.code} size={14} />
            ) : (
              <span className="font-semibold" style={{ fontSize: 15, color: TEXT }}>
                {z ? (z.senbiki === "市街化調整区域" ? "指定なし（調整区域）" : "指定なし") : pend}
              </span>
            )}
            <span className="truncate" style={{ fontSize: 13, color: LIGHT }}>
              {area ?? ""}
              {plans.length > 0 && "・地区計画あり"}
            </span>
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />
      </button>

      <div className="mt-[8px] grid grid-cols-2 gap-[8px]">
        <Cell label="建ぺい率" value={y?.bcr ? `${y.bcr}%` : hint ? `${hint.bcr}%（参考）` : z ? <Faint>データなし</Faint> : pend} height={52} />
        <Cell label="容積率" value={y?.far ? `${y.far}%` : hint ? `${hint.far}%（参考）` : z ? <Faint>データなし</Faint> : pend} height={52} />
        <Cell label="高度地区" value={z ? (z.koudoti ? "指定あり" : "指定なし") : pend} height={52} />
        <Cell label="防火地域" value={z ? (z.bouka ?? "指定なし") : pend} height={52} />
      </div>

      {/* 接道（地図データ）と、市町村の道路種別の地図（MICHILU の中心の機能。紺のボタン） */}
      <div className={`mt-[8px] flex items-center gap-[8px] pl-[12px] pr-[10px] ${CARD}`} style={{ minHeight: 56 }}>
        <button onClick={() => open("roads")} className="flex min-w-0 flex-1 items-center gap-[10px] py-[8px] text-left active:opacity-70">
          <span className="flex shrink-0 items-center justify-center rounded-full bg-[#eef3fa]" style={{ width: 36, height: 36 }}>
            <RoadIcon size={18} stroke={1.7} color="#1d3264" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 15, color: TEXT }}>
              {roads.status === "loading" ? "接道を確認中…" : road ? `${road.direction}側・${road.short}` : roads.status === "none" ? "接道・道路種別" : "近くに色の付いた道路なし"}
            </span>
            <span className="mt-[1px] block truncate leading-[1.35]" style={{ fontSize: 12.5, color: LIGHT }}>
              {road ? `約${Math.max(1, Math.round(road.distance))}m${widthRoad?.width ? `・幅員 約${widthRoad.width}` : "・幅員は現地で確認"}（地図データ）` : cover}
            </span>
          </span>
        </button>
        {mapLink ? (
          <a href={mapLink.url} target="_blank" rel="noreferrer" className="flex h-[36px] shrink-0 items-center gap-[4px] rounded-full pl-[12px] pr-[10px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(15,47,95,0.25)] active:opacity-90" style={{ fontSize: 13, background: NAVY }}>
            {offline ? "参考の地図" : `${m.name.slice(-1)}の地図`}
            <ExternalLink size={13} strokeWidth={2} absoluteStrokeWidth />
          </a>
        ) : (
          <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />
        )}
      </div>

      {/* 建築時の注意点（押すと全部） */}
      <div className={`mt-[8px] overflow-hidden ${CARD}`}>
        <Row
          icon={<AlertFill size={16} color={warnNotes.length ? "#e8622c" : "#1d3264"} />}
          iconBg={warnNotes.length ? "#fdf1ec" : "#eef3fa"}
          title="建築時の注意点"
          sub={notes.length ? `${notes.length}件：${notes.slice(0, 3).map((n) => n.title).join("・")}` : zoning.status === "loading" ? "確認中…" : "都市計画のデータなし（窓口で確認）"}
          right={warnNotes.length ? <span style={{ color: WARN }}>要注意 {warnNotes.length}</span> : undefined}
          minH={52}
          onClick={notes.length ? () => open("notes") : undefined}
        />
      </div>

      {/* その他の法令・上下水道 */}
      {others.length > 0 && (
        <div className="no-scrollbar -mx-[16px] mt-[8px] flex gap-[6px] overflow-x-auto px-[16px]">
          {others.map((o) => (
            <button key={o.label} onClick={() => open("zoning", o.tab)} className="flex h-[36px] shrink-0 items-center gap-[5px] rounded-full bg-white px-[11px] leading-none shadow-[0_2px_8px_rgba(20,45,85,0.06)] active:bg-[#f5f8fc]" style={{ fontSize: 12.5 }}>
              {o.warn && <AlertFill size={12} color="#e8622c" />}
              <span style={{ color: LIGHT }}>{o.label}</span>
              <span className="font-semibold" style={{ color: o.warn ? WARN : TEXT }}>
                {o.value}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 問い合わせ先 */}
      {contact && (
        <div className={`mt-[8px] overflow-hidden ${CARD}`}>
          <Row
            icon={<Phone size={17} strokeWidth={1.8} absoluteStrokeWidth color={NAVY} />}
            title={/^(東京都|\S{2,3}県)\s/.test(contact.dept) ? contact.dept : `${m.name} ${contact.dept}`}
            sub={contact.hours ? `受付：${contact.hours}` : "窓口で聞くことのメモを見る"}
            right={
              phones[0] && !contact.noPhoneInquiry ? (
                <a href={`tel:${phones[0].number.replace(/-/g, "")}`} onClick={(e) => e.stopPropagation()} className="flex h-[34px] items-center gap-[4px] rounded-full px-[12px] text-white" style={{ fontSize: 13, background: NAVY }}>
                  <Phone size={13} strokeWidth={2} absoluteStrokeWidth />
                  電話
                </a>
              ) : undefined
            }
            minH={52}
            onClick={() => open("contact")}
          />
        </div>
      )}
      <Note className="mt-[8px]">用途地域など：国土交通省の都市計画GISデータ（概ねの位置・参考）。最終確認は{m.name}の窓口・都市計画図で。</Note>
    </div>
  );
}
