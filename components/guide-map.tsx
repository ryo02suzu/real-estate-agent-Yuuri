"use client";

/* eslint-disable @next/next/no-img-element -- 外部タイル画像をそのまま並べるため */
// 案内図：物件の場所を示す地図（詳細図と広域図）を A4 1枚で印刷・PDF 保存する。
// 画面ではシートに同じ1枚を縮めて見せ、シートを開いているあいだは印刷の対象を調査メモから案内図に替える
// （body の data-print と、document.body に置いた印刷用の1枚 .print-guide。app/globals.css）。
// 地図は国土地理院の地理院タイル（標準地図）に、物件の位置と筆の形を書き加えたもの。社内や特定のお客様に渡す説明資料は
// 出典の表示だけで使えるが、チラシ・販売図面など不特定多数に配る広告に使うときは国土地理院の承認が要る（測量法。画面と印刷に書く）
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LookupResult } from "@/lib/roadmap";
import { KOZU_CREDIT } from "@/lib/roadmap/kozu-data";
import { chibanLabel, estimatedMark, kuikiLabel, tileBounds, type Parcel } from "@/lib/roadmap/parcel";
import { PARCEL_CREDIT } from "@/lib/roadmap/parcel-data";
import { TILE, tilesAround, toWorldPixel } from "@/lib/tiles";
import { PrintIcon } from "./icons";
import { Sheet } from "./sheet";

type Ok = Extract<LookupResult, { status: "ok" }>;

/** 印刷の1枚の大きさ（A4 縦から余白 12mm を除いた 186×273mm に収まる、96dpi の px） */
const PAGE = { w: 700, h: 990 };
/** 地図の大きさ（詳細図・広域図） */
const DETAIL = { w: PAGE.w, h: 500, z: 18 };
const WIDE = { w: PAGE.w, h: 300, z: 16 };
/** 256px のタイルを 192px で描く（印刷でくっきりし、地図の文字も小さすぎない） */
const TILE_PX = 192;
/** 国土地理院の地図の利用手続（申請が要る場合・要らない場合） */
const GSI_TERMS_URL = "https://www.gsi.go.jp/LAW/2930-index.html";

/** 案内図のシート（画面で縮めて見せ、印刷・PDF 保存する） */
export function GuideMapSheet({ result, open, onClose }: { result: Ok; open: boolean; onClose: () => void }) {
  // 開いているあいだは、ブラウザのメニューから印刷しても案内図になるようにする
  useEffect(() => {
    if (!open) return;
    document.body.dataset.print = "guide";
    return () => {
      delete document.body.dataset.print;
    };
  }, [open]);

  if (!open) return null;
  // document.body に出す（PC のパネルは backdrop-blur で fixed の基準になり、その中では画面いっぱいに出せない）
  return createPortal(
    <Sheet title="案内図（A4）" open onClose={onClose}>
      <GuideMapBody result={result} />
    </Sheet>,
    document.body,
  );
}

function GuideMapBody({ result }: { result: Ok }) {
  const frame = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const scale = usePreviewScale(frame);
  const ready = useImagesReady(page);
  return (
    <div>
      {/* 印刷する1枚を、シートの幅と画面の高さに収まるように縮めて見せる */}
      <div ref={frame} className="flex justify-center">
        <div className="overflow-hidden rounded border border-line shadow-soft" style={{ width: PAGE.w * scale, height: PAGE.h * scale }}>
          <div className="origin-top-left" style={{ transform: `scale(${scale})`, width: PAGE.w }}>
            <GuideMapPage result={result} />
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-[10.5px] leading-[1.6] text-muted [@media(max-height:720px)]:mt-1.5">
        社内や、特定のお客様に渡す説明資料には、出典の表示を残してそのまま使えます。チラシ・販売図面・ホームページなど不特定多数に配る広告に使うときは、
        <a href={GSI_TERMS_URL} target="_blank" rel="noreferrer" className="text-brand underline">
          国土地理院の承認
        </a>
        が要ります。
      </p>
      <button
        onClick={() => window.print()}
        disabled={!ready}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-light to-brand py-3 text-[15px] font-bold text-white shadow-soft disabled:opacity-60 [@media(max-height:720px)]:mt-1.5 [@media(max-height:720px)]:py-2.5"
      >
        <PrintIcon className="h-4 w-4" />
        {ready ? "印刷・PDF保存" : "地図を読み込み中…"}
      </button>
      {/* 印刷用の1枚（画面には出ない。document.body の直下に置き、印刷では画面の作りを丸ごと隠す） */}
      {createPortal(
        <div ref={page} className="print-guide bg-white">
          <GuideMapPage result={result} />
        </div>,
        document.body,
      )}
    </div>
  );
}

