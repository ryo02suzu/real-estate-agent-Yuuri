"use client";

// 照会の文面（ひな形）のシート（スマホ。≡ の「照会の文面（ひな形）」と、照会文のシートの「ひな形を作る・直す」から開く）。
// 一覧（標準＋自分のひな形・新しいひな形・FAX をメールで送るサービスの宛先の形・初期状態に戻す）と、1つのひな形の画面
// （名前・件名・本文、カーソルの所へ差し込み項目を入れるチップ、今の物件（無ければ見本）で入れた下見、複製・削除）。
// 標準は消せず、直せない（今の照会文のまま。複製して直す）。打つたびにこの端末の中だけに保存する（lib/inquiry-store.ts。サーバーには送らない）。
// 消す・複製する・戻すは、少しの間「元に戻す」を出す。どちらの画面もシートの高さは同じ（components/app/doc-size.ts の DOC_BODY）
import { ChevronLeft, ChevronRight, Copy, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  FAX_TOKEN,
  FIELD_KEYS,
  FIELD_NOTE,
  STANDARD_ID,
  STANDARD_TEMPLATE,
  cleanFaxFormat,
  faxFormatProblem,
  fieldToken,
  inquiryInputOf,
  inquiryValues,
  mergeSubject,
  mergeTemplate,
  sampleInput,
  tokenParts,
  unknownTokens,
  type FieldKey,
  type InquiryInput,
  type InquiryTemplate,
  type MergeValues,
} from "@/lib/app/inquiry-template";
import {
  BODY_MAX,
  FAX_FORMAT_MAX,
  NAME_MAX,
  SUBJECT_MAX,
  TEMPLATE_MAX,
  duplicateTemplate,
  loadInquirySettings,
  removeTemplate,
  restoreTemplate,
  saveInquirySettings,
  templateOf,
  updateTemplate,
  type InquirySettings,
  type RemovedTemplate,
} from "@/lib/inquiry-store";
import { useSender } from "@/lib/sender";
import { Sheet } from "../sheet";
import { DOC_BODY } from "./doc-size";
import { FOCUS } from "./inquiry-send";
import { useKeyboardSafe } from "./keyboard";
import { NAVY } from "./ui";

type ResultLike = Parameters<typeof inquiryInputOf>[0];

/** 元に戻すこと（関数ではなく中身で持ち、押したときの今の値に当てる） */
type Undo =
  | { kind: "removed"; text: string; removed: RemovedTemplate }
  | { kind: "added"; text: string; id: string }
  | { kind: "content"; text: string; id: string; subject: string; body: string }
  | { kind: "all"; text: string; prev: InquirySettings };

/** 元に戻すを出す長さ（お気に入り・履歴と同じ） */
const UNDO_MS = 5000;
const INPUT = "w-full rounded-xl border border-line bg-[#f8fafc] px-3 text-[16px] text-ink placeholder:text-muted/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2f7cf6]";
const LABEL = "text-[12.5px] font-semibold text-[#41506a]";
const nameOf = (t: InquiryTemplate) => t.name.trim() || "名前なし";

/** ひな形のシート。result（開いている物件）か input（照会文のシートの材料）で下見を作る。どちらも無ければ見本の物件 */
export function TemplatesSheet({ open, onClose, result, input }: { open: boolean; onClose: () => void; result?: ResultLike | null; input?: InquiryInput }) {
  if (!open) return null;
  return <TemplatesBody onClose={onClose} result={result ?? undefined} input={input} />;
}

