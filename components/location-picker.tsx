"use client";

// スマホの「地図で場所を選ぶ」画面（全画面）。地図を動かして中央の印を物件に合わせ、「この場所で調べる」。
// 住所が番地まで見つからないときや、地番しか分からない土地で使う。開くときに作り、閉じたら外す。
// 見た目はホームと同じ系統：地図の上に浮かぶガラスのバー（戻る・見出し）と、下のガラスの板（町名・地番・紺のボタン）。
// 町名は地図を止めて少し待ってから入れ替わる。板の中の町名は、結果の画面の見出しへつながる（view-transition）
import { ArrowLeft, Crosshair, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { muniName, reverseGeocode } from "@/lib/roadmap";
import { GLASS, HEAD, LIGHT, TEXT } from "./app/r-ui";
import { NAVY } from "./app/ui";
import { MapPanel } from "./map-panel";

/** 町名まで読める程度に拡大してから選んでもらう */
const MIN_ZOOM = 14;

type Center = { lat: number; lng: number; zoom: number; parcel?: string };

export function LocationPicker({
  start,
  busy = false,
  onClose,
  onPick,
}: {
  /** 最初に表示する地点（無ければ関東全体） */
  start?: { lat: number; lng: number };
  /** 「この場所で調べる」を押して読んでいる間（板に「調べています…」。読み終わると結果の帯につながる） */
  busy?: boolean;
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
    <div className="app-touch fixed inset-0 z-50 flex flex-col bg-[#e8eef5]" role="dialog" aria-modal="true" aria-label="地図で物件の場所を選ぶ">
      <div className="relative min-h-0 flex-1">
        <MapPanel
          mode="crosshair"
          point={start}
          onCenter={(lat, lng, zoom, parcel) => setCenter({ lat, lng, zoom, parcel })}
          fallback={<p className="p-6 text-center text-sm text-muted">この端末では地図を表示できません。住所で検索してください。</p>}
        />

        {/* 上のガラスのバー：戻る・見出し */}
        <div className="pointer-events-none absolute inset-x-0 top-0 px-[12px]" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
          <div className="pointer-events-auto flex h-[46px] items-center gap-[6px] rounded-full pl-[3px] pr-[16px] shadow-[0_6px_18px_rgba(20,45,85,0.16)]" style={GLASS}>
            <button onClick={onClose} aria-label="閉じる" className="press flex size-[40px] shrink-0 items-center justify-center rounded-full">
              <ArrowLeft size={22} strokeWidth={2} absoluteStrokeWidth color={HEAD} />
            </button>
            <span className="min-w-0 flex-1 truncate font-semibold leading-none" style={{ fontSize: 15, color: HEAD }}>
              地図で物件の場所を選ぶ
            </span>
          </div>
        </div>

        {/* 下のガラスの板：案内・町名と地番・「この場所で調べる」 */}
        <div className="absolute inset-x-0 bottom-0 px-[12px]" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <div className="rounded-[22px] px-[14px] pb-[12px] pt-[12px] shadow-[0_14px_34px_rgba(20,48,95,0.18)]" style={{ ...GLASS, viewTransitionName: "place-panel" }}>
            <p className="leading-none" style={{ fontSize: 12, color: LIGHT }}>
              {zoomedIn ? "地図を動かして、印の先を物件に合わせてください" : "地図を拡大して、物件の場所に印を合わせてください"}
            </p>
            <p className="mt-[8px] flex h-[24px] items-center gap-[8px] font-semibold leading-none" style={{ fontSize: 16, color: TEXT, viewTransitionName: "place-title" }}>
              <span className="min-w-0 truncate">{zoomedIn ? place || "…" : "　"}</span>
              {zoomedIn && center?.parcel && (
                <span className="shrink-0 rounded-full px-[8px] py-[4px] font-semibold leading-none" style={{ fontSize: 12, color: NAVY, background: "rgba(19,54,100,0.1)" }}>
                  {center.parcel}
                </span>
              )}
            </p>
            <button
              disabled={!zoomedIn || busy}
              onClick={() => center && onPick(center.lat, center.lng)}
              className="press mt-[10px] flex h-[48px] w-full items-center justify-center gap-[8px] rounded-[14px] font-semibold leading-none text-white shadow-[0_8px_20px_rgba(15,47,95,0.22)] disabled:shadow-none"
              style={{ fontSize: 16, background: `linear-gradient(135deg,#1b4280 0%,${NAVY} 60%,#0a2248 100%)`, opacity: busy ? 0.95 : zoomedIn ? 1 : 0.5 }}
            >
              {busy ? (
                <>
                  <LoaderCircle size={18} strokeWidth={2} absoluteStrokeWidth className="animate-spin" />
                  調べています…
                </>
              ) : (
                <>
                  <Crosshair size={18} strokeWidth={2} absoluteStrokeWidth />
                  この場所で調べる
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
