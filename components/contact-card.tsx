import type { Contact } from "@/lib/roadmap";
import { parsePhones } from "@/lib/phone";
import { AlertIcon, MailIcon, PhoneIcon } from "./icons";

export function ContactCard({ contact, city }: { contact: Contact; city: string }) {
  const phones = contact.phone ? parsePhones(contact.phone) : [];
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs text-muted">問い合わせ先</p>
      <p className="mt-0.5 font-bold text-ink">
        {/* 県の出先機関（「千葉県 ○○土木事務所」など）は市町村名を付けない */}
        {/^(東京都|\S{2,3}県)\s/.test(contact.dept) ? contact.dept : `${city} ${contact.dept}`}
      </p>
      {contact.hours && <p className="mt-0.5 text-xs text-muted">受付 {contact.hours}</p>}

      {contact.note && (
        <p className="mt-3 flex gap-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {contact.note}
        </p>
      )}

      {/* 電話で答えてくれない市は、発信ボタンにせず番号だけ小さく出す（窓口の場所確認用） */}
      {contact.noPhoneInquiry && phones.length > 0 && (
        <p className="mt-3 text-xs text-muted">電話 {phones.map((p) => p.number).join(" / ")}（窓口の場所・受付時間の確認用。道路種別は電話では答えてもらえません）</p>
      )}

      {((!contact.noPhoneInquiry && phones.length > 0) || contact.email) && (
        <div className="mt-3 space-y-2">
          {!contact.noPhoneInquiry && phones.map((p) => (
            <a key={p.number} href={`tel:${p.number}`} className="flex items-center gap-3 rounded-xl bg-mint px-3 py-2.5 text-brand">
              <PhoneIcon className="h-5 w-5" />
              <span className="font-bold">{p.number}</span>
              {p.label && <span className="text-xs text-muted">{p.label}</span>}
            </a>
          ))}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-3 rounded-xl bg-mint px-3 py-2.5 text-brand">
              <MailIcon className="h-5 w-5" />
              <span className="break-all text-sm font-bold">{contact.email}</span>
            </a>
          )}
        </div>
      )}
    </section>
  );
}
