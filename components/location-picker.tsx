"use client";

import { useEffect, useState } from "react";
import { muniName, reverseGeocode } from "@/lib/roadmap";
import { CloseIcon, PinIcon } from "./icons";
import { MapPanel } from "./map-panel";

/** 町名まで読める程度に拡大してから選んでもらう */
const MIN_ZOOM = 14;

type Center = { lat: number; lng: number; zoom: number; parcel?: string };

/**
 * スマホの「地図で場所を選ぶ」画面（全画面）。地図を動かして中央の印を物件に合わせ、「この場所で調べる」。
 * 住所が番地まで見つからないときや、地番しか分からない土地で使う。開くときに作り、閉じたら外す
 */
export function LocationPicker({
  start,
  onClose,
  onPick,
}: {
  /** 最初に表示する地点（無ければ関東全体） */
  start?: { lat: number; lng: number };
  onClose: () => void;
  onPick: (lat: number, lng: number) => void;
}) {
  const [center, setCenter] = useState<Center | null>(null);
  const [place, setPlace] = useState("");

  // 中央の地点の市区町村・町名（地図を止めて少し待ってから聞く）
  const key = center && center.zoom >= MIN_ZOOM ? `${center.lat.toFixed(5)},${center.lng.toFixed(5)}` : "";
  useEffect(() => {
    if (!key) return;
    const [lat, lng] = key.split(",").map(Number);
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const rev = await reverseGeocode(lat, lng);
        if (alive) setPlace(rev ? `${muniName(rev.muniCd) ?? ""}${rev.town}` || "（町名なし）" : "（関東の外か、海の上です）");
      } catch {
        if (alive) setPlace("");
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zoomedIn = !!center && center.zoom >= MIN_ZOOM;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="地図で物件の場所を選ぶ">
      <header className="flex items-center gap-2 px-4 pb-2 pt-[max(10px,env(safe-area-inset-top))]">
        <PinIcon className="h-5 w-5 text-brand" />
        <h2 className="flex-1 text-[15px] font-semibold text-ink">地図で物件の場所を選ぶ</h2>
        <button onClick={onClose} aria-label="閉じる" className="rounded-full p-2 text-muted hover:bg-mint">
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        <MapPanel
          mode="crosshair"
          point={start}
          onCenter={(lat, lng, zoom, parcel) => setCenter({ lat, lng, zoom, parcel })}
          fallback={<p className="p-6 text-center text-sm text-muted">この端末では地図を表示できません。住所で検索してください。</p>}
        />
      </div>
      <div className="relative px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_20px_rgba(60,44,20,0.08)]">
        <p className="text-[11px] text-muted">{zoomedIn ? "地図を動かして、印の先を物件に合わせてください" : "地図を拡大して、物件の場所に印を合わせてください"}</p>
        <p className="mt-1 h-6 truncate text-[15px] font-semibold text-ink">
          {zoomedIn ? place || "…" : ""}
          {zoomedIn && center?.parcel && <span className="ml-2 text-[12px] font-normal text-brand">{center.parcel}</span>}
        </p>
        <button
          disabled={!zoomedIn}
          onClick={() => center && onPick(center.lat, center.lng)}
          className="bg-gold mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold text-white shadow-[0_6px_16px_rgba(138,102,50,0.28)] disabled:opacity-50"
        >
          この場所で調べる
        </button>
      </div>
    </div>
  );
}
