"use client";

// PC の「要注意点と次にやること」（真ん中に重ねて開く）。中身はスマホ・共有の文・調査メモと同じ lib/app/triage.ts。
// 要注意（データで分かった注意点）・要確認（自分で確かめること）・次にやること（済んだ印はスマホと同じく端末に残る。lib/checklist.ts）。
// 法令上の判断（再建築の可否など）はしない
import { ChevronDown, ClipboardCopy, ExternalLink, Phone } from "lucide-react";
import { useState } from "react";
import { TRIAGE_NOTE, triageLines, type Action, type Issue, type Triage } from "@/lib/app/triage";
import type { RecordTopic } from "@/lib/records";
import type { Ok } from "../app/use-property";
import { copyText, Overlay } from "./ui";

export function TriageOverlay({ result, triage, checklist, title, onClose, onRecord }: { result: Ok; triage: Triage; checklist: { done: Set<string>; toggle: (id: string) => void }; title: string; onClose: () => void; onRecord: (t: RecordTopic) => void }) {
  const warns = triage.issues.filter((i) => i.level === "warn");
  const checks = triage.issues.filter((i) => i.level === "check");
  const left = triage.actions.filter((a) => !checklist.done.has(a.id)).length;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText([result.matchedAddress, ...triageLines(triage, checklist.done)].join("\n"))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <Overlay
      title="要注意点と次にやること"
      hint={title}
      onClose={onClose}
      actions={
        <button type="button" className="btn small" onClick={copy}>
          <ClipboardCopy size={15} aria-hidden />
          {copied ? "コピーしました" : "一覧をコピー"}
        </button>
      }
    >
      <p className="desk-small mt-0">{TRIAGE_NOTE}</p>
      {triage.pending.length > 0 && (
        <p className="desk-note mt-2 flex items-center gap-2">
          <span className="desk-loading" aria-hidden />
          {triage.pending.join("・")}を確認しています…
        </p>
      )}
      {triage.failed.length > 0 && <p className="placenote warn mt-2">読めなかったデータ：{triage.failed.join("・")}（時間をおいて調べ直してください）</p>}

      <p className="desk-datehead mt-4">要注意（データで分かった注意点）</p>
      {warns.length ? (
        <div className="desk-list">
          {warns.map((i) => (
            <IssueRow key={i.id} issue={i} />
          ))}
        </div>
      ) : (
        <p className="desk-empty py-4">
          <b>{triage.pending.length ? "確認しています" : "要注意はありません"}</b>
          {triage.pending.length ? "読み込みが終わると、ここに出ます。" : "データで分かる範囲では、注意する点は見つかっていません。"}
        </p>
      )}
      <p className="desk-datehead mt-4">要確認（自分で確かめること）</p>
      {checks.length ? (
        <div className="desk-list">
          {checks.map((i) => (
            <IssueRow key={i.id} issue={i} />
          ))}
        </div>
      ) : (
        <p className="hint">ありません。</p>
      )}
      <p className="desk-datehead mt-4">
        次にやること（済んだら印を付けると進み具合に反映。{left ? `あと${left}件` : "すべて済み"}）
      </p>
      <div className="desk-list">
        {triage.actions.map((a) => (
          <ActionRow key={a.id} action={a} done={checklist.done.has(a.id)} onToggle={() => checklist.toggle(a.id)} />
        ))}
      </div>
      <div className="desk-btnrow mt-4 items-center" role="group" aria-label="確かめた結果を記録する">
        <span className="hint">確かめた結果を記録：</span>
        {(
          [
            ["road", "道路"],
            ["zoning", "都市計画"],
            ["law", "建築の注意点"],
            ["hazard", "ハザード"],
            ["parcel", "地番・土地"],
          ] as [RecordTopic, string][]
        ).map(([t, label]) => (
          <button key={t} type="button" className="btn small" onClick={() => onRecord(t)}>
            {label}
          </button>
        ))}
      </div>
    </Overlay>
  );
}

function IssueRow({ issue: i }: { issue: Issue }) {
  return (
    <div className="desk-issue">
      <span className={`chip ${i.level === "warn" ? "warn" : "gold"} shrink-0`}>{i.level === "warn" ? "要注意" : "要確認"}</span>
      <span className="min-w-0">
        <b className="block font-semibold">{i.title}</b>
        <span className="block text-[12.5px] text-[var(--muted)]">{i.detail}</span>
        {i.confirm && <span className="block text-[12px] text-[var(--muted)]">確認：{i.confirm}</span>}
      </span>
    </div>
  );
}

function ActionRow({ action: a, done, onToggle }: { action: Action; done: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const id = `desk-act-${a.id}`;
  return (
    <div className={`desk-check${done ? " done" : ""}`}>
      <input id={id} type="checkbox" checked={done} onChange={onToggle} aria-describedby={`${id}-w`} />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="t block cursor-pointer font-semibold">
          {a.priority === 1 && !done && <span className="chip warn mr-1.5 align-[1px] text-[11px]">必須</span>}
          {a.title}
        </label>
        <span id={`${id}-w`} className="block text-[12.5px] text-[var(--muted)]">
          {a.where}
          {a.phone && <> ・ {a.phone}</>}
        </span>
        {open && (
          <div className="mt-1.5 space-y-1 text-[12.5px]">
            {a.how && <p className="text-[var(--muted)]">{a.how}</p>}
            <ul className="list-disc space-y-0.5 pl-5">
              {a.what.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            {a.bring && <p className="text-[var(--muted)]">持ち物：{a.bring.join("・")}</p>}
            {(a.links?.length || a.phone) && (
              <p className="flex flex-wrap gap-1.5 pt-0.5">
                {a.phone && (
                  <a className="btn small" href={`tel:${a.phone.replace(/[^\d+]/g, "")}`}>
                    <Phone size={13} aria-hidden />
                    {a.phone}
                  </a>
                )}
                {a.links?.map((l) => (
                  <a key={l.url} className="btn small" href={l.url} target="_blank" rel="noreferrer">
                    {l.label}
                    <ExternalLink size={12} aria-hidden />
                  </a>
                ))}
              </p>
            )}
          </div>
        )}
      </div>
      <button type="button" className="btn ghost small shrink-0" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        くわしく
        <ChevronDown size={14} className={open ? "rotate-180" : ""} aria-hidden />
      </button>
    </div>
  );
}
