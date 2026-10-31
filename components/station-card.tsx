"use client";

// 最寄り駅と徒歩の目安（lib/roadmap/walk.ts）。近い順に3駅まで、駅名・路線・徒歩の分数（道路距離 80m を1分）・道路距離。
// 駅の出入口ではなく駅（ホーム）までの目安なので、広告に書くときは実際の道路距離で確かめる旨を添える。
// スマホのシートは、周辺施設（components/poi-card.tsx）があればタブで並べる
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import { lineLabel, nearestStations, STATION_CREDIT, type StationWalk } from "@/lib/roadmap/walk";
import { ChevronRightIcon, TrainIcon } from "./icons";
import { Notes } from "./notes";
import { PoiList, type PoiState } from "./poi-card";
import { Sheet } from "./sheet";
import { Tabs } from "./tabs";

export type StationState = { status: "loading" } | { status: "error" } | { status: "ok"; stations: StationWalk[] };

export function useStations(lat: number, lng: number): StationState {
  const key = `${lat},${lng}`;
  const [state, setState] = useState<{ key: string; value: StationState }>();
  useEffect(() => {
    let alive = true;
    withRetry(() => nearestStations(lat, lng))
      .then((stations) => alive && setState({ key, value: { status: "ok", stations } }))
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に地点が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.value : { status: "loading" };
}

/** 「徒歩約11分」か、歩いて行ける範囲に無ければ「直線約3.2km」 */
export function walkText(s: StationWalk): string {
  if (s.routed) return `徒歩約${s.minutes}分`;
  return `直線約${s.meters >= 1000 ? `${(s.meters / 1000).toFixed(1)}km` : `${Math.round(s.meters / 10) * 10}m`}`;
}

const distText = (m: number) => (m >= 1000 ? `約${(m / 1000).toFixed(1)}km` : `約${Math.round(m / 10) * 10}m`);

/**
 * いちばん近い駅の1行（「新横浜駅 徒歩約11分」）。押すとスマホは一覧が下から出る（周辺施設があれば「周辺施設」のタブも）。
 * PC は onOpen（パネルの中のカードまで動かす）を渡す。
 * スマホは学区と並ぶ狭い行なので、駅名と分数を優先し、「最寄り駅」の見出しと「ほか2駅」は PC だけ出す。駅が無ければ出さない
 */
export function StationLine({ state, pois, onOpen }: { state: StationState; pois?: PoiState; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  if (state.status === "ok" && state.stations.length === 0) return null;
  // 周辺施設のデータが無い（施設が1つも無い）ときは、駅だけのシート
  const withPois = pois && !(pois.status === "ok" && pois.pois.length === 0);
  const top = state.status === "ok" ? state.stations[0] : undefined;
  const more = state.status === "ok" ? state.stations.length - 1 : 0;
  return (
    <>
      <button
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        disabled={state.status !== "ok"}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-left text-[12px] leading-[1.5] lg:py-1.5 lg:text-[13px] text-ink lg:hover:border-brand-light/60"
      >
        <TrainIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        <span className={onOpen ? "shrink-0 text-muted" : "sr-only"}>最寄り駅</span>
        {state.status === "loading" && <span className="truncate text-muted">{onOpen ? "確認中…" : "最寄り駅を確認中…"}</span>}
        {state.status === "error" && <span className="truncate text-muted">{onOpen ? "道路のデータを読み込めませんでした" : "最寄り駅を出せませんでした"}</span>}
        {top && (
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap">
            <span className="truncate">{top.name}駅</span>
            <b className="shrink-0 font-semibold">{walkText(top)}</b>
            {onOpen && more > 0 && <span className="truncate text-muted">ほか{more}駅</span>}
          </span>
        )}
        {state.status === "ok" && <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
      {state.status === "ok" && !onOpen && (
        <Sheet detail title={withPois ? "最寄り駅・周辺施設（徒歩の目安）" : "最寄り駅（徒歩の目安）"} open={open} onClose={() => setOpen(false)}>
          {withPois ? (
            <Tabs names={["最寄り駅", "周辺施設"]} panels={[<StationList key="s" stations={state.stations} />, <PoiList key="p" state={pois} />]} />
          ) : (
            <StationList stations={state.stations} />
          )}
        </Sheet>
      )}
    </>
  );
}

/** 駅の一覧（駅名・路線・徒歩の分数・道路距離）と注意 */
export function StationList({ stations }: { stations: StationWalk[] }) {
  return (
    <div>
      <ul className="divide-y divide-line">
        {stations.map((s) => (
          <li key={s.name} className="py-2.5 dense:py-2 densest:py-1.5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-ink">
              <b className="text-[16px] font-semibold">{s.name}駅</b>
              <span className="text-[15px] font-semibold text-brand">{walkText(s)}</span>
              {s.routed && <span className="text-[12px] text-muted">道路距離{distText(s.meters)}（直線{distText(s.straight)}）</span>}
            </p>
            <p className="text-[12.5px] leading-[1.6] text-muted">{s.lines.map(lineLabel).join("・")}</p>
          </li>
        ))}
      </ul>
      <Notes lead="道路距離 80m を1分とした目安です。広告には実際の道路距離で。" source="国土数値情報（鉄道データ）（国土交通省）・地理院地図Vector">
        <p>
          国土地理院の地図の道路をたどった、物件の地点から駅（ホームの位置）までの目安です（道路距離 80m を1分）。駅の出入口までの道のりや信号・歩道橋は含まないので、広告に書くときは実際の道路距離で確かめてください。
          {stations.some((s) => !s.routed) && "「直線」は、歩いて行ける範囲（2km）に駅が無い・道がつながらないときの直線距離です。"}
        </p>
        <p>{STATION_CREDIT}</p>
      </Notes>
    </div>
  );
}

/** PC：パネルのカード */
export function StationCard({ state }: { state: StationState }) {
  if (state.status === "ok" && state.stations.length === 0) return null;
  return (
    <section className="rounded-2xl border border-line bg-white px-4 py-3 shadow-soft">
      <h3 className="flex items-center gap-1.5 text-[14.5px] font-bold text-ink">
        <TrainIcon className="h-4 w-4 text-brand-light" />
        最寄り駅（徒歩の目安）
      </h3>
      {state.status === "loading" && <p className="mt-1 text-[12px] text-muted">確認中…</p>}
      {state.status === "error" && <p className="mt-1 text-[12px] text-muted">道路のデータを読み込めませんでした。</p>}
      {state.status === "ok" && <StationList stations={state.stations} />}
    </section>
  );
}
