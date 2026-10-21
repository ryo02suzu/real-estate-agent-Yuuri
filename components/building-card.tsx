"use client";

// 物件の地点の建物（国土交通省 PLATEAU の3D都市モデル）。用途・階数・構造（防火上の区分）・高さ・面積など。
// 建物ごとの代表点と範囲のタイル（lib/roadmap/building.ts）から、物件の筆の中にある建物・地点を範囲に含む建物を選ぶ。
// 形は持たないので「推定」とし、登記・建築確認の内容とは異なることがある旨を添える
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import type { LookupResult } from "@/lib/roadmap";
import { buildingAt, buildingRows, buildingSummary, type BuildingHit, type BuildingResult } from "@/lib/roadmap/building";
import { BUILDING_DATA, buildingsCover } from "@/lib/roadmap/building-data";
import { pmtilesBuildingSource } from "@/lib/roadmap/building-tiles";
import { BuildingIcon } from "./icons";
import { Notes } from "./notes";
import type { ParcelInfo } from "./parcel-card";

type Ok = Extract<LookupResult, { status: "ok" }>;

export type BuildingState = { status: "none" } | { status: "loading" } | { status: "error" } | { status: "ok"; result: BuildingResult; onParcel: boolean };

/** 地点の建物を読む。筆（地番）が分かるのを待ち、筆の中にある建物を先に選ぶ。PLATEAU の無い市区町村は none */
export function useBuilding(result: Ok, parcels: ParcelInfo): BuildingState {
  const covered = buildingsCover(result.municipality.codes);
  const parcel = parcels.status === "ok" ? parcels.parcel : undefined;
  const ready = parcels.status !== "loading";
  const key = `${result.lat},${result.lng},${parcel ? `${parcel.kuiki}|${parcel.chibanRaw}` : ""}`;
  const [state, setState] = useState<{ key: string; value: BuildingState }>();
  useEffect(() => {
    if (!covered || !ready) return;
    let alive = true;
    const polygons = parcel?.pieces.flatMap((p) => p.polygons);
    withRetry(() => buildingAt(result.lat, result.lng, pmtilesBuildingSource, polygons))
      .then((r) => alive && setState({ key, value: r ? { status: "ok", result: r, onParcel: !!polygons } : { status: "none" } }))
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に地点と筆が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, covered, ready]);
  if (!covered) return { status: "none" };
  return state?.key === key ? state.value : { status: "loading" };
}

/** 建物の行（名称・用途・階数・構造・高さ・面積・調査年） */
function Rows({ hit }: { hit: BuildingHit }) {
  return (
    <dl className="divide-y divide-line/70">
      {buildingRows(hit.building).map((r) => (
        <div key={r.label} className="flex gap-3 py-1.5">
          <dt className="w-[6.5em] shrink-0 text-[12.5px] leading-[1.65] text-muted">{r.label}</dt>
          <dd className="min-w-0 flex-1 text-[14.5px] font-semibold leading-[1.5] text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 地点の建物の中身（PC のカード・スマホの地番の一覧の中） */
export function BuildingDetail({ state }: { state: Exclude<BuildingState, { status: "none" }> }) {
  if (state.status === "loading") return <p className="text-[12px] text-muted">建物を確認しています…</p>;
  if (state.status === "error") return <p className="text-[12px] text-muted">建物のデータを読み込めませんでした。時間をおいて調べ直してください。</p>;
  const { hit, others } = state.result;
  return (
    <div>
      {hit ? (
        <>
          <p className="text-[12px] text-muted">{hit.onParcel ? "物件の筆の上の建物（推定）" : "地点の建物（推定）"}</p>
          <Rows hit={hit} />
          {hit.building.usage === undefined && hit.building.above === undefined && (
            <p className="mt-1 text-[12px] text-muted">この市区町村のデータには、用途・階数が入っていません。</p>
          )}
        </>
      ) : (
        <p className="text-[13.5px] text-ink">この地点に建物はありません（データの時点で空き地・駐車場・道路など）。</p>
      )}
      {others.length > 0 && (
        <p className="mt-1.5 text-[12.5px] leading-[1.6] text-ink">
          同じ筆の上にほかに{others.length}棟：{others.slice(0, 3).map((o) => buildingSummary(o.building)).join("／")}
          {others.length > 3 && " ほか"}
        </p>
      )}
      <Notes
        lead="地点から推定した建物です。登記・建築確認の内容とは異なることがあります。"
        source={
          <a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noreferrer" className="underline">
            PLATEAU（国土交通省）
          </a>
        }
      >
        <p>
          国土交通省 PLATEAU の3D都市モデルの建物の属性です（都市計画基礎調査などをもとにしたもの）。建物の形は使っていないので、地点の建物は推定です。登記・建築確認の内容とは異なることがあります。構造は防火上の区分（耐火造・準耐火造・防火造・木造など）です。
        </p>
        <p>出典：「3D都市モデル（Project PLATEAU）」（国土交通省）を加工して作成{BUILDING_DATA.edition && `（${BUILDING_DATA.edition}）`}</p>
      </Notes>
    </div>
  );
}

/** PC：地図の左のパネルのカード（PLATEAU の無い市区町村では出さない） */
export function BuildingCard({ state }: { state: BuildingState }) {
  if (state.status === "none") return null;
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-[14.5px] font-semibold text-ink">
        <BuildingIcon className="h-4 w-4 text-brand-light" />
        建物（参考）
      </h3>
      <BuildingDetail state={state} />
    </section>
  );
}
