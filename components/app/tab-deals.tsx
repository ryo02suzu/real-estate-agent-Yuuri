"use client";

// 「取引事例」タブ（デザインの絵の5枚目）：近くの地価公示（標準地）・地価調査（基準地）の地点を、価格の事例として並べる
// （絞り込み・並べ替え・3つの数字・一覧・対象物件との比較）。実際の取引価格（成約事例）は、国の不動産情報ライブラリの
// API キーが登録されたら出す（準備中と書く）。写真の代わりに、地点の航空写真を出す
import { Building, ChevronDown, ChevronRight, CircleDot, House, JapaneseYen, LandPlot, Trees } from "lucide-react";
import { useState } from "react";
import { TSUBO_M2 } from "@/lib/app/area";
import { DEAL_KIND_LABEL, DEALS_CREDIT, DEALS_DATA, DEALS_NOTE, dealKind, dealSummary, totalText, unitPrice, type DealKind, type DealRecord } from "@/lib/roadmap/deals";
import { distanceText, type LandPriceHit, type LandUsage } from "@/lib/roadmap/land-price";
import { BarsFill, GrowthChart } from "./icons";
import { MiniMap } from "./property-map";
import type { TabProps } from "./types";
import { INK2, NAVY, SUB } from "./ui";

const yen = (v: number) => Math.round(v).toLocaleString("ja-JP");

type KindFilter = "all" | "公示" | "調査";
const SORTS = ["近い順", "価格の高い順", "価格の安い順"] as const;
const USAGES: ("すべての用途" | LandUsage)[] = ["すべての用途", "住宅地", "商業地", "工業地"];
const RANGES = [1000, 2000, 4000];

