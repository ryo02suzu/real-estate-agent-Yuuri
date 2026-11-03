"use client";

// 重説・物件概要の下書きのシート（中身は lib/draft.ts）。欄ごとにタブで見せ（スマホでも1画面に収める。欄が長ければ
// シートが dense → denser → densest の順に詰める。components/sheet.tsx）、欄ごと・全部をコピーできる。
// スマホはメニュー（app/page.tsx）から DRAFT_EVENT で開き、PC は結果の印刷・書類の欄から開く
import { Check, ClipboardCopy } from "lucide-react";
import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { docText } from "@/lib/app/doc";
import { draftDoc, draftSectionDoc, uniqueSentences } from "@/lib/app/draft-doc";
import { buildDraft, draftText, sectionLines, DRAFT_NOTE, type DraftInput, type DraftSection } from "@/lib/draft";
import type { LookupResult } from "@/lib/roadmap";
import { DOC_BODY, DOC_PANE } from "./app/doc-sheets";
import { DocSectionView } from "./app/doc-view";
import { CopyIcon } from "./icons";
import { Sheet } from "./sheet";
import { useCopy } from "./use-copy";

type Ok = Extract<LookupResult, { status: "ok" }>;

/** スマホのメニューから下書きを開く（結果の画面がこのイベントを受けて開く） */
export const DRAFT_EVENT = "michilu:draft";
export const openDraft = () => window.dispatchEvent(new Event(DRAFT_EVENT));

/** タブの短い名前（見出しの頭から） */
const TAB_NAMES: [RegExp, string][] = [
  [/^物件/, "所在"],
  [/^都市計画法/, "都市計画"],
  [/^その他の法令/, "その他の法令"],
  [/^敷地と道路/, "道路"],
  [/^飲用水/, "上下水道"],
  [/^ハザードマップ/, "ハザードマップ"],
  [/^災害リスク/, "災害（参考）"],
  [/^販売図面/, "物件概要"],
  [/^周辺環境/, "周辺環境"],
  [/^出典/, "出典"],
];
const tabName = (s: DraftSection) => TAB_NAMES.find(([re]) => re.test(s.title))?.[1] ?? s.title;

/**
 * tidy：スマホの見せ方（components/app の書類と同じ形。シートの高さを固定して、タブを変えても大きさが変わらない。欄の URL は「開く」、
 * 隣地は所在をまとめて短く、コピーする文は見出しと行の形。lib/app/draft-doc.ts）。PC は渡さない（今までどおり）
 */
export function DraftSheet({ result, input, open, onClose, tidy }: { result: Ok; input: DraftInput; open: boolean; onClose: () => void; tidy?: boolean }) {
  if (!open) return null;
  // document.body に出す（PC のパネルは backdrop-blur で fixed の基準になり、その中では画面いっぱいに出せない）
  return createPortal(
    <Sheet title="重説・物件概要の下書き" open onClose={onClose}>
      {tidy ? <TidyDraftBody sections={buildDraft(result, input)} /> : <DraftBody sections={buildDraft(result, input)} />}
    </Sheet>,
    document.body,
  );
}

