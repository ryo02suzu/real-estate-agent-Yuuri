// 書類の差出人（会社名・担当者・電話・メール）。照会文の最後・調査メモと案内図の右上に入れる。
// 端末の localStorage にだけ置く（サーバーには送らない。書き出し・読み込みにも入れない）。使えない端末では、入れないだけで画面は動く
import { useSyncExternalStore } from "react";

export type Sender = { company: string; person: string; phone: string; email: string };

const KEY = "michilu:sender";
/** 差出人が変わったとき window に出す合図（開いている書類が読み直す） */
const EVENT = "michilu:sender";
export const EMPTY_SENDER: Sender = { company: "", person: "", phone: "", email: "" };

const clean = (v: unknown): string => (typeof v === "string" ? v.slice(0, 80) : "");

/** 保存した差出人（無ければ空） */
export function loadSender(): Sender {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return EMPTY_SENDER;
    const o = v as Record<string, unknown>;
    return { company: clean(o.company), person: clean(o.person), phone: clean(o.phone), email: clean(o.email) };
  } catch {
    return EMPTY_SENDER;
  }
}

/** 保存できたか（プライベートブラウズなどで保存できないことがある） */
export function saveSender(s: Sender): boolean {
  try {
    const v = { company: s.company.trim(), person: s.person.trim(), phone: s.phone.trim(), email: s.email.trim() };
    if (!v.company && !v.person && !v.phone && !v.email) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(v));
    cache = undefined;
    if (typeof dispatchEvent === "function") dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

/** 何か入っているか */
export const hasSender = (s: Sender | undefined): s is Sender => !!s && !!(s.company || s.person || s.phone || s.email);

/** 照会文の最後の行（入っていない所は空欄のまま。書き足してもらう） */
export function senderLines(s: Sender | undefined): string[] {
  return [`会社名：${s?.company ?? ""}`, `担当者：${s?.person ?? ""}`, `電話：${s?.phone ?? ""}`, ...(s?.email ? [`メール：${s.email}`] : [])];
}

/** 書類の右上に出す短い差出人（「株式会社○○ 担当 山田」「TEL 03-…」）。何も無ければ空 */
export function senderShort(s: Sender | undefined): string[] {
  if (!hasSender(s)) return [];
  return [[s.company, s.person && `担当 ${s.person}`].filter(Boolean).join(" "), [s.phone && `TEL ${s.phone}`, s.email].filter(Boolean).join(" ")].filter(Boolean);
}

// 画面から読む（同じ値の間は同じものを返す）
let cache: Sender | undefined;
const subscribe = (cb: () => void) => {
  const on = () => {
    cache = undefined;
    cb();
  };
  addEventListener(EVENT, on);
  addEventListener("storage", on);
  return () => {
    removeEventListener(EVENT, on);
    removeEventListener("storage", on);
  };
};
const snapshot = () => (cache ??= loadSender());

/** 差出人（変わったら描き直す。サーバーの描画では空） */
export function useSender(): Sender {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_SENDER);
}
