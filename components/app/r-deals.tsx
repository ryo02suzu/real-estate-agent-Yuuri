"use client";

// 相場のタブの下半分「取引事例」（すりガラスのシートの中。前の版の「取引」タブ）：実際の取引価格・成約価格（不動産情報ライブラリ。
// 同じ町、無ければ市区町村全体）と、近くの地価公示・地価調査の地点の価格の事例。下の操作バーの「取引事例へ」でここまで送る（id="pv-deals"）。
// 一覧なので、件数が多ければスクロールする
import { Building, ChevronDown, ChevronRight, House, LandPlot, Trees } from "lucide-react";
import { useState } from "react";
import { TSUBO_M2 } from "@/lib/app/area";
import { DEAL_KIND_LABEL, DEALS_CREDIT, DEALS_DATA, DEALS_NOTE, dealKind, dealSummary, totalText, unitPrice, type DealKind, type DealRecord } from "@/lib/roadmap/deals";
import { distanceText, type LandPriceHit, type LandUsage } from "@/lib/roadmap/land-price";
import { G, GHead, GNote, GStat, NUM, TILE } from "./g-ui";
import { HoldHeight } from "./hold-height";
import { manYen, yen } from "./r-ui";
import type { TabProps } from "./types";

type KindFilter = "all" | "公示" | "調査";
const SORTS = ["近い順", "高い順", "安い順"] as const;
const USAGES: ("すべて" | LandUsage)[] = ["すべて", "住宅地", "商業地", "工業地"];
const RANGES = [1000, 2000, 4000];

function Chip({ label, on, onClick, drop }: { label: string; on: boolean; onClick: () => void; drop?: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={on} className="press flex h-[34px] shrink-0 items-center gap-[3px] rounded-full px-[12px] font-semibold leading-none transition-colors duration-200" style={on ? { fontSize: 12.5, background: "rgba(255,255,255,0.94)", color: "#1b3f73", boxShadow: "0 4px 14px rgba(5,15,35,0.22)", border: "1px solid rgba(255,255,255,0.94)" } : { fontSize: 12.5, color: "rgba(255,255,255,0.9)", ...TILE }}>
      {label}
      {drop && <ChevronDown size={14} strokeWidth={2} absoluteStrokeWidth />}
    </button>
  );
}

