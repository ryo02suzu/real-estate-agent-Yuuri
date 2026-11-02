"use client";

// 書類のシート（スマホ）。文面を見せてコピー・共有する「文面のシート」（窓口の照会文・地番の一覧）と、調査メモを印刷する前に
// 中身と読み込みの状態を確かめるシート。コピー・共有・印刷は押した操作の中で呼ぶ（iPhone の Safari はそうでないと動かない）。
// どれも document.body に出す（物件の画面の枠の外。見た目は body の .theme-navy に従う）
import { createPortal } from "react-dom";
import { CopyIcon, PrintIcon, ShareIcon } from "../icons";
import { Sheet } from "../sheet";
import { useCopy } from "../use-copy";

const PRIMARY = "flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-light to-brand py-2.5 text-[14px] font-bold text-white shadow-soft dense:py-2";
const SECONDARY = "flex shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-line bg-white px-4 py-2.5 text-[14px] font-semibold text-brand dense:py-2";

/** 文面のシート：文面を見せて、コピー（と、できる端末では共有） */
export function TextDocSheet({ open, onClose, title, lead, text, note }: { open: boolean; onClose: () => void; title: string; lead: string; text: string; note?: string }) {
  if (!open) return null;
  return createPortal(
    <Sheet title={title} open onClose={onClose}>
      <TextDocBody lead={lead} text={text} note={note} />
    </Sheet>,
    document.body,
  );
}

function TextDocBody({ lead, text, note }: { lead: string; text: string; note?: string }) {
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
    <div className="text-ink">
      <p className="text-[12px] leading-[1.6] text-muted dense:leading-[1.5] denser:text-[11.5px]">{lead}</p>
      <pre className="mt-2 max-h-[46vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-mint px-3 py-2 text-[12px] leading-[1.55] text-ink dense:max-h-[38vh]" style={{ fontFamily: "inherit" }} aria-label="文面">
        {text}
      </pre>
      <div className="mt-2.5 flex gap-2 dense:mt-2">
        <button onClick={() => copy.copy(text)} className={PRIMARY}>
          <CopyIcon className="h-4 w-4" />
          {copy.done ? "コピーしました" : "文面をコピー"}
        </button>
        {canShare && (
          <button onClick={() => void share()} className={SECONDARY} aria-label="共有">
            <ShareIcon className="h-4 w-4" />
            共有
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-[10.5px] leading-[1.5] text-muted dense:hidden">{note}</p>}
    </div>
  );
}

/** 調査メモの印刷：入るもの・読み込みの状態を見せてから印刷（iPhone はプリントの画面から PDF にできる） */
export function MemoSheet({ open, onClose, pending, failed, records, onPrint }: { open: boolean; onClose: () => void; pending: string[]; failed: string[]; records: number; onPrint: () => void }) {
  if (!open) return null;
  return createPortal(
    <Sheet title="調査メモ（A4）" open onClose={onClose}>
      <div className="text-ink">
        <p className="text-[12px] leading-[1.6] text-muted dense:leading-[1.5]">
          道路種別・都市計画・法令・ハザード・地番・建物・地価・駅・学区・周辺の施設と、要注意点と次にやること、あなたの確認の記録（{records}件）を A4（1〜2枚）にまとめます。窓口へ持っていくメモ・社内の報告に。
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
