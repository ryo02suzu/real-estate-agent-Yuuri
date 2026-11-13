"use client";

// スマホの書類の見せ方。lib/app/doc.ts の中身（題・章・行）を、見出し・表・印で読みやすく見せる（コピーする文は docText）。
// 注意は赤い▲、確かめる所は「要確認」の札、やることは□（済みは緑の☑）、確かめる先の地図・ページは「開く」の札（押すと開く）。
// 照会文は手紙の形（LetterView。自分のひな形は書いたとおりの行で TextLetter）で見せ、A4 の1枚（PrintLetter）にも印刷できる
import { ExternalLink, Square, SquareCheck, TriangleAlert } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Doc, DocItem } from "@/lib/app/doc";
import type { Letter } from "@/lib/app/inquiry-letter";

const NAVY = "#133664";

/** 行の頭の印 */
function Mark({ it }: { it: DocItem }) {
  if (it.box === "done") return <SquareCheck size={16} strokeWidth={2.2} className="mt-[2px] shrink-0 text-[#1f8f5a]" aria-label="済み" />;
  if (it.box === "todo") return <Square size={16} strokeWidth={2} className="mt-[2px] shrink-0 text-[#8794a8]" aria-label="未" />;
  if (it.tone === "warn") return <TriangleAlert size={15} strokeWidth={2.3} className="mt-[3px] shrink-0 text-[#c2401f]" aria-label="注意" />;
  return <span className="mt-[9px] size-[5px] shrink-0 rounded-full bg-[#9aa7ba]" aria-hidden />;
}

function Tag({ tone, text }: { tone: DocItem["tone"]; text: string }) {
  if (tone === "check" && /要確認/.test(text)) return null;
  if (tone === "check") return <span className="ml-1.5 inline-block whitespace-nowrap rounded-[6px] bg-[#fff1d6] px-1.5 py-px align-[1px] text-[10.5px] font-bold text-[#8a5a00]">要確認</span>;
  if (tone === "ok") return <span className="ml-1.5 inline-block whitespace-nowrap rounded-[6px] bg-[#e3f5ec] px-1.5 py-px align-[1px] text-[10.5px] font-bold text-[#1f8f5a]">確認済み</span>;
  return null;
}