/** スマホの下書き：欄のタブ（1行。横にすべらせる）・欄の中身（同じ高さの枠の中）・全部コピー／この欄をコピー */
function TidyDraftBody({ sections }: { sections: DraftSection[] }) {
  const [tab, setTab] = useState(0);
  const all = useCopy();
  const part = useCopy();
  const s = sections[Math.min(tab, sections.length - 1)];
  const checks = sections.reduce((n, x) => n + x.rows.filter((r) => r.check).length, 0);
  const confirmed = sections.reduce((n, x) => n + x.rows.filter((r) => r.confirmed).length, 0);
  const section = draftSectionDoc(s);
  const source = /^出典/.test(s.title);
  return (
    <div className={`${DOC_BODY} text-ink`}>
      <p className="shrink-0 text-[12px] leading-[1.6] text-muted">
        重説・販売図面の欄の順に並べた参考の下書きです（法令上の判断はしません）。<b className="font-semibold text-[#8a5a00]">要確認 {checks}か所</b>は役所・法務局・現地で確かめてから書いてください。
        {confirmed > 0 && <b className="ml-1 font-semibold text-[#1f8f5a]">確認済み {confirmed}か所は、あなたが確かめた結果です。</b>}
      </p>
      <div role="tablist" aria-label="欄" className="-mx-5 mt-2 flex shrink-0 gap-1.5 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((x, i) => {
          const n = x.rows.filter((r) => r.check).length;
          return (
            <button key={x.title} role="tab" aria-selected={i === tab} onClick={() => setTab(i)} className="press inline-flex h-[32px] shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-colors duration-150" style={{ background: i === tab ? "#133664" : "#eef2f7", color: i === tab ? "#fff" : "#41506a" }}>
              {tabName(x)}
              {n > 0 && <span className="rounded-full px-1.5 text-[10.5px] font-bold tabular-nums" style={{ background: i === tab ? "rgba(255,255,255,0.2)" : "#fff1d6", color: i === tab ? "#fff" : "#8a5a00" }}>{n}</span>}
            </button>
          );
        })}
      </div>
      <div className={`${DOC_PANE} mt-2`} role="tabpanel" aria-label={s.title}>
        {source ? (
          // 出典は長いので、小さな字で並べる（同じ注が2回出ないように）
          <div className="space-y-1 rounded-[14px] bg-white px-3 py-2.5 text-[11px] leading-[1.55] text-muted shadow-[0_1px_3px_rgba(20,45,85,0.08)]">
            {uniqueSentences(s.rows.map((r) => r.value)).map((v) => (
              <p key={v}>{v}</p>
            ))}
          </div>
        ) : (
          <DocSectionView section={section} />
        )}
      </div>
      <div className="mt-2.5 flex shrink-0 gap-2">
        <button onClick={() => all.copy(docText(draftDoc(sections, new Date())))} className="press flex h-[48px] flex-1 items-center justify-center gap-2 rounded-[16px] text-[15px] font-bold text-white transition-colors duration-200" style={{ background: all.done ? "#1f8f5a" : "#133664" }}>
          {all.done ? <Check key="done" className="td-bump h-5 w-5" strokeWidth={3} /> : <ClipboardCopy className="h-[18px] w-[18px]" />}
          {all.done ? "コピーしました" : "全部コピー"}
        </button>
        <button onClick={() => part.copy(docText({ title: `重説の下書き：${s.title}`, head: [], sections: [section] }))} className="press flex h-[48px] shrink-0 items-center justify-center gap-1.5 rounded-[16px] px-4 text-[14px] font-bold" style={{ background: "#e3ebf6", color: "#133664" }}>
          {part.done ? <Check className="h-4 w-4" strokeWidth={3} /> : <CopyIcon className="h-4 w-4" />}
          {part.done ? "コピー済" : "この欄だけ"}
        </button>
      </div>
    </div>
  );
}

