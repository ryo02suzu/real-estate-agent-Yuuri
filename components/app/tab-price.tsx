"use client";

// 「相場・取引」タブ（新しく作った画面。ほかのタブと同じ見た目）：近くの地価公示・地価調査から、土地の相場の目安
// （最寄りの地点の価格・前年比・周辺の平均・価格の推移）、図面上の面積から出した土地の概算、路線価の地図、
// 取引価格（成約価格）の準備状況。どれも物件そのものの価格・査定ではない（画面に「目安」と書く）
import { ChevronRight, ExternalLink, JapaneseYen, Map as MapIcon, TrendingUp } from "lucide-react";
import { useState } from "react";
import { parcelAreaM2, TSUBO_M2 } from "@/lib/app/area";
import { asOfText, changeText, distanceText, kindText, type LandPriceHit } from "@/lib/roadmap/land-price";
import { DEALS_DATA, DEALS_NOTE, dealSummary } from "@/lib/roadmap/deals";
import { ROSENKA_CHECK } from "@/lib/roadmap/rosenka";
import { BarsFill, CoinStack, GrowthChart } from "./icons";
import type { TabProps } from "./types";
import { INK2, NAVY, SUB } from "./ui";

const yen = (v: number) => Math.round(v).toLocaleString("ja-JP");
const tsubo = (perM2: number) => yen(perM2 * TSUBO_M2);

/** 「3.02億円」「12.4億円」「8,500万円」 */
export function okuText(v: number): string {
  if (v >= 1e9) return `${(Math.round(v / 1e7) / 10).toFixed(1)}億円`;
  if (v >= 1e8) return `${(Math.round(v / 1e6) / 100).toFixed(2)}億円`;
  return `${Math.round(v / 1e4).toLocaleString("ja-JP")}万円`;
}

