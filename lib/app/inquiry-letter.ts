// 道路種別の照会文（スマホ）：役所の建築の担当課へ FAX・メールで送る、ビジネス文書の形の依頼文。
// 日付・宛先・差出人・件名・本文・「記」（所在地・聞くこと・添付）・「以上」と、役所の方がそのまま書き込んで返せる「ご回答欄」
// （道路種別に○を付けるだけ・幅員・後退・位置指定・公道か私道か）。画面ではこの形のまま見せ、A4 で印刷（PDF）もできる。
// 聞くことは lib/inquiry.ts の ASK と同じ中身を、照会の言葉づかいにしたもの。法令上の判断はしない
import { hasSender, type Sender } from "../sender";
import { half, jaDate } from "./doc";

export type Letter = {
  title: string;
  date: string;
  to: string;
  /** 差出人の行（入っていなければ記入欄） */
  from: string[];
  /** 差出人が入っていない（記入欄のまま） */
  blankFrom: boolean;
  body: string[];
  /** 記の中身（1. 所在地 など） */
  items: { title: string; lines: string[] }[];
  /** ご回答欄の行 */
  answer: { label: string; value: string }[];
};

/** 照会で聞くこと（lib/inquiry.ts の ASK を、照会の言葉づかいで） */
export const LETTER_ASK = [
  "前面道路の建築基準法上の種別（42条1項各号・2項・43条2項 など）",
  "2項道路の場合、後退（セットバック）の要否・位置・距離と、道路中心線の確定の有無",
  "位置指定道路の場合、指定番号・指定年月日と、指定図面の写しの交付の可否",
  "道路の幅員（認定幅員・現況幅員）と、道路境界の確定の有無",
  "公道（市道など）か私道か",
];

/** 地番が分からないときの記入欄（照会文の「地番：」の後ろ） */
export const CHIBAN_BLANK = "（　　　　　　　）";

/** 記の「ご教示いただきたい事項」の行（(1) 〜 (5)） */
export const askLines = (): string[] => LETTER_ASK.map((a, i) => `(${i + 1}) ${a}`);

/** ご回答欄の1行（コピー・共有する文の形） */
export const answerLine = (a: { label: string; value: string }): string => `${a.label}：${a.value}`;

/** 地番の書き方を、書類の形（3556番1）にする。枝番の無い地番は「3556番」 */
export function formalChiban(chiban: string): string {
  const s = half(chiban).trim();
  if (!/^\d+(-\d+)*$/.test(s)) return s;
  const [main, ...rest] = s.split("-");
  return rest.length ? `${main}番${rest.join("番")}` : `${main}番`;
}

export function inquiryLetter({ address, chiban, dept, sender, date }: { address: string; chiban?: string; dept: string; sender?: Sender; date: Date }): Letter {
  const from = hasSender(sender)
    ? [sender.company, sender.person && `担当：${sender.person}`, [sender.phone && `電話：${sender.phone}`, sender.email && `メール：${sender.email}`].filter(Boolean).join("　")].filter((x): x is string => !!x)
    : ["会社名：", "担当：", "電話：", "メール："];
  return {
    title: "道路種別のご照会",
    date: jaDate(date),
    to: `${dept} 御中`,
    from,
    blankFrom: !hasSender(sender),
    body: [
      "いつもお世話になっております。",
      "下記の土地の前面道路について、建築基準法上の道路の種別などをご教示いただきたく、ご照会申し上げます。",
      "お忙しいところ恐れ入りますが、よろしくお願いいたします。",
    ],
    items: [
      { title: "所在地", lines: [half(address), `地番：${chiban ? formalChiban(chiban) : CHIBAN_BLANK}`] },
      { title: "ご教示いただきたい事項", lines: askLines() },
      { title: "添付資料", lines: ["住宅地図の写し（物件の位置に印）", "公図の写し"] },
    ],
    answer: [
      { label: "道路の種別", value: "□42条1項1号　□1項2号　□1項3号　□1項4号　□1項5号　□42条2項　□43条2項　□建築基準法上の道路ではない　□その他（　　　　　）" },
      { label: "幅員", value: "認定幅員　　　　m　／　現況幅員　　　　m" },
      { label: "後退（セットバック）", value: "□要（道路中心線から　　　m）　□不要" },
      { label: "位置指定道路", value: "指定番号　　　　　　　指定年月日　　　　　　　" },
      { label: "道路の別", value: "□公道（管理者：　　　　　）　□私道" },
      { label: "ご回答日", value: "　　　　年　　月　　日" },
      { label: "ご担当者", value: "" },
    ],
  };
}

/** コピー・共有する文（メール・FAX 送信の本文） */
export function letterText(l: Letter): string {
  return [
    l.title,
    "",
    l.date,
    "",
    l.to,
    "",
    ...l.from,
    "",
    ...l.body,
    "",
    "記",
    "",
    ...l.items.flatMap((it, i) => [`${i + 1}. ${it.title}`, ...it.lines.map((x) => `　${x}`), ""]),
    "以上",
    "",
    "――――――――――――――――――――",
    "ご回答欄（ご記入のうえ、FAX・メールでご返信いただけますと幸いです）",
    ...l.answer.map(answerLine),
  ].join("\n");
}
