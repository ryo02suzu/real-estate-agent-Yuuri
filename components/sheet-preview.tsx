"use client";

/* eslint-disable @next/next/no-img-element -- 外部タイル画像をそのまま並べるため */
import { useState } from "react";
import { sheetName, type SheetHit } from "@/lib/roadmap/sheets";
import { TILE, toWorldPixel } from "@/lib/tiles";
import { ExpandIcon, MapIcon } from "./icons";
import { Sheet } from "./sheet";

/**
 * PDF の図と同じ範囲（北が上）の地理院地図に、物件のピンを立てる。
 * 道路や川の形を見比べれば、開いた PDF のどこに物件があるかがすぐ分かる。
 */
export function SheetPreview({
  lat,
  lng,
  sheet,
  className = "",
  large,
  zoomable = !large,
  fitWidth,
}: {
  lat: number;
  lng: number;
  sheet: SheetHit;
  className?: string;
  /** PC の大きな枠。1段細かいタイルを使う */
  large?: boolean;
  /** 「大きく見る」ボタンを出すか */
  zoomable?: boolean;
  /** 高さを決めず、幅いっぱいに図の縦横比で描く（拡大表示用） */
  fitWidth?: boolean;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [north, west, south, east] = sheet.bounds;
  // タイルを縮めて描くと文字が小さく線がくっきりする。図の幅がスマホで約800px、PC で約1600px になるズーム
  const w0 = toWorldPixel(north, east, 0).x - toWorldPixel(north, west, 0).x;
  const z = Math.min(18, Math.max(12, Math.round(Math.log2((large ? 1600 : 800) / w0))));
  const p0 = toWorldPixel(north, west, z);
  const p1 = toWorldPixel(south, east, z);
  const W = p1.x - p0.x;
  const H = p1.y - p0.y;
  const pin = toWorldPixel(lat, lng, z);
  const tiles: { x: number; y: number }[] = [];
  for (let y = Math.floor(p0.y / TILE); y <= Math.floor(p1.y / TILE); y++)
    for (let x = Math.floor(p0.x / TILE); x <= Math.floor(p1.x / TILE); x++) tiles.push({ x, y });
  const pct = (v: number) => `${v * 100}%`;

  return (
    // 枠いっぱいに、図の縦横比のまま収める（コンテナクエリの単位で幅を決める）
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-xl border border-line bg-mint ${fitWidth ? "" : "p-2 [container-type:size]"} ${className}`}
    >
      <div
        className="relative shadow-[0_0_0_1px_rgba(138,102,50,0.35)]"
        style={{ aspectRatio: `${W} / ${H}`, width: fitWidth ? "100%" : `min(100cqw, calc(100cqh * ${W / H}))` }}
      >
        <div className="absolute inset-0 overflow-hidden bg-white">
        {tiles.map((t) => (
          <img
            key={`${t.x}-${t.y}`}
            src={`https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${t.x}/${t.y}.png`}
            alt=""
            // 淡色地図に無いタイル（水面など）は標準地図で埋める
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.includes("/pale/")) img.src = img.src.replace("/pale/", "/std/");
            }}
            className="absolute max-w-none"
            // タイルの継ぎ目に隙間が出ないよう 1px 重ねる
            style={{
              left: pct((t.x * TILE - p0.x) / W),
              top: pct((t.y * TILE - p0.y) / H),
              width: `calc(${pct(TILE / W)} + 1px)`,
              height: `calc(${pct(TILE / H)} + 1px)`,
            }}
          />
        ))}
        </div>
        {/* 「左上」「中央」などの言い方に合わせた 3×3 の目安線 */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="border-[0.5px] border-dashed border-brand/60" />
          ))}
        </div>
        {/* 物件の地点。図の端にあっても隠れないよう、地点を中心にした丸印にする */}
        <span
          className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-brand shadow-[0_0_0_5px_rgba(138,102,50,0.3)]"
          style={{ left: pct((pin.x - p0.x) / W), top: pct((pin.y - p0.y) / H) }}
        />
      </div>
      {/* スマホでは枠が小さくなるので、大きく表示して PDF と見比べられるようにする */}
      {zoomable && (
        <button
          onClick={() => setZoomed(true)}
          // 枠がとても低いとき（背の低い画面で地図ボタンが多い市）は、はみ出さないよう小さくする
          className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] text-ink shadow-soft [@container(max-height:40px)]:bottom-1 [@container(max-height:40px)]:right-1 [@container(max-height:40px)]:py-0.5 [@container(max-height:40px)]:text-[10px]"
        >
          <ExpandIcon className="h-3.5 w-3.5" />
          大きく見る
        </button>
      )}
      <Sheet title={`${sheetName(sheet)}と同じ範囲`} open={zoomed} onClose={() => setZoomed(false)}>
        <SheetPreview lat={lat} lng={lng} sheet={sheet} zoomable={false} fitWidth />
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          北が上です。道路や川の形を PDF の図と見比べると、物件（●）の場所がすぐ見つかります。
          {sheet.howto && <span className="mt-1 block text-brand">{sheet.howto}</span>}
        </p>
        <a
          href={sheet.url}
          target="_blank"
          rel="noreferrer"
          className="bg-gold mt-3 flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white"
        >
          <MapIcon className="h-5 w-5" />
          {sheet.howto ? `地図で図 ${sheet.label} を開く` : `${sheetName(sheet)}の PDF を開く`}
        </a>
      </Sheet>
      <a
        href="https://maps.gsi.go.jp/development/ichiran.html"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-1 left-1 rounded bg-white/80 px-1.5 text-[9px] text-muted"
      >
        地理院タイル
      </a>
    </div>
  );
}
