"use client";

// 書類のシート（スマホ）。どれも同じ高さ（DOC_BODY）で開き、中身は真ん中の枠の中で動かす（押す・選ぶ・差出人を開くで、シートの大きさが
// 変わらない）。地番の一覧など「書類の中身」を読みやすく見せてコピー・共有するシート（DocSheet。中身は lib/app/doc.ts）、
// 照会文のシート（InquirySheet。「照会文」で使うひな形を選んで手紙の形で見せ、コピー・印刷（A4）・共有。「送る」で宛先を入れて、
// メール・FAX・電話のアプリを開く。components/app/inquiry-send.tsx）、調査メモを印刷する前に中身と読み込みの状態を
// 確かめるシート（MemoSheet）。コピー・共有・印刷は押した操作の中で呼ぶ（iPhone の Safari はそうでないと動かない）。
// どれも document.body に出す（物件の画面の枠の外。見た目は body の .theme-navy に従う）
import { Check, ClipboardCopy, Printer, Share2 } from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { docText, type Doc } from "@/lib/app/doc";
import { inquiryLetter, letterText } from "@/lib/app/inquiry-letter";
import { STANDARD_ID, inquiryValues, mergeSubject, mergeTemplate, unknownTokens, type InquiryInput } from "@/lib/app/inquiry-template";
import { EMPTY_TO, forgetInquiryTo, loadInquiryTo, officeKey, saveInquirySettings, saveInquiryTo, templateOf, useInquirySettings, type InquiryTo } from "@/lib/inquiry-store";
import { parsePhones } from "@/lib/phone";
import type { Contact } from "@/lib/roadmap";
import { PrintIcon } from "../icons";
import { Sheet } from "../sheet";
import { useCopy } from "../use-copy";
import { DOC_BODY, DOC_PANE } from "./doc-size";
import { DocView, LetterView, PrintLetter, TextLetter } from "./doc-view";
import { FaxCover, SendPanel, TemplateChips } from "./inquiry-send";
import { TemplatesSheet } from "./template-editor";

const NAVY = "#133664";
const PRIMARY = "flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-light to-brand py-2.5 text-[14px] font-bold text-white shadow-soft dense:py-2";

// シートの大きさ（components/app/doc-size.ts。ほかの書類のシートもここから読む）
export { DOC_BODY, DOC_PANE };

/** コピー・共有・印刷のボタンの列 */
export function DocActions({ text, onPrint, printLabel = "印刷・PDF" }: { text: string; onPrint?: () => void; printLabel?: string }) {
  const copy = useCopy();
  // 共有の画面（LINE・メールなど）が出せる端末だけ「共有」を出す（この部品は開いたときだけ描くので、サーバーの描画とは食い違わない）
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = async () => {
    try {
      await navigator.share({ text });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      await copy.copy(text);
    }
  };
  return (
    <div className="mt-2.5 flex shrink-0 gap-2 dense:mt-2">
      <button onClick={() => copy.copy(text)} className="press flex h-[48px] flex-1 items-center justify-center gap-2 rounded-[16px] text-[15px] font-bold text-white transition-colors duration-200" style={{ background: copy.done ? "#1f8f5a" : NAVY }}>
        {copy.done ? <Check key="done" className="td-bump h-5 w-5" strokeWidth={3} /> : <ClipboardCopy className="h-[18px] w-[18px]" />}
        {copy.done ? "コピーしました" : "コピー"}
      </button>
      {onPrint && (
        <button onClick={onPrint} className="press flex h-[48px] shrink-0 items-center justify-center gap-1.5 rounded-[16px] px-4 text-[14px] font-bold" style={{ background: "#e3ebf6", color: NAVY }}>
          <Printer className="h-[17px] w-[17px]" />
          {printLabel}
        </button>
      )}
      {canShare && (
        <button onClick={() => void share()} aria-label="共有" className="press flex h-[48px] w-[52px] shrink-0 items-center justify-center rounded-[16px]" style={{ background: "#e3ebf6", color: NAVY }}>
          <Share2 className="h-[18px] w-[18px]" />
        </button>
      )}
    </div>
  );
}