export function PriceTab({ result, data, go, expand }: TabProps) {
  const { landPrice, parcels } = data;
  const hits = landPrice.status === "ok" ? landPrice.hits : [];
  const top = hits[0];
  const near = hits.filter((h) => h.distance <= 2000);
  const avg = near.length ? near.reduce((s, h) => s + h.price, 0) / near.length : undefined;
  const parcel = parcels.status === "ok" ? parcels.parcel : undefined;
  // 住所で調べたときの筆は、物件の土地と合っているか分からないので計算しない（地番で調べるか、地図で選んだ地点だけ）
  const own = parcels.status === "ok" && parcels.kind !== "address";
  const area = own && parcel && /^\d/.test(parcel.chibanRaw) ? parcelAreaM2(parcel) : undefined;

  return (
    <div className="mt-[9px] pl-[9.2px] pr-[8.6px]">
      <h3 className="font-bold leading-none" style={{ fontSize: 11.2, color: INK2 }}>
        土地の相場
      </h3>
      <p className="mt-[5px] leading-[1.45]" style={{ fontSize: 7.4, color: SUB }}>
        近くの地価公示・地価調査（国の公的な価格）から、相場の目安を確認できます。
      </p>

      {landPrice.status === "loading" && <Msg>地価公示・地価調査の地点を確認しています…</Msg>}
      {landPrice.status === "error" && <Msg>地価のデータを読み込めませんでした。時間をおいて調べ直してください。</Msg>}
      {landPrice.status === "ok" && !top && <Msg>4km以内に地価公示・地価調査の地点がありません。</Msg>}

      {top && (
        <>
          {/* 3つの数字 */}
          <div className="mt-[8px] grid grid-cols-3 gap-[7.3px]">
            <Stat bg="#edf5fd" icon={<CoinStack size={15.5} color="#1c3a6a" />} label="最寄りの地点" value={yen(top.price)} unit="円/㎡" note={`（坪 約${tsubo(top.price)}円）`} />
            <Stat
              bg="#fbe7f0"
              icon={
                <span className="flex items-center justify-center rounded-full bg-[#cd3279]" style={{ width: 15.9, height: 15.9 }}>
                  <TrendingUp size={9.5} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
                </span>
              }
              label="前年比"
              value={changeText(top.change)}
              note={`（${top.year}年・${kindText(top.kind)}）`}
            />
            <Stat bg="#edf6f1" icon={<GrowthChart size={15.5} color="#12a36a" />} label={`周辺の平均（${near.length}地点）`} value={avg ? yen(avg) : "―"} unit={avg ? "円/㎡" : undefined} note="（半径2km以内）" />
          </div>

          {/* 最寄りの地点と価格の推移 */}
          <section className="mt-[7px] rounded-[8px] border border-[#e9eef4] bg-white px-[9px] pb-[8px] pt-[8px]">
            <div className="flex items-start">
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-[1.3]" style={{ fontSize: 8.2, color: "#1c2740" }}>
                  {kindText(top.kind)} {top.no}（{top.usage}）
                </p>
                <p className="mt-[2.5px] leading-[1.35]" style={{ fontSize: 6.5, color: SUB }}>
                  物件から{top.bearing}へ{distanceText(top.distance)}・{asOfText(top)}
                  {top.address && `・${top.address}`}
                </p>
              </div>
              <button onClick={() => expand({ landPrice: top.point })} className="ml-[6px] flex shrink-0 items-center gap-[3px] rounded-full border border-[#cfd8e4] px-[7px] py-[4px] font-semibold leading-none active:bg-[#f2f5f9]" style={{ fontSize: 6.6, color: NAVY }}>
                <MapIcon size={8.5} strokeWidth={1.5} absoluteStrokeWidth />
                地図
              </button>
            </div>
            <History hit={top} />
          </section>

          {/* 土地の概算（図面上の面積 × 最寄りの地点の価格） */}
          <section className="mt-[7px] rounded-[8px] bg-[#f1f6fc] px-[9px] pb-[8px] pt-[8px]">
            <p className="flex items-center gap-[5px] font-bold leading-none" style={{ fontSize: 8.2, color: "#1c2740" }}>
              <JapaneseYen size={11} strokeWidth={1.8} absoluteStrokeWidth color={NAVY} />
              土地の概算
              <span className="font-normal" style={{ fontSize: 6, color: "#7d8aa0" }}>
                公示地価から計算した目安
              </span>
            </p>
            {area ? (
              <>
                <p className="mt-[6px] font-latin font-bold leading-none" style={{ fontSize: 15, color: "#0f1623" }}>
                  約{okuText(area * top.price)}
                </p>
                <p className="mt-[4px] leading-[1.45]" style={{ fontSize: 6.6, color: SUB }}>
                  図面上の面積 約{area.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}㎡ × {yen(top.price)}円/㎡。形・接道・個別の事情で大きく変わります。査定価格ではありません。
                </p>
              </>
            ) : (
              <p className="mt-[5px] leading-[1.45]" style={{ fontSize: 6.8, color: SUB }}>
                {parcels.status === "loading"
                  ? "筆の形を確認しています…"
                  : parcels.status === "ok" && parcels.kind === "address"
                    ? "住所で調べたときは、地図の筆が物件の土地と合っているか分からないため計算しません。地番で調べるか、地図で物件の場所を選ぶと「図面上の面積 × 単価」で目安を出します。"
                    : "この地点の筆の面積が分からないため計算できません。"}
              </p>
            )}
          </section>
        </>
      )}

      {/* 路線価 */}
      {landPrice.status === "ok" && landPrice.rosenka.length > 0 && (
        <section className="mt-[7px] rounded-[8px] border border-[#e9eef4] bg-white px-[9px] pb-[8px] pt-[8px]">
          <p className="flex items-center gap-[5px] font-bold leading-none" style={{ fontSize: 8.2, color: "#1c2740" }}>
            <BarsFill size={11} color="#1f5fd1" />
            路線価を地図で見る
          </p>
          <div className="mt-[6px] grid grid-cols-2 gap-[5px]">
            {landPrice.rosenka.map((l) => (
              <a key={l.kind} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-[5px] rounded-[7px] border border-[#cfd8e4] px-[7px] py-[6px] active:bg-[#f2f5f9]">
                <span className="min-w-0 flex-1 font-semibold leading-[1.3]" style={{ fontSize: 6.9, color: NAVY }}>
                  {l.name.replace(/等（/, "（")}
                </span>
                <ExternalLink size={8} strokeWidth={1.5} absoluteStrokeWidth color={NAVY} className="shrink-0" />
              </a>
            ))}
          </div>
          <p className="mt-[4px] leading-[1.45]" style={{ fontSize: 6, color: "#8a95a6" }}>
            全国地価マップ（資産評価システム研究センター）で開きます。{ROSENKA_CHECK}。
          </p>
        </section>
      )}

      {/* 取引価格・成約価格（不動産情報ライブラリ） */}
      <DealsCard data={data} go={go} town={result.town} />

      <button onClick={() => go("deals")} className="mt-[7px] flex w-full items-center rounded-[8px] bg-[#f1f6fc] px-[11px] text-left active:bg-[#e6eefa]" style={{ height: 36 }}>
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-none" style={{ fontSize: 8.6, color: "#111827" }}>
            周辺の価格事例を一覧で見る
          </span>
          <span className="mt-[4px] block leading-none" style={{ fontSize: 6.8, color: "#5f6d84" }}>
            近くの地価公示・地価調査の地点（{hits.length}地点）
          </span>
        </span>
        <ChevronRight size={10} strokeWidth={1.5} absoluteStrokeWidth color="#1a2f5a" />
      </button>
      <p className="mt-[4px] leading-[1.5]" style={{ fontSize: 5.6, color: "#8a95a6" }}>
        出典：「国土数値情報（地価公示データ・都道府県地価調査データ）」（国土交通省）を加工して作成。標準地・基準地は、その地域の標準的な土地の価格で、物件そのものの価格ではありません。
      </p>
    </div>
  );
}

function Msg({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-[8px] rounded-[8px] bg-[#f7f9fd] px-[9px] py-[10px] leading-[1.5]" style={{ fontSize: 7, color: "#8a95a6" }}>
      {children}
    </p>
  );
}

export function Stat({ bg, icon, label, value, unit, note }: { bg: string; icon: React.ReactNode; label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-[7px] px-[8px] pb-[7px] pt-[7.5px]" style={{ background: bg, minHeight: 55.1 }}>
      <div className="flex items-center gap-[6px]">
        <span className="flex w-[16px] shrink-0 justify-center">{icon}</span>
        <span className="min-w-0 truncate leading-none" style={{ fontSize: 6.6, color: "#3f4a5f" }}>
          {label}
        </span>
      </div>
      <p className="font-latin mt-[6px] whitespace-nowrap font-bold leading-none" style={{ fontSize: 10.6, color: INK2 }}>
        {value}
        {unit && (
          <span className="font-semibold" style={{ fontSize: 7, marginLeft: 2.4 }}>
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

const CW = 340;
const CH = 74;
const PAD = { l: 34, r: 40, t: 8, b: 14 };

/** 価格の推移（1つの地点の年ごとの価格の折れ線）。押した年の価格を出す */
function History({ hit }: { hit: LandPriceHit }) {
  const pts = hit.history.filter((h) => h.price > 0);
  const [sel, setSel] = useState<number | null>(null);
  if (pts.length < 2)
    return (
      <p className="mt-[6px] leading-[1.45]" style={{ fontSize: 6.6, color: "#8a95a6" }}>
        価格の推移は、この地点のデータにありません。
      </p>
    );
  const years = pts.map((p) => p.year);
  const prices = pts.map((p) => p.price);
  const y0 = Math.min(...years);
  const y1 = Math.max(...years);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || hi * 0.1 || 1;
  const x = (yr: number) => PAD.l + ((yr - y0) / (y1 - y0 || 1)) * (CW - PAD.l - PAD.r);
  const y = (p: number) => PAD.t + (1 - (p - (lo - span * 0.12)) / (span * 1.24)) * (CH - PAD.t - PAD.b);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)},${y(p.price).toFixed(1)}`).join("");
  const area = `${line}L${x(y1).toFixed(1)},${CH - PAD.b}L${x(y0).toFixed(1)},${CH - PAD.b}Z`;
  const last = pts[pts.length - 1];
  const first = pts[0];
  const s = sel !== null ? pts[sel] : null;
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * CW;
    let best = 0;
    pts.forEach((p, i) => Math.abs(x(p.year) - vx) < Math.abs(x(pts[best].year) - vx) && (best = i));
    setSel(best);
  };
  const short = (v: number) => (v >= 10_000 ? `${(Math.round(v / 1000) / 10).toLocaleString("ja-JP")}万` : yen(v));
  return (
    <div className="mt-[6px]">
      <p className="leading-none" style={{ fontSize: 6.6, color: "#3f4a5f" }}>
        価格の推移（円/㎡）{first.year}年 → {last.year}年 {((last.price / first.price - 1) * 100 >= 0 ? "+" : "") + ((last.price / first.price - 1) * 100).toFixed(1)}%
      </p>
      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        className="mt-[3px] block w-full touch-none select-none"
        role="img"
        aria-label={`価格の推移：${pts.map((p) => `${p.year}年 ${yen(p.price)}円`).join("、")}`}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerMove={(e) => e.buttons && pick(e.clientX, e.currentTarget)}
      >
        {/* 目盛り（最高と最低）。横線は細く薄く */}
        {[hi, lo].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={CW - PAD.r} y1={y(v)} y2={y(v)} stroke="#e6ebf2" strokeWidth={0.8} />
            <text x={PAD.l - 4} y={y(v) + 2.4} textAnchor="end" fontSize={6.4} fill="#8a95a6">
              {short(v)}
            </text>
          </g>
        ))}
        <path d={area} fill={NAVY} opacity={0.08} />
        <path d={line} fill="none" stroke={NAVY} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        {/* 最新の年は点と値 */}
        <circle cx={x(last.year)} cy={y(last.price)} r={3.6} fill={NAVY} stroke="#fff" strokeWidth={1.6} />
        <text x={x(last.year) + 6} y={y(last.price) + 2.4} fontSize={6.8} fontWeight={700} fill="#1c2740">
          {short(last.price)}
        </text>
        {s && (
          <g>
            <line x1={x(s.year)} x2={x(s.year)} y1={PAD.t - 2} y2={CH - PAD.b} stroke="#9fb0c8" strokeWidth={0.8} />
            <circle cx={x(s.year)} cy={y(s.price)} r={3.4} fill="#fff" stroke={NAVY} strokeWidth={1.6} />
            <g transform={`translate(${Math.min(Math.max(x(s.year) - 34, 2), CW - 70)},${Math.max(y(s.price) - 22, 0)})`}>
              <rect width={68} height={15} rx={4} fill="#1c2740" opacity={0.92} />
              <text x={34} y={10} textAnchor="middle" fontSize={6.6} fill="#fff">
                {s.year}年 {yen(s.price)}円
              </text>
            </g>
          </g>
        )}
        {[first.year, last.year].map((yr) => (
          <text key={yr} x={x(yr)} y={CH - 3} textAnchor="middle" fontSize={6.4} fill="#8a95a6">
            {yr}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** 周辺の取引価格（同じ町の事例の単価の中央値）。データがまだ無ければ準備中と、不動産情報ライブラリへの入口 */
function DealsCard({ data, go, town }: { data: TabProps["data"]; go: TabProps["go"]; town: string }) {
  const d = data.deals;
  const ok = d.status === "ok" ? d : undefined;
  const base = ok ? (ok.town.length ? ok.town : ok.all) : [];
  const sum = dealSummary(base);
  const where = ok ? (ok.town.length ? town.replace(/[0-9一二三四五六七八九十]+丁目$/, "") : ok.city) : "";
  return (
    <section className="mt-[7px] rounded-[8px] bg-[#eef8f2] px-[9px] pb-[8px] pt-[8px]">
      <div className="flex items-center gap-[5px]">
        <GrowthChart size={13} color="#12b076" />
        <p className="min-w-0 flex-1 font-bold leading-none" style={{ fontSize: 8.2, color: "#1c2740" }}>
          周辺の取引価格（取引・成約）
        </p>
        {!ok && (
          <span className="rounded-full bg-[#fff3c4] px-[6px] py-[3px] font-bold leading-none" style={{ fontSize: 6.4, color: "#5c4a00" }}>
            {d.status === "loading" ? "確認中" : DEALS_DATA.url ? "データなし" : "準備中"}
          </span>
        )}
      </div>
      {ok ? (
        <>
          <div className="mt-[6px] grid grid-cols-3 gap-[6px]">
            {[
              ["事例の件数", `${base.length}件`, `${where}・直近2年`],
              ["土地の単価", sum.land ? `${yen(sum.land)}円/㎡` : "―", sum.land ? `坪 約${tsubo(sum.land)}円` : "土地の事例なし"],
              ["マンションの単価", sum.mansion ? `${yen(sum.mansion)}円/㎡` : "―", "専有面積あたり"],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-[6px] bg-white px-[6px] py-[6px]">
                <p className="leading-none" style={{ fontSize: 6.2, color: "#3f4a5f" }}>
                  {label}
                </p>
                <p className="font-latin mt-[4px] whitespace-nowrap font-bold leading-none" style={{ fontSize: 8.6, color: INK2 }}>
                  {value}
                </p>
                <p className="mt-[3.5px] truncate leading-none" style={{ fontSize: 5.9, color: SUB }}>
                  {note}
                </p>
              </div>
            ))}
          </div>
          <button onClick={() => go("deals")} className="mt-[6px] inline-flex items-center gap-[4px] rounded-full px-[10px] py-[5.5px] font-bold leading-none text-white" style={{ fontSize: 7, background: NAVY }}>
            取引事例を一覧で見る
            <ChevronRight size={8} strokeWidth={1.6} absoluteStrokeWidth />
          </button>
          <p className="mt-[4px] leading-[1.45]" style={{ fontSize: 5.6, color: "#8a95a6" }}>
            単価は中央値。国土交通省「不動産情報ライブラリ」（{DEALS_DATA.periods}）。{DEALS_NOTE}。
          </p>
        </>
      ) : (
        <>
          <p className="mt-[5px] leading-[1.5]" style={{ fontSize: 6.7, color: SUB }}>
            {DEALS_DATA.url
              ? "この市区町村の取引事例は、不動産情報ライブラリのデータにありません。"
              : "国土交通省「不動産情報ライブラリ」の取引価格・成約価格を、この画面と「取引事例」に出す準備ができています（APIキーの登録待ち）。それまでは、不動産情報ライブラリで地域を選んで確認できます。"}
          </p>
          <a href="https://www.reinfolib.mlit.go.jp/realEstatePrices/" target="_blank" rel="noreferrer" className="mt-[6px] inline-flex items-center gap-[4px] rounded-full px-[10px] py-[5.5px] font-bold leading-none text-white" style={{ fontSize: 7, background: NAVY }}>
            不動産情報ライブラリで見る
            <ChevronRight size={8} strokeWidth={1.6} absoluteStrokeWidth />
          </a>
        </>
      )}
    </section>
  );
}
