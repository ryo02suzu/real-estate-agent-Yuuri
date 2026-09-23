/* eslint-disable @next/next/no-img-element -- 外部タイル画像をそのまま並べるため */
import { tilesAround } from "@/lib/tiles";
import { PinIcon } from "./icons";

/** 地理院タイルで検索地点の周辺を表示する（確認用の静的プレビュー） */
export function MapPreview({ lat, lng }: { lat: number; lng: number }) {
  // z18 のタイルを半分の大きさで描く＝縮尺は z17 相当で、高精細画面でもくっきり
  const { tiles, size, offsetX, offsetY } = tilesAround(lat, lng, 18, { size: 128, radius: 2, layer: "pale" });
  return (
    <div className="relative h-36 overflow-hidden rounded-2xl border border-line bg-mint">
      <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(${-offsetX}px, ${-offsetY}px)` }}>
        {tiles.map((t) => (
          <img key={`${t.x}-${t.y}`} src={t.url} alt="" width={size} height={size} className="absolute max-w-none" style={{ left: t.left, top: t.top }} />
        ))}
      </div>
      <PinIcon className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-full text-red-600 drop-shadow" />
      <a
        href="https://maps.gsi.go.jp/development/ichiran.html"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-1 right-1 rounded bg-white/80 px-1.5 text-[10px] text-muted"
      >
        地理院タイル
      </a>
    </div>
  );
}
