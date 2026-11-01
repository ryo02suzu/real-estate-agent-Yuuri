"use client";

// 「法令」タブ（すりガラスのシートの中。街の模型では用途地域の色を地面に敷く）：用途地域と都市計画（色の帯）、建ぺい率・容積率の大きな数字、
// 高度地区・防火地域、建築時の注意点（押すと全部）、その他の法令・上下水道の札、問い合わせ先。道路の種別は道路のタブ。
// どれも目安で、この土地に建てられるかの判断ではない（「役所・建築士で確認」）
import { ChevronRight, Phone } from "lucide-react";
import { buildingNotes } from "@/lib/app/legal";
import { ratioHint } from "@/lib/app/ratio-hint";
import { parsePhones } from "@/lib/phone";
import { houreiGroups } from "@/lib/roadmap/hourei";
import { moridoValue } from "@/lib/roadmap/morido";
import { tochiLine } from "@/lib/roadmap/tochi";
import { YOUTO_COLORS } from "@/lib/roadmap/zoning";
import { G, GCard, GCell, GFaint, GNote, GRow, NUM, TILE } from "./g-ui";
import { AlertFill } from "./icons";
import { pendingText } from "./r-ui";
import type { TabProps } from "./types";

export function LawTab({ result, data, open }: TabProps) {
  const { zoning, roads, building } = data;
  const m = result.municipality;
  const z = zoning.status === "ok" ? zoning.zoning : undefined;
  const y = z?.youto[0];
  const pend = <GFaint>{pendingText(zoning.status)}</GFaint>;
  const roadList = roads.status === "ok" ? roads.roads : [];
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
  const color = y ? (YOUTO_COLORS[y.code] ?? "#cccccc") : "rgba(255,255,255,0.25)";

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
  const bcr = y?.bcr ? String(y.bcr) : hint ? String(hint.bcr) : undefined;
  const far = y?.far ? String(y.far) : hint ? String(hint.far) : undefined;

  return (
    <div className="flex flex-col gap-[10px]">
      {/* 用途地域・都市計画（色の帯。押すと詳しい画面） */}
      <button onClick={zoning.status === "ok" ? () => open("zoning") : undefined} className="press-soft overflow-hidden rounded-[18px] text-left" style={TILE}>
        <span aria-hidden className="block h-[6px]" style={{ background: `linear-gradient(90deg, ${color}, ${color}99)` }} />
        <span className="flex items-center gap-[10px] px-[13px] pb-[12px] pt-[10px]">
          <span className="min-w-0 flex-1">
            <span className="block leading-none" style={{ fontSize: 11.5, color: G.faint }}>
              用途地域・都市計画
            </span>
            <span className="mt-[7px] block truncate font-bold leading-[1.3]" style={{ fontSize: 17, color: G.text }}>
              {y ? z!.youto.map((o) => o.name.normalize("NFKC")).join("／") : z ? (z.senbiki === "市街化調整区域" ? "指定なし（調整区域）" : "指定なし") : pend}
            </span>
            <span className="mt-[3px] block truncate leading-[1.35]" style={{ fontSize: 12.5, color: G.sub }}>
              {area ?? ""}
              {plans.length > 0 && "・地区計画あり"}
            </span>
          </span>
          {zoning.status === "ok" && <ChevronRight size={18} strokeWidth={1.8} absoluteStrokeWidth color={G.chevron} className="shrink-0" />}
        </span>
        {/* 建ぺい率・容積率（大きな数字） */}
        <span className="grid grid-cols-2 gap-[8px] px-[13px] pb-[13px]">
          {(
            [
              ["建ぺい率", bcr],
              ["容積率", far],
            ] as const
          ).map(([label, v]) => (
            <span key={label} className="block rounded-[14px] px-[11px] py-[9px]" style={{ background: "rgba(255,255,255,0.06)" }}>
              <span className="block leading-none" style={{ fontSize: 11.5, color: G.faint }}>
                {label}
                {hint && !(label === "建ぺい率" ? y?.bcr : y?.far) && "（参考）"}
              </span>
              <span className="mt-[6px] block font-semibold leading-none" style={{ fontSize: v ? 30 : 15, color: G.text, ...NUM }}>
                {v ?? (z ? <GFaint>データなし</GFaint> : pend)}
                {v && (
                  <small className="ml-[2px] font-medium" style={{ fontSize: 14, color: G.sub }}>
                    %
                  </small>
                )}
              </span>
            </span>
          ))}
        </span>
        {/* （参考）の値の出どころ：この市の都市計画のデータに数値が無いので、近くの同じ用途地域の地価公示・地価調査の地点の値 */}
        {hint && (!y?.bcr || !y?.far) && (
          <span className="block px-[13px] pb-[12px] leading-[1.5]" style={{ fontSize: 11.5, color: G.sub }}>
            （参考）は、{m.name}の都市計画のデータに数値が無いため、約{Math.round(hint.distance / 10) * 10}m先の同じ用途地域の{hint.label}の値です。同じ用途地域でも場所で違うことがあるので、この土地の値は都市計画図・窓口で確かめてください。
          </span>
        )}
      </button>

      <div className="grid grid-cols-2 gap-[8px]">
        <GCell label="高度地区" value={z ? (z.koudoti ? "指定あり" : "指定なし") : pend} height={58} />
        <GCell label="防火地域" value={z ? (z.bouka ?? "指定なし") : pend} height={58} />
      </div>

      {/* 建築時の注意点・その他の法令・問い合わせ先 */}
      <GCard className="overflow-hidden">
        <GRow
          icon={<AlertFill size={16} color={warnNotes.length ? "#ffb57a" : "#fff"} />}
          iconBg={warnNotes.length ? "rgba(255,183,94,0.18)" : "rgba(255,255,255,0.1)"}
          title="建築時の注意点"
          sub={notes.length ? `${notes.length}件：${notes.slice(0, 3).map((n) => n.title).join("・")}` : zoning.status === "loading" ? "確認中…" : "都市計画のデータなし（窓口で確認）"}
          right={warnNotes.length ? <span style={{ color: G.warn }}>要注意 {warnNotes.length}</span> : undefined}
          minH={56}
          onClick={notes.length ? () => open("notes") : undefined}
        />
        {others.map((o) => (
          <GRow key={o.label} title={o.label} sub={o.value} right={o.warn ? <span style={{ color: G.warn }}>要確認</span> : undefined} onClick={() => open("zoning", o.tab)} minH={48} />
        ))}
      </GCard>

      {contact && (
        <GCard className="overflow-hidden">
          <GRow
            icon={<Phone size={17} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />}
            title={/^(東京都|\S{2,3}県)\s/.test(contact.dept) ? contact.dept : `${m.name} ${contact.dept}`}
            sub={contact.hours ? `受付：${contact.hours}` : "窓口で聞くことのメモを見る"}
            right={
              phones[0] && !contact.noPhoneInquiry ? (
                <a href={`tel:${phones[0].number.replace(/-/g, "")}`} onClick={(e) => e.stopPropagation()} className="flex h-[32px] items-center gap-[4px] rounded-full px-[12px] font-semibold" style={{ fontSize: 12.5, color: "#1b3f73", background: "rgba(255,255,255,0.94)" }}>
                  <Phone size={13} strokeWidth={2} absoluteStrokeWidth />
                  電話
                </a>
              ) : undefined
            }
            minH={56}
            onClick={() => open("contact")}
          />
        </GCard>
      )}
      <GNote>用途地域など：国土交通省の都市計画GISデータ（概ねの位置・参考）。模型の地面の色は、まわりの用途地域です。最終確認は{m.name}の窓口・都市計画図で。</GNote>
    </div>
  );
}
