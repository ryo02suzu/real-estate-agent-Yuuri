// 端末の中で作ったファイル（物件概要書の Excel など）を保存する。スマホは共有のシート（「ファイルに保存」・メール・AirDrop など）、
// PC はダウンロード。共有できない端末もダウンロード。どこにも送らない（共有先は使う人が選ぶ）
export type SaveResult = "shared" | "downloaded" | "cancelled";

export async function saveFile(bytes: Uint8Array, name: string, type: string): Promise<SaveResult> {
  const part = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const file = new File([part], name, { type });
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // 共有できなかったときは、ダウンロードにする
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}
