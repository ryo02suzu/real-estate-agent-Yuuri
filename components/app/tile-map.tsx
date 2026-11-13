"use client";

/* eslint-disable @next/next/no-img-element -- 地理院タイル・ハザードマップのタイルの画像をそのまま並べるため */
// スマホの新しい見た目の地図。地理院タイル（淡色地図・標準地図・航空写真）を、物件の地点を中心に箱の大きさだけ並べる。
// 上にハザードマップのタイル（半透明）・筆の形・用途地域の色・施設の印を重ねられる。動かせない地図（拡大は全画面の地図で）。
// 細かいタイル（1つ上のズーム）を半分の大きさで描くので、高精細の画面でもくっきり見える
import { useEffect, useId, useState, type ReactNode } from "react";
import { tileBounds, type LngLat, type Parcel } from "@/lib/roadmap/parcel";
import { SANKO_CITIES } from "@/lib/roadmap/sanko-data";
import { YOUTO_COLORS, ZONING_ZOOM, type Youto } from "@/lib/roadmap/zoning";
import { pmtilesZoningSource } from "@/lib/roadmap/zoning-tiles";
import { toWorldPixel } from "@/lib/tiles";

export type Layer = "pale" | "std" | "photo";

const BASE: Record<Layer, { url: (z: number, x: number, y: number) => string; max: number }> = {
  pale: { url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${x}/${y}.png`, max: 18 },
  std: { url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/std/${z}/${x}/${y}.png`, max: 18 },
  photo: { url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x}/${y}.jpg`, max: 18 },
};

/** 経緯度 → 箱の中の位置（px） */
export type Project = (p: LngLat) => [number, number];

type Tile = { key: string; url: string; left: number; top: number; size: number };

/** 箱（幅 w・高さ h）を覆うタイル。z は見た目のズーム、tz は読むタイルのズーム（z より細かいと半分などで描く） */
function tilesFor(lat: number, lng: number, z: number, tz: number, w: number, h: number, url: (z: number, x: number, y: number) => string): Tile[] {
  const k = 2 ** (tz - z);
  const c = toWorldPixel(lat, lng, tz);
  const x0 = c.x - (w / 2) * k;
  const y0 = c.y - (h / 2) * k;
  const out: Tile[] = [];
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((c.y + (h / 2) * k) / 256); ty++)
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((c.x + (w / 2) * k) / 256); tx++)
      out.push({ key: `${tz}/${tx}/${ty}`, url: url(tz, tx, ty), left: (tx * 256 - x0) / k, top: (ty * 256 - y0) / k, size: 256 / k });
  return out;
}

export function projector(lat: number, lng: number, z: number, w: number, h: number): Project {
  const c = toWorldPixel(lat, lng, z);
  return ([plng, plat]) => {
    const p = toWorldPixel(plat, plng, z);
    return [p.x - c.x + w / 2, p.y - c.y + h / 2];
  };
}

export function TileMap({
  lat,
  lng,
  width,
  height,
  z = 17,
  layer = "pale",
  overlay,
  overlayOpacity = 0.75,
  parcel,
  zoning = false,
  onZoning,
  className = "",
  credit = true,
  children,
}: {
  lat: number;
  lng: number;
  width: number;
  height: number;
  /** 見た目のズーム（17 で 1px が約1m） */
  z?: number;
  layer?: Layer;
  /** 重ねるタイル（ハザードマップなど）。{z}/{x}/{y} を含む URL（いくつでも）。z17 まで */
  overlay?: string | string[];
  overlayOpacity?: number;
  /** 筆の形を重ねる */
  parcel?: Parcel;
  /** 用途地域の色を重ねる */
  zoning?: boolean;
  /** 重ねた用途地域（凡例用。地図に見えているもの） */
  onZoning?: (youto: Youto[]) => void;
  className?: string;
  /** 左上に出典（地理院タイル）を出す */
  credit?: boolean;
  /** 印など。project で経緯度を箱の中の位置にする */
  children?: (project: Project) => ReactNode;
}) {
  const base = BASE[layer];
  const tz = Math.min(z + 1, base.max);
  const tiles = tilesFor(lat, lng, z, tz, width, height, base.url);
  const otz = Math.min(z + 1, 17);
  const overlays = overlay === undefined ? [] : Array.isArray(overlay) ? overlay : [overlay];
  const overlayTiles = overlays.flatMap((o) => tilesFor(lat, lng, z, otz, width, height, (zz, x, y) => o.replace("{z}", String(zz)).replace("{x}", String(x)).replace("{y}", String(y))).map((t) => ({ ...t, key: `${o}|${t.key}` })));
  const project = projector(lat, lng, z, width, height);
  const clip = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const shapes = useZoningShapes(zoning ? { lat, lng, z, width, height } : null);
  useEffect(() => {
    if (!onZoning || !shapes) return;
    const seen = new Map<string, Youto>();
    for (const s of shapes) seen.set(`${s.youto.code}|${s.youto.name}`, s.youto);
    onZoning([...seen.values()]);
  }, [shapes, onZoning]);
  return (
    <div className={`relative overflow-hidden bg-[#e9eef4] ${className}`} style={{ width, height }}>
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.url}
          alt=""
          width={t.size}
          height={t.size}
          loading="lazy"
          draggable={false}
          className="absolute max-w-none select-none"
          style={{ left: t.left, top: t.top, width: t.size, height: t.size }}
          onError={(e) => {
            // 淡色地図に無いタイル（水面など）は標準地図で埋める
            const img = e.currentTarget;
            if (img.src.includes("/pale/")) img.src = img.src.replace("/pale/", "/std/");
            else img.style.visibility = "hidden";
          }}
        />
      ))}
      {shapes && (
        <svg aria-hidden className="pointer-events-none absolute left-0 top-0" width={width} height={height}>
          {shapes.map((s, i) => (
            <path
              key={i}
              d={s.rings.map((ring) => `M${ring.map((p) => project(p).map((v) => v.toFixed(1)).join(",")).join("L")}Z`).join("")}
              fill={YOUTO_COLORS[s.youto.code] ?? "#cccccc"}
              fillOpacity={0.42}
              fillRule="evenodd"
              stroke={YOUTO_COLORS[s.youto.code] ?? "#999999"}
              strokeOpacity={0.9}
              strokeWidth={0.8}
            />
          ))}
        </svg>
      )}
      {overlayTiles.map((t) => (
        <img
          key={`o${t.key}`}
          src={t.url}
          alt=""
          width={t.size}
          height={t.size}
          loading="lazy"
          draggable={false}
          className="absolute max-w-none select-none"
          style={{ left: t.left, top: t.top, width: t.size, height: t.size, opacity: overlayOpacity }}
          // 区域の無い所はタイルが無い（404）
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        />
      ))}
      {parcel && (
        // 筆の形。タイルの境で分かれているので、部分ごとにそのタイルの範囲で切り抜く（境の線を出さない）
        <svg aria-hidden className="pointer-events-none absolute left-0 top-0" width={width} height={height}>
          <defs>
            {parcel.pieces.map(({ tile: [x, y] }, i) => {
              const [w, s, e, n] = tileBounds(x, y);
              const [x0, y0] = project([w, n]);
              const [x1, y1] = project([e, s]);
              return (
                <clipPath key={i} id={`${clip}-${i}`}>
                  <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
                </clipPath>
              );
            })}
          </defs>
          {parcel.pieces.map(({ polygons }, i) => (
            <path
              key={i}
              clipPath={`url(#${clip}-${i})`}
              d={polygons
                .flat()
                .map((ring) => `M${ring.map((p) => project(p).map((v) => v.toFixed(1)).join(",")).join("L")}Z`)
                .join("")}
              fill="rgba(19,54,100,0.12)"
              fillRule="evenodd"
              stroke="#133664"
              strokeWidth={1.2}
            />
          ))}
        </svg>
      )}
      {children?.(project)}
      {credit && (
        <a
          href="https://maps.gsi.go.jp/development/ichiran.html"
          target="_blank"
          rel="noreferrer"
          className="absolute left-[4px] top-[4px] rounded-[2px] bg-white/75 px-[3px] py-[1px] leading-none text-[#6b778a]"
          style={{ fontSize: 4.6 }}
        >
          地理院タイル{overlays.length ? "・ハザードマップポータル" : ""}
          {parcel ? (parcel.sanko ? `・筆：${SANKO_CITIES[parcel.sanko]?.credit ?? "市町村の地番参考図"}` : parcel.estimated ? "・筆：登記所備付地図データ（法務省）から推定した位置" : "・筆：登記所備付地図データ（法務省）を加工") : ""}
          {zoning ? "・用途地域：都市計画決定GISデータ（国交省）を加工" : ""}
        </a>
      )}
    </div>
  );
}

