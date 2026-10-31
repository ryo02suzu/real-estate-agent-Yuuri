"use client";

// 物件のまわりの道路の種別（市の地図データを読んだもの）。地図の色を見比べなくても、種別・方角・距離が文字で分かる。
// 読めるのは公開の ArcGIS レイヤがある市町だけ（lib/roadmap/road-read.ts）。前面道路の判定や接道の判断はしない
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import type { ResolvedLink } from "@/lib/roadmap";
import { readRoads, ROAD_RADIUS_M, type NearbyRoad, type RoadRead } from "@/lib/roadmap/road-read";
import { ChevronRightIcon, MapIcon, RetryIcon } from "./icons";
import { Notes } from "./notes";
import { usePanelDetail } from "./panel-detail";
import { Sheet } from "./sheet";

/** error の retry：読み込み直す */
export type RoadsState = { status: "none" } | { status: "loading" } | { status: "error"; retry?: () => void } | { status: "ok"; roads: NearbyRoad[]; label: string };

/** 結果の地図のうち、道路の種別を読める地図があれば、物件のまわりの道路を読む */
export function useNearbyRoads(links: ResolvedLink[], lat: number, lng: number): RoadsState {
  const link = links.find((l) => l.read);
  const read: RoadRead | undefined = link?.read;
  // 読み込み直すたびに増やす（同じ地点でも読み直す）
  const [attempt, setAttempt] = useState(0);
  const key = read ? `${lat},${lng},${read.layers.map((l) => l.url).join(",")}#${attempt}` : "";
  const [state, setState] = useState<{ key: string; value: RoadsState }>();
  useEffect(() => {
    if (!read || !link) return;
    let alive = true;
    withRetry(() => readRoads(read, lat, lng))
      .then((roads) => alive && setState({ key, value: { status: "ok", roads, label: link.label } }))
      .catch(() => alive && setState({ key, value: { status: "error", retry: () => setAttempt((n) => n + 1) } }));
    return () => {
      alive = false;
    };
    // key に地点とレイヤが入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!read) return { status: "none" };
  return state?.key === key ? state.value : { status: "loading" };
}

/** 「北 約6m」 */
const where = (r: NearbyRoad) => (r.direction === "地点上" ? "地点の上" : `${r.direction} 約${Math.max(1, Math.round(r.distance))}m`);

/** スマホ：地図ボタンの下の1行。押すと一覧が下から出る。onShowMap があれば、一覧から MICHILU の地図に道路種別を描いて見られる */
export function NearbyRoadsLine({ state, onShowMap }: { state: RoadsState; onShowMap?: () => void }) {
  const [open, setOpen] = useState(false);
  // 結果パネルの中の詳細なら、地図の重ね表示へ移っても詳細は開いたまま（地図を閉じると同じ詳細に戻る）
  const inPanel = !!usePanelDetail();
  if (state.status === "none") return null;
  const first = state.status === "ok" ? state.roads[0] : undefined;
  // 読めなかったときは、押すと読み込み直す（上の公式図のボタンでも確かめられる）
  const retry = state.status === "error" ? state.retry : undefined;
  return (
    <>
      <button
        onClick={() => (retry ? retry() : setOpen(true))}
        disabled={state.status !== "ok" && !retry}
        className="mt-1.5 flex min-h-11 w-full items-center gap-1.5 rounded-lg bg-[#f7f3ec] px-2 py-1 text-left text-[12px] leading-[1.5] lg:py-1.5 lg:text-[13px] text-ink"
      >
        <span className="shrink-0 text-muted">近くの道路</span>
        {state.status === "loading" && <span className="truncate text-muted">地図のデータを読んでいます…</span>}
        {state.status === "error" && <span className="truncate text-muted">地図のデータを読めませんでした</span>}
        {retry && (
          <span className="ml-auto flex shrink-0 items-center gap-1 font-semibold text-brand">
            <RetryIcon className="h-3.5 w-3.5" />
            再読み込み
          </span>
        )}
        {state.status === "ok" && !first && <span className="truncate text-muted">{ROAD_RADIUS_M}m以内に色の付いた道路はありません</span>}
        {first && (
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap">
            <Swatch color={first.color} />
            <b className="font-semibold">{first.short}</b>
            <span className="text-muted">{where(first)}</span>
            {state.status === "ok" && state.roads.length > 1 && <span className="text-muted">ほか{state.roads.length - 1}</span>}
          </span>
        )}
        {state.status === "ok" && <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
      {state.status === "ok" && (
        <Sheet detail title="物件のまわりの道路（地図データ）" open={open} onClose={() => setOpen(false)}>
          {onShowMap && (
            <button
              onClick={() => {
                if (!inPanel) setOpen(false);
                onShowMap();
              }}
              className="bg-gold mb-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-semibold text-white shadow-[0_6px_16px_rgba(138,102,50,0.28)]"
            >
              <MapIcon className="h-4 w-4" />
              地図に道路種別の色を出して見る
            </button>
          )}
          <NearbyRoadsList state={state} />
        </Sheet>
      )}
    </>
  );
}

/** PC：地図ボタンの下に一覧をそのまま出す */
export function NearbyRoadsBlock({ state }: { state: RoadsState }) {
  if (state.status === "none") return null;
  return (
    <div className="mt-2 rounded-xl bg-[#f7f3ec] px-3 py-2">
      <p className="text-[11.5px] font-semibold text-ink">物件のまわりの道路（地図データ）</p>
      {state.status === "loading" && <p className="mt-1 text-[11.5px] text-muted">地図のデータを読んでいます…</p>}
      {state.status === "error" && <p className="mt-1 text-[11.5px] text-muted">地図のデータを読めませんでした。上のボタンで地図を開いて確かめてください。</p>}
      {state.status === "ok" && <NearbyRoadsList state={state} compact />}
    </div>
  );
}

function NearbyRoadsList({ state, compact }: { state: Extract<RoadsState, { status: "ok" }>; compact?: boolean }) {
  return (
    <div>
      {state.roads.length === 0 ? (
        <p className="mt-1 text-[13px] text-ink">物件から{ROAD_RADIUS_M}m以内に、地図で色の付いた道路はありません。色の無い道の種別は、市の案内（上の注意書き）か窓口で確かめてください。</p>
      ) : (
        <ul className={compact ? "mt-1 space-y-1" : "divide-y divide-line/70"}>
          {state.roads.map((r) => (
            <li key={`${r.label}|${r.direction}|${r.distance}`} className={`flex items-start gap-2 ${compact ? "" : "py-2"}`}>
              <Swatch color={r.color} className="mt-[5px]" />
              <span className="min-w-0 flex-1">
                <span className={`block font-semibold text-ink ${compact ? "text-[13px]" : "text-[14.5px]"}`}>{r.label}</span>
                <span className="block text-[12px] text-muted">
                  {where(r)}
                  {r.width && `・幅員 ${r.width}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Notes lead="地図に色の無い道は載っていません。前面道路と幅員は、地図と現地で確かめてください。">
        <p>
          「{state.label}」のデータを読み、物件の地点から{ROAD_RADIUS_M}m以内にある道路を近い順に出しています。地図に色の無い道は載っていません。どれが前面道路か・幅員は地図と現地で確かめ、最終確認は窓口で行ってください。
        </p>
      </Notes>
    </div>
  );
}

function Swatch({ color, className = "" }: { color?: string; className?: string }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10 ${className}`} style={{ background: color ?? "#bbb" }} />;
}
