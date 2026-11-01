import type { PropertyRecords, RecordTopic } from "@/lib/records";
import type { HazardKind } from "@/lib/roadmap/hazard";
import type { ParcelPick } from "../parcel-card";
import type { TabKey } from "./result-head";
import type { TopicStatus } from "./status";
import type { Ok, PropertyData } from "./use-property";

/** 下から出す詳しい画面（シート） */
export const SHEET_KINDS = ["parcel", "zoning", "hazard", "landPrice", "stations", "schools", "pois", "scores", "notes", "building", "roads", "evac", "contact", "deal"] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

/** 拡大した地図（MICHILU の動く地図）を開くときの重ね */
export type MapOpen = { roads?: boolean; hazard?: HazardKind; landPrice?: [number, number]; /** 筆・地番を重ねて開く（地図をタップして地番を選べる） */ parcels?: boolean };

/** 地図に重ねて選ぶハザードの種類（ハザードのタブ。街の模型の地面にも同じ種類の色を敷く） */
export type HazardPick = "flood" | "naisui" | "takashio" | "tsunami" | "dosha";

/** 土地に接する道路（国土地理院の地図データ。街の模型から。建築基準法の道路かどうかは分からない） */
export type FrontRoad = { direction: string; width: string; major: boolean };

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
  /** 「要注意点と次にやること」の画面 */
  triage: () => void;
  /** 次にやることの済んだ印（端末に保存） */
  checklist: { done: Set<string>; toggle: (id: string) => void };
  /** 物件の鍵（lib/property-id.ts）と、あなたの確認の記録 */
  pid: string;
  records: PropertyRecords;
  /** 調査の状況（6つの項目） */
  statuses: TopicStatus[];
  /** 確認の記録の画面を開く */
  record: (topic: RecordTopic) => void;
  /** 街の模型が出ているか（出ていなければ、タブの中に平らな地図を出す） */
  has3d: boolean;
  /** 隣の土地を模型に出すか */
  neighbors: boolean;
  setNeighbors: (on: boolean) => void;
  /** 謄本・公図の請求に貼る地番として選んだ筆（隣の土地の札・模型・地図で選ぶ） */
  pick: ParcelPick;
  /** ハザードのタブで選んだ種類 */
  hazard: HazardPick;
  setHazard: (k: HazardPick) => void;
  /** 土地に接する道路（地理院の地図データ） */
  front: FrontRoad[] | null;
};