function DraftBody({ sections }: { sections: DraftSection[] }) {
  const [tab, setTab] = useState(0);
  const all = useCopy();
  const part = useCopy();
  const s = sections[Math.min(tab, sections.length - 1)];
  const checks = sections.reduce((n, x) => n + x.rows.filter((r) => r.check).length, 0);
  // あなたが確かめた結果を入れた欄の数（スマホの「次にやること」で書いたとき。PC は入れないので出ない）
  const confirmed = sections.reduce((n, x) => n + x.rows.filter((r) => r.confirmed).length, 0);
  return (
    <div className="text-ink">
      <p className="text-[11px] leading-[1.6] text-muted dense:leading-[1.5] denser:text-[10.5px] densest:leading-[1.4]">
        {/* いちばん詰めるときは1行に縮める（同じ注意はコピーした文の最後にも入る） */}
        <span className="densest:hidden">重説・販売図面の欄の順に並べた参考の下書きです（法令上の判断はしません）。</span>
        <b className="font-semibold text-[#8a4f3a]">要確認（{checks}）</b>は役所・法務局・現地で<span className="densest:hidden">確かめてください。</span>
        <span className="hidden densest:inline">確認。法令の判断はしません</span>
        {confirmed > 0 && <b className="ml-1 font-semibold text-[#1f8f5a]">確認済み（{confirmed}）は、あなたが確かめた結果です。</b>}
      </p>
      <button
        onClick={() => all.copy(draftText(sections))}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-light to-brand py-2.5 text-[14px] font-bold text-white shadow-soft dense:py-2 densest:mt-1.5 densest:py-1 densest:text-[13px]"
      >
        <CopyIcon className="h-4 w-4" />
        {all.done ? "コピーしました" : "全部コピー"}
      </button>
      <div role="tablist" className="mt-2.5 flex flex-wrap gap-1 dense:mt-2 densest:mt-1.5">
        {sections.map((x, i) => (
          <button
            key={x.title}
            role="tab"
            aria-selected={i === tab}
            onClick={() => setTab(i)}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] densest:px-2 densest:py-0.5 densest:text-[11px] ${i === tab ? "border-brand bg-brand text-white" : "border-line text-ink"}`}
          >
            {tabName(x)}
          </button>
        ))}
      </div>
      <section className="mt-2 rounded-xl border border-line px-3 py-2 dense:py-1.5 densest:mt-1.5 densest:py-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[12.5px] font-bold">{s.title}</h3>
          <button onClick={() => part.copy(sectionLines(s).join("\n"))} className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-brand">
            <CopyIcon className="h-3 w-3" />
            {/* 詰めるときは「コピー」だけにして、欄の見出しを1行に収める */}
            {part.done ? "コピー済" : <span><span className="densest:hidden">この欄を</span>コピー</span>}
          </button>
        </div>
        {/^出典/.test(s.title) ? (
          // 出典は長いので、表にせず小さな字で並べる
          <div className="mt-1 space-y-0.5 text-[10px] leading-[1.45] text-muted dense:space-y-0 denser:text-[9.5px] densest:mt-0.5 densest:text-[9px] densest:leading-[1.28]">
            {s.rows.map((r) => (
              <p key={r.value}>{r.value}</p>
            ))}
          </div>
        ) : (
          <dl className="mt-1.5 grid grid-cols-[7.2em_1fr] gap-x-2 gap-y-1 text-[11.5px] leading-[1.5] dense:mt-1 dense:gap-y-0.5 denser:text-[11px] denser:leading-[1.45] densest:gap-y-0 densest:leading-[1.3]">
            {s.rows.map((r, i) => (
              <Fragment key={i}>
                <dt className="text-muted">{r.label}</dt>
                <dd className="min-w-0">
                  <span className={r.value === "要確認" ? "font-semibold text-[#8a4f3a]" : ""}>{r.value}</span>
                  {r.check && r.value !== "要確認" && <span className="ml-1 whitespace-nowrap rounded bg-[#f6e4dc] px-1 text-[10px] text-[#8a4f3a]">要確認</span>}
                  {r.confirmed && <span className="ml-1 whitespace-nowrap rounded bg-[#e3f5ec] px-1 text-[10px] font-semibold text-[#1f8f5a]">確認済み</span>}
                  {r.note &&
                    (/^https?:/.test(r.note) ? (
                      // URL は画面では「開く」だけ（コピーした文には URL が入る）
                      <a href={r.note} target="_blank" rel="noreferrer" className="ml-1.5 text-[11px] text-brand underline">
                        開く
                      </a>
                    ) : (
                      // 確かめた結果の欄は「確認済み」の印を付けたので、注の頭の「確認済み」は省く（コピーした文には入る）
                      <Note text={r.confirmed ? r.note.replace(/^確認済み /, "") : r.note} />
                    ))}
                </dd>
              </Fragment>
            ))}
          </dl>
        )}
      </section>
      {/* 同じ注意はコピーした文の最後にも入る。背の低い画面と、詰めるときは出さない */}
      <p className="mt-2 text-[10px] leading-[1.5] text-muted dense:hidden [@media(max-height:720px)]:hidden">{DRAFT_NOTE}</p>
    </div>
  );
}

/** 欄の注。いちばん詰めるときは2行までにして、押すと全部を出す（コピーした文には全部入る） */
function Note({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      onClick={() => setOpen((o) => !o)}
      className={`block text-[10px] leading-[1.45] text-muted denser:text-[9.5px] densest:leading-[1.3] ${open ? "" : "densest:line-clamp-2"}`}
    >
      {text}
    </span>
  );
}