type Shape = { youto: Youto; rings: LngLat[][] };

/** 地図に見えている範囲の用途地域の形（都市計画のタイル z15 を読む） */
function useZoningShapes(view: { lat: number; lng: number; z: number; width: number; height: number } | null): Shape[] | null {
  const key = view ? `${view.lat},${view.lng},${view.z},${view.width},${view.height}` : "";
  const [state, setState] = useState<{ key: string; shapes: Shape[] }>();
  useEffect(() => {
    if (!view) return;
    let alive = true;
    const k = 2 ** (ZONING_ZOOM - view.z);
    const c = toWorldPixel(view.lat, view.lng, ZONING_ZOOM);
    const xs = [Math.floor((c.x - (view.width / 2) * k) / 256), Math.floor((c.x + (view.width / 2) * k) / 256)];
    const ys = [Math.floor((c.y - (view.height / 2) * k) / 256), Math.floor((c.y + (view.height / 2) * k) / 256)];
    const jobs: Promise<Shape[]>[] = [];
    for (let x = xs[0]; x <= xs[1]; x++)
      for (let y = ys[0]; y <= ys[1]; y++)
        jobs.push(
          pmtilesZoningSource
            .tile(x, y)
            .then((features) =>
              (features ?? [])
                .filter((f) => f.layer === "youto")
                .map((f) => ({
                  youto: { name: f.props.name ?? "用途地域", code: f.props.code ?? 0, far: f.props.far, bcr: f.props.bcr },
                  rings: f.geometry().polygons.flat(),
                })),
            )
            .catch(() => []),
        );
    Promise.all(jobs).then((all) => alive && setState({ key, shapes: all.flat() }));
    return () => {
      alive = false;
    };
    // key に範囲が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return view && state?.key === key ? state.shapes : null;
}