/** 書類の中身を見せて、コピー・共有するシート（地番の一覧など） */
export function DocSheet({ open, onClose, title, lead, doc, note, extra }: { open: boolean; onClose: () => void; title: string; lead: string; doc: Doc; note?: string; extra?: ReactNode }) {
  if (!open) return null;
  return createPortal(
    <Sheet title={title} open onClose={onClose}>
      <div className={`${DOC_BODY} text-ink`}>
        <p className="shrink-0 text-[12px] leading-[1.6] text-muted dense:leading-[1.5]">{lead}</p>
        {extra && <div className="shrink-0">{extra}</div>}
        <div className={`${DOC_PANE} mt-2`} aria-label="書類の中身">
          <DocView doc={doc} />
        </div>
        <DocActions text={docText(doc)} />
        {note && <p className="mt-2 shrink-0 text-[10.5px] leading-[1.5] text-muted [@media(max-height:720px)]:hidden">{note}</p>}
      </div>
    </Sheet>,
    document.body,
  );
}

type InquiryProps = {
  onClose: () => void;
  lead: string;
  /** 照会文の材料（物件の住所・地番・宛先の課・市区町村・差出人・日付。lib/app/inquiry-template.ts の inquiryInputOf） */
  input: InquiryInput;
  /** 都道府県（宛先帳の鍵。同じ名前の町村を分ける） */
  pref: string;
  /** 窓口のデータ（電話・メール・受付時間・注意。無い市区町村もある） */
  contact?: Contact;
  note?: string;
  extra?: ReactNode;
};

/**
 * 照会文のシート：「照会文」（使うひな形を選び、手紙の形で見せ、コピー（メールの本文）・印刷（FAX 用の A4）・共有）と
 * 「送る」（宛先を入れて、メール・FAX・電話のアプリを開く）。開いている間は、印刷の対象を照会文にする
 * （「印刷して FAX」のときだけ、1枚目に FAX 送付状を付ける。body の data-print="fax"）
 */
export function InquirySheet({ open, ...props }: { open: boolean } & InquiryProps) {
  useEffect(() => {
    if (!open) return;
    document.body.dataset.print = "letter";
    return () => {
      delete document.body.dataset.print;
    };
  }, [open]);
  if (!open) return null;
  return createPortal(<InquiryBody {...props} />, document.body);
}

/** 窓口のデータから入れる宛先（電話は最初の番号。FAX 番号は窓口のデータに無いので空） */
const toOf = (c?: Contact): InquiryTo => ({ ...EMPTY_TO, email: c?.email ?? "", fax: c?.fax ?? "", phone: c?.phone ? (parsePhones(c.phone)[0]?.number ?? "") : "" });

type Tab = "letter" | "send";
const TABS: { key: Tab; label: string }[] = [
  { key: "letter", label: "照会文" },
  { key: "send", label: "送る" },
];

