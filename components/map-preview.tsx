"use client";

/* eslint-disable @next/next/no-img-element -- 外部タイル画像をそのまま並べるため */
import { useId } from "react";
import { tileBounds, type Parcel } from "@/lib/roadmap/parcel";
import { TILE, tilesAround, toWorldPixel } from "@/lib/tiles";
import { ExpandIcon, PinIcon, PinOutlineIcon } from "./icons";

/** 地理院タイルで検索地点の周辺を表示する（確認用の静的プレビュー） */
export function MapPreview({
  lat,
  lng,
  className = "h-[104px]",
  large,
  onFix,
  fixClassName = "",
  parcel,
}: {
  lat: number;
  lng: number;
  className?: string;
  /** PC の大きな枠：z18 のタイルを半分の大きさで 9×9 枚（1152px 四方） */
  large?: boolean;
  /** 「場所を直す」（地図で物件の場所を選び直す） */
  onFix?: () => void;
  /** 「場所を直す」のボタンに足すクラス（背の低い画面では別の所に出すときに隠す） */
  fixClassName?: string;
  /** 地番で見つけた筆・地図で選んだ地点の筆（形を重ねる） */
  parcel?: Parcel;
}) {
  // z18 のタイルを半分の大きさで描く＝縮尺は z17 相当で、高精細画面でもくっきり
  const radius = large ? 4 : 2;
  const { tiles, size, offsetX, offsetY } = tilesAround(lat, lng, 18, { size: 128, radius, layer: "pale" });
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // 経緯度 → タイルを並べた箱の中の位置（物件の地点が offsetX, offsetY）
  const c = toWorldPixel(lat, lng, 18);
  const px = (lng2: number, lat2: number) => {
    const p = toWorldPixel(lat2, lng2, 18);
    return [offsetX + ((p.x - c.x) * size) / TILE, offsetY + ((p.y - c.y) * size) / TILE] as const;
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border border-line bg-mint ${className}`}>
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
        {parcel && (
          // 筆の形。タイルの境で分かれているので、部分ごとにそのタイルの範囲で切り抜く（境の線を出さない）
          <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={(2 * radius + 1) * size} height={(2 * radius + 1) * size}>
            <defs>
              {parcel.pieces.map(({ tile: [x, y] }, i) => {
                const [w, s, e, n] = tileBounds(x, y);
                const [x0, y0] = px(w, n);
                const [x1, y1] = px(e, s);
                return (
                  <clipPath key={i} id={`${clipId}-${i}`}>
                    <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
                  </clipPath>
                );
              })}
            </defs>
            {parcel.pieces.map(({ polygons }, i) => (
              <path
                key={i}
                clipPath={`url(#${clipId}-${i})`}
                d={polygons
                  .flat()
                  .map((ring) => `M${ring.map(([x, y]) => px(x, y).map((v) => v.toFixed(1)).join(",")).join("L")}Z`)
                  .join("")}
                fill="rgba(196,154,92,0.25)"
                fillRule="evenodd"
                stroke="#8a6632"
                strokeWidth={2}
              />
            ))}
          </svg>
        )}
      </div>
      <PinIcon className={`absolute left-1/2 top-1/2 ${large ? "h-12 w-12" : "h-8 w-8"} -translate-x-1/2 -translate-y-full text-brand drop-shadow`} />
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
      {onFix && (
        <button
          onClick={onFix}
          className={`absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-brand shadow-soft ${fixClassName}`}
        >
          <PinOutlineIcon className="h-3.5 w-3.5" />
          場所を直す
        </button>
      )}
      <a
        href="https://maps.gsi.go.jp/development/ichiran.html"
        target="_blank"
        rel="noreferrer"
        className="absolute left-1 top-1 rounded bg-white/80 px-1.5 text-[9px] text-muted"
      >
        地理院タイル
      </a>
      {parcel && (
        // 登記所備付地図データ利用規約の出典と、加工したことの記載
        <a
          href="https://front.geospatial.jp/moj-chizu-xml-readme/"
          target="_blank"
          rel="noreferrer"
          className="absolute right-1 top-1 rounded bg-white/80 px-1.5 text-[9px] text-muted"
        >
          筆：「登記所備付地図データ」（法務省）を加工して作成
        </a>
      )}
    </div>
  );
}
