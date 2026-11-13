// 照会の文面（自分のひな形）・FAX をメールで送るサービスの宛先の形・最後に使ったひな形と、照会の宛先帳（市区町村＋窓口ごとのメール・FAX・電話）。
// 端末の localStorage にだけ置く（lib/sender.ts と同じ。MICHILU のサーバーには送らない。書き出し・読み込みにも入れない）。
// 保存できない端末（プライベートブラウズなど）では、保存できなかったことを返す（画面はそのまま動く）
import { useSyncExternalStore } from "react";
import { STANDARD_ID, STANDARD_TEMPLATE, type InquiryTemplate } from "./app/inquiry-template";

const KEY = "michilu:inquiry-templates";
const BOOK_KEY = "michilu:inquiry-to";
/** ひな形が変わったとき window に出す合図（開いている照会文のシートが読み直す） */
const EVENT = "michilu:inquiry-templates";

/** 自分のひな形の数・字数の上限 */
export const TEMPLATE_MAX = 20;
export const NAME_MAX = 40;
export const SUBJECT_MAX = 120;
export const BODY_MAX = 6000;
/** FAX の宛先の形の字数の上限 */
export const FAX_FORMAT_MAX = 120;
/** 宛先帳に残す窓口の数（古いものから消す） */
export const BOOK_MAX = 200;

export type InquirySettings = {
  /** 自分のひな形（標準は入れない） */
  list: InquiryTemplate[];
  /** FAX をメールで送るサービスの宛先の形（「{番号}@…」。空なら使わない） */
  fax: string;
  /** 最後に選んだひな形の id（標準か自分のひな形） */
  pick: string;
};

export const EMPTY_SETTINGS: InquirySettings = { list: [], fax: "", pick: STANDARD_ID };

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/** 保存したひな形・設定（壊れた値・無い値は空。標準と同じ id・重なる id は捨てる） */
export function loadInquirySettings(): InquirySettings {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return EMPTY_SETTINGS;
    const o = v as Record<string, unknown>;
    const seen = new Set<string>([STANDARD_ID]);
    const list: InquiryTemplate[] = [];
    for (const t of Array.isArray(o.list) ? o.list : []) {
      if (!t || typeof t !== "object") continue;
      const r = t as Record<string, unknown>;
      const id = str(r.id, 64);
      if (!id || seen.has(id) || list.length >= TEMPLATE_MAX) continue;
      seen.add(id);
      list.push({ id, name: str(r.name, NAME_MAX), subject: str(r.subject, SUBJECT_MAX), body: str(r.body, BODY_MAX) });
    }
    const pick = str(o.pick, 64);
    return { list, fax: str(o.fax, FAX_FORMAT_MAX), pick: pick && seen.has(pick) ? pick : STANDARD_ID };
  } catch {
    return EMPTY_SETTINGS;
  }
}

/** 保存できたか（プライベートブラウズなどで保存できないことがある） */
export function saveInquirySettings(s: InquirySettings): boolean {
  try {
    if (!s.list.length && !s.fax && s.pick === STANDARD_ID) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ list: s.list.slice(0, TEMPLATE_MAX), fax: s.fax, pick: s.pick }));
    cache = undefined;
    if (typeof dispatchEvent === "function") dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

/** 使うひな形（無い id なら標準） */
export const templateOf = (s: InquirySettings, id: string): InquiryTemplate => s.list.find((t) => t.id === id) ?? STANDARD_TEMPLATE;

/** 新しいひな形の id（重ならない） */
export function newTemplateId(): string {
  const r = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `t-${Date.now().toString(36)}-${r}`;
}

