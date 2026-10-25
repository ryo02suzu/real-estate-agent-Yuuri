"use client";

// 「相場」タブ：近くの地価公示・地価調査から土地の相場の目安（最寄りの地点の価格・前年比・周辺の平均と幅・価格の推移）、
// 図面上の面積から出した土地の概算、路線価の地図、取引事例への入口。どれも物件そのものの価格・査定ではない（「目安」と書く）。1画面に収める
import { Map as MapIcon } from "lucide-react";
import { useState } from "react";
import { parcelAreaM2, TSUBO_M2 } from "@/lib/app/area";
import { asOfText, changeText, distanceText, kindText, type LandPriceHit } from "@/lib/roadmap/land-price";
import { CARD, Ghost, LIGHT, manYen, Note, Stat, TEXT, yen } from "./r-ui";
import type { TabProps } from "./types";
import { NAVY } from "./ui";


/** 「3.02億円」「12.4億円」「8,500万円」 */
export function okuText(v: number): string {
  if (v >= 1e9) return `${(Math.round(v / 1e7) / 10).toFixed(1)}億円`;
  if (v >= 1e8) return `${(Math.round(v / 1e6) / 100).toFixed(2)}億円`;
  return `${Math.round(v / 1e4).toLocaleString("ja-JP")}万円`;
}

export function PriceTab({ data, expand }: TabProps) {
  const { landPrice, parcels } = data;
  const hits = landPrice.status === "ok" ? landPrice.hits : [];
  const top = hits[0];
  const near = hits.filter((h) => h.distance <= 2000);
  const avg = near.length ? near.reduce((s, h) => s + h.price, 0) / near.length : undefined;
  // 用途（住宅地・商業地）が同じ、2km 以内の近い6地点の幅
  const same = near.filter((h) => h.usage === top?.usage).slice(0, 6);
  const prices = same.map((h) => h.price);
  const parcel = parcels.status === "ok" ? parcels.parcel : undefined;
  // 住所で調べたときの筆は、物件の土地と合っているか分からないので計算しない（地番で調べるか、地図で選んだ地点だけ）
  const own = parcels.status === "ok" && parcels.kind !== "address";
  const area = own && parcel && /^\d/.test(parcel.chibanRaw) ? parcelAreaM2(parcel) : undefined;

  if (!top)
    return (
      <div className={`px-[16px] py-[18px] leading-[1.6] ${CARD}`} style={{ fontSize: 14, color: LIGHT }}>
        {landPrice.status === "loading" ? "地価公示・地価調査の地点を確認しています…" : landPrice.status === "error" ? "地価のデータを読み込めませんでした。時間をおいて調べ直してください。" : "4km以内に地価公示・地価調査の地点がありません。"}
      </div>
    );

  return (
    <div>
      {/* 最寄りの地点の価格 */}
      <div className={`px-[14px] pb-[10px] pt-[10px] ${CARD}`}>
        <p className="flex items-center justify-between leading-none" style={{ fontSize: 12, color: LIGHT }}>
          <span className="truncate">
            土地の参考価格（{kindText(top.kind)}・{top.usage}）
          </span>
          <span className="shrink-0 rounded-full bg-[#fbe7f0] px-[8px] py-[5px] font-bold" style={{ fontSize: 11.5, color: "#c1246c" }}>
            前年比 {changeText(top.change)}
          </span>
        </p>
        <p className="mt-[8px] leading-none" style={{ color: TEXT }}>
          <b className="font-bold" style={{ fontSize: 28 }}>
            {yen(top.price)}
          </b>
          <span className="ml-[3px] font-semibold" style={{ fontSize: 14 }}>
            円/㎡
          </span>
          <span className="ml-[10px]" style={{ fontSize: 13, color: LIGHT }}>
            坪 約{manYen(top.price * TSUBO_M2)}
          </span>
        </p>
        <div className="mt-[8px] flex items-center justify-between gap-[8px]">
          <p className="min-w-0 truncate leading-[1.4]" style={{ fontSize: 12, color: LIGHT }}>
            {top.bearing}へ{distanceText(top.distance)}・{asOfText(top)}
            {top.address && `・${top.address}`}
          </p>
          <Ghost onClick={() => expand({ landPrice: top.point })} icon={<MapIcon size={15} strokeWidth={1.8} absoluteStrokeWidth />} className="h-[34px] shrink-0 px-[12px]">
            地図
          </Ghost>
        </div>
      </div>

      {/* 周辺の平均・幅・地点数 */}
      <div className="mt-[8px] grid grid-cols-3 gap-[8px]">
        <Stat label="周辺の平均" value={avg ? `${man(avg)}万` : "―"} unit={avg ? "円/㎡" : undefined} note={`半径2km・${near.length}地点`} />
        <Stat label="周辺の幅" value={prices.length > 1 ? `${man(Math.min(...prices))}〜${man(Math.max(...prices))}万` : "―"} note={prices.length > 1 ? `${top.usage}・近い${prices.length}地点` : "比べる地点なし"} small />
        <Stat label="土地の概算" value={area ? `約${okuText(area * top.price)}` : "―"} note={area ? `${area.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}㎡ × 単価` : parcels.status === "loading" ? "筆を確認中…" : "地番か地図で調べると出ます"} />
      </div>

      {/* 価格の推移 */}
      <div className={`mt-[8px] px-[14px] pb-[4px] pt-[8px] ${CARD}`}>
        <History hit={top} />
      </div>

      {/* 路線価・一覧 */}
      {landPrice.status === "ok" && landPrice.rosenka.length > 0 && (
        <div className="mt-[8px] flex gap-[8px]">
          {landPrice.rosenka.slice(0, 2).map((l) => (
            <Ghost key={l.kind} href={l.url} className="min-w-0 flex-1 px-[8px]">
              <span className="truncate">{l.name.replace(/等（.*$/, "").replace(/（.*$/, "")}</span>
            </Ghost>
          ))}
        </div>
      )}
      <Note className="mt-[8px]">出典：国土数値情報（地価公示・地価調査）。地域の標準的な土地の価格で、物件そのものの価格・査定ではありません。</Note>
    </div>
  );
}

