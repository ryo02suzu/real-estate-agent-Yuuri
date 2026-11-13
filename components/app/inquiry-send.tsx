"use client";

// 照会文のシート（スマホ）の「送る」：宛先（窓口のメール・FAX・電話。窓口のデータから入れ、直した値は市区町村＋窓口ごとに端末に覚える）と、
// メールのアプリを開く（mailto:）・FAX（FAX をメールで送るサービスの宛先の形があればそのメール、無ければ印刷して FAX か FAX のアプリへ共有）・
// 電話（tel:）・共有・コピー。送るのは利用者のアプリで、MICHILU のサーバーには送らず、自動でも送らない。
// あわせて、使うひな形を選ぶチップ（TemplateChips）と、印刷して FAX するときの送付状（FaxCover）
import { Check, ChevronDown, ClipboardCopy, Mail, Minus, Pencil, Phone, Plus, Printer, Share2, TriangleAlert } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { STANDARD_TEMPLATE, cleanEmail, faxFormatProblem, faxMailTo, isEmail, isPhoneDigits, mailtoUrl, numberDigits, telUrl, type InquiryTemplate } from "@/lib/app/inquiry-template";
import type { InquiryTo } from "@/lib/inquiry-store";
import type { Contact } from "@/lib/roadmap";
import { useCopy } from "../use-copy";
import { useKeyboardSafe } from "./keyboard";
import { Expand } from "./research";
import { NAVY } from "./ui";

