"use client";

// 重説・物件概要の下書きのシート（中身は lib/draft.ts）。欄ごとにタブで見せ（スマホでも1画面に収める。欄が長ければ
// シートが dense → denser → densest の順に詰める。components/sheet.tsx）、欄ごと・全部をコピーできる。
// スマホはメニュー（app/page.tsx）から DRAFT_EVENT で開き、PC は結果の印刷・書類の欄から開く
import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { buildDraft, draftText, sectionLines, DRAFT_NOTE, type DraftInput, type DraftSection } from "@/lib/draft";
import type { LookupResult } from "@/lib/roadmap";
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
  [/^出典/, "出典"],
];
const tabName = (s: DraftSection) => TAB_NAMES.find(([re]) => re.test(s.title))?.[1] ?? s.title;

export function DraftSheet({ result, input, open, onClose }: { result: Ok; input: DraftInput; open: boolean; onClose: () => void }) {
  if (!open) return null;
  // document.body に出す（PC のパネルは backdrop-blur で fixed の基準になり、その中では画面いっぱいに出せない）
  return createPortal(
    <Sheet title="重説・物件概要の下書き" open onClose={onClose}>
      <DraftBody sections={buildDraft(result, input)} />
    </Sheet>,
    document.body,
  );
}

function DraftBody({ sections }: { sections: DraftSection[] }) {
  const [tab, setTab] = useState(0);
  const all = useCopy();
  const part = useCopy();
  const s = sections[Math.min(tab, sections.length - 1)];
  const checks = sections.reduce((n, x) => n + x.rows.filter((r) => r.check).length, 0);
  return (
    <div className="text-ink">
      <p className="text-[11px] leading-[1.6] text-muted dense:leading-[1.5] denser:text-[10.5px] densest:leading-[1.4]">
        重説・販売図面の欄の順に並べた参考の下書きです（法令上の判断はしません）。<b className="font-semibold text-[#8a4f3a]">要確認（{checks}）</b>は役所・法務局・現地で確かめてください。
      </p>
      <button
        onClick={() => all.copy(draftText(sections))}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-light to-brand py-2.5 text-[14px] font-bold text-white shadow-soft dense:py-2 densest:mt-1.5 densest:py-1.5"
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
          <div className="mt-1 space-y-0.5 text-[10px] leading-[1.45] text-muted dense:space-y-0 denser:text-[9.5px] densest:leading-[1.35]">
            {s.rows.map((r) => (
              <p key={r.value}>{r.value}</p>
            ))}
          </div>
        ) : (
          <dl className="mt-1.5 grid grid-cols-[7.2em_1fr] gap-x-2 gap-y-1 text-[11.5px] leading-[1.5] dense:mt-1 dense:gap-y-0.5 denser:text-[11px] denser:leading-[1.45] densest:gap-y-0 densest:leading-[1.35]">
            {s.rows.map((r, i) => (
              <Fragment key={i}>
                <dt className="text-muted">{r.label}</dt>
                <dd className="min-w-0">
                  <span className={r.value === "要確認" ? "font-semibold text-[#8a4f3a]" : ""}>{r.value}</span>
                  {r.check && r.value !== "要確認" && <span className="ml-1 whitespace-nowrap rounded bg-[#f6e4dc] px-1 text-[10px] text-[#8a4f3a]">要確認</span>}
                  {r.note &&
                    (/^https?:/.test(r.note) ? (
                      // URL は画面では「開く」だけ（コピーした文には URL が入る）
                      <a href={r.note} target="_blank" rel="noreferrer" className="ml-1.5 text-[11px] text-brand underline">
                        開く
                      </a>
                    ) : (
                      <span className="block text-[10px] leading-[1.45] text-muted denser:text-[9.5px] densest:leading-[1.3]">{r.note}</span>
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