/** 取引事例（実際の取引と、公的な価格の事例） */
export function DealsSection({ result, data, open }: TabProps) {
  const lp = data.landPrice;
  const all = lp.status === "ok" ? lp.hits : [];
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState(0);
  const [usage, setUsage] = useState(0);
  const [range, setRange] = useState(1);
  const list = all
    .filter((h) => (kind === "all" || h.kind === kind) && (usage === 0 || h.usage === USAGES[usage]) && h.distance <= RANGES[range])
    .sort((a, b) => (sort === 0 ? a.distance - b.distance : sort === 1 ? b.price - a.price : a.price - b.price));
  const avg = list.length ? list.reduce((s, h) => s + h.price, 0) / list.length : undefined;
  // 住宅地と商業地などが混ざった平均は、そう書く（用途で絞ると、その用途だけの平均）
  const mixed = new Set(list.map((h) => h.usage)).size > 1;
  const withChange = list.filter((h) => h.change !== undefined);
  const avgChange = withChange.length ? withChange.reduce((s, h) => s + (h.change ?? 0), 0) / withChange.length : undefined;

  return (
    <div id="pv-deals" className="flex scroll-mt-[118px] flex-col gap-[10px] pt-[6px]">
      <Transactions data={data} town={result.town} />

      <section>
        <GHead title="公的な価格の事例" note="地価公示・地価調査" />
        <div className="no-scrollbar -mx-[14px] flex gap-[6px] overflow-x-auto px-[14px] pb-[2px]">
          <Chip label="すべて" on={kind === "all"} onClick={() => setKind("all")} />
          <Chip label="地価公示" on={kind === "公示"} onClick={() => setKind("公示")} />
          <Chip label="地価調査" on={kind === "調査"} onClick={() => setKind("調査")} />
          <Chip label={SORTS[sort]} on={false} onClick={() => setSort((v) => (v + 1) % SORTS.length)} drop />
          <Chip label={USAGES[usage]} on={false} onClick={() => setUsage((v) => (v + 1) % USAGES.length)} drop />
          <Chip label={`${RANGES[range] / 1000}km以内`} on={false} onClick={() => setRange((v) => (v + 1) % RANGES.length)} drop />
        </div>
        <div className="mt-[8px] grid grid-cols-3 gap-[8px]">
          <GStat label="事例の件数" value={lp.status === "loading" ? "…" : `${list.length}件`} note={`半径${RANGES[range] / 1000}km`} />
          <GStat label={mixed ? "平均単価（用途混在）" : "平均単価"} value={avg ? `${man(avg)}万` : "―"} unit={avg ? "円/㎡" : undefined} note={avg ? (mixed ? "用途で絞ると比べやすい" : `坪 約${manYen(avg * TSUBO_M2)}`) : undefined} />
          <GStat label="前年比の平均" value={avgChange === undefined ? "―" : `${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%`} note="同じ地点の前年比" />
        </div>
        {/* 絞り込みで地点が減っても、一覧の板の大きさは変えない（components/app/hold-height.tsx） */}
        <HoldHeight className="mt-[8px] overflow-hidden rounded-[18px]" style={TILE} resetKey={result.matchedAddress}>
          {lp.status === "loading" && <Msg>地点を確認しています…</Msg>}
          {lp.status === "error" && <Msg>地価のデータを読み込めませんでした。</Msg>}
          {lp.status === "ok" && list.length === 0 && <Msg>条件に合う地点がありません。絞り込みを変えてください。</Msg>}
          {list.map((h) => (
            <DealRow key={`${h.kind}|${h.no}`} hit={h} onClick={() => open("deal", all.indexOf(h))} />
          ))}
        </HoldHeight>
        <GNote className="mt-[8px]">出典：国土数値情報（地価公示・都道府県地価調査）。標準地・基準地はその地域の標準的な土地の価格です。{result.municipality.name}周辺の事例です。</GNote>
      </section>
    </div>
  );
}

/** データの期間を短く：「2024年第3四半期〜2026年第1四半期」→「2024年7月〜2026年3月」（読めなければそのまま） */
export function periodShort(periods: string): string {
  const m = periods.normalize("NFKC").match(/^(\d{4})年第(\d)四半期[〜~-](\d{4})年第(\d)四半期$/);
  return m ? `${m[1]}年${(Number(m[2]) - 1) * 3 + 1}月〜${m[3]}年${Number(m[4]) * 3}月` : periods;
}

/** 万円の数だけ（10万以上は整数、それ未満は小数1桁）：「314」「1640」「0.9」 */
function man(v: number): string {
  return v >= 100_000 ? String(Math.round(v / 10_000)) : (v / 10_000).toFixed(1);
}

function Msg({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-[14px] py-[16px] leading-[1.5]" style={{ fontSize: 13, color: G.sub }}>
      {children}
    </p>
  );
}

