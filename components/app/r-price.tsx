"use client";

// 「相場」タブ（すりガラスのシートの中。街の模型では、いちばん近い地価の地点へ光の道を流し、近くの地点に価格の高さの柱を立てる）：
// 近くの地価公示・地価調査から土地の相場の目安（最寄りの地点の価格・前年比・周辺の平均と幅・価格の推移の線）、図面上の面積から出した
// 土地の概算、路線価の地図、その下に取引事例（components/app/r-deals.tsx。前の版の「取引」タブ）。
// どれも物件そのものの価格・査定ではない（「目安」と書く）
import { Map as MapIcon } from "lucide-react";
import { useState } from "react";
import { parcelAreaM2, TSUBO_M2 } from "@/lib/app/area";
import { refLandPoint, usageForZone } from "@/lib/app/ratio-hint";
import { asOfText, changeText, distanceText, kindText, type LandPriceHit } from "@/lib/roadmap/land-price";
import { G, GBadge, GNote, GPill, GStat, NUM, TILE, TILE_GOLD } from "./g-ui";
import { DealsSection } from "./r-deals";
import { manYen, yen } from "./r-ui";
import type { TabProps } from "./types";

/** 「3.02億円」「12.4億円」「8,500万円」 */
export function okuText(v: number): string {
  if (v >= 1e9) return `${(Math.round(v / 1e7) / 10).toFixed(1)}億円`;
  if (v >= 1e8) return `${(Math.round(v / 1e6) / 100).toFixed(2)}億円`;
  return `${Math.round(v / 1e4).toLocaleString("ja-JP")}万円`;
}

