"use client";

/* eslint-disable @next/next/no-img-element -- 地理院タイルの画像をそのまま並べるため */
// 物件の地点を中心にした航空写真（地理院タイルの全国最新写真）。建物の写真の代わりに、上から見た物件のまわりを出す。
// 出典（地理院タイル）は、使う側が小さく添える
import { TILE, toWorldPixel } from "@/lib/tiles";

export function AerialPhoto({
  lat,
  lng,
  z = 18,
  radius = 1,
  className = "",
  children,
}: {
  lat: number;
  lng: number;
  /** 18 が一番くわしい（1枚 256px を半分の大きさで描くので、縮尺は z17 相当） */
  z?: number;
  /** 中心のまわり何枚ぶん並べるか（1 なら 3×3） */
  radius?: number;
  className?: string;
  /** 写真の上に重ねるもの（ピン・暗い膜など） */
  children?: React.ReactNode;
}) {
  const size = TILE / 2;
  const p = toWorldPixel(lat, lng, z);
  const cx = Math.floor(p.x / TILE);
  const cy = Math.floor(p.y / TILE);
  const scale = size / TILE;
  const offsetX = (p.x - (cx - radius) * TILE) * scale;
  const offsetY = (p.y - (cy - radius) * TILE) * scale;
  const tiles: { x: number; y: number; left: number; top: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) tiles.push({ x: cx + dx, y: cy + dy, left: (dx + radius) * size, top: (dy + radius) * size });
  return (
    <div className={`relative overflow-hidden bg-[#9fb0c4] ${className}`}>
      <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(${-offsetX}px, ${-offsetY}px)` }}>
        {tiles.map((t) => (
          <img
            key={`${t.x}-${t.y}`}
            src={`https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${t.x}/${t.y}.jpg`}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            className="absolute max-w-none"
            style={{ left: t.left, top: t.top }}
          />
        ))}
      </div>
      {children}
    </div>
  );
}