function TemplatesBody({ onClose, result, input }: { onClose: () => void; result?: ResultLike; input?: InquiryInput }) {
  const sender = useSender();
  const [today] = useState(() => new Date());
  const sample = !input && !result;
  const material = input ?? (result ? inquiryInputOf(result, sender, today) : sampleInput(sender, today));
  const { values, blank } = inquiryValues(material);
  // 開いている間は手元の値で動かし、打つたびに端末へ書く（保存できない端末でも、閉じるまでは直せる）
  const [s, setS] = useState<InquirySettings>(() => loadInquirySettings());
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  const [undo, setUndo] = useState<(Undo & { key: number }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const commit = (next: InquirySettings) => {
    setS(next);
    setFailed(!saveInquirySettings(next));
  };
  const go = (id: string | null) => {
    setMoved(true);
    setView(id);
    setNotice(null);
  };
  const offer = (u: Undo) => setUndo({ ...u, key: (undo?.key ?? 0) + 1 });
  const duplicate = (from: InquiryTemplate) => {
    const d = duplicateTemplate(s, from);
    if (!d) return setNotice(`自分のひな形は ${TEMPLATE_MAX} 件までです。使わないものを消してから作ってください。`);
    commit(d.settings);
    go(d.copy.id);
    offer({ kind: "added", text: `「${nameOf(d.copy)}」を作りました`, id: d.copy.id });
  };
  const remove = (id: string) => {
    const r = removeTemplate(s, id);
    if (!r) return;
    commit(r.settings);
    go(null);
    offer({ kind: "removed", text: `「${nameOf(r.removed.template)}」を消しました`, removed: r.removed });
  };
  const toStandard = (t: InquiryTemplate) => {
    commit(updateTemplate(s, t.id, { subject: STANDARD_TEMPLATE.subject, body: STANDARD_TEMPLATE.body }));
    offer({ kind: "content", text: "件名と本文を標準の文に戻しました", id: t.id, subject: t.subject, body: t.body });
  };
  const resetAll = () => {
    commit({ ...s, list: [], pick: STANDARD_ID });
    offer({ kind: "all", text: "初期状態に戻しました（標準だけ）", prev: s });
  };
  const applyUndo = () => {
    if (!undo) return;
    if (undo.kind === "removed") commit(restoreTemplate(s, undo.removed));
    else if (undo.kind === "added") {
      const r = removeTemplate(s, undo.id);
      if (r) commit(r.settings);
      if (view === undo.id) go(null);
    } else if (undo.kind === "content") commit(updateTemplate(s, undo.id, { subject: undo.subject, body: undo.body }));
    else commit(undo.prev);
    setUndo(null);
  };

  const editing = view === null ? null : view === STANDARD_ID ? STANDARD_TEMPLATE : (s.list.find((t) => t.id === view) ?? null);
  return (
    <Sheet title="照会の文面（ひな形）" open onClose={onClose}>
      <div className={`${DOC_BODY} relative text-ink`}>
        {failed && <p className="mb-1.5 shrink-0 rounded-xl bg-[#fdece4] px-3 py-1.5 text-[11.5px] leading-[1.5] text-[#a2431c]">保存できませんでした（プライベートブラウズでは残りません）。閉じるまでは、この画面で直せます。</p>}
        <div key={editing?.id ?? "list"} className="rp-pane flex min-h-0 flex-1 flex-col" data-dir={moved ? (editing ? "r" : "l") : undefined}>
          {editing ? (
            editing.id === STANDARD_ID ? (
              <StandardView values={values} blank={blank} sample={sample} onBack={() => go(null)} onDuplicate={() => duplicate(STANDARD_TEMPLATE)} notice={notice} />
            ) : (
              <EditView
                t={editing}
                values={values}
                blank={blank}
                sample={sample}
                onChange={(patch) => {
                  commit(updateTemplate(s, editing.id, patch));
                  // 直し始めたら、複製・標準に戻すの「元に戻す」は下げる（直した中身を巻き戻さない）
                  if (undo) setUndo(null);
                }}
                onBack={() => go(null)}
                onDuplicate={() => duplicate(editing)}
                onDelete={() => remove(editing.id)}
                onStandard={() => toStandard(editing)}
                notice={notice}
              />
            )
          ) : (
            <ListView s={s} values={values} onOpen={(id) => go(id)} onNew={() => duplicate(STANDARD_TEMPLATE)} onFax={(fax) => commit({ ...s, fax })} onResetAll={resetAll} notice={notice} />
          )}
        </div>
        {undo && <UndoBar key={undo.key} text={undo.text} onUndo={applyUndo} onDone={() => setUndo(null)} />}
      </div>
    </Sheet>
  );
}

/** 一覧：標準・自分のひな形・新しいひな形・FAX をメールで送るサービスの宛先の形・初期状態に戻す */
function ListView({ s, values, onOpen, onNew, onFax, onResetAll, notice }: { s: InquirySettings; values: MergeValues; onOpen: (id: string) => void; onNew: () => void; onFax: (fax: string) => void; onResetAll: () => void; notice: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const kb = useKeyboardSafe(box);
  const [askReset, setAskReset] = useState(false);
  const pick = templateOf(s, s.pick).id;
  const rows = [STANDARD_TEMPLATE, ...s.list];
  return (
    <>
      <p className="shrink-0 text-[12px] leading-[1.6] text-muted dense:leading-[1.5]">照会文の件名と本文のひな形です。照会文のシートで選んで使います。この端末の中だけに残します（MICHILU のサーバーには送りません）。</p>
      <div ref={box} className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <ul className="divide-y divide-line rounded-[16px] bg-[#f4f7fb] px-3">
          {rows.map((t) => {
            const standard = t.id === STANDARD_ID;
            const empty = !standard && !t.body.trim();
            const unknown = !standard && unknownTokens(t.subject, t.body).length > 0;
            return (
              <li key={t.id}>
                <button onClick={() => onOpen(t.id)} className={`flex min-h-[60px] w-full items-center gap-3 py-2 text-left ${FOCUS}`}>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="min-w-0 truncate text-[14.5px] font-semibold text-ink">{nameOf(t)}</span>
                      {standard && <Tag tone="muted">消せません・複製して直す</Tag>}
                      {pick === t.id && <Tag tone="ok">いま使うひな形</Tag>}
                      {empty && <Tag tone="warn">本文が空</Tag>}
                      {unknown && <Tag tone="warn">入らない項目あり</Tag>}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">件名：{mergeSubject(t.subject, values).text || "（件名なし）"}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </button>
              </li>
            );
          })}
        </ul>
        <button onClick={onNew} className={`press mt-2.5 flex h-[48px] w-full items-center justify-center gap-1.5 rounded-[16px] text-[14.5px] font-bold text-white ${FOCUS}`} style={{ background: NAVY }}>
          <Plus className="h-[18px] w-[18px]" />
          新しいひな形（標準の文から作る）
        </button>
        {notice && <p className="mt-2 text-[12px] leading-[1.55] text-[#c2561f]">{notice}</p>}
        <FaxFormatField value={s.fax} onSave={onFax} />
        {s.list.length > 0 &&
          (askReset ? (
            <div className="mt-3 rounded-[16px] border border-[#f0c9b6] bg-[#fdf3ee] p-3" role="group" aria-label="初期状態に戻す">
              <p className="text-[12.5px] leading-[1.6] text-[#7a3a1f]">自分のひな形 {s.list.length}件を消して、標準だけにします（FAX の宛先の形はそのまま）。消したあと、少しの間は元に戻せます。</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    setAskReset(false);
                    onResetAll();
                  }}
                  className={`press h-[44px] flex-1 rounded-full text-[14px] font-bold text-white ${FOCUS}`}
                  style={{ background: "#b4482a" }}
                >
                  消して初期状態に戻す
                </button>
                <button onClick={() => setAskReset(false)} className={`press h-[44px] flex-1 rounded-full border bg-white text-[14px] font-bold ${FOCUS}`} style={{ color: NAVY, borderColor: "#c9d5e6" }}>
                  やめる
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAskReset(true)} className={`mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold ${FOCUS}`} style={{ color: "#8a4f3a" }}>
              <RotateCcw className="h-4 w-4" />
              初期状態に戻す（自分のひな形を消す）
            </button>
          ))}
        <div aria-hidden style={{ height: kb }} />
      </div>
    </>
  );
}

