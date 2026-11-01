// 時間帯（昼・夕方・夜）で背景の写真を切り替える仕組み（書類・出力 components/app/docs.tsx と、お気に入り components/app/favorites.tsx）。
// 時間帯は太陽の高さで決める（lib/app/sun.ts の dayPart。URL の #t= で日時を固定していればその時刻）。空を入れ直すたび
// （1分ごと・戻ったとき・#t= が変わったとき。components/app/sky.tsx の useSkyClock）に見直す。
// 時間帯が変わったら、前の写真の上に新しい写真をゆっくり重ねてから前のを外す（構図の違う写真なので、途中で混ぜたままにはしない）。
// 現れ方は app/globals.css の .day-intro（初めて開いたとき：ふわっと落ち着く）と .day-swap（入れ替わり：ゆっくり重なる）
import { useEffect, useRef, useState } from "react";
import { dayPart, overrideTime, solar, type DayPart } from "@/lib/app/sun";
import { SKY_EVENT } from "./sky-event";

export type { DayPart };

/** 写真が入れ替わる時間（app/globals.css の .day-swap と同じ） */
export const SWAP_MS = 1600;

/** いまの時間帯 */
export function partNow(): DayPart {
  const s = solar(overrideTime(location.hash) ?? new Date());
  return dayPart(s.altitude, s.rising);
}

/** いまの時間帯（空を入れ直すたびに見直す） */
export function useDayPart(): DayPart {
  const [part, setPart] = useState<DayPart>(() => (typeof window === "undefined" ? "day" : partNow()));
  useEffect(() => {
    const read = () => setPart(partNow());
    addEventListener(SKY_EVENT, read);
    return () => removeEventListener(SKY_EVENT, read);
  }, []);
  return part;
}

/**
 * 重ねる写真の並び（下から上）。時間帯が変わったら、前の写真（下）と新しい写真（上）の2枚になり、
 * 新しい写真が現れきったら done で前の写真を外す（並びを変えないので、前の写真の箱は動かさずに残る）
 */
export function useDayLayers(): { shown: DayPart; layers: DayPart[]; swapping: boolean; done: () => void } {
  const part = useDayPart();
  const [shown, setShown] = useState(part);
  const [prev, setPrev] = useState<DayPart | null>(null);
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