export function DealsTab({ result, data, open }: TabProps) {
  const lp = data.landPrice;
  const all = lp.status === "ok" ? lp.hits : [];
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState(0);
  const [usage, setUsage] = useState(0);
  const [range, setRange] = useState(2);
  const list = all
    .filter((h) => (kind === "all" || h.kind === kind) && (usage === 0 || h.usage === USAGES[usage]) && h.distance <= RANGES[range])
    .sort((a, b) => (sort === 0 ? a.distance - b.distance : sort === 1 ? b.price - a.price : a.price - b.price));
  const avg = list.length ? list.reduce((s, h) => s + h.price, 0) / list.length : undefined;
  const withChange = list.filter((h) => h.change !== undefined);
  const avgChange = withChange.length ? withChange.reduce((s, h) => s + (h.change ?? 0), 0) / withChange.length : undefined;
  const top = all[0];
  const dealsLand = data.deals.status === "ok" ? dealSummary(data.deals.town).land : undefined;
  const allAvg = all.length ? all.reduce((s, h) => s + h.price, 0) / all.length : undefined;

  const chip = (label: string, on: boolean, onClick: () => void, drop = false) => (
    <button key={label} onClick={onClick} className="flex shrink-0 items-center gap-[2px] rounded-[6px] border px-[9px] font-medium leading-none" style={{ height: 20.9, fontSize: 6.85, background: on ? NAVY : "#fff", borderColor: on ? NAVY : "#e3e8ef", color: on ? "#fff" : "#26324a", fontWeight: on ? 700 : 500 }}>
      {label}
      {drop && <ChevronDown size={10} strokeWidth={1.4} absoluteStrokeWidth />}
    </button>
  );

  return (
    <div className="mt-[9px] pl-[8.6px] pr-[8px]">
      <h3 className="font-bold leading-none" style={{ fontSize: 11.2, color: INK2 }}>
        周辺の取引事例
      </h3>
      <p className="mt-[5.5px] leading-[1.45]" style={{ fontSize: 7.4, color: SUB }}>
        このエリアの実際の取引の事例と、公的な価格（地価公示・地価調査）から、価格の目安を確認できます。
      </p>

      <Transactions data={data} town={result.town} />

      <h4 className="mt-[12px] font-bold leading-none" style={{ fontSize: 9.4, color: INK2 }}>
        公的な価格の事例（地価公示・地価調査）
      </h4>

      {/* 絞り込み */}
      <div className="-mr-[8px] mt-[7px] flex gap-[6px] overflow-x-auto pb-[1px] pr-[8px] [scrollbar-width:none]">
        {chip("すべて", kind === "all", () => setKind("all"))}
        {chip("地価公示", kind === "公示", () => setKind("公示"))}
        {chip("地価調査", kind === "調査", () => setKind("調査"))}
        {chip(SORTS[sort], false, () => setSort((v) => (v + 1) % SORTS.length), true)}
        {chip(USAGES[usage], false, () => setUsage((v) => (v + 1) % USAGES.length), true)}
        {chip(`半径${RANGES[range] / 1000}km以内`, false, () => setRange((v) => (v + 1) % RANGES.length), true)}
      </div>

      {/* 3つの数字 */}
      <div className="mt-[8px] grid grid-cols-3 gap-[7.3px]">
        <Tile bg="#edf5fd" icon={<BarsFill size={15.5} color="#1f5fd1" />} label="事例の件数" value={lp.status === "loading" ? "…" : `${list.length}件`} note={`（半径${RANGES[range] / 1000}km・公示/調査）`} />
        <Tile
          bg="#fbe7f0"
          icon={
            <span className="flex items-center justify-center rounded-full bg-[#cd3279]" style={{ width: 15.9, height: 15.9 }}>
              <JapaneseYen size={9.5} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
            </span>
          }
          label="平均単価"
          value={avg ? yen(avg) : "―"}
          unit={avg ? "円/㎡" : undefined}
          note={avg ? `（坪単価 約${yen(avg * TSUBO_M2)}円）` : undefined}
        />
        <Tile bg="#edf6f1" icon={<GrowthChart size={15.5} color="#12a36a" />} label="前年比の平均" value={avgChange === undefined ? "―" : `${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}%`} note="（同じ地点の前年比）" />
      </div>

      {/* 一覧 */}
      <div className="mt-[6px] space-y-[3px]">
        {lp.status === "loading" && <Msg>地点を確認しています…</Msg>}
        {lp.status === "error" && <Msg>地価のデータを読み込めませんでした。</Msg>}
        {lp.status === "ok" && list.length === 0 && <Msg>条件に合う地点がありません。絞り込みを変えてください。</Msg>}
        {list.map((h) => (
          <DealRow key={`${h.kind}|${h.no}`} hit={h} onClick={() => open("deal", all.indexOf(h))} />
        ))}
      </div>

      {/* 対象物件との比較 */}
      {top && (
        <section className="mt-[5px] rounded-[8px] bg-[#e9f3fd] px-[5px] pb-[5px] pt-[7.6px]">
          <div className="flex items-center px-[2.6px]">
            <GrowthChart size={13.5} color="#1a3263" />
            <div className="ml-[9px] min-w-0 flex-1">
              <p className="font-bold leading-none" style={{ fontSize: 8, color: INK2 }}>
                対象物件との比較
              </p>
              <p className="mt-[4px] leading-none" style={{ fontSize: 6.4, color: SUB }}>
                周辺の価格事例と比べた価格水準の目安です。
              </p>
            </div>
          </div>
          <div className="mt-[6px] grid grid-cols-3 rounded-[7px] bg-[#fcfcfe] py-[8px]">
            <Compare label="本物件の参考単価（最寄り地点）" value={yen(top.price)} note={`（約${yen(top.price * TSUBO_M2)}円/坪）`} />
            <Compare label={`周辺の平均（${all.length}地点）`} value={allAvg ? yen(allAvg) : "―"} note={allAvg ? `（約${yen(allAvg * TSUBO_M2)}円/坪）` : ""} line />
            {dealsLand ? (
              <Compare label="同じ町の取引（土地・中央値）" value={yen(dealsLand)} note={`（約${yen(dealsLand * TSUBO_M2)}円/坪）`} line />
            ) : (
              <Compare label="取引価格（土地・中央値）" value={data.deals.status === "none" && !DEALS_DATA.url ? "準備中" : "―"} note={data.deals.status === "none" && !DEALS_DATA.url ? "（APIキーの登録待ち）" : "（同じ町の土地の事例なし）"} line muted />
            )}
          </div>
        </section>
      )}
      <p className="mt-[4px] leading-[1.5]" style={{ fontSize: 5.6, color: "#8a95a6" }}>
        出典：「国土数値情報（地価公示データ・都道府県地価調査データ）」（国土交通省）を加工して作成。写真：地理院タイル（航空写真）。実際の取引価格は国土交通省「不動産情報ライブラリ」で確認できます。
        {result.municipality.name}周辺の事例です。
      </p>
    </div>
  );
}