/** 「12.1万」「8,500」 */
function short(v: number): string {
  return v >= 10_000 ? `${(Math.round(v / 1000) / 10).toLocaleString("ja-JP")}万` : yen(v);
}

/** 万円の数だけ（10万以上は整数、それ未満は小数1桁）：「314」「1640」「0.9」 */
function man(v: number): string {
  return v >= 100_000 ? String(Math.round(v / 10_000)) : (v / 10_000).toFixed(1);
}

const CW = 330;
const CH = 78;
const PAD = { l: 38, r: 46, t: 9, b: 16 };

/** 価格の推移（1つの地点の年ごとの価格の折れ線）。押した年の価格を出す */
function History({ hit }: { hit: LandPriceHit }) {
  const pts = hit.history.filter((h) => h.price > 0);
  const [sel, setSel] = useState<number | null>(null);
  if (pts.length < 2)
    return (
      <p className="leading-[1.5]" style={{ fontSize: 13, color: LIGHT }}>
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
  const areaPath = `${line}L${x(y1).toFixed(1)},${CH - PAD.b}L${x(y0).toFixed(1)},${CH - PAD.b}Z`;
  const last = pts[pts.length - 1];
  const first = pts[0];
  const s = sel !== null ? pts[sel] : null;
  const rate = (last.price / first.price - 1) * 100;
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * CW;
    let best = 0;
    pts.forEach((p, i) => Math.abs(x(p.year) - vx) < Math.abs(x(pts[best].year) - vx) && (best = i));
    setSel(best);
  };
  return (
    <div>
      <p className="flex items-baseline justify-between leading-none">
        <span className="font-semibold" style={{ fontSize: 13, color: TEXT }}>
          価格の推移
          <span className="ml-[6px] font-normal" style={{ fontSize: 12, color: LIGHT }}>
            {first.year}年→{last.year}年
          </span>
        </span>
        <span className="font-bold" style={{ fontSize: 13, color: rate >= 0 ? "#c1246c" : "#1f5fbf" }}>
          {rate >= 0 ? "+" : ""}
          {rate.toFixed(1)}%
        </span>
      </p>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="mt-[4px] block w-full touch-none select-none" role="img" aria-label={`価格の推移：${pts.map((p) => `${p.year}年 ${yen(p.price)}円`).join("、")}`} onPointerDown={(e) => pick(e.clientX, e.currentTarget)} onPointerMove={(e) => e.buttons && pick(e.clientX, e.currentTarget)}>
        {[hi, lo].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={CW - PAD.r} y1={y(v)} y2={y(v)} stroke="#e6ebf2" strokeWidth={1} />
            <text x={PAD.l - 5} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="#8a95a6">
              {short(v)}
            </text>
          </g>
        ))}
        <path d={areaPath} fill={NAVY} opacity={0.08} />
        <path d={line} fill="none" stroke={NAVY} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.year)} cy={y(last.price)} r={4.2} fill={NAVY} stroke="#fff" strokeWidth={2} />
        <text x={x(last.year) + 7} y={y(last.price) + 3.5} fontSize={10.5} fontWeight={700} fill="#1c2740">
          {short(last.price)}
        </text>
        {s && (
          <g>
            <line x1={x(s.year)} x2={x(s.year)} y1={PAD.t - 2} y2={CH - PAD.b} stroke="#9fb0c8" strokeWidth={1} />
            <circle cx={x(s.year)} cy={y(s.price)} r={4} fill="#fff" stroke={NAVY} strokeWidth={2} />
            <g transform={`translate(${Math.min(Math.max(x(s.year) - 46, 2), CW - 94)},${Math.max(y(s.price) - 26, 0)})`}>
              <rect width={92} height={19} rx={5} fill="#1c2740" opacity={0.92} />
              <text x={46} y={13} textAnchor="middle" fontSize={10.5} fill="#fff">
                {s.year}年 {yen(s.price)}円
              </text>
            </g>
          </g>
        )}
        {[first.year, last.year].map((yr) => (
          <text key={yr} x={x(yr)} y={CH - 4} textAnchor="middle" fontSize={10} fill="#8a95a6">
            {yr}
          </text>
        ))}
      </svg>
    </div>
  );
}
