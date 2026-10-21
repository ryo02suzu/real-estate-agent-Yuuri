"use client";

// スマホの新しい見た目（紺）で、1つの物件について読むデータをまとめる。今までの部品の読み込み（用途地域・筆・道路・ハザード・建物・地価・
// 学区・駅）に、周辺環境の画面で使う施設（地図の印と飲食店の数）と、ハザードの画面の指定緊急避難場所を足す。
// どれもブラウザから国・自治体・OpenStreetMap のデータを直接読み、物件の住所を自前のサーバーに送らない
import { useEffect, useState } from "react";
import type { LookupResult } from "@/lib/roadmap";
import { withRetry } from "@/lib/retry";
import { dealCity, dealsInTown, DEALS_DATA, loadDeals, type DealRecord } from "@/lib/roadmap/deals";
import { browserJsonFetcher, evacSitesNear, type EvacSite } from "@/lib/roadmap/evac";
import { nearbyPois, nearestOf, POI_DATA, POI_EXTRA, POI_ORDER, type Poi, type PoiWalk } from "@/lib/roadmap/poi";
import { pmtilesPoiSource } from "@/lib/roadmap/poi-tiles";
import { routedOk, walkMinutes, walkTo } from "@/lib/roadmap/walk";
import { HAS_DINING_DATA } from "@/lib/app/scores";
import { useBuilding } from "../building-card";
import { useHazard } from "../hazard-card";
import { useLandPrices } from "../land-price-card";
import { useNearbyRoads } from "../nearby-roads";
import { useParcelInfo } from "../parcel-card";
import type { PoiState } from "../poi-card";
import { useSchools } from "../school-card";
import { useStations } from "../station-card";
import { useZoning } from "../zoning-card";

export type Ok = Extract<LookupResult, { status: "ok" }>;

/** 飲食店の数を数える範囲（m） */
export const DINING_RADIUS = 500;

export type AroundState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ok";
      /** 種類ごとの最寄り（生活環境の種類と飲食店） */
      nearest: PoiWalk[];
      /** 半径500m以内の飲食店の数（飲食店のデータが無ければ undefined） */
      dining?: number;
      /** 歩いて行ける範囲（約1.2km）の施設すべて（近い順） */
      all: (Poi & { straight: number })[];
    };

/** 周辺環境の画面の施設（最寄り・飲食店の数・地図の印） */
export function useAround(lat: number, lng: number): AroundState {
  const key = `${lat},${lng}`;
  const [state, setState] = useState<{ key: string; value: AroundState }>();
  useEffect(() => {
    if (!POI_DATA.url) return;
    let alive = true;
    withRetry(async () => {
      const all = await nearbyPois(lat, lng, pmtilesPoiSource);
      const nearest = await nearestOf(lat, lng, all, [...POI_ORDER, ...POI_EXTRA]);
      const dining = HAS_DINING_DATA ? all.filter((p) => p.kind === 13 && p.straight <= DINING_RADIUS).length : undefined;
      return { status: "ok", nearest, dining, all } as const;
    })
      .then((value) => alive && setState({ key, value }))
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に地点が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!POI_DATA.url) return { status: "ok", nearest: [], all: [] };
  return state?.key === key ? state.value : { status: "loading" };
}

export type EvacWalk = EvacSite & { walk?: { meters: number; minutes: number } };
export type EvacState = { status: "loading" } | { status: "error" } | { status: "ok"; sites: EvacWalk[] };

/** 近くの指定緊急避難場所（3つまで・3km 以内）と、道路をたどった徒歩の目安 */
export function useEvacuation(lat: number, lng: number): EvacState {
  const key = `${lat},${lng}`;
  const [state, setState] = useState<{ key: string; value: EvacState }>();
  useEffect(() => {
    let alive = true;
    withRetry(() => evacSitesNear(lat, lng, browserJsonFetcher))
      .then(async (sites) => {
        if (!alive) return;
        setState({ key, value: { status: "ok", sites } });
        const dist = await walkTo(
          lat,
          lng,
          sites.map((s, id) => ({ id, points: [s.at] })),
        ).catch(() => new Map<number, number>());
        const walked = sites.map((s, id) => {
          const d = dist.get(id);
          return routedOk(d, s.straight) ? { ...s, walk: { meters: d, minutes: walkMinutes(d) } } : s;
        });
        if (alive) setState({ key, value: { status: "ok", sites: walked } });
      })
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に地点が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.value : { status: "loading" };
}

export type DealsState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ok";
      /** 市区町村の名前（「東京都渋谷区」） */
      city: string;
      /** 物件と同じ町の事例（新しい順） */
      town: DealRecord[];
      /** 市区町村全体の事例（新しい順） */
      all: DealRecord[];
    };

/** 実際の取引事例（不動産情報ライブラリ）。データがまだ無い（API キーの登録待ち）・データの無い市区町村は none */
export function useDeals(result: Ok): DealsState {
  const code = DEALS_DATA.url ? dealCity(result.municipality.codes, result.matchedAddress) : undefined;
  const key = `${code ?? ""}|${result.town}`;
  const [state, setState] = useState<{ key: string; value: DealsState }>();
  useEffect(() => {
    if (!code) return;
    let alive = true;
    withRetry(() => loadDeals(code))
      .then((file) => {
        if (!alive) return;
        if (!file) return setState({ key, value: { status: "none" } });
        setState({ key, value: { status: "ok", city: DEALS_DATA.cities[code] ?? "", town: dealsInTown(file.records, result.town), all: file.records } });
      })
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に市区町村と町が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!code) return { status: "none" };
  return state?.key === key ? state.value : { status: "loading" };
}

/** 1つの物件で読むデータすべて */
export function useProperty(result: Ok) {
  const { lat, lng, municipality: m } = result;
  const zoning = useZoning(lat, lng, m);
  const parcels = useParcelInfo(result);
  const roads = useNearbyRoads(result.links, lat, lng);
  const hazard = useHazard(lat, lng, m);
  const building = useBuilding(result, parcels);
  // 取引事例の画面に地価の地点を並べるので、ふだんより多めに読む（共有・下書きには近い5つ）
  const landPrice = useLandPrices(lat, lng, 12);
  const schools = useSchools(lat, lng);
  const stations = useStations(lat, lng);
  const around = useAround(lat, lng);
  const evac = useEvacuation(lat, lng);
  const deals = useDeals(result);
  // 共有の文面・下書き・調査メモには、今までどおり生活環境の種類だけ（飲食店は入れない）
  const pois: PoiState = around.status === "ok" ? { status: "ok", pois: around.nearest.filter((p) => POI_ORDER.includes(p.kind)) } : around;
  const landPrice5 = landPrice.status === "ok" ? { ...landPrice, hits: landPrice.hits.slice(0, 5) } : landPrice;
  return { zoning, parcels, roads, hazard, building, landPrice, landPrice5, schools, stations, around, pois, evac, deals };
}

export type PropertyData = ReturnType<typeof useProperty>;
