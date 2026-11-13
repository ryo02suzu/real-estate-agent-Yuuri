"use client";

// 書類の差出人（会社名・担当者・電話・メール）を入れる欄。照会文のシートの中（畳んだ行から開く）と、その他の「書類の差出人」の
// シートから使う。入れた差出人は照会文の最後・調査メモと案内図の右上に入る（lib/sender.ts。端末の中だけに残す）
import { Building2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { hasSender, loadSender, saveSender, senderShort, useSender, type Sender } from "@/lib/sender";
import { Sheet } from "../sheet";
import { Expand } from "./research";
import { NAVY } from "./ui";

const FIELDS: { key: keyof Sender; label: string; placeholder: string; type: string; auto: string }[] = [
  { key: "company", label: "会社名", placeholder: "例：〇〇不動産株式会社 〇〇店", type: "text", auto: "organization" },
  { key: "person", label: "担当者", placeholder: "例：営業部 〇〇", type: "text", auto: "name" },
  { key: "phone", label: "電話", placeholder: "例：03-0000-0000", type: "tel", auto: "tel" },
  { key: "email", label: "メール（任意）", placeholder: "例：info@example.co.jp", type: "email", auto: "email" },
];

/** 差出人の入力欄（打つたびに保存する。入力中の空白は消さず、保存するときだけ前後の空白を外す） */
export function SenderFields() {
  const [v, setV] = useState<Sender>(() => loadSender());
  const [saved, setSaved] = useState<boolean | null>(null);
  const set = (k: keyof Sender, val: string) => {
    const next = { ...v, [k]: val };
    setV(next);
    setSaved(saveSender(next));
  };
  return (
    <div className="space-y-2.5">
      {FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className="text-[12.5px] font-semibold text-[#41506a]">{f.label}</span>
          <input
            value={v[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
            placeholder={f.placeholder}
            type={f.type}
            autoComplete={f.auto}
            maxLength={80}
            className="mt-1 h-[44px] w-full rounded-xl border border-line bg-[#f8fafc] px-3 text-[16px] text-ink placeholder:text-muted/60"
          />
        </label>
      ))}
      <p className={`text-[11.5px] leading-[1.55] ${saved === false ? "text-[#c2561f]" : "text-muted"}`}>
        {saved === false ? "保存できませんでした（プライベートブラウズでは残りません）。" : "この端末の中だけに残します（MICHILU のサーバーには送りません）。照会文・調査メモ・案内図に入ります。"}
      </p>
    </div>
  );
}

/** 照会文のシートの中：差出人の1行（押すと入力欄が開く） */
export function SenderInline() {
  const s = useSender();
  const [open, setOpen] = useState(false);
  const has = hasSender(s);
  return (
    <div className="mt-2 rounded-xl bg-[#f4f7fb]">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left">
        <Building2 size={16} strokeWidth={2.2} color={NAVY} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: has ? "#1b2a44" : NAVY }}>
          {has ? `差出人：${senderShort(s).join("・")}` : "差出人を入れる（会社名・担当者・電話）"}
        </span>
        <ChevronDown size={16} className="td-chev shrink-0 text-muted" data-open={open ? "1" : "0"} />
      </button>
      <Expand open={open}>
        <div>
          <div className="px-3 pb-3">
            <SenderFields />
          </div>
        </div>
      </Expand>
    </div>
  );
}

/** その他の「書類の差出人」のシート */
export function SenderSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet title="書類の差出人" open={open} onClose={onClose}>
      <p className="mb-3 text-[12.5px] leading-[1.6] text-muted">役所への照会文の最後と、調査メモ・案内図の右上に入れる会社名・担当者です。入れなければ空欄のままです。</p>
      {open && <SenderFields />}
    </Sheet>
  );
}
