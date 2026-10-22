"use client";

// 物件の地点の国のデータ（液状化の発生傾向・大規模盛土造成地・災害履歴・将来推計人口・医療機関と幼稚園・駅別乗降客数・
// 地価公示の鑑定評価書）を読むフック。どの画面からでも使えるよう、画面の部品とは分けておく（見た目は画面の側で決める）。
// データがまだ無い（取り込み前）ものは status: "none"
import { useEffect, useState } from "react";
import { appraisalFor, type AppraisalPoint } from "@/lib/roadmap/appraisal";
import { nearbyFacilities, nearestFacilities, type Facility, type FacilityWalk } from "@/lib/roadmap/facilities";
import type { LandPricePoint } from "@/lib/roadmap/land-price";
import { liquefactionAt, type Liquefaction } from "@/lib/roadmap/liquefaction";
import { populationAt, type PopulationOutlook } from "@/lib/roadmap/population";
import { hasNational, type NationalKey } from "@/lib/roadmap/reinfolib";
import { loadRidership, ridershipOf, type Ridership } from "@/lib/roadmap/ridership";
import { rirekiAt, type RirekiRecord } from "@/lib/roadmap/rireki";
import type { StationWalk } from "@/lib/roadmap/walk";
import { zouseiAt, type Zousei } from "@/lib/roadmap/zousei";
import { withRetry } from "@/lib/retry";

/** 読み込みの状態。none はデータがまだ無い（取り込み前） */
export type Loaded<T> = { status: "none" } | { status: "loading" } | { status: "error" } | { status: "ok"; value: T };

/** key が変わるたびに run を読み直す（読み終わる前に key が変われば、古い結果は捨てる） */
function useLoaded<T>(data: NationalKey | NationalKey[], key: string | null, run: () => Promise<T>): Loaded<T> {
  const ready = (Array.isArray(data) ? data : [data]).every(hasNational);
  const [state, setState] = useState<{ key: string; value: Loaded<T> }>();
  useEffect(() => {
    if (!ready || key === null) return;
    let alive = true;
    withRetry(run)
      .then((value) => alive && setState({ key, value: { status: "ok", value } }))
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に読むものが入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);
  if (!ready || key === null) return { status: "none" };
  return state?.key === key ? state.value : { status: "loading" };
}

/** 液状化の発生傾向（null はデータの無い所：海・関東の外） */
export const useLiquefaction = (lat: number, lng: number) => useLoaded<Liquefaction | null>("liq", `${lat},${lng}`, () => liquefactionAt(lat, lng));

/** 大規模盛土造成地 */
export const useZousei = (lat: number, lng: number) => useLoaded<Zousei>("zousei", `${lat},${lng}`, () => zouseiAt(lat, lng));

/** 災害履歴（範囲の中・近くの記録） */
export const useRireki = (lat: number, lng: number) => useLoaded<RirekiRecord[]>("rireki", `${lat},${lng}`, () => rirekiAt(lat, lng));

/** まわりの将来推計人口（null は人の住んでいない所） */
export const usePopulation = (lat: number, lng: number) => useLoaded<PopulationOutlook | null>("pop", `${lat},${lng}`, () => populationAt(lat, lng));

export type FacilitiesValue = {
  /** まわり（1.2km）の医療機関・幼稚園（近い順） */
  near: (Facility & { straight: number })[];
  /** 探し方ごとの最寄りと徒歩の目安（病院・診療所・小児科・内科・歯科・救急病院・幼稚園） */
  nearest: (FacilityWalk & { query: string })[];
};

/** 国のデータの医療機関・幼稚園 */
export const useFacilities = (lat: number, lng: number) =>
  useLoaded<FacilitiesValue>("fac", `${lat},${lng}`, async () => {
    const near = await nearbyFacilities(lat, lng);
    return { near, nearest: await nearestFacilities(lat, lng, near) };
  });

/** 駅ごとの乗降客数（駅の名前 → 乗降客数。見つからない駅は null） */
export function useRidership(stations: StationWalk[] | undefined): Loaded<Record<string, Ridership | null>> {
  const key = stations ? stations.map((s) => `${s.name}@${s.at?.join(",")}`).join("|") : null;
  return useLoaded("ridership", key, async () => {
    const data = await loadRidership();
    const out: Record<string, Ridership | null> = {};
    for (const s of stations ?? []) out[s.name] = data && s.at ? ridershipOf(data, s.name, s.at) : null;
    return out;
  });
}

/** 地価公示の地点の鑑定評価書（地価調査の地点・地点が無いときは none） */
export function useAppraisal(point: LandPricePoint | undefined): Loaded<AppraisalPoint | null> {
  const key = point && point.kind === "公示" ? `${point.no}@${point.point.join(",")}` : null;
  return useLoaded("appraisal", key, () => appraisalFor(point!.no, point!.point));
}
