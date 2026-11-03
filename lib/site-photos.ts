// 現地の写真メモ：物件ごとに、現地で撮った写真をこの端末の IndexedDB にだけ残す（サーバーには送らない。書き出し・共有にも入れない）。
// 保存する前に画像を描き直して JPEG にし直すので、写真に付いている撮影場所（GPS）・機種・日時などの情報（Exif）は残らない。
// 長い辺は MAX_EDGE まで縮める（調査メモに並べる・見返すには十分で、端末の容量を食わない）。物件の鍵は lib/property-id.ts
export const MAX_EDGE = 1600;
/** 1つの物件に残せる枚数 */
export const MAX_PHOTOS = 12;
const QUALITY = 0.82;
const DB = "michilu-photos";
const STORE = "photos";

export type SitePhoto = { id: string; pid: string; at: number; blob: Blob; w: number; h: number };

/** 長い辺を max までに縮めた大きさ（大きくはしない） */
export function fitSize(w: number, h: number, max = MAX_EDGE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** 画像を描き直して JPEG にする（Exif・GPS は残らない。向きは端末が読んだとおりに直してから描く） */
export async function reencode(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  let src: CanvasImageSource;
  let w: number;
  let h: number;
  let close = () => {};
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    src = bmp;
    w = bmp.width;
    h = bmp.height;
    close = () => bmp.close();
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      src = img;
      w = img.naturalWidth;
      h = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const size = fitSize(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(src, 0, 0, size.w, size.h);
  close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
  if (!blob) throw new Error("encode");
  return { blob, ...size };
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("pid", "pid");
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((res, rej) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => res(req.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  } finally {
    db.close();
  }
}

/** 物件の写真（撮った順） */
export async function listPhotos(pid: string): Promise<SitePhoto[]> {
  const all = await tx("readonly", (s) => s.index("pid").getAll(pid) as IDBRequest<SitePhoto[]>);
  return all.sort((a, b) => a.at - b.at);
}

/** 写真を足す（描き直したものを渡す） */
export async function addPhoto(pid: string, p: { blob: Blob; w: number; h: number }): Promise<void> {
  const id = `${pid}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  await tx("readwrite", (s) => s.put({ id, pid, at: Date.now(), ...p } satisfies SitePhoto));
}

export async function removePhoto(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}