/** 案内図の1枚 */
function GuideMapPage({ result }: { result: Ok }) {
  const p = result.parcel;
  const found = p && !result.picked ? p : undefined;
  const [at] = useState(() => new Date());
  const date = `${at.getFullYear()}年${at.getMonth() + 1}月${at.getDate()}日`;
  return (
    <div className="bg-white text-[11px] leading-[1.55] text-[#1d1b18]" style={{ width: PAGE.w }}>
      <header className="flex items-end justify-between gap-4 border-b-2 border-[#9a7442] pb-1.5">
        <div className="min-w-0">
          <p className="text-[18px] font-bold leading-tight tracking-[0.3em]">案内図</p>
          <p className="mt-1 text-[14px] font-bold leading-snug">
            {result.matchedAddress}
            {found ? ` ${chibanLabel(found.chibanRaw)}${estimatedMark(found)}` : <span className="text-[12px] font-normal"> 付近</span>}
          </p>
          {p && result.picked && (
            <p className="text-[11px]">
              地図で選んだ地点の筆：{kuikiLabel(p.kuiki)} {chibanLabel(p.chibanRaw)}
              {estimatedMark(p)}
            </p>
          )}
        </div>
        <p className="shrink-0 text-right text-[10px] leading-[1.5] text-[#7a6a55]">
          作成日 {date}
          <br />
          MICHILU
        </p>
      </header>

      <div className="mt-2">
        <TileMap lat={result.lat} lng={result.lng} {...DETAIL} parcel={p} label="詳細図" />
      </div>
      <div className="mt-2">
        <TileMap lat={result.lat} lng={result.lng} {...WIDE} label="広域図" frame={{ w: DETAIL.w, h: DETAIL.h, z: DETAIL.z }} />
      </div>

      <footer className="mt-2 space-y-0.5 text-[9px] leading-[1.55] text-[#5d5143]">
        <p>
          ※ 赤い丸が物件の位置です（{found ? "地番で探した筆の中の点" : result.picked ? "地図で選んだ地点" : "住所から求めた位置"}）。
          {result.approximate ? "番地まで見つからず、町の中心の位置です。" : "位置はずれることがあります。"}現地でお確かめください。
        </p>
        <p>
          ※ この案内図は、国土地理院の地理院タイル（標準地図）に物件の位置{p ? "と筆の形" : ""}
          を書き加えたものです。社内や、特定のお客様に渡す説明資料にお使いください。チラシ・販売図面・ホームページなど不特定多数に配る広告に使うときは、国土地理院の承認が必要です（測量法）。
        </p>
        <p className="text-[#7a6a55]">
          出典：地理院タイル（国土地理院）を加工して作成。{p && `筆の${PARCEL_CREDIT}。`}
          {p?.estimated && `${KOZU_CREDIT}。`}
        </p>
      </footer>
    </div>
  );
}

