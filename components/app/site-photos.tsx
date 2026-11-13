"use client";
/* eslint-disable @next/next/no-img-element -- 端末の中に保存した写真（blob の URL）をそのまま並べるため */

// 現地の写真メモ（要注意点と次にやることの「現地で確かめる」の中）。撮る・選ぶ → 描き直して端末に保存（撮影場所などの情報は消える。
// lib/site-photos.ts）→ 並べる・大きく見る（左右になぞって送る）・消す。調査メモの印刷にも入る。送信・書き出しはしない
import { Camera, ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { addPhoto, listPhotos, MAX_PHOTOS, reencode, removePhoto } from "@/lib/site-photos";
import { NAVY } from "./ui";

export type PhotoItem = { id: string; url: string; at: number };
export type SitePhotosState = { items: PhotoItem[]; busy: boolean; error: string | null; add: (files: FileList | File[]) => Promise<void>; remove: (id: string) => Promise<void> };

/** 物件の写真（端末の中から読み、足す・消すたびに読み直す。画像の URL は使い終わったら消す） */
export function useSitePhotos(pid: string): SitePhotosState {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [ver, setVer] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => {
    let alive = true;
    listPhotos(pid)
      .then((ps) => {
        if (!alive) return;
        const next = ps.map((p) => ({ id: p.id, url: URL.createObjectURL(p.blob), at: p.at }));
        const old = urls.current;
        urls.current = next.map((x) => x.url);
        setItems(next);
        // 前の画像の URL は、描き直したあとで消す（一瞬消えて見えないように）
        setTimeout(() => old.forEach((u) => URL.revokeObjectURL(u)), 1500);
      })
      .catch(() => {
        // IndexedDB が使えない端末（プライベートブラウズの一部など）は、写真なしで続ける
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [pid, ver]);
  useEffect(() => {
    const held = urls;
    return () => held.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const add = async (files: FileList | File[]) => {
    const room = MAX_PHOTOS - items.length;
    const list = [...files].filter((f) => f.type.startsWith("image/") || !f.type).slice(0, Math.max(0, room));
    if (!list.length) {
      setError(room <= 0 ? `1つの物件に${MAX_PHOTOS}枚までです。要らない写真を消してから足してください。` : "画像のファイルを選んでください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const f of list) await addPhoto(pid, await reencode(f));
    } catch {
      setError("写真を保存できませんでした。端末の空き容量と、プライベートブラウズでないことを確かめてください。");
    } finally {
      setBusy(false);
      setVer((v) => v + 1);
    }
  };
  const remove = async (id: string) => {
    try {
      await removePhoto(id);
    } finally {
      setVer((v) => v + 1);
    }
  };
  return { items, busy, error, add, remove };
}

/** 「現地で確かめる」の中の写真の欄 */
export function SitePhotos({ photos }: { photos: SitePhotosState }) {
  const input = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<number | null>(null);
  const { items, busy, error, add } = photos;
  return (
    <div className="mt-3 rounded-[16px] bg-white p-3 shadow-[0_1px_4px_rgba(20,45,85,0.08)]">
      <p className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: NAVY }}>
        <Camera size={14} strokeWidth={2.4} />
        現地の写真
        <span className="text-[11.5px] font-normal tabular-nums text-muted">
          {items.length}/{MAX_PHOTOS}枚
        </span>
      </p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {items.map((p, i) => (
          <button key={p.id} onClick={() => setView(i)} aria-label={`写真 ${i + 1} を大きく見る`} className="sp-in press relative aspect-square overflow-hidden rounded-[10px] bg-[#eef2f7]" style={{ "--i": i } as CSSProperties}>
            <img src={p.url} alt="" className="size-full object-cover" draggable={false} />
          </button>
        ))}
        {items.length < MAX_PHOTOS && (
          <button onClick={() => input.current?.click()} disabled={busy} className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-[#b4c2d6] text-[11px] font-semibold" style={{ color: NAVY }}>
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <ImagePlus size={20} strokeWidth={2} />}
            {busy ? "保存中" : "撮る・選ぶ"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="現地の写真を撮る・選ぶ"
        onChange={(e) => {
          if (e.target.files?.length) void add(e.target.files);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-1.5 text-[12px] leading-[1.55] text-[#c2561f]">{error}</p>}
      <p className="mt-2 text-[11.5px] leading-[1.55] text-muted">撮影場所（GPS）などの情報を消して、この端末の中だけに保存します（送信・書き出しはしません）。調査メモの印刷に入ります。</p>
      {view !== null && items[view] && <Lightbox photos={photos} index={view} onIndex={setView} onClose={() => setView(null)} />}
    </div>
  );
}

/** 写真を大きく見る（左右になぞるか、矢印で送る。消すときは2回押す） */
function Lightbox({ photos, index, onIndex, onClose }: { photos: SitePhotosState; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { items, remove } = photos;
  const p = items[index];
  const [confirm, setConfirm] = useState(false);
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const go = (d: number) => {
    const n = index + d;
    if (n >= 0 && n < items.length) {
      setConfirm(false);
      onIndex(n);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  const d = new Date(p.at);
  const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return createPortal(
    <div className="sp-lb fixed inset-0 z-[70] flex flex-col bg-[rgba(6,12,24,0.97)] text-white backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="現地の写真">
      <div className="flex items-center gap-2 px-3" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
        <button onClick={onClose} aria-label="閉じる" className="press flex size-[44px] items-center justify-center rounded-full bg-white/10">
          <X size={22} />
        </button>
        <span className="min-w-0 flex-1 text-center text-[14px] font-semibold tabular-nums">
          {index + 1} / {items.length}
          <span className="ml-2 text-[12px] font-normal text-white/60">{when}</span>
        </span>
        <span className="size-[44px]" />
      </div>
      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2"
        onTouchStart={(e) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchMove={(e) => start.current && setDx(e.touches[0].clientX - start.current.x)}
        onTouchEnd={() => {
          if (dx < -50) go(1);
          else if (dx > 50) go(-1);
          setDx(0);
          start.current = null;
        }}
      >
        <img key={p.id} src={p.url} alt={`現地の写真 ${index + 1}`} className="sp-zoom max-h-full max-w-full rounded-[6px] object-contain" style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform 220ms cubic-bezier(0.2,0.8,0.2,1)" }} draggable={false} />
        {index > 0 && (
          <button onClick={() => go(-1)} aria-label="前の写真" className="press absolute left-2 top-1/2 flex size-[40px] -translate-y-1/2 items-center justify-center rounded-full bg-white/12">
            <ChevronLeft size={22} />
          </button>
        )}
        {index < items.length - 1 && (
          <button onClick={() => go(1)} aria-label="次の写真" className="press absolute right-2 top-1/2 flex size-[40px] -translate-y-1/2 items-center justify-center rounded-full bg-white/12">
            <ChevronRight size={22} />
          </button>
        )}
      </div>
      <div className="flex justify-center px-4 pt-3" style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}>
        <button
          onClick={() => {
            if (!confirm) return setConfirm(true);
            const last = items.length === 1;
            void remove(p.id);
            setConfirm(false);
            if (last) onClose();
            else if (index === items.length - 1) onIndex(index - 1);
          }}
          className="press flex h-[44px] items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors duration-200"
          style={{ background: confirm ? "#d1432b" : "rgba(255,255,255,0.12)" }}
        >
          <Trash2 size={17} />
          {confirm ? "もう一度押すと消します" : "この写真を消す"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
