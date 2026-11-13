"use client";

// PC の「書類・出力」（真ん中に広く重ねて開く）。左で書類を選び、右で中身を見てコピー・印刷する。中身はスマホと同じ lib の決まり
// （重説の下書き lib/draft.ts・調査レポート lib/app/report.ts・照会文 lib/app/inquiry-letter.ts と inquiry-template.ts・
// 謄本・公図用の地番 lib/app/parcel-doc.ts・案内図 components/guide-map.tsx・調査メモ components/print-sheet.tsx）。
// 照会を送る（メール・FAX・電話のアプリを開く。自動では送らない）・ひな形を作る・直すは、スマホと同じ画面（components/app/doc-sheets.tsx・
// template-editor.tsx）を重ねて開く。案内図は地理院の地図なので、開いている間は Google の 3D を隠す（呼ぶ側）
import { ClipboardCopy, Printer, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { confirmedItems } from "@/lib/app/confirmed";
import { docText, type Doc } from "@/lib/app/doc";
import { inquiryLetter, letterText } from "@/lib/app/inquiry-letter";
import { inquiryDeptOf, inquiryInputOf, inquiryValues, mergeTemplate, STANDARD_ID } from "@/lib/app/inquiry-template";
import { parcelDoc } from "@/lib/app/parcel-doc";
import { buildReport, todoDoc, type ReportDetail } from "@/lib/app/report";
import { buildDraft, draftText } from "@/lib/draft";
import { templateOf, useInquirySettings } from "@/lib/inquiry-store";
import type { PropertyRecords } from "@/lib/records";
import { useSender } from "@/lib/sender";
import { DraftBody } from "../draft-sheet";
import { GuideMapBody } from "../guide-map";
import { loaded } from "../result-view";
import { InquirySheet } from "../app/doc-sheets";
import { DocView, LetterView, PrintLetter, TextLetter } from "../app/doc-view";
import { SenderFields } from "../app/sender-editor";
import { TemplatesSheet } from "../app/template-editor";
import type { Ok, PropertyData } from "../app/use-property";
import { BodyPortal, copyText, Overlay, type Toast } from "./ui";

export type DocKind = "draft" | "report" | "inquiry" | "parcels" | "guide" | "memo" | "todo" | "sender";

const KINDS: { key: DocKind; name: string; sub: string }[] = [
  { key: "draft", name: "重説の下書き", sub: "物件の表示・法令・道路・災害の欄" },
  { key: "report", name: "調査レポート", sub: "結果の文面（メール・チャットに貼る）" },
  { key: "inquiry", name: "役所への照会文", sub: "印刷・メール・FAX で送る" },
  { key: "parcels", name: "謄本・公図用の地番", sub: "物件の筆と隣地の一覧" },
  { key: "guide", name: "案内図（A4）", sub: "詳細図と広域図を印刷" },
  { key: "memo", name: "調査メモ（A4）", sub: "窓口へ持っていくメモを印刷" },
  { key: "todo", name: "要注意点と次にやること", sub: "一覧の文面" },
];

type Props = {
  kind: DocKind;
  setKind: (k: DocKind) => void;
  result: Ok;
  data: PropertyData;
  records: PropertyRecords;
  checklist: { done: Set<string> };
  title: string;
  /** 面積の目安（「約226.04㎡（約68.4坪）」） */
  areaLine?: string;
  onClose: () => void;
  toast: (t: Toast | string) => void;
};

export function DocsOverlay({ kind, setKind, result, data, records, checklist, title, areaLine, onClose, toast }: Props) {
  const sender = useSender();
  const loadedData = loaded({ ...data, landPrice: data.landPrice5 });
  const [detail, setDetail] = useState<ReportDetail>("full");
  const [sendOpen, setSendOpen] = useState(false);
  const [templates, setTemplates] = useState(false);
  const settings = useInquirySettings();
  const now = new Date();

  // 印刷の対象：案内図・照会文を開いている間はそれ、ほかは調査メモ（app/globals.css の body[data-print]）
  useEffect(() => {
    if (kind !== "guide" && kind !== "inquiry") return;
    document.body.dataset.print = kind === "guide" ? "guide" : "letter";
    return () => {
      delete document.body.dataset.print;
    };
    // 照会を送る画面を閉じると、その画面が印刷の対象を外すので、入れ直す
  }, [kind, sendOpen]);

  // 中身とコピーする文
  const input = inquiryInputOf(result, sender, now);
  const tpl = templateOf(settings, settings.pick);
  const standard = tpl.id === STANDARD_ID;
  const letter = inquiryLetter(input);
  const letterBody = standard ? letterText(letter) : mergeTemplate(tpl.body, inquiryValues(input).values).text;
  const draftSections = buildDraft(result, { ...loadedData, confirmed: confirmedItems(records) });
  let doc: Doc | null = null;
  if (kind === "report") doc = buildReport(result, { ...loadedData, triage: data.triage, done: checklist.done }, { detail, date: now, area: areaLine, records });
  else if (kind === "parcels") doc = parcelDoc(result, loadedData.parcels, now);
  else if (kind === "todo") doc = todoDoc(result, data.triage, checklist.done, now);
  const text = kind === "draft" ? draftText(draftSections) : kind === "inquiry" ? letterBody : doc ? docText(doc) : "";
  const canCopy = !!text;
  const canPrint = kind === "inquiry" || kind === "memo";
  const copy = async () => {
    if (await copyText(text)) toast("文面をコピーしました");
  };
  const k = KINDS.find((x) => x.key === kind);

  return (
    <Overlay title="書類・出力" hint="カルテの内容から作ります。法令上の判断はしません。最後は役所・法務局・現地で確かめてください" onClose={onClose}>
      <div className="desk-two">
        <div className="side" role="group" aria-label="作る書類">
          {KINDS.map((x) => (
            <button key={x.key} type="button" className="btn" aria-pressed={kind === x.key} onClick={() => setKind(x.key)}>
              <span>
                {x.name}
                <small>{x.sub}</small>
              </span>
            </button>
          ))}
          <div className="my-1 h-px bg-[var(--line)]" aria-hidden />
          <button type="button" className="btn ghost" aria-pressed={kind === "sender"} onClick={() => setKind("sender")}>
            <span>
              差出人の設定
              <small>照会文・調査メモ・案内図に入ります</small>
            </span>
          </button>
          <button type="button" className="btn ghost" onClick={() => setTemplates(true)}>
            <span>
              照会文のひな形を作る・直す
              <small>差し込み項目つきの自分の文面</small>
            </span>
          </button>
        </div>
        <div className="main">
          <div className="mh">
            <b>{kind === "sender" ? "差出人の設定" : k?.name}</b>
            <span className="hint min-w-0 flex-1 truncate">{title}</span>
            {kind === "report" && (
              <div className="seg" role="group" aria-label="文面の長さ">
                <button type="button" aria-pressed={detail === "short"} onClick={() => setDetail("short")}>
                  要点
                </button>
                <button type="button" aria-pressed={detail === "full"} onClick={() => setDetail("full")}>
                  くわしく
                </button>
              </div>
            )}
            {kind === "inquiry" && (
              <button type="button" className="btn" onClick={() => setSendOpen(true)}>
                <Send size={15} aria-hidden />
                送る・ひな形を選ぶ
              </button>
            )}
            {canPrint && (
              <button type="button" className="btn" onClick={() => window.print()}>
                <Printer size={15} aria-hidden />
                印刷・PDF
              </button>
            )}
            {canCopy && (
              <button type="button" className="btn primary" onClick={copy}>
                <ClipboardCopy size={15} aria-hidden />
                文面をコピー
              </button>
            )}
          </div>
          <div className="mb">
            {kind === "draft" && (
              <div className="paper">
                <DraftBody sections={draftSections} />
              </div>
            )}
            {doc && (
              <div className="paper max-w-[760px]">
                <DocView doc={doc} />
              </div>
            )}
            {kind === "inquiry" && (
              <div className="max-w-[760px]">
                <p className="desk-small mt-0 mb-2">
                  {inquiryDeptOf(result)} あての照会文です（使うひな形：{tpl.name.trim() || "名前なし"}）。役所によって照会の受け方（窓口のみ・FAX・メール・決まった様式）が違います。先に電話か公式サイトで確かめてください。
                  {result.contact?.noPhoneInquiry && "この市区町村は電話では答えてもらえません。"}
                </p>
                <div className="paper">{standard ? <LetterView letter={letter} /> : <TextLetter text={letterBody} />}</div>
              </div>
            )}
            {kind === "guide" && (
              <div className="paper max-w-[760px]">
                <GuideMapBody result={result} sender={sender} />
              </div>
            )}
            {kind === "memo" && (
              <div className="max-w-[640px] space-y-2 text-[13px]">
                <p>道路種別・都市計画・法令・ハザード・地番・建物・地価・駅・学区・周辺の施設と、要注意点と次にやること、あなたの確認の記録を A4（2枚）にまとめます。2枚目は窓口で書き込む回答欄です。</p>
                {data.triage.pending.length > 0 ? (
                  <p className="placenote">読み込み中：{data.triage.pending.join("・")}。終わってから印刷すると全部入ります。</p>
                ) : (
                  <p className="placenote">データはそろっています。</p>
                )}
                {data.triage.failed.length > 0 && <p className="placenote warn">読めなかったデータ：{data.triage.failed.join("・")}</p>}
                <p className="hint">画面（地図・3D・カルテ）は印刷しません。印刷の画面で「PDF に保存」を選ぶと PDF になります。</p>
              </div>
            )}
            {kind === "sender" && (
              <div className="paper max-w-[520px]">
                <SenderFields />
                <p className="mt-2 text-[12px] text-muted">この端末だけに保存されます。照会文の最後・調査メモと案内図の右上に入ります。</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* 照会文の印刷用の1枚（画面には出ない。送る画面を開いている間は、その画面の1枚を使う） */}
      {kind === "inquiry" && !sendOpen && <PrintLetter letter={letter} text={standard ? undefined : letterBody} />}
      <BodyPortal>
        <InquirySheet
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          lead={`${inquiryDeptOf(result)} あての照会文です。中身を確かめて、「送る」からメール・FAX で送れます（コピー・印刷もできます）。${result.contact?.noPhoneInquiry ? "この市区町村は電話では答えてもらえません。" : ""}`}
          input={input}
          pref={result.municipality.pref}
          contact={result.contact}
          note="役所によって照会の受け方（窓口のみ・FAX・メール・決まった様式）が違います。先に電話か公式サイトで確かめてください。住宅地図・公図の写し（物件に印）を添えると早く答えてもらえます。"
        />
        {templates && <TemplatesSheet open onClose={() => setTemplates(false)} input={input} />}
      </BodyPortal>
    </Overlay>
  );
}
