// 照会の文面（ひな形）：名前・件名・本文。本文と件名の {{日付}} などの差し込み項目に、アプリが物件ごとに中身を入れる（mergeTemplate）。
// 「標準」は今の照会文（lib/app/inquiry-letter.ts の letterText）と同じ文になるひな形（消せない。複製して直す）。
// 差し込み項目は、照会文を作るときにアプリが持っている値だけ（物件の住所・地番・市区町村・窓口の課・日付・書類の差出人・
// 聞くこと・回答欄）。無い値は作らない。分からない項目（{{部署}} など）は書いたまま残す。
// 送るのは利用者のメール・FAX のアプリ（mailto:・tel:・印刷・共有）。MICHILU のサーバーには送らず、自動では送らない
import type { LookupResult } from "../roadmap";
import { registryChiban } from "../roadmap/parcel";
import type { Sender } from "../sender";
import { half } from "./doc";
import { CHIBAN_BLANK, answerLine, askLines, formalChiban, inquiryLetter } from "./inquiry-letter";

/** 差し込み項目（この順で、ひな形の編集画面のチップに並べる） */
export const FIELD_KEYS = ["日付", "宛先", "所在地", "地番", "市区町村", "差出人", "会社名", "担当者", "電話", "メール", "聞くこと", "回答欄"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

/** 差し込み項目の説明（編集画面に出す） */
export const FIELD_NOTE: Record<FieldKey, string> = {
  日付: "照会文を作った日（2026年11月7日の形）",
  宛先: "窓口の課の名前（「御中」は付けない）",
  所在地: "物件の住所（国土地理院が読んだ形）",
  地番: "物件の筆の地番（3556番1 の形）。分からなければ（　）の空欄",
  市区町村: "物件の市区町村",
  差出人: "会社名・担当・電話・メールの行。差出人を入れていなければ記入欄",
  会社名: "書類の差出人の会社名",
  担当者: "書類の差出人の担当者",
  電話: "書類の差出人の電話",
  メール: "書類の差出人のメール",
  聞くこと: "(1)〜(5) の聞くこと（5行）",
  回答欄: "役所の方が書き込むご回答欄（7行）",
};

export const isFieldKey = (s: string): s is FieldKey => (FIELD_KEYS as readonly string[]).includes(s);

/** チップから入れる形 */
export const fieldToken = (k: FieldKey) => `{{${k}}}`;

export type MergeValues = Record<FieldKey, string>;

export type InquiryTemplate = { id: string; name: string; subject: string; body: string };

/** 「標準」の id（自分のひな形の id とは重ならない） */
export const STANDARD_ID = "standard";

/**
 * 標準のひな形。本文は letterText（照会文のシートのコピー・共有・印刷の文）と同じ文になる（lib/app/inquiry-template.test.ts で確かめる）。
 * 照会文の決まった言葉（あいさつ・添付資料・回答欄の見出し）はそのまま、物件ごとに変わる所だけを差し込み項目にした
 */
export const STANDARD_TEMPLATE: InquiryTemplate = {
  id: STANDARD_ID,
  name: "標準",
  subject: "道路種別のご照会（{{所在地}}）",
  body: [
    "道路種別のご照会",
    "",
    "{{日付}}",
    "",
    "{{宛先}} 御中",
    "",
    "{{差出人}}",
    "",
    "いつもお世話になっております。",
    "下記の土地の前面道路について、建築基準法上の道路の種別などをご教示いただきたく、ご照会申し上げます。",
    "お忙しいところ恐れ入りますが、よろしくお願いいたします。",
    "",
    "記",
    "",
    "1. 所在地",
    "　{{所在地}}",
    "　地番：{{地番}}",
    "",
    "2. ご教示いただきたい事項",
    "　{{聞くこと}}",
    "",
    "3. 添付資料",
    "　住宅地図の写し（物件の位置に印）",
    "　公図の写し",
    "",
    "以上",
    "",
    "――――――――――――――――――――",
    "ご回答欄（ご記入のうえ、FAX・メールでご返信いただけますと幸いです）",
    "{{回答欄}}",
  ].join("\n"),
};

/** 照会文を作る材料（物件の画面が持っている値） */
export type InquiryInput = {
  /** 物件の住所（国土地理院が読んだ形） */
  address: string;
  /** 物件の筆の登記の地番（分かっているときだけ） */
  chiban?: string;
  /** 宛先の課（「松戸市 建築指導課」。御中は付けない） */
  dept: string;
  /** 市区町村 */
  city: string;
  sender?: Sender;
  date: Date;
};

type OkResult = Extract<LookupResult, { status: "ok" }>;

/** 宛先の課：分かっていれば道路種別の窓口（市区町村名を頭に。県の出先機関はそのまま）、無ければ建築の担当課 */
export function inquiryDeptOf(result: Pick<OkResult, "municipality" | "contact">): string {
  const m = result.municipality;
  if (!result.contact) return `${m.name} 建築指導の担当課`;
  return /^(東京都|\S{2,3}県)\s/.test(result.contact.dept) ? result.contact.dept : `${m.name} ${result.contact.dept}`;
}

/** 物件の画面の値から、照会文の材料を作る（地番は地番で調べた筆か住所の地点の筆。地図で選んだ地点の筆は入れない） */
export function inquiryInputOf(result: Pick<OkResult, "matchedAddress" | "municipality" | "contact" | "parcel" | "picked">, sender: Sender | undefined, date: Date): InquiryInput {
  const p = result.parcel;
  const found = p && !result.picked ? p : undefined;
  return { address: result.matchedAddress, chiban: found ? registryChiban(found.chibanRaw) : undefined, dept: inquiryDeptOf(result), city: result.municipality.name, sender, date };
}

/** 物件を開いていないときの下見の材料（見本の物件。差出人は入れたもの） */
export const sampleInput = (sender: Sender | undefined, date: Date): InquiryInput => ({ address: "〇〇県〇〇市〇〇町1-2-3", chiban: "123-4", dept: "〇〇市 建築指導課", city: "〇〇市", sender, date });

/** 差し込む値と、この物件では空になる項目（地番が分からない・差出人の欄が空など） */
export function inquiryValues(input: InquiryInput): { values: MergeValues; blank: FieldKey[] } {
  const l = inquiryLetter(input);
  const s = input.sender;
  const values: MergeValues = {
    日付: l.date,
    宛先: input.dept,
    所在地: half(input.address),
    地番: input.chiban ? formalChiban(input.chiban) : CHIBAN_BLANK,
    市区町村: input.city,
    差出人: l.from.join("\n"),
    会社名: s?.company ?? "",
    担当者: s?.person ?? "",
    電話: s?.phone ?? "",
    メール: s?.email ?? "",
    聞くこと: askLines().join("\n"),
    回答欄: l.answer.map(answerLine).join("\n"),
  };
  const blank = FIELD_KEYS.filter((k) => values[k] === "" || (k === "地番" && !input.chiban) || (k === "差出人" && l.blankFrom));
  return { values, blank };
}

/** {{名前}}。全角の ｛｛ ｝｝ と、中の前後の空白も受ける */
const TOKEN = /[{｛]{2}[ 　]*([^{}｛｝\n]+?)[ 　]*[}｝]{2}/g;

export type Merged = {
  text: string;
  /** 差し込みの項目に無い名前（書いたまま残した形。「{{部署}}」） */
  unknown: string[];
  /** 使った差し込み項目 */
  used: FieldKey[];
};

/**
 * ひな形に値を入れる。値は1回だけ入れる（入れた値の中の {{…}} は読み直さない）。複数行の値（差出人・聞くこと・回答欄）は、
 * 項目を書いた行の頭の字下げ（空白・全角の空白）を2行目からもそろえる（「　{{聞くこと}}」→ 5行とも「　(1) …」）
 */
export function mergeTemplate(text: string, values: MergeValues): Merged {
  const unknown: string[] = [];
  const used: FieldKey[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out = lines.map((line) => {
    const indent = /^[ \t　]*/.exec(line)?.[0] ?? "";
    return line.replace(TOKEN, (whole: string, name: string) => {
      if (!isFieldKey(name)) {
        if (!unknown.includes(whole)) unknown.push(whole);
        return whole;
      }
      if (!used.includes(name)) used.push(name);
      return values[name].split("\n").join(`\n${indent}`);
    });
  });
  return { text: out.join("\n"), unknown, used };
}

/** 件名に入れる（件名は1行。複数行の項目は空白でつなぐ） */
export function mergeSubject(subject: string, values: MergeValues): Merged {
  const m = mergeTemplate(subject, values);
  return { ...m, text: m.text.replace(/[ \t　]*\n[ \t　]*/g, " ").trim() };
}

/** 文を、差し込み項目（知っている名前・知らない名前）とそれ以外に分ける（編集画面で項目を目立たせる） */
export function tokenParts(text: string): { text: string; field?: FieldKey; unknown?: true }[] {
  const out: { text: string; field?: FieldKey; unknown?: true }[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push(isFieldKey(m[1]) ? { text: m[0], field: m[1] } : { text: m[0], unknown: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** 書いてある差し込み項目のうち、項目に無い名前（入力中の編集画面で知らせる） */
export const unknownTokens = (...texts: string[]): string[] => [...new Set(texts.flatMap((t) => [...t.matchAll(TOKEN)].filter((m) => !isFieldKey(m[1])).map((m) => m[0])))];

/** 全角の英数字・記号（！〜～）と全角の空白を半角に（メールアドレス・番号は半角で読む） */
export const toHalfAscii = (s: string) => s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");

/** メールアドレスの形（HTML の type="email" と同じ決まり。ドメインに「.」が1つ以上） */
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL.test(s);
/** 入れたメールアドレスを読む形（全角を半角に、前後の空白を外す） */
export const cleanEmail = (s: string) => toHalfAscii(s).trim();

/** 番号の区切り（ハイフン・長音・ダッシュ・空白・かっこ） */
const SEP = "\\s\\-‐‑‒–—―−ー()";
const NUMBER_RUN = new RegExp(`\\d[\\d${SEP}]*\\d`);
/**
 * 電話・FAX 番号の数字だけ（全角は半角に、ハイフン・空白・かっこは外す）。最初の番号だけを読む
 * （「029-224-1111（代表・内線3461）」→ 0292241111。内線の数字はつなげない）
 */
export function numberDigits(s: string): string {
  const m = NUMBER_RUN.exec(toHalfAscii(s));
  return m ? m[0].replace(/\D/g, "") : "";
}
/** 国内の電話・FAX 番号の形（0 から始まる 10〜11 桁） */
export const isPhoneDigits = (d: string) => /^0\d{9,10}$/.test(d);

/** 電話をかける tel:（番号が読めなければ null） */
export function telUrl(phone: string): string | null {
  const d = numberDigits(phone);
  return isPhoneDigits(d) ? `tel:${d}` : null;
}

/** 件名・本文の % 符号化（UTF-8。改行は CRLF の %0D%0A。& ? # % = + と空白も符号化する） */
const encodeField = (s: string) => encodeURIComponent(s.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n"));
/** 宛先の % 符号化（@ の前後を分けて符号化する。@ はそのまま） */
function encodeAddress(a: string): string {
  const at = a.lastIndexOf("@");
  return `${encodeURIComponent(a.slice(0, at))}@${encodeURIComponent(a.slice(at + 1))}`;
}

/**
 * メールのアプリを開く mailto:（RFC 6068）。宛先が空なら宛先なしで開く（宛先は利用者が入れる）。
 * 宛先が入っていてメールアドレスの形でなければ null
 */
export function mailtoUrl({ to = "", subject, body }: { to?: string; subject: string; body: string }): string | null {
  const addr = cleanEmail(to);
  if (addr && !isEmail(addr)) return null;
  return `mailto:${addr ? encodeAddress(addr) : ""}?subject=${encodeField(subject)}&body=${encodeField(body)}`;
}

/** FAX をメールで送るサービスの宛先の形に入れる所 */
export const FAX_TOKEN = "{番号}";

/** 宛先の形を読む形（全角を半角に、前後の空白を外す。全角の ｛番号｝ も {番号} になる。途中の空白はメールの形でないので断る） */
export const cleanFaxFormat = (s: string) => toHalfAscii(s).trim();

/** 宛先の形の問題（空＝使わない は問題なし） */
export function faxFormatProblem(format: string): string | null {
  const f = cleanFaxFormat(format);
  if (!f) return null;
  if (!f.includes(FAX_TOKEN)) return "{番号}（FAX 番号が入る所）を入れてください";
  if (!isEmail(f.split(FAX_TOKEN).join("0312345678"))) return "メールアドレスの形になっていません（{番号} の所に FAX 番号が入ります）";
  return null;
}

/** FAX をメールで送るときの宛先（宛先の形の {番号} に、FAX 番号の数字を入れる） */
export function faxMailTo(format: string, fax: string): { ok: true; to: string } | { ok: false; reason: string } {
  const f = cleanFaxFormat(format);
  if (!f) return { ok: false, reason: "FAX をメールで送るサービスの宛先の形が入っていません" };
  const problem = faxFormatProblem(f);
  if (problem) return { ok: false, reason: `宛先の形：${problem}` };
  const d = numberDigits(fax);
  if (!isPhoneDigits(d)) return { ok: false, reason: "FAX 番号を、0 から始まる 10〜11 桁で入れてください（ハイフンはあってもかまいません）" };
  return { ok: true, to: f.split(FAX_TOKEN).join(d) };
}
