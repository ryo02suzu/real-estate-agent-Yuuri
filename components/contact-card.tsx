import type { Contact } from "@/lib/roadmap";
import { parsePhones } from "@/lib/phone";
import { AlertIcon, ChevronRightIcon, MailIcon, PhoneIcon } from "./icons";

/** 問い合わせ先。部署名などの表と、ワンタップで発信できる電話ボタン */
export function ContactCard({ contact, city }: { contact: Contact; city: string }) {
  const phones = contact.phone ? parsePhones(contact.phone) : [];
  // 県の出先機関（「千葉県 ○○土木事務所」など）は市町村名を付けない
  const dept = /^(東京都|\S{2,3}県)\s/.test(contact.dept) ? contact.dept : `${city} ${contact.dept}`;
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white px-4 py-3">
      <h3 className="flex items-center gap-2 border-b border-line/70 pb-2 text-[13px] font-semibold text-ink">
        <PhoneIcon className="h-4 w-4 text-brand-light" />
        お問い合わせ先
        {phones.length > 0 && <span className="ml-auto text-[10.5px] font-normal text-muted">番号をタップで電話</span>}
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
    </section>
  );
}
