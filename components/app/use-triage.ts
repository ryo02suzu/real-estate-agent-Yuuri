"use client";

// 画面の部品の読み込みの状態（components/*-card.tsx のもの）を、要注意点と次にやること（lib/app/triage.ts）の入力にそろえる。
// スマホ（components/app/use-property.ts）と PC（components/result-view.tsx）の両方から使う
import { useMemo } from "react";
import { triageOf, type Triage, type TriageInput } from "@/lib/app/triage";
import type { LookupResult } from "@/lib/roadmap";
import type { Liquefaction } from "@/lib/roadmap/liquefaction";
import type { RirekiRecord } from "@/lib/roadmap/rireki";
import type { Zousei } from "@/lib/roadmap/zousei";
import type { BuildingState } from "../building-card";
import type { HazardState } from "../hazard-card";
import type { RoadsState } from "../nearby-roads";
import { parcelLines, type ParcelInfo } from "../parcel-card";
import type { ZoningState } from "../zoning-card";
import type { Loaded } from "./use-national";

type Ok = Extract<LookupResult, { status: "ok" }>;

export type TriageSources = {
  zoning: ZoningState;
  parcels: ParcelInfo;
  roads: RoadsState;
  hazard: HazardState;
  building: BuildingState;
  liq?: Loaded<Liquefaction | null>;
  zousei?: Loaded<Zousei>;
  rireki?: Loaded<RirekiRecord[]>;
};

/** 筆の状態を、隣地の地番（登記の地番）の並びにして渡す */
function parcelsOf(info: ParcelInfo): TriageInput["parcels"] {
  if (info.status !== "ok") return info;
  return { status: "ok", parcel: info.parcel, kind: info.kind, neighbors: parcelLines(info).neighbors };
}

export function triageFrom(result: Ok, s: TriageSources): Triage {
  return triageOf({ result, zoning: s.zoning, parcels: parcelsOf(s.parcels), roads: s.roads, hazard: s.hazard, building: s.building, liq: s.liq, zousei: s.zousei, rireki: s.rireki });
}

/** 読み込みの状態が変わったときだけ出し直す */
export function useTriage(result: Ok, s: TriageSources): Triage {
  const { zoning, parcels, roads, hazard, building, liq, zousei, rireki } = s;
  return useMemo(() => triageFrom(result, { zoning, parcels, roads, hazard, building, liq, zousei, rireki }), [result, zoning, parcels, roads, hazard, building, liq, zousei, rireki]);
}