const LIGHT = "#e3ebf6";
/** 見えるフォーカス（キーボードで動かしたとき） */
export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[#2f7cf6] focus-visible:ring-offset-2";

/** 使うひな形を選ぶ（標準＋自分のひな形。横にすべらせる）。右の端に、ひな形を作る・直す入口 */
export function TemplateChips({ list, pick, onPick, onEdit }: { list: InquiryTemplate[]; pick: string; onPick: (id: string) => void; onEdit?: () => void }) {
  const items = [STANDARD_TEMPLATE, ...list];
  return (
    <div className="-mx-5 flex shrink-0 items-center gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="使うひな形">
      {items.map((t) => {
        const on = t.id === pick;
        return (
          // 押せる高さは 44px、見た目の札は 34px
          <button key={t.id} onClick={() => onPick(t.id)} aria-pressed={on} className="group flex h-[44px] shrink-0 items-center outline-none">
            {/* 選んでも札の幅が変わらないよう、✓ の場所はいつも取っておく */}
            <span className="inline-flex h-[34px] max-w-[15em] items-center rounded-full pl-2.5 pr-3.5 text-[13px] font-semibold transition-colors duration-150 group-focus-visible:ring-2 group-focus-visible:ring-[#2f7cf6] group-focus-visible:ring-offset-1" style={on ? { background: NAVY, color: "#fff" } : { background: "#eef2f7", color: "#41506a" }}>
              <Check className={`mr-1 h-3.5 w-3.5 shrink-0 ${on ? "" : "opacity-0"}`} strokeWidth={3} />
              <span className="truncate">{t.name.trim() || "名前なし"}</span>
            </span>
          </button>
        );
      })}
      {onEdit && (
        <button onClick={onEdit} className="group flex h-[44px] shrink-0 items-center outline-none">
          <span className="inline-flex h-[34px] items-center gap-1 rounded-full border border-dashed border-[#b9c6d8] px-3 text-[12.5px] font-semibold group-focus-visible:ring-2 group-focus-visible:ring-[#2f7cf6] group-focus-visible:ring-offset-1" style={{ color: NAVY }}>
            <Pencil className="h-3.5 w-3.5" />
            ひな形を作る・直す
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * 印刷して FAX するときの送付状（A4 の1枚目。画面には出ない。app/globals.css の .print-fax-cover：body の data-print="fax" のときだけ印刷に出て、
 * 次のページから照会文）。宛先・FAX 番号・日付・送付枚数・差出人・件名
 */
export function FaxCover({ to, fax, date, pages, from, blankFrom, subject }: { to: string; fax: string; date: string; pages: number; from: string[]; blankFrom: boolean; subject: string }) {
  const row = (label: string, body: ReactNode) => (
    <tr>
      <th className="w-[7.5em] border border-[#9aa4b5] bg-[#f2f4f7] px-3 py-2 text-left align-top font-semibold">{label}</th>
      <td className="border border-[#9aa4b5] px-3 py-2 align-top">{body}</td>
    </tr>
  );
  return (
    <div className="print-fax-cover text-[11pt] leading-[1.7] text-[#1d1b18]">
      <p className="text-center text-[20pt] font-bold tracking-[0.3em]">FAX 送付状</p>
      <p className="mt-5 text-right">{date}</p>
      <table className="mt-4 w-full border-collapse">
        <tbody>
          {row("宛先", <span className="font-bold">{to} 御中</span>)}
          {row("FAX 番号", fax.trim() || <span className="inline-block min-w-[12em] border-b border-dotted border-[#9aa4b5]">&nbsp;</span>)}
          {row(
            "差出人",
            from.map((f) => (
              <p key={f} className={blankFrom ? "border-b border-dotted border-[#b9c0cc] text-[#5d6574]" : ""}>
                {f}
              </p>
            )),
          )}
          {row("件名", subject || "（件名なし）")}
          {row("送付枚数", `${pages}枚（この送付状を含む）`)}
        </tbody>
      </table>
      <p className="mt-8">いつもお世話になっております。</p>
      <p>下記のとおり、書類をお送りいたします。ご確認のほど、よろしくお願いいたします。</p>
      <p className="mt-3 text-right">以上</p>
    </div>
  );
}

/** 宛先の1行（左に名前、右に入力欄。44px） */
function ToField({ id, label, value, onChange, onBlur, type, placeholder, error, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; onBlur: () => void; type: "email" | "tel"; placeholder: string; error?: string | null; hint?: ReactNode }) {
  const note = error || hint;
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="w-[3.4em] shrink-0 text-[13px] font-semibold text-[#41506a]">
          {label}
        </label>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          type={type}
          inputMode={type}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={type === "email" ? 254 : 40}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? `${id}-note` : undefined}
          className={`h-[44px] min-w-0 flex-1 rounded-xl border bg-[#f8fafc] px-3 text-[16px] text-ink placeholder:text-muted/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2f7cf6] ${error ? "border-[#e0a07f]" : "border-line"}`}
        />
      </div>
      {note && (
        <p id={`${id}-note`} className={`mt-1 pl-[calc(3.4em+8px)] text-[11.5px] leading-[1.5] [overflow-wrap:anywhere] ${error ? "text-[#c2561f]" : "text-muted"}`}>
          {note}
        </p>
      )}
    </div>
  );
}

/** 送るボタン（押せるときはリンク。押せない理由があれば、押すと理由を出す） */
function SendButton({ href, onClick, icon, label, primary, blocked }: { href?: string | null; onClick?: () => void; icon: ReactNode; label: string; primary?: boolean; blocked?: boolean }) {
  const cls = `press flex h-[48px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[16px] px-2 text-[14.5px] font-bold ${FOCUS} ${blocked ? "opacity-55" : ""}`;
  const style = primary ? { background: NAVY, color: "#fff" } : { background: LIGHT, color: NAVY };
  const body = (
    <>
      {icon}
      <span className="truncate">{label}</span>
    </>
  );
  return href && !blocked ? (
    <a href={href} onClick={onClick} className={cls} style={style}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} aria-disabled={blocked || undefined} className={cls} style={style}>
      {body}
    </button>
  );
}

type Msg = { text: string; warn?: boolean } | null;

/** 「送る」の中身（シートの高さの中で縦に動かす） */
export function SendPanel({
  dept,
  templateName,
  subject,
  body,
  ready,
  unknown = [],
  to,
  onTo,
  saved,
  canReset,
  onReset,
  contact,
  faxFormat,
  pages,
  onPages,
  onPrintFax,
}: {
  /** 宛先の課 */
  dept: string;
  templateName: string;
  subject: string;
  body: string;
  /** 本文がある（空のひな形は送れない） */
  ready: boolean;
  /** ひな形に書いてある、差し込みの項目に無い名前（書いたまま送られる） */
  unknown?: string[];
  to: InquiryTo;
  onTo: (to: InquiryTo) => void;
  /** 宛先を端末に覚えられたか（まだ直していなければ null） */
  saved: boolean | null;
  /** 覚えた宛先がある（窓口のデータに戻せる） */
  canReset: boolean;
  onReset: () => void;
  contact?: Contact;
  /** FAX をメールで送るサービスの宛先の形（≡ の「照会の文面（ひな形）」で入れる。空なら使わない） */
  faxFormat: string;
  pages: number;
  onPages: (n: number) => void;
  /** 印刷して FAX（送付状つき。押した操作の中で印刷を呼ぶ） */
  onPrintFax: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const kb = useKeyboardSafe(box);
  const copy = useCopy();
  const [msg, setMsg] = useState<Msg>(null);
  const [touched, setTouched] = useState<Record<keyof InquiryTo, boolean>>({ email: false, fax: false, phone: false });
  const [faxOpen, setFaxOpen] = useState(false);
  // 共有の画面が出せる端末だけ「共有」を出す（この部品は開いたときだけ描くので、サーバーの描画とは食い違わない）
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const email = cleanEmail(to.email);
  const emailError = email && !isEmail(email) ? "メールアドレスの形になっていません" : null;
  const faxDigits = numberDigits(to.fax);
  const faxError = to.fax.trim() && !isPhoneDigits(faxDigits) ? "FAX 番号は、0 から始まる 10〜11 桁で入れてください（ハイフンはあってもかまいません）" : null;
  const tel = telUrl(to.phone);
  const phoneError = to.phone.trim() && !tel ? "電話番号は、0 から始まる 10〜11 桁で入れてください" : null;
  const useFaxMail = !!faxFormat && !faxFormatProblem(faxFormat);
  const faxMail = useFaxMail ? faxMailTo(faxFormat, to.fax) : null;
  const mailHref = ready ? mailtoUrl({ to: email, subject, body }) : null;
  const faxHref = ready && faxMail?.ok ? mailtoUrl({ to: faxMail.to, subject, body }) : null;

  const set = (k: keyof InquiryTo, v: string) => onTo({ ...to, [k]: v });
  const blur = (k: keyof InquiryTo) => setTouched((t) => ({ ...t, [k]: true }));
  const notReady = () => setMsg({ text: "このひな形は本文が空です。「照会文」の「ひな形を作る・直す」で本文を入れてください。", warn: true });
  /** メールのアプリを開く前に、本文をクリップボードにも写す（長い本文が切れるアプリのため。押した操作の中で写す） */
  const copyAlso = (what: string) => {
    try {
      void navigator.clipboard.writeText(body).then(
        () => setMsg({ text: `本文もコピーしました。${what}で本文が途中で切れていたら、貼り付けてください。` }),
        () => setMsg({ text: `${what}を開きます（本文はコピーできませんでした。切れていたら「照会文」の「コピー」から貼ってください）。`, warn: true }),
      );
    } catch {
      setMsg({ text: `${what}を開きます（本文はコピーできませんでした）。`, warn: true });
    }
  };
  const onMail = () => {
    if (!ready) return notReady();
    if (!mailHref) {
      setTouched((t) => ({ ...t, email: true }));
      return setMsg({ text: "メールの宛先を直してください（空のままなら、宛先なしでメールのアプリが開きます）。", warn: true });
    }
    copyAlso("メールのアプリ");
  };
  const onFax = () => {
    if (!useFaxMail) {
      setFaxOpen((o) => !o);
      setMsg(null);
      return;
    }
    if (!ready) return notReady();
    if (!faxHref) {
      setTouched((t) => ({ ...t, fax: true }));
      return setMsg({ text: faxMail && !faxMail.ok ? faxMail.reason : "FAX 番号を入れてください。", warn: true });
    }
    copyAlso("メールのアプリ");
  };
  const onPhone = () => {
    if (tel) return;
    setTouched((t) => ({ ...t, phone: true }));
    setMsg({ text: to.phone.trim() ? "電話番号の形を直してください（0 から始まる 10〜11 桁）。" : "電話番号を入れてください。", warn: true });
  };
  const share = async (label: string) => {
    if (!ready) return notReady();
    try {
      await navigator.share({ title: subject, text: body });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      await copy.copy(body);
      setMsg({ text: `${label}を開けなかったので、本文をコピーしました。` });
    }
  };
  const printFax = () => {
    if (!ready) return notReady();
    onPrintFax();
  };
  // 窓口のデータの電話（内線・係の名前・2つ目の番号があるときや、欄を直したときに、元の書き方を添える）
  const contactPhone = contact?.phone && contact.phone.trim() !== to.phone.trim() ? contact.phone : null;

  return (
    <div ref={box} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain text-ink">
      {/* 送る文（ひな形・件名・本文の長さ） */}
      <div className="rounded-[14px] bg-[#f4f7fb] px-3 py-2.5">
        <p className="text-[11.5px] leading-[1.5] text-muted">ひな形：{templateName}</p>
        <p className="mt-0.5 text-[13px] font-semibold leading-[1.5] [overflow-wrap:anywhere]">件名：{subject || "（件名なし）"}</p>
        <p className="mt-0.5 text-[11.5px] leading-[1.5] text-muted">{ready ? `本文 ${body.length.toLocaleString("ja-JP")}文字。中身は「照会文」で確かめられます。` : "本文が空です。"}</p>
        {unknown.length > 0 && <p className="mt-1 text-[11.5px] leading-[1.5] text-[#8a5a00] [overflow-wrap:anywhere]">入らない項目：{unknown.join("・")}（書いたまま送られます）</p>}
      </div>

      {/* 宛先 */}
      <fieldset className="mt-3 min-w-0">
        <legend className="text-[12.5px] font-semibold text-[#41506a]">宛先：{dept}</legend>
        <ToField id="iq-email" label="メール" type="email" value={to.email} onChange={(v) => set("email", v)} onBlur={() => blur("email")} placeholder="例：kenchiku@city.example.lg.jp" error={touched.email ? emailError : null} />
        <ToField
          id="iq-fax"
          label="FAX"
          type="tel"
          value={to.fax}
          onChange={(v) => set("fax", v)}
          onBlur={() => blur("fax")}
          placeholder="例：047-000-0000"
          error={touched.fax ? faxError : null}
          hint={faxMail?.ok ? `FAX のメール宛先：${faxMail.to}` : undefined}
        />
        <ToField
          id="iq-phone"
          label="電話"
          type="tel"
          value={to.phone}
          onChange={(v) => set("phone", v)}
          onBlur={() => blur("phone")}
          placeholder="例：047-000-0000"
          error={touched.phone ? phoneError : null}
          hint={
            contactPhone || contact?.noPhoneInquiry || contact?.hours ? (
              <>
                {contactPhone && <span className="block">窓口のデータ：{contactPhone}</span>}
                {contact?.hours && <span className="block">受付時間：{contact.hours}</span>}
                {contact?.noPhoneInquiry && <span className="block text-[#8a4f3a]">道路種別は電話では答えてもらえません（電話は窓口の場所・時間の確認用）。</span>}
              </>
            ) : undefined
          }
        />
        <p className={`mt-2 text-[11.5px] leading-[1.55] ${saved === false ? "text-[#c2561f]" : "text-muted"}`}>
          {saved === false ? "宛先を保存できませんでした（プライベートブラウズでは残りません）。この画面ではそのまま使えます。" : "直した宛先は、この窓口の宛先としてこの端末にだけ覚え、次から入ります（MICHILU のサーバーには送りません）。"}
        </p>
        {canReset && (
          <button type="button" onClick={onReset} className={`-mb-1 flex min-h-[44px] items-center text-[12.5px] font-semibold underline underline-offset-2 ${FOCUS}`} style={{ color: NAVY }}>
            窓口のデータに戻す
          </button>
        )}
      </fieldset>

      {/* 窓口の注意（データの備考。電話・FAX・メールを受けない窓口がある） */}
      {contact?.note && (
        <p className="mt-2 flex gap-1.5 rounded-xl bg-[#fff4e5] px-3 py-2 text-[12px] leading-[1.6] text-[#7a5a2a]">
          <TriangleAlert className="mt-[3px] h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">窓口の注意（MICHILU の窓口のデータ）：{contact.note}</span>
        </p>
      )}

      {/* 送る */}
      <div className="mt-3 flex gap-2">
        <SendButton primary href={mailHref} onClick={onMail} blocked={!ready} icon={<Mail className="h-[18px] w-[18px] shrink-0" />} label="メールで送る" />
        {useFaxMail ? (
          <SendButton href={faxHref} onClick={onFax} blocked={!ready} icon={<Printer className="h-[17px] w-[17px] shrink-0" />} label="FAXで送る" />
        ) : (
          <button type="button" onClick={onFax} aria-expanded={faxOpen} aria-controls="iq-fax-ways" className={`press flex h-[48px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[16px] px-2 text-[14.5px] font-bold ${FOCUS}`} style={{ background: LIGHT, color: NAVY }}>
            <Printer className="h-[17px] w-[17px] shrink-0" />
            <span className="truncate">FAXで送る</span>
            <ChevronDown className="td-chev h-4 w-4 shrink-0" data-open={faxOpen ? "1" : "0"} />
          </button>
        )}
      </div>
      {!useFaxMail && (
        <Expand open={faxOpen}>
          <div id="iq-fax-ways" inert={!faxOpen}>
            <div className="mt-2 rounded-[16px] bg-[#f4f7fb] p-3">
              <p className="text-[12px] leading-[1.6] text-muted">A4 に印刷して FAX するか（1枚目が FAX 送付状、2枚目から照会文）、FAX のアプリへ共有します。</p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="min-w-0 flex-1 text-[13px] font-semibold text-[#41506a]">送付枚数（送付状を含む）</span>
                <button type="button" onClick={() => onPages(Math.max(2, pages - 1))} disabled={pages <= 2} aria-label="送付枚数を1枚減らす" className={`press flex h-[44px] w-[44px] items-center justify-center rounded-full bg-white disabled:opacity-40 ${FOCUS}`} style={{ color: NAVY }}>
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[3em] text-center text-[15px] font-bold tabular-nums" aria-live="polite">
                  {pages}枚
                </span>
                <button type="button" onClick={() => onPages(Math.min(30, pages + 1))} disabled={pages >= 30} aria-label="送付枚数を1枚増やす" className={`press flex h-[44px] w-[44px] items-center justify-center rounded-full bg-white disabled:opacity-40 ${FOCUS}`} style={{ color: NAVY }}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[11px] leading-[1.5] text-muted">住宅地図・公図の写しを添えるときは、その枚数も足してください。</p>
              <div className="mt-2 grid gap-2">
                <SendButton onClick={printFax} blocked={!ready} icon={<Printer className="h-[17px] w-[17px] shrink-0" />} label="印刷して FAX（A4・FAX 送付状つき）" />
                {canShare ? (
                  <SendButton onClick={() => void share("共有の画面")} blocked={!ready} icon={<Share2 className="h-[17px] w-[17px] shrink-0" />} label="共有（FAX のアプリなどへ）" />
                ) : (
                  <SendButton onClick={() => (ready ? void copy.copy(body) : notReady())} blocked={!ready} icon={<ClipboardCopy className="h-[17px] w-[17px] shrink-0" />} label={copy.done ? "コピーしました" : "コピー（FAX のアプリに貼る）"} />
                )}
              </div>
              <p className="mt-2 text-[11px] leading-[1.55] text-muted">FAX をメールで送るサービスを契約しているなら、≡ の「照会の文面（ひな形）」で宛先の形を入れると、ここからメールのアプリで FAX の宛先へ送れます。</p>
            </div>
          </div>
        </Expand>
      )}
      <div className="mt-2 flex gap-2">
        <SendButton href={tel} onClick={onPhone} icon={<Phone className="h-[17px] w-[17px] shrink-0" />} label="電話する" />
        {canShare && <SendButton onClick={() => void share("共有の画面")} blocked={!ready} icon={<Share2 className="h-[17px] w-[17px] shrink-0" />} label="共有" />}
        <SendButton onClick={() => (ready ? void copy.copy(body) : notReady())} blocked={!ready} icon={copy.done ? <Check className="td-bump h-[17px] w-[17px] shrink-0" strokeWidth={3} /> : <ClipboardCopy className="h-[17px] w-[17px] shrink-0" />} label={copy.done ? "コピーしました" : "コピー"} />
      </div>
      <p role="status" aria-live="polite" className={`mt-2 min-h-[18px] text-[12px] leading-[1.55] ${msg?.warn ? "text-[#c2561f]" : "text-[#1f6f4a]"}`}>
        {msg?.text}
      </p>
      <ul className="mt-1 space-y-1 text-[11.5px] leading-[1.55] text-muted">
        <li>送信はお使いのメール・FAX のアプリやサービスから行います（MICHILU のサーバーには送りません）。</li>
        <li className="font-semibold text-[#41506a]">自動では送りません。送る前に内容を確かめてください。</li>
        <li>役所によって照会の受け方（窓口のみ・FAX・メール・決まった様式）が違います。先に電話か公式サイトで確かめてください。</li>
      </ul>
      <div aria-hidden style={{ height: kb }} />
    </div>
  );
}
