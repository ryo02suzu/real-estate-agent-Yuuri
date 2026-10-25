"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import type { LookupResult } from "@/lib/roadmap";
import type { HazardKind } from "@/lib/roadmap/hazard";
import { displayAddress, GLASS, HEAD, LIGHT } from "./app/r-ui";
import { MapPanel } from "./map-panel";
import { MapPreview } from "./map-preview";

type Ok = Extract<LookupResult, { status: "ok" }>;

/**
 * スマホの「地図を拡大」：物件のまわりを MICHILU の中の動く地図で見る（全画面）。
 * PC の地図と同じく、筆・地番、用途地域、道路種別（市の公開データがある所だけ）、ハザードを重ねて凡例を出せる。
 * 地図をタップして「ここで調べる」か、ピンを動かすと、その地点で調べ直す（地図は閉じる）。
 * 見た目はホームと同じ系統：地図の上に浮かぶガラスのバー（戻る・住所）と、下の白い板（凡例と注記）
 */
export function FullMap({
  result,
  withRoads,
  hazard,
  landPrice,
  onClose,
  onPick,
}: {
  result: Ok;
  /** 道路種別を重ねて開く（「近くの道路」の一覧から開いたとき） */
  withRoads?: boolean;
  /** このハザードを重ねて開く（災害リスクの一覧から開いたとき） */
  hazard?: HazardKind;
  /** 地価を重ね、この地点（[経度, 緯度]）も見えるように開く（地価の一覧の「地図」から開いたとき） */
  landPrice?: [number, number];
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
    <div className="app-touch fixed inset-0 z-50 flex flex-col bg-[#e8eef5]" role="dialog" aria-modal="true" aria-label="物件のまわりの地図">
      <div className="relative min-h-0 flex-1">
        <MapPanel
          point={{ lat: result.lat, lng: result.lng }}
          sheet={sheet}
          parcel={result.parcel}
          roads={roads}
          compact
          toolsClassName="right-3 top-[calc(max(10px,env(safe-area-inset-top))+56px)]"
          initial={withRoads && roads ? { roads: true } : landPrice ? { landPrice: true } : undefined}
          initialHazard={hazard}
          initialLandPrice={landPrice}
          legendTarget={legendSlot}
          onPick={(lat, lng) => {
            onClose();
            onPick(lat, lng);
          }}
          // WebGL が使えない端末：静的な地図と、地理院地図への入口
          fallback={<MapPreview lat={result.lat} lng={result.lng} className="h-full rounded-none border-0" parcel={result.parcel} />}
        />
        {/* 上のガラスのバー：戻る・住所 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 px-[12px]" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
          <div className="pointer-events-auto flex h-[46px] items-center gap-[6px] rounded-full pl-[3px] pr-[16px] shadow-[0_6px_18px_rgba(20,45,85,0.16)]" style={GLASS}>
            <button onClick={onClose} aria-label="閉じる" className="press flex size-[40px] shrink-0 items-center justify-center rounded-full">
              <ArrowLeft size={22} strokeWidth={2} absoluteStrokeWidth color={HEAD} />
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold leading-none" style={{ fontSize: 15, color: HEAD }}>
                物件のまわりの地図
              </span>
              <span className="mt-[3px] block truncate leading-none" style={{ fontSize: 11.5, color: LIGHT }}>
                {displayAddress(result.matchedAddress)}
              </span>
            </span>
          </div>
        </div>
      </div>
      {/* 下の白い板：凡例と注記 */}
      <div className="relative -mt-[22px] max-h-[38vh] shrink-0 overflow-y-auto rounded-t-[22px] bg-white px-[16px] pb-[max(12px,env(safe-area-inset-bottom))] pt-[12px] shadow-[0_-8px_24px_rgba(20,45,85,0.12)]">
        <div className="mx-auto mb-[10px] h-[4px] w-[40px] rounded-full bg-[#dde5ee]" />
        <div ref={setLegendSlot} className="empty:hidden [&:not(:empty)]:mb-2" />
        <p className="leading-[1.6]" style={{ fontSize: 11, color: LIGHT }}>
          地図をタップすると、その地点の地番・用途地域・道路種別・建物・地価・ハザード（表示中のもの）と「ここで調べる」が出ます。地図は参考情報です。最終確認は窓口で。
        </p>
      </div>
    </div>
  );
}
