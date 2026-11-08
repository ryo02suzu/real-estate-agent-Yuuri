// 筆の形の目安（PC のカルテの「辺の数」・比較）。登記所備付地図データの筆の形（タイルごとの部分）を、街の模型と同じ座標
// （調べた地点を原点にしたメートル。lib/app/town-model.ts）にして、はっきり曲がる角（25°以上。lib/app/scene-lots.ts の shapeOf）を数える。
// 細かく折れた線の点・タイルの継ぎ目で生まれた点は数えない。地図データからの目安で、測量の結果ではない
import { PARCEL_ZOOM, type Parcel } from "../roadmap/parcel";
import { shapeOf, tileRect, type SceneShape } from "./scene-lots";
import { localOf, type XZ } from "./town-model";

/** 筆の形（原点は origin。無ければ筆の代表点） */
export function lotShape(parcel: Parcel, origin: { lat: number; lng: number } = parcel.point): SceneShape {
  const toLocal: (lng: number, lat: number) => XZ = localOf(origin);
  return shapeOf(
    parcel.pieces.map((p) => ({ polygons: p.polygons, rect: tileRect(p.tile[0], p.tile[1], PARCEL_ZOOM, toLocal) })),
    toLocal,
  );
}

/**
 * 辺の数（角の数と同じ。外周の角だけを数える）。形が読めなければ undefined。
 * 長方形の筆は 4、L 字の筆は 6 になる
 */
export function lotCorners(parcel: Parcel): number | undefined {
  const n = lotShape(parcel).corners.length;
  return n >= 3 ? n : undefined;
}