/** 地価公示・地価調査の1行 */
function DealRow({ hit, onClick }: { hit: LandPriceHit; onClick: () => void }) {
  const sale = hit.kind === "公示";
  return (
    <button onClick={onClick} className="flex w-full items-center gap-[10px] border-t border-white/10 px-[12px] py-[9px] text-left first:border-t-0 active:bg-white/5" style={{ minHeight: 64 }}>
      <span className="flex shrink-0 items-center justify-center rounded-[10px] font-bold leading-none" style={{ width: 40, height: 40, fontSize: 12, background: sale ? "rgba(255,201,74,0.16)" : "rgba(116,187,255,0.16)", color: sale ? "#ffe2a3" : "#cfe5ff" }}>
        {sale ? "公示" : "調査"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 14.5, color: G.text }}>
          {(hit.jukyo || hit.address || "所在不明").replace(/^(東京都|.{2,3}県)/, "")}
        </span>
        <span className="mt-[2px] block truncate leading-[1.3]" style={{ fontSize: 12, color: G.faint }}>
          {hit.usage}・{hit.bearing}へ{distanceText(hit.distance)}・{hit.year}年{hit.station ? `・${hit.station}${hit.stationM ? ` ${hit.stationM.toLocaleString("ja-JP")}m` : ""}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block whitespace-nowrap font-semibold leading-none" style={{ fontSize: 15, color: G.text, ...NUM }}>
          {yen(hit.price)}
          <span className="ml-[1px] font-medium" style={{ fontSize: 10.5, color: G.sub }}>
            円/㎡
          </span>
        </span>
        <span className="mt-[4px] block whitespace-nowrap leading-none" style={{ fontSize: 11, color: hit.change !== undefined && hit.change < 0 ? G.blue : G.red }}>
          {hit.change !== undefined ? `前年比${hit.change >= 0 ? "+" : ""}${hit.change.toFixed(1)}%` : `坪 約${manYen(hit.price * TSUBO_M2)}`}
        </span>
      </span>
      <ChevronRight size={16} strokeWidth={1.8} absoluteStrokeWidth color={G.chevron} className="shrink-0" />
    </button>
  );
}

const KIND_ICON: Record<DealKind, typeof House> = { land: LandPlot, house: House, mansion: Building, other: Trees };
const KIND_FILTERS: (DealKind | "all")[] = ["all", "land", "house", "mansion"];

/** 実際の取引事例（不動産情報ライブラリ）。同じ町の事例、無ければ市区町村全体の新しい事例 */
function Transactions({ data, town }: { data: TabProps["data"]; town: string }) {
  const d = data.deals;
  const [kind, setKind] = useState<DealKind | "all">("all");
  const [scope, setScope] = useState<"town" | "city">("town");
  const [limit, setLimit] = useState(5);
  if (d.status === "none")
    return (
      <div className="rounded-[18px] px-[14px] py-[12px]" style={TILE}>
        <p className="flex items-center gap-[6px] font-semibold leading-none" style={{ fontSize: 14, color: G.text }}>
          実際の取引価格・成約価格
          <span className="rounded-full px-[7px] py-[4px] font-bold" style={{ fontSize: 11, color: "#2a1a04", background: "#ffd36b" }}>
            {DEALS_DATA.url ? "データなし" : "準備中"}
          </span>
        </p>
        <p className="mt-[8px] leading-[1.5]" style={{ fontSize: 12.5, color: G.sub }}>
          {DEALS_DATA.url ? "この市区町村の事例は、不動産情報ライブラリのデータにありません。" : "国土交通省「不動産情報ライブラリ」の取引価格・成約価格を出す準備ができています（APIキーの登録待ち）。"}
        </p>
      </div>
    );
  if (d.status !== "ok")
    return (
      <div className="rounded-[18px] px-[14px] py-[14px]" style={{ ...TILE, fontSize: 13, color: G.sub }}>
        {d.status === "loading" ? "取引事例を読んでいます…" : "取引事例を読み込めませんでした。"}
      </div>
    );
  const base = scope === "town" && d.town.length ? d.town : d.all;
  const list = base.filter((r) => kind === "all" || dealKind(r.t) === kind);
  const sum = dealSummary(base);
  const where = scope === "town" && d.town.length ? town.replace(/[0-9一二三四五六七八九十]+丁目$/, "") : d.city;
  return (
    <section>
      <GHead title="実際の取引事例" note={`${where}・${periodShort(DEALS_DATA.periods)}`} />
      <div className="no-scrollbar -mx-[14px] flex gap-[6px] overflow-x-auto px-[14px] pb-[2px]">
        {KIND_FILTERS.map((k) => (
          <Chip key={k} label={k === "all" ? "すべて" : DEAL_KIND_LABEL[k]} on={kind === k} onClick={() => setKind(k)} />
        ))}
        {d.town.length > 0 && <Chip label={scope === "town" ? `${d.city}全体にする` : "同じ町だけ"} on={false} onClick={() => setScope((v) => (v === "town" ? "city" : "town"))} drop />}
      </div>
      <div className="mt-[8px] grid grid-cols-3 gap-[8px]">
        <GStat label="事例の件数" value={`${base.length}件`} note={periodShort(DEALS_DATA.periods)} />
        <GStat label="土地の単価" value={sum.land ? `${man(sum.land)}万` : "―"} unit={sum.land ? "円/㎡" : undefined} note={sum.land ? `中央値・坪 約${manYen(sum.land * TSUBO_M2)}` : "土地の事例なし"} />
        <GStat label="マンション" value={sum.mansion ? `${man(sum.mansion)}万` : "―"} unit={sum.mansion ? "円/㎡" : undefined} note="中央値・専有面積あたり" />
      </div>
      {/* 種類の絞り込みで事例が減っても、一覧の板の大きさは変えない */}
      <HoldHeight className="mt-[8px] overflow-hidden rounded-[18px]" style={TILE} resetKey={town}>
        {list.length === 0 && <Msg>条件に合う事例がありません。</Msg>}
        {list.slice(0, limit).map((r, i) => (
          <TxRow key={`${r.pe}|${r.d}|${r.p}|${i}`} r={r} />
        ))}
        {list.length > limit && (
          <button onClick={() => setLimit((v) => v + 10)} className="flex h-[44px] w-full items-center justify-center border-t border-white/10 font-semibold active:bg-white/5" style={{ fontSize: 13.5, color: "#fff" }}>
            さらに{Math.min(10, list.length - limit)}件を見る（全{list.length}件）
          </button>
        )}
      </HoldHeight>
      <GNote className="mt-[6px]">
        {DEALS_CREDIT}（{DEALS_DATA.periods}）。{DEALS_NOTE}。事例の場所は町（地区）までです。
      </GNote>
    </section>
  );
}

function TxRow({ r }: { r: DealRecord }) {
  const k = dealKind(r.t);
  const Icon = KIND_ICON[k];
  const unit = unitPrice(r);
  const sale = r.k === "成約";
  return (
    <div className="flex w-full items-center gap-[10px] border-t border-white/10 px-[12px] py-[9px] first:border-t-0" style={{ minHeight: 64 }}>
      <span className="flex shrink-0 items-center justify-center rounded-[10px]" style={{ width: 38, height: 38, background: "rgba(255,255,255,0.1)" }}>
        <Icon size={19} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold leading-[1.3]" style={{ fontSize: 14.5, color: G.text }}>
          {(r.m ?? "") + (r.d ?? "")}
          <span className="ml-[6px] rounded-[4px] px-[4px] py-[2px] font-bold" style={{ fontSize: 10, background: sale ? "rgba(116,187,255,0.18)" : "rgba(255,201,74,0.18)", color: sale ? "#cfe5ff" : "#ffe2a3" }}>
            {sale ? "成約" : "取引"}
          </span>
        </span>
        <span className="mt-[2px] block truncate leading-[1.3]" style={{ fontSize: 12, color: G.faint }}>
          {DEAL_KIND_LABEL[k]}・{r.pe ?? "時期不明"}
          {r.by ? `・${r.by}築` : ""}
          {r.a ? `・${k === "mansion" ? "専有" : ""}${r.a.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}㎡` : r.as ? `・${r.as}` : ""}
          {r.rc || r.br ? `・前面道路 ${[r.dir, r.rc, r.br ? `${r.br}m` : ""].filter(Boolean).join(" ")}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block whitespace-nowrap font-semibold leading-none" style={{ fontSize: 15, color: G.text, ...NUM }}>
          {totalText(r.p)}
        </span>
        <span className="mt-[4px] block whitespace-nowrap leading-none" style={{ fontSize: 11, color: G.faint }}>
          {unit ? `${yen(unit)}円/㎡` : r.fa ? `延床${r.fa.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}㎡` : ""}
        </span>
      </span>
    </div>
  );
}
