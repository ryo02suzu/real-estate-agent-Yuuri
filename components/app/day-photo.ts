// 時間帯で背景の写真を切り替える仕組み（書類・出力 components/app/docs.tsx と、お気に入り components/app/favorites.tsx）。
// 時間帯は太陽の高さで決める（lib/app/sun.ts。書類・出力は dayPart の昼・夕方・夜、お気に入りは favPart の昼・昼と夕方のあいだ・夕方・夜。
// URL の #t= で日時を固定していればその時刻）。空を入れ直すたび（1分ごと・戻ったとき・#t= が変わったとき。components/app/sky.tsx の useSkyClock）に見直す。
// 時間帯が変わったら、前の写真の上に新しい写真をゆっくり重ねてから前のを外す（構図の違う写真なので、途中で混ぜたままにはしない）。
// 現れ方は app/globals.css の .day-intro（初めて開いたとき：ふわっと落ち着く）と .day-swap（入れ替わり：ゆっくり重なる）
import { useEffect, useRef, useState } from "react";
import { overrideTime, solar, type DayPart, type FavPart } from "@/lib/app/sun";
import { SKY_EVENT } from "./sky-event";

export type { DayPart, FavPart };

/** 太陽の高さ（度）と昇っているかから、時間帯を決める（lib/app/sun.ts の dayPart・favPart） */
export type PartOf<P extends string> = (altitude: number, rising: boolean) => P;

/** 写真が入れ替わる時間（app/globals.css の .day-swap と同じ） */
export const SWAP_MS = 1600;

/** いまの時間帯 */
export function partNow<P extends string>(partOf: PartOf<P>): P {
  const s = solar(overrideTime(location.hash) ?? new Date());
  return partOf(s.altitude, s.rising);
}

/** いまの時間帯（空を入れ直すたびに見直す）。サーバーで作るときは、太陽が高いとき（昼） */
export function useDayPart<P extends string>(partOf: PartOf<P>): P {
  const [part, setPart] = useState<P>(() => (typeof window === "undefined" ? partOf(90, false) : partNow(partOf)));
  useEffect(() => {
    const read = () => setPart(partNow(partOf));
    addEventListener(SKY_EVENT, read);
    return () => removeEventListener(SKY_EVENT, read);
  }, [partOf]);
  return part;
}

/**
 * 重ねる写真の並び（下から上）。時間帯が変わったら、前の写真（下）と新しい写真（上）の2枚になり、
 * 新しい写真が現れきったら done で前の写真を外す（並びを変えないので、前の写真の箱は動かさずに残る）
 */
export function useDayLayers<P extends string>(partOf: PartOf<P>): { shown: P; layers: P[]; swapping: boolean; done: () => void } {
  const part = useDayPart(partOf);
  const [shown, setShown] = useState(part);
  const [prev, setPrev] = useState<P | null>(null);
  if (part !== shown) {
    setPrev(shown);
    setShown(part);
  }
  return { shown, layers: prev ? [prev, shown] : [shown], swapping: prev !== null, done: () => setPrev(null) };
}

/**
 * 1枚の写真の現れ方。読み込めてから現れる（初めは .day-intro、入れ替わりは .day-swap）。現れ方は置いたときに決める
 * （入れ替わりが終わって前の写真を外したあと、もう一度動き出さないように）。入れ替わりの写真は、現れきったら onShown
 */
export function useLayerEntry(swap: boolean, onShown: () => void): { className: string; onLoad: () => void } {
  const [ready, setReady] = useState(false);
  const [entry] = useState(swap ? "day-swap" : "day-intro");
  const done = useRef(onShown);
  useEffect(() => {
    done.current = onShown;
  });
  useEffect(() => {
    if (!ready || entry !== "day-swap") return;
    const t = window.setTimeout(() => done.current(), SWAP_MS + 80);
    return () => clearTimeout(t);
  }, [ready, entry]);
  return { className: ready ? entry : "opacity-0", onLoad: () => setReady(true) };
}