export function PriceTab(props: TabProps) {
  const { data, expand } = props;
  const { landPrice, parcels, zoning } = data;
  const hits = landPrice.status === "ok" ? landPrice.hits : [];
  // 参考の地点は、物件の用途地域に合う用途（住宅地・商業地など）の、いちばん近い地点（無ければいちばん近い地点）
  const youto = zoning.status === "ok" ? zoning.zoning.youto[0]?.name : undefined;
  const { top, matched } = refLandPoint(hits, youto);
  const near = hits.filter((h) => h.distance <= 2000);
  // 平均と幅は、参考の地点と用途（住宅地・商業地など）が同じ 2km 以内の地点だけで出す（商業地と住宅地を混ぜると意味のない値になる）
  const sameAll = near.filter((h) => h.usage === top?.usage);
  const avg = sameAll.length ? sameAll.reduce((s, h) => s + h.price, 0) / sameAll.length : undefined;
  // 幅は近い6地点
  const same = sameAll.slice(0, 6);
  const prices = same.map((h) => h.price);
  const parcel = parcels.status === "ok" ? parcels.parcel : undefined;
  // 住所で調べたときの筆は、物件の土地と合っているか分からないので計算しない（地番で調べるか、地図で選んだ地点だけ）。
  // 公図から推定した筆・市の地番参考図の筆は、形から測った面積が地積と大きく違うことがあるので計算しない
  const own = parcels.status === "ok" && parcels.kind !== "address";
  const rough = !!parcel && !!(parcel.estimated || parcel.sanko);
  const want = usageForZone(youto);
  // 建物が共同住宅（マンション）なら、筆は敷地全体なので掛けない（部屋の価格の目安にならない）
  const condo = data.building.status === "ok" && /共同住宅/.test(data.building.result.hit?.building.usage ?? "");
  // 物件の用途地域と用途が違う地点（近くに同じ用途の地点が無いとき）の単価は、面積に掛けない
  const area = own && parcel && !rough && !condo && /^\d/.test(parcel.chibanRaw) && (matched || !want) ? parcelAreaM2(parcel) : undefined;

  return (
    <div className="flex flex-col gap-[10px]">
      {top ? (
        <>
          {/* 最寄りの地点の価格 */}
          <div className="rounded-[18px] px-[13px] pb-[12px] pt-[12px]" style={TILE_GOLD}>
            <p className="flex items-center justify-between gap-[8px] leading-none">
              <span className="truncate" style={{ fontSize: 12, color: "#ffe2a3", letterSpacing: 0.4 }}>
                土地の参考価格（{kindText(top.kind)}・{top.usage}）
              </span>
              {top.change !== undefined && <GBadge tone="none">前年比 {changeText(top.change)}</GBadge>}
            </p>
            <p className="mt-[10px] leading-none" style={{ color: G.text, ...NUM }}>
              <b className="font-semibold" style={{ fontSize: 32 }}>
                {yen(top.price)}
              </b>
              <span className="ml-[3px] font-medium" style={{ fontSize: 14, color: G.sub }}>
                円/㎡
              </span>
              <span className="ml-[10px]" style={{ fontSize: 13, color: G.sub }}>
                坪 約{manYen(top.price * TSUBO_M2)}
              </span>
            </p>
            <div className="mt-[10px] flex items-center justify-between gap-[8px]">
              <p className="min-w-0 truncate leading-[1.4]" style={{ fontSize: 12, color: G.sub }}>
                {top.bearing}へ{distanceText(top.distance)}・{asOfText(top)}
                {top.address && `・${top.address}`}
              </p>
              <GPill onClick={() => expand({ landPrice: top.point })} icon={<MapIcon size={14} strokeWidth={1.8} absoluteStrokeWidth />} className="h-[32px] px-[11px]">
                地図
              </GPill>
            </div>
          </div>

          {/* 周辺の平均・幅・土地の概算 */}
          <div className="grid grid-cols-3 gap-[8px]">
            <GStat label="周辺の平均" value={avg ? `${man(avg)}万` : "―"} unit={avg ? "円/㎡" : undefined} note={`半径2km・${top.usage}${sameAll.length}地点`} />
            <GStat label="周辺の幅" value={prices.length > 1 ? `${man(Math.min(...prices))}〜${man(Math.max(...prices))}万` : "―"} note={prices.length > 1 ? `${top.usage}・近い${prices.length}地点` : "比べる地点なし"} small />
            <GStat
              label="地価×面積"
              value={area ? `約${okuText(area * top.price)}` : "―"}
              note={area ? `${Math.round(area).toLocaleString("ja-JP")}㎡×上の単価` : parcels.status === "loading" ? "筆を確認中…" : rough ? "推定の筆は対象外" : condo ? "マンションの敷地は対象外" : !matched && want ? `近くに${want}の地点なし` : "地番か地図で調べると出ます"}
              small
            />
          </div>

          {/* 価格の推移 */}
          <div className="rounded-[18px] px-[13px] pb-[6px] pt-[11px]" style={TILE}>
            <History hit={top} />
          </div>

          {/* 路線価 */}
          {landPrice.status === "ok" && landPrice.rosenka.length > 0 && (
            <div className="flex gap-[8px]">
              {landPrice.rosenka.slice(0, 2).map((l) => (
                <GPill key={l.kind} href={l.url} className="min-w-0 flex-1 justify-center">
                  <span className="truncate">{l.name.replace(/等（.*$/, "").replace(/（.*$/, "")}</span>
                </GPill>
              ))}
            </div>
          )}
          <GNote>
            出典：国土数値情報（地価公示・地価調査）。地域の標準的な土地の価格で、物件そのものの価格・査定ではありません。
            {matched ? `物件の用途地域に合う${top.usage}の地点のうち、いちばん近い地点です。` : want ? `2km以内に${want}の地点が無いため、いちばん近い${top.usage}の地点を出しています（用途が違うので、比べるときは注意）。` : ""}
            平均と幅は{top.usage}の地点だけ。
            {area ? "「地価×面積」は、筆の形から測った図面上の面積に上の地点の単価を掛けた目安です（地積は登記で、価格は個別の条件で変わります）。" : ""}
          </GNote>
        </>
      ) : (
        <div className="rounded-[18px] px-[14px] py-[16px] leading-[1.6]" style={{ ...TILE, fontSize: 14, color: G.sub }}>
          {landPrice.status === "loading" ? "地価公示・地価調査の地点を確認しています…" : landPrice.status === "error" ? "地価のデータを読み込めませんでした。時間をおいて調べ直してください。" : "4km以内に地価公示・地価調査の地点がありません。"}
        </div>
      )}

      {/* 取引事例（実際の取引価格・成約価格と、公的な価格の事例） */}
      <DealsSection {...props} />
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
const CH = 92;
const PAD = { l: 38, r: 46, t: 10, b: 16 };

/** 価格の推移（1つの地点の年ごとの価格の折れ線。開いたときに左から描く）。押した年の価格を出す */
function History({ hit }: { hit: LandPriceHit }) {
  const pts = hit.history.filter((h) => h.price > 0);
  const [sel, setSel] = useState<number | null>(null);
  if (pts.length < 2)
    return (
      <p className="pb-[8px] leading-[1.5]" style={{ fontSize: 13, color: G.sub }}>
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
        <span className="font-semibold" style={{ fontSize: 13, color: G.text }}>
          価格の推移
          <span className="ml-[6px] font-normal" style={{ fontSize: 12, color: G.faint }}>
            {first.year}年→{last.year}年
          </span>
        </span>
        <span className="font-semibold" style={{ fontSize: 13, color: rate >= 0 ? G.red : G.blue, ...NUM }}>
          {rate >= 0 ? "+" : ""}
          {rate.toFixed(1)}%
        </span>
      </p>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="mt-[4px] block w-full touch-none select-none overflow-visible" role="img" aria-label={`価格の推移：${pts.map((p) => `${p.year}年 ${yen(p.price)}円`).join("、")}`} onPointerDown={(e) => pick(e.clientX, e.currentTarget)} onPointerMove={(e) => e.buttons && pick(e.clientX, e.currentTarget)}>
        <defs>
          <linearGradient id="pv-spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4c25a" stopOpacity="0.35" />
            <stop offset="1" stopColor="#f4c25a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[hi, lo].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={CW - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            <text x={PAD.l - 5} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.55)">
              {short(v)}
            </text>
          </g>
        ))}
        <path className="pv-spark-area" d={areaPath} fill="url(#pv-spark)" />
        <path className="pv-spark-line" pathLength={1} d={line} fill="none" stroke="#f4c25a" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.year)} cy={y(last.price)} r={4.2} fill="#f4c25a" stroke="rgba(20,24,34,0.9)" strokeWidth={2} />
        <text x={x(last.year) + 7} y={y(last.price) + 3.5} fontSize={10.5} fontWeight={700} fill="#fff">
          {short(last.price)}
        </text>
        {s && (
          <g>
            <line x1={x(s.year)} x2={x(s.year)} y1={PAD.t - 2} y2={CH - PAD.b} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
            <circle cx={x(s.year)} cy={y(s.price)} r={4} fill="#fff" stroke="#f4c25a" strokeWidth={2} />
            <g transform={`translate(${Math.min(Math.max(x(s.year) - 46, 2), CW - 94)},${Math.max(y(s.price) - 26, 0)})`}>
              <rect width={92} height={19} rx={5} fill="rgba(255,255,255,0.94)" />
              <text x={46} y={13} textAnchor="middle" fontSize={10.5} fill="#1b3f73" fontWeight={600}>
                {s.year}年 {yen(s.price)}円
              </text>
            </g>
          </g>
        )}
        {[first.year, last.year].map((yr) => (
          <text key={yr} x={x(yr)} y={CH - 3} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.55)">
            {yr}
          </text>
        ))}
      </svg>
    </div>
  );
}