function Msg({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[7px] bg-[#f7f9fd] px-[9px] py-[10px] leading-[1.5]" style={{ fontSize: 7, color: "#8a95a6" }}>
      {children}
    </p>
  );
}

function Tile({ bg, icon, label, value, unit, note }: { bg: string; icon: React.ReactNode; label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-[7px] px-[8px] pb-[7px] pt-[7.5px]" style={{ background: bg, minHeight: 55.1 }}>
      <div className="flex items-center gap-[7px]">
        <span className="flex w-[16px] shrink-0 justify-center">{icon}</span>
        <span className="min-w-0 truncate leading-none" style={{ fontSize: 6.75, color: "#3f4a5f" }}>
          {label}
        </span>
      </div>
      <p className="font-latin mt-[6px] whitespace-nowrap font-bold leading-none" style={{ fontSize: 10.6, color: INK2 }}>
        {value}
        {unit && (
          <span className="font-semibold" style={{ fontSize: 7.4, marginLeft: 2.6 }}>
            {unit}
          </span>
        )}
      </p>
      {note && (
        <p className="mt-[5px] truncate leading-none" style={{ fontSize: 6.3, color: SUB }}>
          {note}
        </p>
      )}
    </div>
  );
}

/** 事例の1行（左：航空写真、中：種類・所在・時点・駅、右：地積・価格・坪単価） */
function DealRow({ hit, onClick }: { hit: LandPriceHit; onClick: () => void }) {
  const sale = hit.kind === "公示";
  return (
    <button onClick={onClick} className="flex w-full items-stretch gap-[0.5px] text-left active:opacity-90">
      <MiniMap at={hit.point} width={73.7} height={52} className="rounded-[5px]" layer="photo" z={18} color="#f0263a" />
      <span className="ml-[0.5px] flex min-w-0 flex-1 rounded-[7px] border border-[#edf1f6] bg-white">
        <span className="min-w-0 flex-1 px-[8px] py-[5px]" style={{ maxWidth: 136 }}>
          <span className="flex items-center gap-[4px]">
            <span className="flex shrink-0 items-center justify-center rounded-[4px] px-[4px] font-bold leading-none" style={{ height: 15, fontSize: 6.6, background: sale ? "#fad1e1" : "#cfe4fd", color: sale ? "#c1246c" : "#1f5fd1" }}>
              {sale ? "公示" : "調査"}
            </span>
            <span className="truncate leading-none" style={{ fontSize: 6.2, color: SUB }}>
              {hit.no}・{hit.usage}
            </span>
          </span>
          <span className="mt-[4px] block truncate font-bold leading-none" style={{ fontSize: 7.4, color: INK2 }}>
            {(hit.jukyo || hit.address || "所在不明").replace(/^(東京都|.{2,3}県)/, "")}
          </span>
          <span className="mt-[4px] flex items-center gap-[3px] leading-none" style={{ fontSize: 6.3, color: SUB }}>
            <CircleDot size={5.6} strokeWidth={1} absoluteStrokeWidth color={SUB} />
            {hit.year}年{hit.kind === "公示" ? "1月1日" : "7月1日"}時点・{hit.bearing}へ{distanceText(hit.distance)}
          </span>
          {hit.station && (
            <span className="mt-[3px] flex items-center gap-[3px] truncate leading-none" style={{ fontSize: 6.3, color: SUB }}>
              <CircleDot size={5.6} strokeWidth={1} absoluteStrokeWidth color={SUB} />
              {hit.station}
              {hit.stationM ? ` ${hit.stationM.toLocaleString("ja-JP")}m` : "駅前"}
            </span>
          )}
        </span>
        <span className="my-[5px] w-[0.6px] shrink-0 bg-[#e8edf3]" />
        <span className="flex min-w-0 flex-1 items-center pl-[8px] pr-[2px]">
          <span className="min-w-0 flex-1">
            {hit.area && (
              <span className="flex items-baseline gap-[5px] leading-none">
                <span style={{ fontSize: 6.3, color: SUB }}>地積</span>
                <span className="font-latin truncate" style={{ fontSize: 6.6, color: INK2 }}>
                  {hit.area.toLocaleString("ja-JP")}㎡（{(hit.area / TSUBO_M2).toFixed(2)}坪）
                </span>
              </span>
            )}
            <span className="mt-[4px] flex items-baseline gap-[5px] leading-none">
              <span style={{ fontSize: 6.3, color: SUB }}>価格</span>
              <span className="font-latin whitespace-nowrap font-bold" style={{ fontSize: 10.5, color: INK2 }}>
                {yen(hit.price)}
                <span style={{ fontSize: 7, marginLeft: 2 }}>円/㎡</span>
              </span>
            </span>
            <span className="mt-[4px] block truncate leading-none" style={{ fontSize: 6.3, color: SUB }}>
              （坪単価 約{yen(hit.price * TSUBO_M2)}円）{hit.change !== undefined ? ` 前年比${hit.change >= 0 ? "+" : ""}${hit.change.toFixed(1)}%` : ""}
            </span>
          </span>
          <ChevronRight size={12} strokeWidth={1.3} absoluteStrokeWidth color="#1c3460" className="shrink-0" />
        </span>
      </span>
    </button>
  );
}

function Compare({ label, value, note, line, muted }: { label: string; value: string; note: string; line?: boolean; muted?: boolean }) {
  return (
    <div className={`px-[6px] text-center ${line ? "border-l-[0.6px] border-[#d5dce6]" : ""}`}>
      <p className="leading-[1.3]" style={{ fontSize: 6.2, color: "#3f4a5f" }}>
        {label}
      </p>
      <p className="font-latin mt-[4px] whitespace-nowrap font-bold leading-none" style={{ fontSize: muted ? 8.6 : 10, color: muted ? "#8a95a6" : INK2 }}>
        {value}
        {!muted && <span style={{ fontSize: 7, fontWeight: 600, marginLeft: 2 }}>円/㎡</span>}
      </p>
      <p className="mt-[4px] leading-none" style={{ fontSize: 6.3, color: SUB }}>
        {note}
      </p>
    </div>
  );
}

const KIND_ICON: Record<DealKind, typeof House> = { land: LandPlot, house: House, mansion: Building, other: Trees };
const KIND_FILTERS: (DealKind | "all")[] = ["all", "land", "house", "mansion"];

/** 実際の取引事例（不動産情報ライブラリ）。同じ町の事例、無ければ市区町村全体の新しい事例 */
function Transactions({ data, town }: { data: TabProps["data"]; town: string }) {
  const d = data.deals;
  const [kind, setKind] = useState<DealKind | "all">("all");
  const [scope, setScope] = useState<"town" | "city">("town");
  if (d.status === "none")
    return (
      <div className="mt-[8px] rounded-[8px] bg-[#eef8f2] px-[9px] py-[8px]">
        <p className="flex items-center gap-[5px] font-bold leading-none" style={{ fontSize: 8, color: "#1c2740" }}>
          <GrowthChart size={12} color="#12b076" />
          実際の取引価格・成約価格
          <span className="rounded-full bg-[#fff3c4] px-[6px] py-[2.5px] font-bold leading-none" style={{ fontSize: 6.2, color: "#5c4a00" }}>
            {DEALS_DATA.url ? "この市区町村はデータなし" : "準備中"}
          </span>
        </p>
        <p className="mt-[5px] leading-[1.5]" style={{ fontSize: 6.6, color: SUB }}>
          {DEALS_DATA.url
            ? "この市区町村の事例は、不動産情報ライブラリのデータにありません。"
            : "国土交通省「不動産情報ライブラリ」の取引価格・成約価格を出す準備ができています（APIキーの登録待ち）。下の公的な価格の事例も目安になります。"}
        </p>
      </div>
    );
  if (d.status !== "ok")
    return (
      <p className="mt-[8px] rounded-[7px] bg-[#f7f9fd] px-[9px] py-[10px]" style={{ fontSize: 7, color: "#8a95a6" }}>
        {d.status === "loading" ? "取引事例を読んでいます…" : "取引事例を読み込めませんでした。"}
      </p>
    );
  const base = scope === "town" && d.town.length ? d.town : d.all;
  const list = base.filter((r) => kind === "all" || dealKind(r.t) === kind);
  const sum = dealSummary(base);
  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick} className="shrink-0 rounded-[6px] border px-[9px] leading-none" style={{ height: 20.9, fontSize: 6.85, background: on ? NAVY : "#fff", borderColor: on ? NAVY : "#e3e8ef", color: on ? "#fff" : "#26324a", fontWeight: on ? 700 : 500 }}>
      {label}
    </button>
  );
  return (
    <section className="mt-[8px]">
      <div className="-mr-[8px] flex gap-[6px] overflow-x-auto pb-[1px] pr-[8px] [scrollbar-width:none]">
        {KIND_FILTERS.map((k) => chip(k === "all" ? "すべて" : DEAL_KIND_LABEL[k], kind === k, () => setKind(k)))}
        {d.town.length > 0 && chip(scope === "town" ? `${town.replace(/[0-9一二三四五六七八九十]+丁目$/, "")}の事例` : `${d.city}全体`, false, () => setScope((v) => (v === "town" ? "city" : "town")))}
      </div>
      <div className="mt-[7px] grid grid-cols-3 gap-[7.3px]">
        <Tile bg="#edf5fd" icon={<BarsFill size={15.5} color="#1f5fd1" />} label="取引事例の件数" value={`${base.length}件`} note={`（${scope === "town" && d.town.length ? "同じ町" : d.city}・直近2年）`} />
        <Tile
          bg="#fbe7f0"
          icon={
            <span className="flex items-center justify-center rounded-full bg-[#cd3279]" style={{ width: 15.9, height: 15.9 }}>
              <JapaneseYen size={9.5} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
            </span>
          }
          label="土地の単価（中央値）"
          value={sum.land ? yen(sum.land) : "―"}
          unit={sum.land ? "円/㎡" : undefined}
          note={sum.land ? `（坪単価 約${yen(sum.land * TSUBO_M2)}円）` : "（土地の事例なし）"}
        />
        <Tile bg="#edf6f1" icon={<GrowthChart size={15.5} color="#12a36a" />} label="マンションの単価" value={sum.mansion ? yen(sum.mansion) : "―"} unit={sum.mansion ? "円/㎡" : undefined} note="（専有面積あたり・中央値）" />
      </div>
      <div className="mt-[6px] space-y-[3px]">
        {list.length === 0 && (
          <p className="rounded-[7px] bg-[#f7f9fd] px-[9px] py-[10px]" style={{ fontSize: 7, color: "#8a95a6" }}>
            条件に合う事例がありません。
          </p>
        )}
        {list.slice(0, 15).map((r, i) => (
          <TxRow key={`${r.pe}|${r.d}|${r.p}|${i}`} r={r} />
        ))}
      </div>
      <p className="mt-[4px] leading-[1.5]" style={{ fontSize: 5.6, color: "#8a95a6" }}>
        {DEALS_CREDIT}（{DEALS_DATA.periods}）。{DEALS_NOTE}。事例の場所は町（地区）までです。
      </p>
    </section>
  );
}

