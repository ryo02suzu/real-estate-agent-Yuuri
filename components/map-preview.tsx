"use client";

/* eslint-disable @next/next/no-img-element -- 外部タイル画像をそのまま並べるため */
import { tilesAround } from "@/lib/tiles";
import { ExpandIcon, PinIcon } from "./icons";

/** 地理院タイルで検索地点の周辺を表示する（確認用の静的プレビュー） */
export function MapPreview({ lat, lng }: { lat: number; lng: number }) {
  // z18 のタイルを半分の大きさで描く＝縮尺は z17 相当で、高精細画面でもくっきり
  const { tiles, size, offsetX, offsetY } = tilesAround(lat, lng, 18, { size: 128, radius: 2, layer: "pale" });
  return (
    <div className="relative h-[104px] overflow-hidden rounded-xl border border-line bg-mint">
      <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(${-offsetX}px, ${-offsetY}px)` }}>
        {tiles.map((t) => (
          <img
            key={`${t.x}-${t.y}`}
            src={t.url}
            alt=""
            width={size}
            height={size}
            className="absolute max-w-none"
            style={{ left: t.left, top: t.top }}
            // 淡色地図に無いタイル（水面など）は標準地図で埋める
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.includes("/pale/")) img.src = img.src.replace("/pale/", "/std/");
            }}
          />
        ))}
      </div>
      <PinIcon className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-full text-brand drop-shadow" />
      {/* 地理院地図をその場所で開く（周辺を広く見たいとき） */}
      <a
        href={`https://maps.gsi.go.jp/#17/${lat.toFixed(6)}/${lng.toFixed(6)}/`}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] text-ink shadow-soft"
      >
        <ExpandIcon className="h-3.5 w-3.5" />
        地図を拡大
      </a>
      <a
        href="https://maps.gsi.go.jp/development/ichiran.html"
        target="_blank"
        rel="noreferrer"
        className="absolute left-1 top-1 rounded bg-white/80 px-1.5 text-[9px] text-muted"
      >
        地理院タイル
      </a>
    </div>
  );
}
