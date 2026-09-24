import type { Contact } from "@/lib/roadmap";
import { parsePhones } from "@/lib/phone";
import { AlertIcon, MailIcon, PhoneIcon } from "./icons";

/** 問い合わせ先。部署名・電話・メール・受付時間・備考の表 */
export function ContactCard({ contact, city }: { contact: Contact; city: string }) {
  const phones = contact.phone ? parsePhones(contact.phone) : [];
  // 県の出先機関（「千葉県 ○○土木事務所」など）は市町村名を付けない
  const dept = /^(東京都|\S{2,3}県)\s/.test(contact.dept) ? contact.dept : `${city} ${contact.dept}`;
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white p-4">
      <h3 className="flex items-center gap-2 border-b border-line/70 pb-2.5 text-[14px] text-ink">
        <PhoneIcon className="h-[18px] w-[18px] text-brand-light" />
        お問い合わせ先
      </h3>
      <dl className="mt-2 grid grid-cols-[4.5em_1fr] gap-x-3 gap-y-2.5 text-[12px] leading-relaxed">
        <dt className="text-muted">部署名</dt>
        <dd className="text-ink">{dept}</dd>

        {phones.length > 0 && (
          <>
            <dt className="text-muted">電話番号</dt>
            <dd className="space-y-1">
              {phones.map((p) =>
                // 電話で答えてくれない市は発信リンクにせず、番号だけ出す（窓口の場所確認用）
                contact.noPhoneInquiry ? (
                  <span key={p.number} className="tabular block text-ink">
                    {p.number}
                    {p.label && <span className="ml-1.5 text-[10.5px] text-muted">{p.label}</span>}
                  </span>
                ) : (
                  <a key={p.number} href={`tel:${p.number}`} className="flex flex-wrap items-center gap-x-1.5">
                    <PhoneIcon className="h-3.5 w-3.5 text-muted" />
                    <span className="tabular text-[13px] text-sky-700 underline-offset-2">{p.number}</span>
                    <span className="text-[10.5px] text-muted">{p.label ?? "タップで発信"}</span>
                  </a>
                ),
              )}
              {contact.noPhoneInquiry && !contact.note && <span className="block text-[10.5px] text-red-700">道路種別は電話では答えてもらえません</span>}
            </dd>
          </>
        )}

        {contact.email && (
          <>
            <dt className="text-muted">メール</dt>
            <dd>
              <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 break-all text-sky-700">
                <MailIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                {contact.email}
              </a>
            </dd>
          </>
        )}

        {contact.hours && (
          <>
            <dt className="text-muted">受付時間</dt>
            <dd className="text-ink">{contact.hours}</dd>
          </>
        )}

        {contact.note && (
          <>
            <dt className="text-muted">備考</dt>
            <dd className="flex gap-1.5 text-red-700">
              <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {contact.note}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
