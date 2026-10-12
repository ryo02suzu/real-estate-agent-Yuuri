"use client";

import { useEffect, useState } from "react";
import type { LookupResult } from "@/lib/roadmap";
import type { HazardKind } from "@/lib/roadmap/hazard";
import { CloseIcon, MapIcon } from "./icons";
import { MapPanel } from "./map-panel";
import { MapPreview } from "./map-preview";

type Ok = Extract<LookupResult, { status: "ok" }>;

/**
 * スマホの「地図を拡大」：物件のまわりを MICHILU の中の動く地図で見る（全画面）。
 * PC の地図と同じく、筆・地番、用途地域、道路種別（市の公開データがある所だけ）、ハザードを重ねて凡例を出せる。
 * 地図をタップして「ここで調べる」か、ピンを動かすと、その地点で調べ直す（地図は閉じる）
 */
export function FullMap({
  result,
  withRoads,
  hazard,
  onClose,
  onPick,
}: {
  result: Ok;
  /** 道路種別を重ねて開く（「近くの道路」の一覧から開いたとき） */
  withRoads?: boolean;
  /** このハザードを重ねて開く（災害リスクの一覧から開いたとき） */
  hazard?: HazardKind;
  onClose: () => void;
  onPick: (lat: number, lng: number) => void;
}) {
  // 凡例は地図の下に出す（地図とピンを隠さない）
  const [legendSlot, setLegendSlot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sheet = result.links.find((l) => l.sheet)?.sheet;
  const roadLink = result.links.find((l) => l.read);
  const roads = roadLink?.read ? { read: roadLink.read, city: result.municipality.name } : undefined;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="物件のまわりの地図">
      <header className="flex items-center gap-2 px-4 pb-2 pt-[max(10px,env(safe-area-inset-top))]">
        <MapIcon className="h-5 w-5 text-brand" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">物件のまわりの地図</h2>
        <button onClick={onClose} aria-label="閉じる" className="rounded-full p-2 text-muted hover:bg-mint">
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        <MapPanel
          point={{ lat: result.lat, lng: result.lng }}
          sheet={sheet}
          parcel={result.parcel}
          roads={roads}
          compact
          initial={withRoads && roads ? { roads: true } : undefined}
          initialHazard={hazard}
          legendTarget={legendSlot}
          onPick={(lat, lng) => {
            onClose();
            onPick(lat, lng);
          }}
          // WebGL が使えない端末：静的な地図と、地理院地図への入口
          fallback={<MapPreview lat={result.lat} lng={result.lng} className="h-full rounded-none border-0" parcel={result.parcel} />}
        />
      </div>
      <div className="max-h-[38vh] overflow-y-auto px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
        <div ref={setLegendSlot} className="empty:hidden [&:not(:empty)]:mb-2" />
        <p className="text-[10.5px] leading-[1.6] text-muted">
          地図をタップすると、その地点の地番・用途地域・道路種別・建物・ハザード（表示中のもの）と「ここで調べる」が出ます。地図は参考情報です。最終確認は窓口で。
        </p>
      </div>
    </div>
  );
}