/** 複製の名前（「標準のコピー」。同じ名前があれば「標準のコピー 2」） */
export function copyName(name: string, list: InquiryTemplate[]): string {
  const base = `${name || "名前なし"}のコピー`.slice(0, NAME_MAX);
  const names = new Set(list.map((t) => t.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base.slice(0, NAME_MAX - String(i).length - 1)} ${i}`;
    if (!names.has(n)) return n;
  }
}

/** 複製を作って、元のすぐ後ろ（標準なら先頭）に入れる。数の上限なら null */
export function duplicateTemplate(s: InquirySettings, from: InquiryTemplate): { settings: InquirySettings; copy: InquiryTemplate } | null {
  if (s.list.length >= TEMPLATE_MAX) return null;
  const copy: InquiryTemplate = { id: newTemplateId(), name: copyName(from.name, s.list), subject: from.subject, body: from.body };
  const at = s.list.findIndex((t) => t.id === from.id);
  const list = [...s.list];
  list.splice(at < 0 ? 0 : at + 1, 0, copy);
  return { settings: { ...s, list }, copy };
}

/** ひな形を直す（字数の上限で切る） */
export function updateTemplate(s: InquirySettings, id: string, patch: Partial<Omit<InquiryTemplate, "id">>): InquirySettings {
  return {
    ...s,
    list: s.list.map((t) =>
      t.id === id
        ? {
            ...t,
            ...(patch.name !== undefined ? { name: patch.name.slice(0, NAME_MAX) } : {}),
            ...(patch.subject !== undefined ? { subject: patch.subject.slice(0, SUBJECT_MAX) } : {}),
            ...(patch.body !== undefined ? { body: patch.body.slice(0, BODY_MAX) } : {}),
          }
        : t,
    ),
  };
}

/** 消したひな形（元に戻すときに、同じ場所へ戻す） */
export type RemovedTemplate = { template: InquiryTemplate; index: number; wasPick: boolean };

/** ひな形を消す（選んでいたら標準に戻す） */
export function removeTemplate(s: InquirySettings, id: string): { settings: InquirySettings; removed: RemovedTemplate } | null {
  const index = s.list.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const template = s.list[index];
  return { settings: { ...s, list: s.list.filter((t) => t.id !== id), pick: s.pick === id ? STANDARD_ID : s.pick }, removed: { template, index, wasPick: s.pick === id } };
}

/** 消したひな形を元の場所に戻す */
export function restoreTemplate(s: InquirySettings, r: RemovedTemplate): InquirySettings {
  if (s.list.some((t) => t.id === r.template.id)) return s;
  const list = [...s.list];
  list.splice(Math.min(r.index, list.length), 0, r.template);
  return { ...s, list: list.slice(0, TEMPLATE_MAX), pick: r.wasPick ? r.template.id : s.pick };
}

// 画面から読む（同じ値の間は同じものを返す）
let cache: InquirySettings | undefined;
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
const snapshot = () => (cache ??= loadInquirySettings());

/** ひな形・設定（変わったら描き直す。サーバーの描画では空） */
export function useInquirySettings(): InquirySettings {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_SETTINGS);
}

/** 照会の宛先（窓口のメール・FAX・電話。利用者が直した値） */
export type InquiryTo = { email: string; fax: string; phone: string };
export const EMPTY_TO: InquiryTo = { email: "", fax: "", phone: "" };
type BookEntry = InquiryTo & { at: number };

/** 宛先帳の鍵（都道府県・市区町村・宛先の課。同じ名前の町村が別の県にあっても分ける） */
export const officeKey = (pref: string, city: string, dept: string) => `${pref}${city}|${dept}`;

/** 宛先帳を読む（壊れた値は空として読み、次の保存で書き直す。localStorage が使えないときは投げる） */
function readBook(): Record<string, BookEntry> {
  const raw = localStorage.getItem(BOOK_KEY);
  let v: unknown = null;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    return {};
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, BookEntry> = {};
  for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    out[k.slice(0, 200)] = { email: str(r.email, 254), fax: str(r.fax, 40), phone: str(r.phone, 40), at: typeof r.at === "number" ? r.at : 0 };
  }
  return out;
}

/** この窓口に覚えた宛先（無ければ null。窓口のデータから入れる） */
export function loadInquiryTo(key: string): InquiryTo | null {
  try {
    const e = readBook()[key];
    return e ? { email: e.email, fax: e.fax, phone: e.phone } : null;
  } catch {
    return null;
  }
}

/** この窓口の宛先を覚える（前後の空白は外す。窓口が多くなったら古いものから消す）。保存できたか */
export function saveInquiryTo(key: string, to: InquiryTo, now = Date.now()): boolean {
  try {
    const book = readBook();
    book[key] = { email: to.email.trim().slice(0, 254), fax: to.fax.trim().slice(0, 40), phone: to.phone.trim().slice(0, 40), at: now };
    const keys = Object.keys(book).sort((a, b) => book[b].at - book[a].at);
    for (const k of keys.slice(BOOK_MAX)) delete book[k];
    localStorage.setItem(BOOK_KEY, JSON.stringify(book));
    return true;
  } catch {
    return false;
  }
}

/** この窓口に覚えた宛先を忘れる（窓口のデータに戻す）。保存できたか */
export function forgetInquiryTo(key: string): boolean {
  try {
    const book = readBook();
    delete book[key];
    if (Object.keys(book).length) localStorage.setItem(BOOK_KEY, JSON.stringify(book));
    else localStorage.removeItem(BOOK_KEY);
    return true;
  } catch {
    return false;
  }
}