function InquiryBody({ onClose, lead, input, pref, contact, note, extra }: InquiryProps) {
  const settings = useInquirySettings();
  const [pick, setPick] = useState(settings.pick);
  const [tab, setTab] = useState<Tab>("letter");
  const [dir, setDir] = useState<"r" | "l" | null>(null);
  // ひな形を作る・直す（このシートの上に重ねて開く）
  const [edit, setEdit] = useState(false);
  // 宛先（この窓口に覚えた値か、窓口のデータ）。直すたびに端末に覚える
  const office = officeKey(pref, input.city, input.dept);
  const [to, setTo] = useState<InquiryTo>(() => loadInquiryTo(office) ?? toOf(contact));
  const [saved, setSaved] = useState<boolean | null>(null);
  const [remembered, setRemembered] = useState(() => loadInquiryTo(office) !== null);
  // FAX 送付状の送付枚数（送付状＋照会文。添付を足すのは利用者）
  const [pages, setPages] = useState(2);

  const tpl = templateOf(settings, pick);
  const standard = tpl.id === STANDARD_ID;
  const letter = inquiryLetter(input);
  const { values } = inquiryValues(input);
  // 標準は今の照会文そのもの（letterText と同じ文になることはテストで確かめている）
  const text = standard ? letterText(letter) : mergeTemplate(tpl.body, values).text;
  const subject = mergeSubject(tpl.subject, values).text;
  const unknown = standard ? [] : unknownTokens(tpl.subject, tpl.body);
  const ready = standard || tpl.body.trim() !== "";

  const choose = (id: string) => {
    setPick(id);
    // 次に開いたときも同じひな形（保存できなくても、この画面では選んだまま）
    saveInquirySettings({ ...settings, pick: id });
  };
  const changeTo = (next: InquiryTo) => {
    setTo(next);
    const ok = saveInquiryTo(office, next);
    setSaved(ok);
    if (ok) setRemembered(true);
  };
  const resetTo = () => {
    forgetInquiryTo(office);
    setTo(toOf(contact));
    setSaved(null);
    setRemembered(false);
  };
  const go = (t: Tab) => {
    if (t === tab) return;
    setDir(t === "send" ? "r" : "l");
    setTab(t);
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Tab = tab === "letter" ? "send" : "letter";
    go(next);
    document.getElementById(`iq-tab-${next}`)?.focus();
  };
  // 押した操作の中で印刷を呼ぶ（iPhone はプリントの画面から PDF にもできる）。印刷の対象は body の data-print（app/globals.css）
  const print = (mode: "letter" | "fax") => {
    document.body.dataset.print = mode;
    window.print();
  };

  return (
    <>
      <Sheet title="道路種別の照会文" open onClose={() => !edit && onClose()}>
        <div className={`${DOC_BODY} text-ink`}>
          {/* 照会文 ⇄ 送る（切り替えてもシートの大きさは変わらない） */}
          <div role="tablist" aria-label="照会文と送り方" className="relative grid h-[44px] shrink-0 grid-cols-2 rounded-full bg-[#eef2f7]">
            <span aria-hidden className="td-seg-pill absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-white shadow-[0_1px_4px_rgba(20,45,85,0.16)]" style={{ transform: tab === "send" ? "translateX(100%)" : "none" }} />
            {TABS.map((t) => (
              <button
                key={t.key}
                id={`iq-tab-${t.key}`}
                role="tab"
                aria-selected={tab === t.key}
                aria-controls="iq-panel"
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => go(t.key)}
                onKeyDown={onTabKey}
                className="relative z-[1] h-[44px] rounded-full text-[14px] font-bold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2f7cf6]"
                style={{ color: tab === t.key ? NAVY : "#5f6f86" }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div key={tab} id="iq-panel" role="tabpanel" aria-labelledby={`iq-tab-${tab}`} className="td-pane mt-2 flex min-h-0 flex-1 flex-col" data-dir={dir ?? undefined}>
            {tab === "letter" ? (
              <>
                <p className="shrink-0 text-[12px] leading-[1.6] text-muted dense:leading-[1.5]">{lead}</p>
                <TemplateChips list={settings.list} pick={tpl.id} onPick={choose} onEdit={() => setEdit(true)} />
                {extra && <div className="-mt-1 shrink-0">{extra}</div>}
                {unknown.length > 0 && <p className="mt-1.5 shrink-0 rounded-xl bg-[#fff4e5] px-3 py-1.5 text-[11.5px] leading-[1.5] text-[#7a5a2a] [overflow-wrap:anywhere]">入らない項目：{unknown.join("・")}（書いたまま残ります。「ひな形を作る・直す」で直せます）</p>}
                <div className={`${DOC_PANE} mt-2`} aria-label="照会文">
                  <div className="rounded-[10px] bg-white px-3.5 py-3 shadow-[0_1px_4px_rgba(20,45,85,0.10)]">
                    {standard ? <LetterView letter={letter} /> : ready ? <TextLetter text={text} /> : <p className="text-[12.5px] leading-[1.7] text-muted">このひな形は本文が空です。「ひな形を作る・直す」で本文を入れてください。</p>}
                  </div>
                </div>
                <DocActions text={text} onPrint={() => print("letter")} printLabel="印刷・PDF" />
                {note && <p className="mt-2 shrink-0 text-[10.5px] leading-[1.5] text-muted [@media(max-height:720px)]:hidden">{note}</p>}
              </>
            ) : (
              <SendPanel
                dept={input.dept}
                templateName={tpl.name.trim() || "名前なし"}
                subject={subject}
                body={text}
                ready={ready}
                unknown={unknown}
                to={to}
                onTo={changeTo}
                saved={saved}
                canReset={remembered}
                onReset={resetTo}
                contact={contact}
                faxFormat={settings.fax}
                pages={pages}
                onPages={setPages}
                onPrintFax={() => print("fax")}
              />
            )}
          </div>
        </div>
        <PrintLetter
          letter={letter}
          text={standard ? undefined : text}
          cover={<FaxCover to={input.dept} fax={to.fax} date={letter.date} pages={pages} from={letter.from} blankFrom={letter.blankFrom} subject={subject} />}
        />
      </Sheet>
      {/* ひな形を作る・直す（照会文のシートの上に重ねる。閉じると、選べるひな形が新しくなっている） */}
      {edit &&
        createPortal(
          <div className="theme-navy relative z-[60]">
            <TemplatesSheet open onClose={() => setEdit(false)} input={input} />
          </div>,
          document.body,
        )}
    </>
  );
}

/** 調査メモの印刷：入るもの・読み込みの状態を見せてから印刷（iPhone はプリントの画面から PDF にできる） */
export function MemoSheet({ open, onClose, pending, failed, records, photos = 0, onPrint }: { open: boolean; onClose: () => void; pending: string[]; failed: string[]; records: number; photos?: number; onPrint: () => void }) {
  if (!open) return null;
  return createPortal(
    <Sheet title="調査メモ（A4）" open onClose={onClose}>
      <div className="text-ink">
        <p className="text-[12px] leading-[1.6] text-muted dense:leading-[1.5]">
          道路種別・都市計画・法令・ハザード・地番・建物・地価・駅・学区・周辺の施設と、要注意点と次にやること、あなたの確認の記録（{records}件）{photos > 0 && `・現地の写真（${Math.min(photos, 6)}枚）`}を A4（2枚）にまとめます。2枚目は窓口で書き込む回答欄です。窓口へ持っていくメモ・社内の報告に。
        </p>
        <ul className="mt-2 space-y-1 text-[12px] leading-[1.5]">
          {pending.length > 0 ? (
            <li className="rounded-xl bg-[#fff4e5] px-3 py-2 text-[#7a5a2a]">読み込み中：{pending.join("・")}。終わってから印刷すると全部入ります（いま印刷すると、その欄は「読み込み中でした」になります）。</li>
          ) : (
            <li className="rounded-xl bg-mint px-3 py-2 text-brand">データはそろっています。</li>
          )}
          {failed.length > 0 && <li className="rounded-xl bg-[#f6e4dc] px-3 py-2 text-[#8a4f3a]">読めなかったデータ：{failed.join("・")}（時間をおいて調べ直すと入ることがあります）。</li>}
        </ul>
        <button onClick={onPrint} className={`${PRIMARY} mt-2.5 w-full py-3 text-[15px] dense:mt-2`}>
          <PrintIcon className="h-4 w-4" />
          印刷・PDF保存
        </button>
        <p className="mt-2 text-[10.5px] leading-[1.5] text-muted dense:hidden">iPhone はプリントの画面の共有から PDF に保存できます。参考の資料です。最終確認は役所の窓口・公的な資料で。</p>
      </div>
    </Sheet>,
    document.body,
  );
}