/** 小さな札 */
function Tag({ tone, children }: { tone: "ok" | "warn" | "muted"; children: ReactNode }) {
  const st: Record<typeof tone, CSSProperties> = { ok: { background: "#e3f5ec", color: "#1f7a4c" }, warn: { background: "#fff1d6", color: "#8a5a00" }, muted: { background: "#e8edf4", color: "#5f6f86" } };
  return (
    <span className="shrink-0 whitespace-nowrap rounded-[6px] px-1.5 py-px text-[10.5px] font-bold" style={st[tone]}>
      {children}
    </span>
  );
}

/** FAX をメールで送るサービスの宛先の形（任意）。{番号} の入ったメールアドレスの形になったら保存する */
function FaxFormatField({ value, onSave }: { value: string; onSave: (fax: string) => void }) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  const problem = faxFormatProblem(draft);
  const clean = cleanFaxFormat(draft);
  const change = (v: string) => {
    setDraft(v);
    if (!faxFormatProblem(v)) onSave(cleanFaxFormat(v));
  };
  // iPhone では { } を打ちにくいので、カーソルの所へ {番号} を入れるボタン
  const insertToken = () => {
    const el = input.current;
    const at = el && document.activeElement === el ? (el.selectionStart ?? draft.length) : draft.length;
    const end = el && document.activeElement === el ? (el.selectionEnd ?? at) : at;
    const next = (draft.slice(0, at) + FAX_TOKEN + draft.slice(end)).slice(0, FAX_FORMAT_MAX);
    flushSync(() => change(next));
    const caret = Math.min(at + FAX_TOKEN.length, next.length);
    el?.focus({ preventScroll: true });
    el?.setSelectionRange(caret, caret);
  };
  return (
    <section className="mt-4 rounded-[16px] bg-[#f4f7fb] p-3" aria-labelledby="iq-fax-format-title">
      <h3 id="iq-fax-format-title" className="text-[13.5px] font-bold text-ink">
        FAX をメールで送るサービスの宛先の形（任意）
      </h3>
      <p className="mt-1 text-[12px] leading-[1.6] text-muted">
        契約している FAX のサービスが、FAX 番号を入れたメールアドレスあてのメールを FAX にして送るなら、その宛先の形を入れます。{FAX_TOKEN} の所に、照会文のシートで入れた FAX 番号（ハイフンなしの数字）が入ります。形は、お使いのサービスの説明で確かめてください。
      </p>
      <div className="mt-2 flex gap-2">
        <input
          ref={input}
          id="iq-fax-format"
          aria-label="FAX をメールで送るサービスの宛先の形"
          aria-describedby="iq-fax-format-note"
          aria-invalid={problem ? true : undefined}
          value={draft}
          onChange={(e) => change(e.target.value)}
          placeholder={`例：${FAX_TOKEN}@fax.example.co.jp`}
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={FAX_FORMAT_MAX}
          className={`${INPUT} h-[44px] min-w-0 flex-1 ${problem ? "border-[#e0a07f]" : ""}`}
        />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={insertToken} className={`press h-[44px] shrink-0 rounded-xl bg-[#e3ebf6] px-3 text-[13px] font-bold ${FOCUS}`} style={{ color: NAVY }}>
          {FAX_TOKEN} を入れる
        </button>
      </div>
      <p id="iq-fax-format-note" role="status" className={`mt-1.5 text-[11.5px] leading-[1.55] [overflow-wrap:anywhere] ${problem ? "text-[#c2561f]" : "text-muted"}`}>
        {problem
          ? `${problem}。直すまで保存しません${value ? `（今は「${value}」のまま）` : ""}。`
          : clean
            ? `保存しました。FAX 番号が 047-123-4567 なら、宛先は ${clean.split(FAX_TOKEN).join("0471234567")} です（照会文のシートの「FAXで送る」で、この宛先のメールを開きます）。`
            : "入れなければ、FAX は印刷して送るか、FAX のアプリへ共有します。"}
      </p>
    </section>
  );
}

