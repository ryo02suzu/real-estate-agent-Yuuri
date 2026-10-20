"use client";

// 周辺施設（販売図面の「生活環境」）と徒歩の目安（lib/roadmap/poi.ts）。スーパー・コンビニ・病院などの種類ごとに、いちばん近い施設と
// 徒歩の分数（道路距離 80m を1分）・道路距離。施設の位置までの目安で、OpenStreetMap に無い施設もあるので、広告には実際の道のりで確かめる旨を添える
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import { nearestPois, POI_CREDIT, POI_DATA, POI_NOTE, poiWalkText, type PoiWalk } from "@/lib/roadmap/poi";
import { pmtilesPoiSource } from "@/lib/roadmap/poi-tiles";
import { InfoIcon, ShopIcon } from "./icons";

export type PoiState = { status: "loading" } | { status: "error" } | { status: "ok"; pois: PoiWalk[] };

const NONE: PoiState = { status: "ok", pois: [] };

/** 物件のまわりの周辺施設（データが置かれていなければ空） */
export function usePois(lat: number, lng: number): PoiState {
  const key = `${lat},${lng}`;
  const [state, setState] = useState<{ key: string; value: PoiState }>();
  useEffect(() => {
    if (!POI_DATA.url) return;
    let alive = true;
    withRetry(() => nearestPois(lat, lng, pmtilesPoiSource))
      .then((pois) => alive && setState({ key, value: { status: "ok", pois } }))
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に地点が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!POI_DATA.url) return NONE;
  return state?.key === key ? state.value : { status: "loading" };
}

/** 施設の一覧（種類・名前・徒歩の目安）と注意・出典。シートで入りきらなければ詰める（components/sheet.tsx の useDense） */
export function PoiList({ state }: { state: PoiState }) {
  if (state.status === "loading") return <p className="py-2 text-[12px] text-muted">周辺の施設を確認しています…</p>;
  if (state.status === "error") return <p className="py-2 text-[12px] text-muted">施設のデータを読み込めませんでした。時間をおいて調べ直してください。</p>;
  if (!state.pois.length) return <p className="py-2 text-[12px] text-muted">歩いて行ける範囲（約1.2km）に、データにある施設がありません。</p>;
  return (
    <div>
      <dl className="divide-y divide-line/70">
        {state.pois.map((w) => (
          <div key={w.kind} className="flex items-baseline gap-2 py-1 text-[12px] leading-[1.5] dense:py-[3px] denser:text-[11.5px] densest:py-[1px] densest:leading-[1.35]">
            <dt className="w-[7.5em] shrink-0 text-[11px] text-muted">{w.label}</dt>
            <dd className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
              <span className="min-w-0 truncate text-ink">{w.name}</span>
              <b className={`shrink-0 font-semibold ${w.routed ? "text-brand" : "text-muted"}`}>{poiWalkText(w)}</b>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted dense:mt-1.5 dense:leading-[1.5] denser:text-[10px] densest:mt-1 densest:leading-[1.4]">
        <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {POI_NOTE}。
          <span className="mt-0.5 block">{POI_CREDIT}</span>
        </span>
      </p>
    </div>
  );
}

/** PC：パネルのカード（データが無い・近くに施設が無ければ出さない） */
export function PoiCard({ state }: { state: PoiState }) {
  if (state.status === "ok" && state.pois.length === 0) return null;
  return (
    <section className="rounded-2xl border border-line bg-white px-4 py-3 shadow-soft">
      <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
        <ShopIcon className="h-4 w-4 text-brand-light" />
        周辺施設（徒歩の目安）
      </h3>
      <PoiList state={state} />
    </section>
  );
}
