"use client";

// タブの左上の地図：物件の地点を中心に、地理院タイル（と筆・用途地域・ハザードの重ね）を出し、ピン・住所の吹き出し・拡大ボタン・
// 左下のボタン（「地図アプリで開く」など）を重ねる。地図は動かさず、拡大ボタンで MICHILU の動く地図（全画面）を開く
import { Expand } from "lucide-react";
import type { ReactNode } from "react";
import type { Parcel } from "@/lib/roadmap/parcel";
import type { Youto } from "@/lib/roadmap/zoning";
import { TileMap, type Layer, type Project } from "./tile-map";
import { MapBubble, MapPill, MapRoundButton, PinMark } from "./ui";

export function PropertyMap({
  lat,
  lng,
  width,
  height,
  z = 17,
  layer = "pale",
  overlay,
  overlayOpacity,
  parcel,
  zoning,
  onZoning,
  bubble,
  onExpand,
  pill,
  credit = true,
  pinScale = 1,
  children,
}: {
  lat: number;
  lng: number;
  width: number;
  height: number;
  z?: number;
  layer?: Layer;
  overlay?: string | string[];
  overlayOpacity?: number;
  parcel?: Parcel;
  zoning?: boolean;
  onZoning?: (y: Youto[]) => void;
  /** ピンの下の白い吹き出し（住所） */
  bubble?: string;
  onExpand?: () => void;
  /** 左下のボタン */
  pill?: { icon: ReactNode; label: string; onClick?: () => void; href?: string };
  credit?: boolean;
  pinScale?: number;
  /** 施設の印など（ピンの下に描く） */
  children?: (project: Project) => ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[8px]" style={{ width, height }}>
      <TileMap lat={lat} lng={lng} width={width} height={height} z={z} layer={layer} overlay={overlay} overlayOpacity={overlayOpacity} parcel={parcel} zoning={zoning} onZoning={onZoning} credit={credit}>
        {(project) => {
          const [x, y] = project([lng, lat]);
          return (
            <>
              {children?.(project)}
              <span className="absolute" style={{ left: x - 9.5 * pinScale, top: y - 25.3 * pinScale }}>
                <PinMark width={19 * pinScale} height={25.3 * pinScale} />
              </span>
              <span
                className="absolute rounded-full border-[1.2px] border-white bg-[#8fb6ea] shadow-[0_0_0_1px_rgba(19,54,100,0.15)]"
                style={{ left: x - 3.5, top: y - 1.5, width: 7, height: 7 }}
              />
              {bubble && (
                <span className="absolute -translate-x-1/2" style={{ left: Math.min(Math.max(x, 60), width - 60), top: y + 8 }}>
                  <MapBubble size={5.9}>{bubble}</MapBubble>
                </span>
              )}
            </>
          );
        }}
      </TileMap>
      {onExpand && (
        <MapRoundButton label="地図を拡大" onClick={onExpand} style={{ right: 5.2, top: 5.2, width: 19.5, height: 19.5 }}>
          <Expand size={9.5} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" />
        </MapRoundButton>
      )}
      {pill && <MapPill icon={pill.icon} label={pill.label} onClick={pill.onClick} href={pill.href} />}
    </div>
  );
}

/** 小さな地図（施設のカードの写真の代わり）。施設の地点に色の丸の印 */
export function MiniMap({ at, width, height, z = 17, color = "#1f6fe0", className = "", layer = "pale" }: { at: [number, number]; width: number; height: number; z?: number; color?: string; className?: string; layer?: Layer }) {
  const [lng, lat] = at;
  return (
    <div className={`relative shrink-0 overflow-hidden ${className}`} style={{ width, height }}>
      <TileMap lat={lat} lng={lng} width={width} height={height} z={z} layer={layer} credit={false}>
        {(project) => {
          const [x, y] = project(at);
          return <span className="absolute rounded-full border-[1.5px] border-white shadow-[0_1px_2px_rgba(0,0,0,0.3)]" style={{ left: x - 4.5, top: y - 4.5, width: 9, height: 9, background: color }} />;
        }}
      </TileMap>
    </div>
  );
}
