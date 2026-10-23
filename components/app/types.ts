import type { HazardKind } from "@/lib/roadmap/hazard";
import type { TabKey } from "./result-head";
import type { Ok, PropertyData } from "./use-property";

/** 下から出す詳しい画面（シート） */
export type SheetKind =
  | "parcel"
  | "zoning"
  | "hazard"
  | "landPrice"
  | "stations"
  | "schools"
  | "pois"
  | "scores"
  | "notes"
  | "building"
  | "roads"
  | "evac"
  | "contact"
  | "deal";

/** 拡大した地図（MICHILU の動く地図）を開くときの重ね */
export type MapOpen = { roads?: boolean; hazard?: HazardKind; landPrice?: [number, number] };

export type TabProps = {
  result: Ok;
  data: PropertyData;
  /** 別のタブへ */
  go: (t: TabKey) => void;
  /** 詳しい画面を開く（arg は取引事例の地点の番号など） */
  open: (s: SheetKind, arg?: number) => void;
  /** MICHILU の動く地図（全画面） */
  expand: (o?: MapOpen) => void;
  /** 「地図アプリで開く」の選択 */
  mapApps: () => void;
  /** 「レポートを作成」（書類・出力） */
  report: () => void;
};
