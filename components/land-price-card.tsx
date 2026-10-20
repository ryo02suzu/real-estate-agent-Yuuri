"use client";

// 物件の近くの地価公示（標準地）・都道府県地価調査（基準地）。近い順に、価格（円/m²・坪あたり）・前年比・距離と向き・用途を出し、
// 押すと所在・地積・前面道路・最寄り駅・用途地域・価格の推移を開く。地点は国土数値情報（lib/roadmap/land-price.ts）。
// 路線価（相続税・固定資産税）は、全国地価マップを物件の場所で開くリンクを添える（lib/roadmap/rosenka.ts）
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import {
  asOfText,
  changeText,
  distanceText,
  kindText,
  landPriceRows,
  landPriceTitle,
  nearestLandPrices,
  priceText,
  tsuboText,
  LAND_USAGE_COLORS,
  type LandPriceHit,
} from "@/lib/roadmap/land-price";
import { LAND_PRICE_DATA } from "@/lib/roadmap/land-price-data";
import { pmtilesLandPriceSource } from "@/lib/roadmap/land-price-tiles";
import { ROSENKA_CHECK, ROSENKA_NOTE, rosenkaLinks, type RosenkaLink } from "@/lib/roadmap/rosenka";
import { ChevronRightIcon, ExternalIcon, InfoIcon, LandPriceIcon, MapIcon } from "./icons";
import { Sheet } from "./sheet";

export type LandPriceState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; hits: LandPriceHit[]; /** 物件の場所で開く路線価の地図（全国地価マップ） */ rosenka: RosenkaLink[] };