/** 地理院タイル（標準地図）を並べた地図。物件の位置の赤い丸、筆の形、縮尺、方位を描く */
function TileMap({
  lat,
  lng,
  z,
  w,
  h,
  parcel,
  frame,
  label,
}: {
  lat: number;
  lng: number;
  z: number;
  w: number;
  h: number;
  parcel?: Parcel;
  /** 詳細図の範囲（広域図に破線の枠で描く） */
  frame?: { w: number; h: number; z: number };
  label: string;
}) {
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { tiles, offsetX, offsetY } = tilesAround(lat, lng, z, { size: TILE_PX, radius: 2, layer: "std" });
  // 経緯度 → 地図の枠の中の位置（物件の地点が枠の中心）
  const c = toWorldPixel(lat, lng, z);
  const px = (lng2: number, lat2: number) => {
    const p = toWorldPixel(lat2, lng2, z);
    return [w / 2 + ((p.x - c.x) * TILE_PX) / TILE, h / 2 + ((p.y - c.y) * TILE_PX) / TILE] as const;
  };
  // 1px が何 m か（Webメルカトルの縮み方は緯度で決まる）
  const mpp = ((40075016.686 * Math.cos((lat * Math.PI) / 180)) / (TILE * 2 ** z)) * (TILE / TILE_PX);
  const fr = frame && { w: frame.w / 2 ** (frame.z - z), h: frame.h / 2 ** (frame.z - z) };
  const big = z >= 17;
  return (
    <div className="relative overflow-hidden border border-[#8f8577] bg-[#f4f1ea]" style={{ width: w, height: h }}>
      <div className="absolute" style={{ left: w / 2 - offsetX, top: h / 2 - offsetY }}>
        {tiles.map((t) => (
          <img key={`${t.x}-${t.y}`} src={t.url} alt="" width={TILE_PX} height={TILE_PX} className="absolute max-w-none" style={{ left: t.left, top: t.top }} />
        ))}
      </div>
      <svg aria-hidden className="absolute left-0 top-0" width={w} height={h}>
        {parcel && (
          <>
            <defs>
              {/* 筆はタイルの境で分かれているので、部分ごとにそのタイルの範囲で切り抜く（境の線を出さない） */}
              {parcel.pieces.map(({ tile: [x, y] }, i) => {
                const [west, south, east, north] = tileBounds(x, y);
                const [x0, y0] = px(west, north);
                const [x1, y1] = px(east, south);
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
                fill="rgba(214,40,40,0.14)"
                fillRule="evenodd"
                stroke="#d62828"
                strokeWidth={2}
              />
            ))}
          </>
        )}
        {fr && <rect x={(w - fr.w) / 2} y={(h - fr.h) / 2} width={fr.w} height={fr.h} fill="none" stroke="#d62828" strokeWidth={1.5} strokeDasharray="5 3" />}
        {/* 物件の位置：赤い二重丸と「物件」の札 */}
        <circle cx={w / 2} cy={h / 2} r={big ? 14 : 8} fill="none" stroke="#fff" strokeWidth={big ? 6 : 5} />
        <circle cx={w / 2} cy={h / 2} r={big ? 14 : 8} fill="none" stroke="#d62828" strokeWidth={big ? 3 : 2.5} />
        <circle cx={w / 2} cy={h / 2} r={big ? 3.5 : 2.5} fill="#d62828" />
        {big && (
          <g>
            <line x1={w / 2 + 10} y1={h / 2 - 10} x2={w / 2 + 26} y2={h / 2 - 26} stroke="#d62828" strokeWidth={2} />
            <rect x={w / 2 + 24} y={h / 2 - 46} width={44} height={22} rx={4} fill="#d62828" />
            <text x={w / 2 + 46} y={h / 2 - 30.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">
              物件
            </text>
          </g>
        )}
      </svg>
      <span className="absolute left-1.5 top-1.5 rounded-sm bg-white/90 px-1.5 text-[10px] font-bold">{label}</span>
      <NorthArrow />
      <ScaleBar mpp={mpp} />
      <span className="absolute bottom-0.5 right-1 rounded-sm bg-white/85 px-1 text-[8px] text-[#5d5143]">地理院タイル（国土地理院）</span>
    </div>
  );
}

/** 縮尺のものさし（区切りの良い長さで、100px 前後） */
function ScaleBar({ mpp }: { mpp: number }) {
  const NICE = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const m = NICE.filter((v) => v / mpp <= 140).pop() ?? NICE[0];
  return (
    <div className="absolute bottom-1.5 left-1.5 rounded-sm bg-white/90 px-1.5 pb-0.5 pt-1 text-[9px] leading-none">
      <div className="border-x-2 border-b-2 border-[#1d1b18]" style={{ width: m / mpp, height: 5 }} />
      <span className="mt-0.5 block">{m >= 1000 ? `${m / 1000}km` : `${m}m`}</span>
    </div>
  );
}

/** 方位（地理院タイルは北が上） */
function NorthArrow() {
  return (
    <svg aria-hidden viewBox="0 0 24 34" className="absolute right-2 top-1.5 h-[34px] w-[24px]">
      <text x="12" y="10" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1d1b18">
        N
      </text>
      <path d="M12 12 L18 32 L12 27 L6 32 Z" fill="#1d1b18" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

/** 縮めて見せる倍率（枠の幅と、画面の高さ。シートの見出し・説明・ボタンの分を除く） */
function usePreviewScale(frame: React.RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(0.45);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / PAGE.w, (window.innerHeight * 0.92 - 215) / PAGE.h, 1));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [frame]);
  return scale;
}

/** 印刷用の1枚の地図が読み終わったか（読めないタイルがあっても 8 秒で進める） */
function useImagesReady(page: React.RefObject<HTMLDivElement | null>): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const imgs = [...el.querySelectorAll("img")];
    let left = imgs.filter((i) => !i.complete).length;
    const done = () => {
      left -= 1;
      if (left <= 0) setReady(true);
    };
    for (const i of imgs) {
      if (i.complete) continue;
      i.addEventListener("load", done, { once: true });
      i.addEventListener("error", done, { once: true });
    }
    const t = setTimeout(() => setReady(true), left ? 8000 : 0);
    return () => clearTimeout(t);
  }, [page]);
  return ready;
}