/** 一覧へ戻る見出しの行（右に操作） */
function EditHead({ onBack, children }: { onBack: () => void; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <button onClick={onBack} className={`press -ml-1.5 inline-flex h-[44px] items-center gap-0.5 pr-2 text-[14px] font-semibold ${FOCUS}`} style={{ color: NAVY }}>
        <ChevronLeft className="h-5 w-5" />
        ひな形の一覧
      </button>
      <div className="flex shrink-0 gap-1.5">{children}</div>
    </div>
  );
}

function HeadButton({ onClick, icon, label, danger }: { onClick: () => void; icon: ReactNode; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`press inline-flex h-[44px] items-center gap-1 rounded-full px-3 text-[13px] font-bold ${FOCUS}`} style={danger ? { background: "#fbe9e2", color: "#a2431c" } : { background: "#e3ebf6", color: NAVY }}>
      {icon}
      {label}
    </button>
  );
}

/** 文の中の差し込み項目を目立たせる（知っている項目は青、知らない項目は黄） */
function Marked({ text }: { text: string }) {
  return (
    <>
      {tokenParts(text).map((p, i) =>
        p.field ? (
          <span key={i} className="rounded-[4px] bg-[#e3ebf6] px-0.5 text-[#133664]">
            {p.text}
          </span>
        ) : p.unknown ? (
          <mark key={i} className="rounded-[4px] bg-[#ffe7b3] px-0.5 text-[#7a4f00]">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** 今の物件（無ければ見本）の値で入れた下見 */
function Preview({ t, values, blank, sample }: { t: InquiryTemplate; values: MergeValues; blank: FieldKey[]; sample: boolean }) {
  const merged = mergeTemplate(t.body, values);
  const subject = mergeSubject(t.subject, values).text;
  const used = new Set([...merged.used, ...mergeSubject(t.subject, values).used]);
  const empty = blank.filter((k) => used.has(k));
  return (
    <section className="mt-3" aria-label="下見">
      <p className={LABEL}>下見（{sample ? "見本の物件" : "いま開いている物件"}の値で入れた形）</p>
      <div className="mt-1 rounded-[14px] bg-[#f4f7fb] p-2">
        <div className="rounded-[10px] bg-white px-3 py-2.5 shadow-[0_1px_4px_rgba(20,45,85,0.10)]">
          <p className="mb-2 border-b border-line pb-1.5 text-[12px] leading-[1.5] text-muted [overflow-wrap:anywhere]">
            件名：<span className="font-semibold text-ink">{subject || "（件名なし）"}</span>
          </p>
          <div className="whitespace-pre-wrap text-[12.5px] leading-[1.7] text-[#1d1b18] [overflow-wrap:anywhere]">{merged.text ? <Marked text={merged.text} /> : <span className="text-muted">（本文が空です）</span>}</div>
        </div>
      </div>
      {empty.length > 0 && (
        <p className="mt-1.5 text-[11.5px] leading-[1.55] text-muted">
          この物件では空：{empty.map(fieldToken).join("・")}
          {empty.includes("地番") && "（地番は（　）の空欄）"}
          {empty.includes("差出人") && "（差出人は記入欄。≡ の「書類の差出人」で入れられます）"}
        </p>
      )}
    </section>
  );
}

/** 標準のひな形（見るだけ。複製して直す） */
function StandardView({ values, blank, sample, onBack, onDuplicate, notice }: { values: MergeValues; blank: FieldKey[]; sample: boolean; onBack: () => void; onDuplicate: () => void; notice: string | null }) {
  return (
    <>
      <EditHead onBack={onBack} />
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <p className="text-[15px] font-bold text-ink">標準</p>
        <p className="mt-1 text-[12.5px] leading-[1.6] text-muted">今の照会文と同じ文です。消したり直したりはできません。複製すると、自分のひな形として直せます。</p>
        <button onClick={onDuplicate} className={`press mt-2.5 flex h-[48px] w-full items-center justify-center gap-1.5 rounded-[16px] text-[14.5px] font-bold text-white ${FOCUS}`} style={{ background: NAVY }}>
          <Copy className="h-[17px] w-[17px]" />
          複製して直す
        </button>
        {notice && <p className="mt-2 text-[12px] leading-[1.55] text-[#c2561f]">{notice}</p>}
        <p className={`${LABEL} mt-3`}>件名</p>
        <p className="mt-1 rounded-xl bg-[#f4f7fb] px-3 py-2 text-[13px] leading-[1.6] [overflow-wrap:anywhere]">
          <Marked text={STANDARD_TEMPLATE.subject} />
        </p>
        <p className={`${LABEL} mt-3`}>本文（{"{{"}…{"}}"} の所に、物件ごとの値が入ります）</p>
        <div className="mt-1 whitespace-pre-wrap rounded-xl bg-[#f4f7fb] px-3 py-2 text-[12.5px] leading-[1.7] [overflow-wrap:anywhere]">
          <Marked text={STANDARD_TEMPLATE.body} />
        </div>
        <Preview t={STANDARD_TEMPLATE} values={values} blank={blank} sample={sample} />
      </div>
    </>
  );
}

/** 自分のひな形を直す画面 */
function EditView({
  t,
  values,
  blank,
  sample,
  onChange,
  onBack,
  onDuplicate,
  onDelete,
  onStandard,
  notice,
}: {
  t: InquiryTemplate;
  values: MergeValues;
  blank: FieldKey[];
  sample: boolean;
  onChange: (patch: Partial<Omit<InquiryTemplate, "id">>) => void;
  onBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onStandard: () => void;
  notice: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const kb = useKeyboardSafe(box);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  /** 差し込み項目を入れる欄（最後に触れた欄。まだなら本文の最後） */
  const target = useRef<"subject" | "body" | null>(null);
  const [ask, setAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const unknown = unknownTokens(t.subject, t.body);
  const noName = !t.name.trim();
  const noBody = !t.body.trim();
  // 空の名前・本文のまま戻るときだけ確かめる（入れたら確かめは消える）
  const showAsk = ask && (noName || noBody);
  const back = () => {
    if (!showAsk && (noName || noBody)) return setAsk(true);
    onBack();
  };
  const insert = (k: FieldKey) => {
    const which = target.current ?? "body";
    const el = which === "subject" ? subjectRef.current : bodyRef.current;
    const v = which === "subject" ? t.subject : t.body;
    const focused = !!el && document.activeElement === el;
    const touched = target.current !== null;
    const start = el && touched ? (el.selectionStart ?? v.length) : v.length;
    const end = el && touched ? (el.selectionEnd ?? start) : start;
    const token = fieldToken(k);
    const next = (v.slice(0, start) + token + v.slice(end)).slice(0, which === "subject" ? SUBJECT_MAX : BODY_MAX);
    // 欄の中身をすぐ描き直してから、入れた項目のすぐ後ろにカーソルを置く（欄に触れていたら、キーボードはそのまま）
    flushSync(() => onChange(which === "subject" ? { subject: next } : { body: next }));
    if (!el) return;
    const caret = Math.min(start + token.length, next.length);
    if (focused) el.focus({ preventScroll: true });
    el.setSelectionRange(caret, caret);
  };
  return (
    <>
      <EditHead onBack={back}>
        <HeadButton onClick={onDuplicate} icon={<Copy className="h-4 w-4" />} label="複製" />
        <HeadButton onClick={onDelete} icon={<Trash2 className="h-4 w-4" />} label="削除" danger />
      </EditHead>
      {showAsk && (
        <div className="mt-1 shrink-0 rounded-[14px] border border-[#f0d7a6] bg-[#fff8e8] px-3 py-2" role="alertdialog" aria-label="空の欄があります">
          <p className="text-[12.5px] leading-[1.55] text-[#6b4a00]">
            {noName && "名前が空です（一覧では「名前なし」と出ます）。"}
            {noBody && "本文が空です（このひな形では照会文を送れません）。"}
            このまま一覧に戻りますか？
          </p>
          <div className="mt-1.5 flex gap-2">
            <button onClick={onBack} className={`press h-[44px] flex-1 rounded-full border bg-white text-[13.5px] font-bold ${FOCUS}`} style={{ color: NAVY, borderColor: "#c9d5e6" }}>
              このまま戻る
            </button>
            <button
              onClick={() => {
                setAsk(false);
                (noName ? document.getElementById("iq-tpl-name") : bodyRef.current)?.focus();
              }}
              className={`press h-[44px] flex-1 rounded-full text-[13.5px] font-bold text-white ${FOCUS}`}
              style={{ background: NAVY }}
            >
              直す
            </button>
          </div>
        </div>
      )}
      <div ref={box} className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {notice && <p className="mb-2 text-[12px] leading-[1.55] text-[#c2561f]">{notice}</p>}
        <label className="block">
          <span className={LABEL}>名前</span>
          <input id="iq-tpl-name" value={t.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={NAME_MAX} placeholder="例：メール用（短い文）" autoComplete="off" aria-invalid={noName || undefined} className={`${INPUT} mt-1 h-[44px]`} />
        </label>
        {noName && <p className="mt-1 text-[11.5px] text-[#c2561f]">名前を入れてください（空のままだと一覧では「名前なし」）。</p>}
        <label className="mt-2.5 block">
          <span className={LABEL}>件名（メールの件名・FAX 送付状の件名）</span>
          <input
            ref={subjectRef}
            value={t.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            onFocus={() => (target.current = "subject")}
            maxLength={SUBJECT_MAX}
            placeholder="例：道路種別のご照会（{{所在地}}）"
            autoComplete="off"
            className={`${INPUT} mt-1 h-[44px]`}
          />
        </label>
        <label className="mt-2.5 block">
          <span className="flex items-baseline justify-between">
            <span className={LABEL}>本文</span>
            <span className="text-[11px] tabular-nums text-muted">
              {t.body.length.toLocaleString("ja-JP")} / {BODY_MAX.toLocaleString("ja-JP")}字
            </span>
          </span>
          <textarea
            ref={bodyRef}
            value={t.body}
            onChange={(e) => onChange({ body: e.target.value })}
            onFocus={() => (target.current = "body")}
            maxLength={BODY_MAX}
            rows={9}
            aria-invalid={noBody || undefined}
            placeholder="照会文の本文。下のチップで {{日付}} などを入れると、物件ごとの値になります。"
            className={`${INPUT} mt-1 block resize-y py-2 leading-[1.6]`}
          />
        </label>
        {noBody && <p className="mt-1 text-[11.5px] text-[#c2561f]">本文が空です（このひな形では照会文を送れません）。</p>}
        {/* 差し込み項目のチップ（押しても欄のカーソルは動かさない） */}
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2">
            <p className={LABEL}>差し込み項目（押すと、カーソルの所に入ります）</p>
            <button onClick={() => setHelp((h) => !h)} aria-expanded={help} className={`inline-flex min-h-[44px] shrink-0 items-center text-[12px] font-semibold ${FOCUS}`} style={{ color: NAVY }}>
              {help ? "説明を閉じる" : "説明"}
            </button>
          </div>
          <div className="flex flex-wrap gap-x-1.5" aria-label="差し込み項目">
            {FIELD_KEYS.map((k) => (
              <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k)} aria-label={`${fieldToken(k)} を入れる。${FIELD_NOTE[k]}`} className="group flex h-[44px] items-center outline-none">
                <span className="inline-flex h-[32px] items-center rounded-full bg-[#e3ebf6] px-2.5 text-[12.5px] font-semibold text-[#133664] group-focus-visible:ring-2 group-focus-visible:ring-[#2f7cf6] group-active:bg-[#cfdcee]">{fieldToken(k)}</span>
              </button>
            ))}
          </div>
          {help && (
            <dl className="mt-1 space-y-1 rounded-xl bg-[#f4f7fb] px-3 py-2 text-[11.5px] leading-[1.5]">
              {FIELD_KEYS.map((k) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-[5.6em] shrink-0 font-semibold text-[#133664]">{fieldToken(k)}</dt>
                  <dd className="min-w-0 text-muted">{FIELD_NOTE[k]}</dd>
                </div>
              ))}
              <p className="pt-1 text-muted">複数行の項目（差出人・聞くこと・回答欄）は、書いた行の頭の字下げを2行目からもそろえます。</p>
            </dl>
          )}
        </div>
        {unknown.length > 0 && (
          <p className="mt-2 flex gap-1.5 rounded-xl bg-[#fff4e5] px-3 py-2 text-[12px] leading-[1.6] text-[#7a5a2a]" role="status">
            <TriangleAlert className="mt-[3px] h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{unknown.join("・")} は差し込みの項目にありません。この項目は入りません（書いたまま残ります）。上のチップから入れ直してください。</span>
          </p>
        )}
        <Preview t={t} values={values} blank={blank} sample={sample} />
        <button onClick={onStandard} className={`press mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold ${FOCUS}`} style={{ color: NAVY }}>
          <RotateCcw className="h-4 w-4" />
          件名と本文を標準の文に戻す
        </button>
        <div aria-hidden style={{ height: kb }} />
      </div>
    </>
  );
}

/** 元に戻す（少しの間だけ。シートの下に重ねる） */
function UndoBar({ text, onUndo, onDone }: { text: string; onUndo: () => void; onDone: () => void }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const t = window.setTimeout(() => done.current(), UNDO_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" className="iq-toast absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 rounded-full py-1 pl-4 pr-1 text-white shadow-[0_8px_24px_rgba(10,25,50,0.28)]" style={{ background: "rgba(19,40,74,0.96)", minHeight: 52 }}>
      <span className="min-w-0 flex-1 truncate text-[13.5px]">{text}</span>
      <button onClick={onUndo} className="press h-[44px] shrink-0 rounded-full bg-white px-4 text-[14px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-[#9db8e6]" style={{ color: NAVY }}>
        元に戻す
      </button>
    </div>
  );
}