/** 物件の近くの地点（5つまで・4km 以内）。関東の外や近くに地点が無ければ hits が空 */
export function useLandPrices(lat: number, lng: number): LandPriceState {
  const key = `${lat},${lng}`;
  const [state, setState] = useState<{ key: string; value: LandPriceState }>();
  useEffect(() => {
    let alive = true;
    withRetry(() => nearestLandPrices(lat, lng, pmtilesLandPriceSource, { count: 5, maxM: 4000 }))
      .then((hits) => alive && setState({ key, value: { status: "ok", hits, rosenka: rosenkaLinks(lat, lng) } }))
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に地点が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.value : { status: "loading" };
}

/** 前年比の色（上がった・下がった。上がったのは良い悪いではないので、強い色にはしない） */
function changeClass(change?: number) {
  if (change === undefined) return "bg-[#f3f1ed] text-muted";
  return change > 0 ? "bg-[#f8ece6] text-[#8a4f3a]" : change < 0 ? "bg-[#e9f0f6] text-[#3a5f8a]" : "bg-[#f3f1ed] text-ink";
}

/**
 * 一番近い地点の価格・前年比（PC は用途と距離も）の1行。押すとスマホは一覧が下から出る。PC は onOpen（パネルの中の地価のカードまで動かす）を渡す。
 * スマホは行を増やさないよう、災害リスクの行の右に小さく置く（compact：見出しは読み上げだけ）。近くに地点が無ければ出さない
 */
export function LandPriceLine({
  state,
  onOpen,
  onShowMap,
  compact,
}: {
  state: LandPriceState;
  onOpen?: () => void;
  onShowMap?: (point: [number, number]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (state.status === "ok" && state.hits.length === 0) return null;
  const top = state.status === "ok" ? state.hits[0] : undefined;
  return (
    <>
      <button
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        disabled={state.status !== "ok"}
        className={`flex items-center gap-1.5 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-left text-[11px] leading-[1.5] text-ink lg:hover:border-brand-light/60 ${compact ? "shrink-0 gap-1" : "min-w-0 flex-1"}`}
      >
        <LandPriceIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        <span className={compact ? "sr-only" : "shrink-0 text-muted"}>近くの地価</span>
        {state.status === "loading" && <span className="truncate text-muted">{compact ? "地価…" : "確認中…"}</span>}
        {state.status === "error" && <span className="truncate text-muted">{compact ? "地価" : "データを読み込めませんでした"}</span>}
        {top && (
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap">
            {!compact && <span className="h-2 w-2 shrink-0 rounded-full border border-black/10" style={{ background: LAND_USAGE_COLORS[top.usage] }} />}
            <b className="font-semibold">{priceText(top.price)}</b>
            <span className={`shrink-0 rounded px-1 ${changeClass(top.change)}`}>{changeText(top.change)}</span>
            {!compact && (
              <span className="truncate text-muted">
                {top.usage}・{distanceText(top.distance)}
              </span>
            )}
          </span>
        )}
        {state.status === "ok" && <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
      {state.status === "ok" && !onOpen && (
        <Sheet title="近くの地価（参考）" open={open} onClose={() => setOpen(false)}>
          <LandPriceDetail
            hits={state.hits}
            rosenka={state.rosenka}
            onShowMap={
              onShowMap &&
              ((p) => {
                setOpen(false);
                onShowMap(p);
              })
            }
          />
        </Sheet>
      )}
    </>
  );
}

/** 1地点（見出し・価格・前年比・距離。押すと詳しい行） */
function Item({ hit, onShowMap }: { hit: LandPriceHit; onShowMap?: (point: [number, number]) => void }) {
  const rows = landPriceRows(hit);
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full border border-black/10" style={{ background: LAND_USAGE_COLORS[hit.usage] }} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] leading-[1.5] text-muted">
            {landPriceTitle(hit)}・{hit.bearing}へ{distanceText(hit.distance)}
          </p>
          <p className="flex flex-wrap items-baseline gap-x-2 text-ink">
            <b className="text-[16px] font-semibold">{priceText(hit.price)}</b>
            <span className="text-[11.5px] text-muted">{tsuboText(hit.price)}</span>
            <span className={`rounded px-1 text-[11px] ${changeClass(hit.change)}`}>前年比 {changeText(hit.change)}</span>
          </p>
          <p className="text-[10.5px] text-muted">{asOfText(hit)}</p>
          {rows.length > 0 && (
            <details className="mt-1 text-[11.5px]">
              <summary className="cursor-pointer text-brand">所在・前面道路・駅・用途地域など</summary>
              <dl className="mt-1 divide-y divide-line/70">
                {rows.map((r) => (
                  <div key={r.label} className="flex gap-3 py-1">
                    <dt className="w-[6.5em] shrink-0 text-[11px] leading-[1.6] text-muted">{r.label}</dt>
                    <dd className="min-w-0 flex-1 text-[12px] leading-[1.5] text-ink">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
        {onShowMap && (
          <button
            onClick={() => onShowMap(hit.point)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-brand hover:bg-mint"
            aria-label={`${kindText(hit.kind)} ${hit.no} を地図で見る`}
          >
            <MapIcon className="h-3.5 w-3.5" />
            地図
          </button>
        )}
      </div>
    </li>
  );
}

/** 地点の一覧（スマホのシート・PC のカード） */
export function LandPriceDetail({ hits, rosenka, onShowMap }: { hits: LandPriceHit[]; rosenka?: RosenkaLink[]; onShowMap?: (point: [number, number]) => void }) {
  return (
    <div>
      <p className="text-[11px] leading-[1.6] text-muted">物件から近い順。標準地（地価公示）・基準地（都道府県地価調査）は、その地域の標準的な土地の価格です。物件そのものの価格ではありません。</p>
      <ul className="divide-y divide-line/70">
        {hits.map((h) => (
          <Item key={`${h.kind}|${h.no}`} hit={h} onShowMap={onShowMap} />
        ))}
      </ul>
      {/* 路線価は全国地価マップを物件の場所で開く（相続税・固定資産税の最新の年分・年度） */}
      {rosenka && rosenka.length > 0 && (
        <div className="mt-2 rounded-xl bg-[#f7f3ec] px-3 py-2 dense:mt-1.5 dense:py-1.5 densest:py-1">
          <p className="text-[11.5px] font-semibold text-ink">路線価を地図で見る</p>
          <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {rosenka.map((l) => (
              <li key={l.kind}>
                <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] leading-[1.5] text-brand underline-offset-2 hover:underline">
                  <ExternalIcon className="h-3 w-3 shrink-0" />
                  {l.name.replace(/等（/, "（")}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-0.5 text-[10.5px] leading-[1.5] text-muted denser:text-[10px] densest:leading-[1.4]">
            {ROSENKA_NOTE}。{ROSENKA_CHECK}。
          </p>
        </div>
      )}
      <p className="mt-2 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted">
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          国土交通省の地価公示（毎年1月1日時点）と、都県の地価調査（毎年7月1日時点）です。前年比は同じ地点の前年の価格との比べです。
          <span className="mt-1 block">
            出典：
            <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noreferrer" className="underline">
              「国土数値情報（地価公示データ・都道府県地価調査データ）」（国土交通省）
            </a>
            を加工して作成（{LAND_PRICE_DATA.edition}）
          </span>
        </span>
      </p>
    </div>
  );
}

/** PC：地図の左のパネルのカード（近くに地点が無ければ出さない） */
export function LandPriceCard({ state, onShowMap }: { state: LandPriceState; onShowMap?: (point: [number, number]) => void }) {
  if (state.status === "ok" && state.hits.length === 0) return null;
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <LandPriceIcon className="h-4 w-4 text-brand-light" />
        近くの地価（参考）
      </h3>
      {state.status === "loading" && <p className="text-[12px] text-muted">地価公示・地価調査の地点を確認しています…</p>}
      {state.status === "error" && <p className="text-[12px] text-muted">地価のデータを読み込めませんでした。時間をおいて調べ直してください。</p>}
      {state.status === "ok" && <LandPriceDetail hits={state.hits} rosenka={state.rosenka} onShowMap={onShowMap} />}
    </section>
  );
}
