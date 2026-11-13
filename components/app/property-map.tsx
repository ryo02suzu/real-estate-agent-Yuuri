"use client";

// タブの上の地図：物件の地点を中心に、地理院タイル（と筆・用途地域・ハザードの重ね）を出し、ピン・住所の吹き出し・拡大ボタン・
// 左下のボタン（「地図アプリで開く」など）を重ねる。地図は動かさず、拡大ボタンで MICHILU の動く地図（全画面）を開く。
// 寸法は本物の大きさ（ピン24×32pt・吹き出し12pt・ボタン32pt）
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
  const pw = 24 * pinScale;
  const ph = 32 * pinScale;
  return (
    <div className="relative overflow-hidden rounded-[18px]" style={{ width, height }}>
      <TileMap lat={lat} lng={lng} width={width} height={height} z={z} layer={layer} overlay={overlay} overlayOpacity={overlayOpacity} parcel={parcel} zoning={zoning} onZoning={onZoning} credit={credit}>
        {(project) => {
          const [x, y] = project([lng, lat]);
          return (
            <>
              {children?.(project)}
              <span className="absolute" style={{ left: x - pw / 2, top: y - ph }}>
                <PinMark width={pw} height={ph} />
              </span>
              <span className="absolute rounded-full border-[1.5px] border-white bg-[#8fb6ea] shadow-[0_0_0_1px_rgba(19,54,100,0.15)]" style={{ left: x - 4, top: y - 2, width: 8, height: 8 }} />
              {bubble && (
                <span className="absolute -translate-x-1/2" style={{ left: Math.min(Math.max(x, 90), width - 90), top: y + 10 }}>
                  <MapBubble>{bubble}</MapBubble>
                </span>
              )}
            </>
          );
        }}
      </TileMap>
      {onExpand && (
        <MapRoundButton label="地図を拡大" onClick={onExpand} style={{ right: 8, top: 8, width: 32, height: 32 }}>
          <Expand size={15} strokeWidth={1.8} absoluteStrokeWidth color="#1c3a63" />
        </MapRoundButton>
      )}
      {pill && <MapPill icon={pill.icon} label={pill.label} onClick={pill.onClick} href={pill.href} />}
    </div>
  );
}
