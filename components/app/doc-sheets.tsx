"use client";

// 書類のシート（スマホ）。どれも同じ高さ（DOC_BODY）で開き、中身は真ん中の枠の中で動かす（押す・選ぶ・差出人を開くで、シートの大きさが
// 変わらない）。地番の一覧など「書類の中身」を読みやすく見せてコピー・共有するシート（DocSheet。中身は lib/app/doc.ts）、
// 照会文を手紙の形で見せてコピー・印刷（A4）・共有するシート（InquirySheet）、調査メモを印刷する前に中身と読み込みの状態を
// 確かめるシート（MemoSheet）。コピー・共有・印刷は押した操作の中で呼ぶ（iPhone の Safari はそうでないと動かない）。
// どれも document.body に出す（物件の画面の枠の外。見た目は body の .theme-navy に従う）
import { Check, ClipboardCopy, Printer, Share2 } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { docText, type Doc } from "@/lib/app/doc";
import { letterText, type Letter } from "@/lib/app/inquiry-letter";
import { PrintIcon } from "../icons";
import { Sheet } from "../sheet";
import { useCopy } from "../use-copy";
import { DocView, LetterView, PrintLetter } from "./doc-view";

const NAVY = "#133664";
const PRIMARY = "flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-light to-brand py-2.5 text-[14px] font-bold text-white shadow-soft dense:py-2";

/** 書類のシートの中身の高さ（どの書類も同じ。画面の高さに合わせ、上限 640px） */
export const DOC_BODY = "flex h-[min(74dvh,640px)] flex-col";
/** 書類の中身を見せる枠（残りの高さをぜんぶ使い、中で縦に動かす） */
export const DOC_PANE = "min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-[16px] bg-[#f4f7fb] p-2.5";

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

/** 照会文のシート：手紙の形で見せ、コピー（メールの本文）・印刷（FAX 用の A4）・共有。開いている間は、印刷の対象を照会文にする */
export function InquirySheet({ open, onClose, lead, letter, note, extra }: { open: boolean; onClose: () => void; lead: string; letter: Letter; note?: string; extra?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    document.body.dataset.print = "letter";
    return () => {
      delete document.body.dataset.print;
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <Sheet title="道路種別の照会文" open onClose={onClose}>
      <div className={`${DOC_BODY} text-ink`}>
        <p className="shrink-0 text-[12px] leading-[1.6] text-muted dense:leading-[1.5]">{lead}</p>
        {extra && <div className="shrink-0">{extra}</div>}
        <div className={`${DOC_PANE} mt-2`} aria-label="照会文">
          <div className="rounded-[10px] bg-white px-3.5 py-3 shadow-[0_1px_4px_rgba(20,45,85,0.10)]">
            <LetterView letter={letter} />
          </div>
        </div>
        <DocActions text={letterText(letter)} onPrint={() => window.print()} printLabel="印刷・PDF" />
        {note && <p className="mt-2 shrink-0 text-[10.5px] leading-[1.5] text-muted [@media(max-height:720px)]:hidden">{note}</p>}
      </div>
      <PrintLetter letter={letter} />
    </Sheet>,
    document.body,
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