function Open({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" aria-label={`${label}を開く`} className="press ml-1.5 inline-flex h-[22px] items-center gap-0.5 whitespace-nowrap rounded-full bg-[#e7effa] px-2 align-[1px] text-[11px] font-semibold" style={{ color: NAVY }}>
      開く
      <ExternalLink size={11} strokeWidth={2.4} />
    </a>
  );
}

/** 題の下の行（URL は「開く」にする） */
function HeadLine({ line }: { line: string }) {
  const m = line.match(/^(.+?)：(https?:\/\/\S+)$/);
  if (m)
    return (
      <p className="text-[12px] leading-[1.6] text-muted">
        {m[1]}
        <Open url={m[2]} label={m[1]} />
      </p>
    );
  return <p className="text-[12px] leading-[1.6] text-muted">{line}</p>;
}

function Row({ it }: { it: DocItem }) {
  const text = (
    <>
      <span className={it.tone === "warn" ? "font-semibold text-[#a3321a]" : it.tone === "check" && /要確認/.test(it.text) ? "font-semibold text-[#8a5a00]" : ""}>{it.text}</span>
      <Tag tone={it.tone} text={it.text} />
      {it.link && <Open url={it.link.url} label={it.link.label} />}
    </>
  );
  const extra = (
    <>
      {it.note && <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-muted">{it.note}</span>}
      {!!it.sub?.length && (
        <ul className="mt-1 space-y-0.5">
          {it.sub.map((x) => (
            <li key={x} className="flex gap-1.5 text-[12px] leading-[1.5] text-[#4a5568]">
              <span className="mt-[8px] size-[3px] shrink-0 rounded-full bg-[#9aa7ba]" aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">{x}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
  return (
    <li className="flex gap-2 py-[7px]">
      <Mark it={it} />
      {it.label ? (
        <div className="grid min-w-0 flex-1 grid-cols-[6.4em_1fr] gap-x-2 text-[13.5px] leading-[1.55]">
          <span className="text-[12px] leading-[1.75] text-muted">{it.label}</span>
          <span className="min-w-0 text-ink [overflow-wrap:anywhere]">
            {text}
            {extra}
          </span>
        </div>
      ) : (
        <div className="min-w-0 flex-1 text-[13.5px] leading-[1.55] text-ink [overflow-wrap:anywhere]">
          {text}
          {extra}
        </div>
      )}
    </li>
  );
}

/** 1つの章（重説の下書きのタブの中身など） */
export function DocSectionView({ section }: { section: Doc["sections"][number] }) {
  return (
    <section className="rounded-[14px] bg-white px-3 py-2 shadow-[0_1px_3px_rgba(20,45,85,0.08)]">
      <h4 className="flex items-center gap-1.5 pt-0.5 text-[13.5px] font-bold" style={{ color: NAVY }}>
        <span className="h-[14px] w-[3px] shrink-0 rounded-full" style={{ background: NAVY }} aria-hidden />
        {section.title}
      </h4>
      {section.lead && <p className="mt-1 text-[11.5px] leading-[1.55] text-muted">{section.lead}</p>}
      <ul className="mt-0.5 divide-y divide-[#eef2f7]">
        {section.items.map((it, i) => (
          <Row key={`${it.label ?? ""}${it.text}${i}`} it={it} />
        ))}
      </ul>
    </section>
  );
}

/** 書類を読みやすく見せる（中身は lib/app/doc.ts） */
export function DocView({ doc, top }: { doc: Doc; top?: ReactNode }) {
  return (
    <div className="space-y-2.5 pb-1">
      <div className="px-0.5">
        <p className="text-[15.5px] font-bold leading-[1.4]" style={{ color: NAVY }}>
          {doc.title}
        </p>
        {doc.head.map((h) => (
          <HeadLine key={h} line={h} />
        ))}
      </div>
      {top}
      {doc.sections.map((s) => (
        <DocSectionView key={s.title} section={s} />
      ))}
      {!!doc.foot?.length && (
        <div className="space-y-0.5 px-0.5 text-[10.5px] leading-[1.55] text-muted">
          {doc.foot.map((f, i) => (f ? <p key={i}>{f.replace(/^■ /, "")}</p> : <div key={i} className="h-1" />))}
        </div>
      )}
    </div>
  );
}

/** 照会文を、紙の手紙の形で見せる（print：A4 に印刷する大きさ） */
export function LetterView({ letter, print }: { letter: Letter; print?: boolean }) {
  // 印刷は A4 の1枚に収まる大きさ（回答欄まで。app/globals.css の @page の余白 12mm の内側）
  const base = print ? "text-[10.5pt] leading-[1.6]" : "text-[12.5px] leading-[1.7]";
  return (
    <div className={`${base} text-[#1d1b18]`}>
      <p className={`text-center font-bold ${print ? "text-[14pt]" : "text-[15px]"}`}>{letter.title}</p>
      <p className="mt-2 text-right">{letter.date}</p>
      <p className="mt-2 font-bold">{letter.to}</p>
      {letter.blankFrom ? (
        // 差出人が未入力：右寄せの記入欄（「会社名：」の後ろに書き込む線）
        <div className="ml-auto mt-1 w-[62%] max-w-[300px] space-y-0.5">
          {letter.from.map((f) => (
            <p key={f} className="border-b border-dotted border-[#b9c0cc] text-[#5d6574]">
              {f}
            </p>
          ))}
        </div>
      ) : (
        <div className="mt-1 text-right">
          {letter.from.map((f) => (
            <p key={f}>{f}</p>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-0.5">
        {letter.body.map((b) => (
          <p key={b}>{b}</p>
        ))}
      </div>
      <p className="mt-3 text-center">記</p>
      <ol className="mt-1 space-y-2">
        {letter.items.map((it, i) => (
          <li key={it.title}>
            <p className="font-semibold">
              {i + 1}. {it.title}
            </p>
            {it.lines.map((l) => (
              <p key={l} className="pl-[1.2em]">
                {l}
              </p>
            ))}
          </li>
        ))}
      </ol>
      <p className="mt-1 text-right">以上</p>
      <div className={`mt-3 break-inside-avoid rounded-[6px] border border-[#9aa4b5] ${print ? "px-4 py-2.5" : "px-2.5 py-2"}`}>
        <p className="font-bold">ご回答欄</p>
        <p className={`${print ? "text-[9pt]" : "text-[11px]"} text-[#5d6574]`}>ご記入のうえ、FAX・メールでご返信いただけますと幸いです。</p>
        <dl className={`mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 ${print ? "gap-y-2" : "gap-y-1.5"}`}>
          {letter.answer.map((a) => (
            <Fragment key={a.label}>
              <dt className="whitespace-nowrap font-semibold">{a.label}</dt>
              <dd className="min-w-0 border-b border-dotted border-[#b9c0cc] pb-0.5">
                {/* □ の選びは途中で改行しない（「□43条2項」が2行に割れないように） */}
                {a.value.includes("□")
                  ? a.value.split(/(?=□)/).map((c, i) => (
                      <span key={i} className="inline-block whitespace-nowrap">
                        {c}
                      </span>
                    ))
                  : a.value}
              </dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** 自分のひな形の照会文（書いたとおりの行で。print：A4 に印刷する大きさ） */
export function TextLetter({ text, print }: { text: string; print?: boolean }) {
  return <div className={`${print ? "text-[10.5pt] leading-[1.6]" : "text-[12.5px] leading-[1.7]"} whitespace-pre-wrap text-[#1d1b18] [overflow-wrap:anywhere]`}>{text}</div>;
}

/**
 * 照会文の A4 の1枚（画面には出ない。照会文のシートを開いている間だけ、印刷の対象になる。app/globals.css の .print-letter）。
 * text は自分のひな形の文（書いたとおりの行で印刷する。無ければ標準の手紙の形）。cover は印刷して FAX するときの送付状
 * （body の data-print="fax" のときだけ1枚目に出る）
 */
export function PrintLetter({ letter, text, cover }: { letter: Letter; text?: string; cover?: ReactNode }) {
  return createPortal(
    <div className="print-letter bg-white">
      {cover}
      {text === undefined ? <LetterView letter={letter} print /> : <TextLetter text={text} print />}
    </div>,
    document.body,
  );
}
