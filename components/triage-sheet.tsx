"use client";

// 「要注意点と次にやること」のシート（中身は lib/app/triage.ts）。要注意（▲）・要確認（・）を先に、次に窓口ごとのやることを
// チェックの付く一覧で出す（済んだ印は端末に残る。lib/checklist.ts）。スマホはレポートのシートから、PC は印刷のメニューから開く。
// 飾りは最小（文字と並びだけ）で、見た目の色は画面側のテーマ（PC は金色、スマホは紺）に従う
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { TRIAGE_NOTE, triageLines, type Action, type Triage } from "@/lib/app/triage";
import { checklistKey, loadDone, toggleDone } from "@/lib/checklist";
import type { LookupResult } from "@/lib/roadmap";
import { CopyIcon, ExternalIcon } from "./icons";
import { Sheet } from "./sheet";
import { useCopy } from "./use-copy";

type Ok = Extract<LookupResult, { status: "ok" }>;

const noop = () => () => {};

export function TriageSheet({ result, triage, open, onClose }: { result: Ok; triage: Triage; open: boolean; onClose: () => void }) {
  // document.body に出す（PC のパネルは backdrop-blur で fixed の基準になり、その中では画面いっぱいに出せない）
  const client = useSyncExternalStore(noop, () => true, () => false);
  if (!open || !client) return null;
  return createPortal(
    <Sheet title="要注意点と次にやること" open onClose={onClose}>
      <TriageBody result={result} triage={triage} />
    </Sheet>,
    document.body,
  );
}

/** 済んだやることの印（端末に保存）。物件（地点）ごと */
export function useChecklist(result: Ok): { done: Set<string>; toggle: (id: string) => void } {
  const key = checklistKey(result.lat, result.lng);
  const [state, setState] = useState<{ key: string; done: Set<string> }>();
  const done = state?.key === key ? state.done : loadDone(key);
  return { done, toggle: (id) => setState({ key, done: toggleDone(key, id) }) };
}

/** 中身（シートの中・/check ページから使う） */
export function TriageBody({ result, triage }: { result: Ok; triage: Triage }) {
  const { done, toggle } = useChecklist(result);
  const copy = useCopy();
  const warns = triage.issues.filter((i) => i.level === "warn");
  const checks = triage.issues.filter((i) => i.level === "check");
  const left = triage.actions.filter((a) => !done.has(a.id)).length;
  return (
    <div className="text-ink">
      <p className="text-[11px] leading-[1.6] text-muted dense:leading-[1.5] denser:text-[10.5px]">{TRIAGE_NOTE}</p>

      <section className="mt-2.5 rounded-xl border border-line px-3 py-2 dense:py-1.5 densest:mt-1.5">
        <h3 className="flex items-baseline justify-between gap-2 text-[12.5px] font-bold">
          問題になりそうな所
          <span className="text-[11px] font-normal text-muted">{triage.headline}</span>
        </h3>
        {triage.pending.length > 0 && <p className="mt-1 text-[11px] text-muted">{triage.pending.join("・")}を確認しています…</p>}
        {triage.failed.length > 0 && <p className="mt-1 text-[11px] text-[#8a4f3a]">読めなかったデータ：{triage.failed.join("・")}（時間をおいて調べ直してください）</p>}
        {!triage.issues.length && !triage.pending.length && <p className="mt-1 text-[11.5px] text-muted">データで見つかった注意はありません。確かめる所は下の「次にやること」です。</p>}
        {warns.length > 0 && (
          <ul className="mt-1.5 space-y-1.5 dense:space-y-1">
            {warns.map((i) => (
              <li key={i.id} className="text-[11.5px] leading-[1.5] denser:text-[11px]">
                <p className="font-semibold text-[#b23a1e]">▲ {i.title}</p>
                <p className="text-ink/90">{i.detail}</p>
                {i.confirm && <p className="text-[11px] text-muted">確認：{i.confirm}</p>}
              </li>
            ))}
          </ul>
        )}
        {checks.length > 0 && (
          <ul className={`${warns.length ? "mt-2 border-t border-line/70 pt-2" : "mt-1.5"} space-y-1.5 dense:space-y-1`}>
            {checks.map((i) => (
              <li key={i.id} className="text-[11.5px] leading-[1.5] denser:text-[11px]">
                <p className="font-semibold">・{i.title}</p>
                <p className="text-ink/90">{i.detail}</p>
                {i.confirm && <p className="text-[11px] text-muted">確認：{i.confirm}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-2.5 rounded-xl border border-line px-3 py-2 dense:py-1.5 densest:mt-1.5">
        <h3 className="flex items-baseline justify-between gap-2 text-[12.5px] font-bold">
          次にやること
          <span className="text-[11px] font-normal text-muted">{left ? `あと${left}件` : "すべて済み"}</span>
        </h3>
        <ol className="mt-1.5 divide-y divide-line/70">
          {triage.actions.map((a) => (
            <ActionRow key={a.id} action={a} done={done.has(a.id)} onToggle={() => toggle(a.id)} />
          ))}
        </ol>
      </section>

      <button
        onClick={() => copy.copy([`${result.matchedAddress}`, ...triageLines(triage, done)].join("\n"))}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-light to-brand py-2.5 text-[14px] font-bold text-white shadow-soft dense:py-2 densest:mt-1.5 densest:py-1 densest:text-[13px]"
      >
        <CopyIcon className="h-4 w-4" />
        {copy.done ? "コピーしました" : "この一覧をコピー"}
      </button>
    </div>
  );
}

function ActionRow({ action: a, done, onToggle }: { action: Action; done: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-1.5 dense:py-1">
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={done} onChange={onToggle} aria-label={`${a.title}を済みにする`} className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--color-brand)]" />
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <p className={`text-[12.5px] font-semibold leading-[1.4] ${done ? "text-muted line-through" : ""}`}>
            {a.priority === 1 && !done && <span className="mr-1 rounded bg-[#f6e4dc] px-1 text-[10px] font-semibold text-[#8a4f3a]">必須</span>}
            {a.title}
          </p>
          <p className="text-[11px] leading-[1.5] text-muted">
            {a.where}
            {a.phone && <> ・ {a.phone}</>}
          </p>
        </button>
      </div>
      {open && (
        <div className="ml-6 mt-1 space-y-1 text-[11.5px] leading-[1.5] denser:text-[11px]">
          {a.how && <p className="text-muted">{a.how}</p>}
          <ul className="list-disc space-y-0.5 pl-4">
            {a.what.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {a.bring && <p className="text-muted">持ち物：{a.bring.join("・")}</p>}
          {(a.links?.length || a.phone) && (
            <p className="flex flex-wrap gap-1.5 pt-0.5">
              {a.phone && (
                <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-brand">
                  {a.phone} に電話
                </a>
              )}
              {a.links?.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-brand">
                  {l.label}
                  <ExternalIcon className="h-3 w-3 shrink-0 text-muted" />
                </a>
              ))}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
