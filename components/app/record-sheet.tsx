"use client";

// 確認の記録：項目（道路・都市計画・建築の注意点・ハザード・周辺環境・地番・土地）の確認事項を1つずつ、確認済み・確認した方法・
// 出典・メモとして端末の中に残す（サーバーには送らない）。上に自動で取れた情報と次にやること、その下に確認事項。
// 全部が済むまで項目は「確認済み」にならない（一部確認）。保存できたかはその場で知らせる。MICHILU は判定しない（メモは自由記述）
import { Check, ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { METHODS, RECORD_ITEMS, removeRecord, writeRecord, type PropertyRecords, type RecordTopic, type SubRecord } from "@/lib/records";
import { Sheet } from "../sheet";
import { StatusChip } from "./research";
import type { TopicStatus } from "./status";
import { STATUS } from "./tokens";
import { NAVY } from "./ui";

const when = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function RecordSheet({
  open,
  topic,
  pid,
  label,
  records,
  status,
  onClose,
  onChange,
}: {
  open: boolean;
  topic: RecordTopic | null;
  /** 物件の鍵（lib/property-id.ts） */
  pid: string;
  /** 画面に出す名前（住所） */
  label: string;
  records: PropertyRecords;
  /** 項目の状態（取れた情報・次にやること） */
  status?: TopicStatus;
  onClose: () => void;
  onChange: (records: PropertyRecords) => void;
}) {
  // 開いている確認事項（方法・出典・メモの欄）
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [saved, setSaved] = useState<"ok" | "fail" | null>(null);
  if (!open || !topic) return null;
  const item = RECORD_ITEMS[topic];
  const recs = records.items[topic] ?? {};
  const done = item.subs.filter((s) => recs[s.id]?.done).length;
  const write = (sub: string, patch: Partial<Omit<SubRecord, "at">>) => {
    const cur = recs[sub];
    const r = writeRecord(pid, label, topic, sub, { done: cur?.done ?? false, method: cur?.method, source: cur?.source, note: cur?.note, ...patch });
    onChange(r.records);
    setSaved(r.saved ? "ok" : "fail");
  };
  const remove = (sub: string) => {
    const r = removeRecord(pid, topic, sub);
    onChange(r.records);
    setSaved(r.saved ? "ok" : "fail");
    if (openSub === sub) setOpenSub(null);
  };

  return (
    <Sheet title={`${item.label}の確認を記録`} open onClose={onClose}>
      {status && (
        <div className="rounded-2xl bg-mint px-4 py-3">
          <div className="flex items-center gap-2">
            <StatusChip status={status.status}>{status.chip}</StatusChip>
            <span className="text-[12px] text-muted">
              {done}/{item.subs.length} 件を確認済み
            </span>
          </div>
          <p className="mt-2 text-[14px] leading-[1.6] text-ink">{status.value}</p>
          <p className="mt-1 text-[12.5px] leading-[1.6] text-muted">次にやること：{status.hint}</p>
        </div>
      )}
      <ul className="mt-2 divide-y divide-line">
        {item.subs.map((s) => {
          const r = recs[s.id];
          const isOpen = openSub === s.id;
          const on = !!r?.done;
          return (
            <li key={s.id} className="py-1">
              <div className="flex items-center gap-1">
                <button onClick={() => write(s.id, { done: !on })} aria-pressed={on} aria-label={`${s.label}を${on ? "未確認に戻す" : "確認済みにする"}`} className="press flex size-[44px] shrink-0 items-center justify-center">
                  <span className="flex size-[26px] items-center justify-center rounded-full border-2 transition-colors duration-150" style={{ borderColor: on ? STATUS.confirmed.color : "#aeb8c8", background: on ? STATUS.confirmed.color : "transparent" }}>
                    {on && <Check size={16} strokeWidth={3} absoluteStrokeWidth color="#fff" />}
                  </span>
                </button>
                <button onClick={() => setOpenSub(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 py-1 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{s.label}</span>
                    <span className="block truncate text-[12px] text-muted">{r ? [on ? `確認済み ${when(r.at)}` : "未確認", r.method, r.source, r.note ? "メモあり" : ""].filter(Boolean).join("・") : "方法・出典・メモを残せます"}</span>
                  </span>
                  <ChevronDown size={16} className={`shrink-0 text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              <div className="expand" data-open={isOpen ? "1" : "0"} aria-hidden={!isOpen}>
                <div>
                  <div className="pb-3 pl-[48px] pr-1">
                    <div className="flex flex-wrap gap-1.5">
                      {METHODS.map((m) => {
                        const sel = r?.method === m;
                        return (
                          <button key={m} onClick={() => write(s.id, { method: sel ? undefined : m })} aria-pressed={sel} className="press h-[32px] rounded-full px-3 text-[13px] font-semibold" style={{ background: sel ? NAVY : "#eef2f7", color: sel ? "#fff" : "#26324a" }}>
                            {m}
                          </button>
                        );
                      })}
                    </div>
                    <input value={r?.source ?? ""} onChange={(e) => write(s.id, { source: e.target.value })} placeholder="出典（例：渋谷区 指定道路図、建築指導課 窓口）" aria-label={`${s.label}の出典`} className="mt-2 h-[42px] w-full rounded-xl border border-line bg-white px-3 text-[16px] text-ink placeholder:text-muted/70" />
                    <textarea value={r?.note ?? ""} onChange={(e) => write(s.id, { note: e.target.value })} placeholder="メモ（自由記述。MICHILU は判定しません）" aria-label={`${s.label}のメモ`} rows={2} className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-[16px] leading-[1.5] text-ink placeholder:text-muted/70" />
                    {r && (
                      <button onClick={() => remove(s.id)} className="mt-1 flex h-[36px] items-center gap-1 text-[12.5px] text-muted">
                        <Trash2 size={14} />
                        この記録を消す
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={`mt-2 text-[12px] leading-[1.6] ${saved === "fail" ? "text-[#c2561f]" : "text-muted"}`}>
        {saved === "fail"
          ? "保存できませんでした。端末の空き容量と、プライベートブラウズでないことを確かめてください。"
          : saved === "ok"
            ? "保存しました（この端末の中だけ。MICHILU のサーバーには送りません）。"
            : "記録はこの端末の中だけに残ります。機種変更に備えた書き出しは「その他」の「調査記録の書き出し・読み込み」から。"}
      </p>
    </Sheet>
  );
}
