"use client";

import { useState } from "react";
import { ASK, BRING, buildInquiryText } from "@/lib/inquiry";
import type { Contact } from "@/lib/roadmap";
import { parsePhones } from "@/lib/phone";
import { AlertIcon, ChevronRightIcon, CopyIcon, MailIcon, NoteIcon, PhoneIcon } from "./icons";
import { Sheet } from "./sheet";

/** 問い合わせ先。部署名などの表と、ワンタップで発信できる電話ボタン */
export function ContactCard({ contact, city, address }: { contact: Contact; city: string; address: string }) {
  const [memo, setMemo] = useState(false);
  const phones = contact.phone ? parsePhones(contact.phone) : [];
  // 県の出先機関（「千葉県 ○○土木事務所」など）は市町村名を付けない
  const dept = /^(東京都|\S{2,3}県)\s/.test(contact.dept) ? contact.dept : `${city} ${contact.dept}`;
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white px-4 py-3">
      <h3 className="flex items-center gap-2 border-b border-line/70 pb-2 text-[13px] font-semibold text-ink">
        <PhoneIcon className="h-4 w-4 text-brand-light" />
        お問い合わせ先
        <button onClick={() => setMemo(true)} className="ml-auto flex items-center gap-1 rounded-full bg-mint px-2.5 py-1 text-[11px] font-normal text-brand">
          <NoteIcon className="h-3.5 w-3.5" />
          窓口で聞くこと
        </button>
      </h3>
      <dl className="mt-2 grid grid-cols-[4.5em_1fr] gap-x-2 gap-y-1 text-[12px] leading-relaxed">
        <dt className="text-muted">部署名</dt>
        <dd className="text-ink">{dept}</dd>
        {contact.hours && (
          <>
            <dt className="text-muted">受付時間</dt>
            <dd className="text-ink">{contact.hours}</dd>
          </>
        )}
        {contact.note && (
          <>
            <dt className="text-muted">備考</dt>
            <dd className="flex gap-1.5 text-[#8a4f3a]">
              <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {contact.note}
            </dd>
          </>
        )}
      </dl>

      {(phones.length > 0 || contact.email) && (
        <div className="mt-2.5 space-y-2">
          {phones.map((p, i) => (
            // 1件目を金色の大きなボタンに。押すとそのまま発信画面になる
            <a
              key={p.number}
              href={`tel:${p.number.replace(/-/g, "")}`}
              className={
                i === 0
                  ? "bg-gold flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2 text-white shadow-[0_6px_16px_rgba(138,102,50,0.28)] active:scale-[0.99]"
                  : "flex min-h-11 items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-2 text-ink active:scale-[0.99]"
              }
            >
              <PhoneIcon className="h-[18px] w-[18px] shrink-0" />
              <span className="tabular flex-1 text-[17px] font-semibold tracking-[0.02em]">{p.number}</span>
              <span className={`text-[11px] ${i === 0 ? "text-white/85" : "text-muted"}`}>{p.label ?? "電話する"}</span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 opacity-80" />
            </a>
          ))}
          {contact.noPhoneInquiry && !contact.note && (
            <p className="text-[10.5px] leading-relaxed text-muted">道路種別は電話では答えてもらえません（窓口の場所・時間の確認用）。</p>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-2 text-ink">
              <MailIcon className="h-[18px] w-[18px] shrink-0 text-brand" />
              <span className="min-w-0 flex-1 break-all text-[13px]">{contact.email}</span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 opacity-80" />
            </a>
          )}
        </div>
      )}
      <InquirySheet open={memo} onClose={() => setMemo(false)} address={address} dept={dept} />
    </section>
  );
}

function InquirySheet({ open, onClose, address, dept }: { open: boolean; onClose: () => void; address: string; dept: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = buildInquiryText(address, dept);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("コピーしてください", text);
    }
  };
  return (
    <Sheet title="窓口で聞くこと" open={open} onClose={onClose}>
      <p className="text-[12px] text-muted">{dept}</p>
      <h4 className="mb-1.5 mt-4 text-[13px] font-semibold text-ink [@media(max-height:720px)]:mt-2.5 [@media(max-height:720px)]:mb-1">持っていくもの</h4>
      <ul className="space-y-1 text-[13px] text-ink [@media(max-height:720px)]:space-y-0 [@media(max-height:720px)]:text-[12px]">
        {BRING.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-light" />
            {b}
          </li>
        ))}
      </ul>
      <h4 className="mb-1.5 mt-4 text-[13px] font-semibold text-ink [@media(max-height:720px)]:mt-2.5 [@media(max-height:720px)]:mb-1">聞くこと</h4>
      <ol className="space-y-1.5 text-[13px] text-ink [@media(max-height:720px)]:space-y-0.5 [@media(max-height:720px)]:text-[12px]">
        {ASK.map((a, i) => (
          <li key={a} className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint text-[11px] text-brand">{i + 1}</span>
            {a}
          </li>
        ))}
      </ol>
      <button onClick={copy} className="bg-gold mt-5 [@media(max-height:720px)]:mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white">
        <CopyIcon className="h-4 w-4" />
        {copied ? "コピーしました" : "FAX・メール用の依頼文をコピー"}
      </button>
      <p className="mt-2 text-[11px] text-muted">住所と聞くことを入れた文面です。地番と会社名を書き足して使ってください。</p>
    </Sheet>
  );
}