function TxRow({ r }: { r: DealRecord }) {
  const k = dealKind(r.t);
  const Icon = KIND_ICON[k];
  const unit = unitPrice(r);
  const sale = r.k === "成約";
  return (
    <div className="flex w-full items-stretch gap-[0.5px]">
      <span className="flex shrink-0 flex-col items-center justify-center rounded-[5px] bg-[#eef3f9]" style={{ width: 73.7, minHeight: 52 }}>
        <Icon size={18} strokeWidth={1.5} absoluteStrokeWidth color="#1c3a6a" />
        <span className="mt-[4px] leading-none" style={{ fontSize: 6, color: SUB }}>
          {DEAL_KIND_LABEL[k]}
        </span>
      </span>
      <span className="ml-[0.5px] flex min-w-0 flex-1 rounded-[7px] border border-[#edf1f6] bg-white">
        <span className="min-w-0 flex-1 px-[8px] py-[5px]" style={{ maxWidth: 136 }}>
          <span className="flex items-center gap-[4px]">
            <span className="flex shrink-0 items-center justify-center rounded-[4px] px-[4px] font-bold leading-none" style={{ height: 15, fontSize: 6.6, background: sale ? "#cfe4fd" : "#fad1e1", color: sale ? "#1f5fd1" : "#c1246c" }}>
              {sale ? "成約" : "取引"}
            </span>
            <span className="truncate leading-none" style={{ fontSize: 6.2, color: SUB }}>
              {r.t}
            </span>
          </span>
          <span className="mt-[4px] block truncate font-bold leading-none" style={{ fontSize: 7.4, color: INK2 }}>
            {(r.m ?? "") + (r.d ?? "")}
          </span>
          <span className="mt-[4px] flex items-center gap-[3px] leading-none" style={{ fontSize: 6.3, color: SUB }}>
            <CircleDot size={5.6} strokeWidth={1} absoluteStrokeWidth color={SUB} />
            {r.pe ?? "時期不明"}
            {r.by ? `・${r.by}築` : ""}
          </span>
          {(r.rc || r.br) && (
            <span className="mt-[3px] flex items-center gap-[3px] truncate leading-none" style={{ fontSize: 6.3, color: SUB }}>
              <CircleDot size={5.6} strokeWidth={1} absoluteStrokeWidth color={SUB} />
              前面道路 {[r.dir, r.rc, r.br ? `${r.br}m` : ""].filter(Boolean).join("・")}
            </span>
          )}
        </span>
        <span className="my-[5px] w-[0.6px] shrink-0 bg-[#e8edf3]" />
        <span className="flex min-w-0 flex-1 items-center pl-[8px] pr-[6px]">
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-[5px] leading-none">
              <span style={{ fontSize: 6.3, color: SUB }}>{k === "mansion" ? "専有" : "面積"}</span>
              <span className="font-latin truncate" style={{ fontSize: 6.6, color: INK2 }}>
                {r.a ? `${r.a.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}㎡（${(r.a / TSUBO_M2).toFixed(2)}坪）` : (r.as ?? "―")}
                {r.fp ? `・${r.fp}` : ""}
              </span>
            </span>
            <span className="mt-[4px] flex items-baseline gap-[5px] leading-none">
              <span style={{ fontSize: 6.3, color: SUB }}>{sale ? "成約" : "価格"}</span>
              <span className="font-latin whitespace-nowrap font-bold" style={{ fontSize: 10.5, color: INK2 }}>
                {totalText(r.p)}
              </span>
            </span>
            <span className="mt-[4px] block truncate leading-none" style={{ fontSize: 6.3, color: SUB }}>
              {unit ? `単価 ${yen(unit)}円/㎡（坪 約${yen(unit * TSUBO_M2)}円）` : r.fa ? `延床 ${r.fa.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}㎡` : ""}
            </span>
          </span>
        </span>
      </span>
    </div>
  );
}
