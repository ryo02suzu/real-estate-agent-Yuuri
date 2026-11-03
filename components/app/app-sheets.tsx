"use client";

// 「地図アプリで開く」と「レポートを作成」の選択（下から出る）。地図アプリには物件の座標だけを渡す（押したときだけ。自前のサーバーは通さない）。
// レポートは1画面で書類を選ぶ：上に要注意点と次にやること（進みの輪）、その下に作れる書類のタイルを調査の流れの順
// （役所・法務局で → 現地で → 書類にする。components/app/doc-kinds.tsx）で、それぞれの状態（宛先・筆の数・要確認の数など）と一緒に。
// 「結果の文面」は同じシートの次の画面で、「要点」か「詳しく」と入れる項目を選びながら、読みやすい形で中身を確かめてコピー・共有する
// （効くのは文面だけ）。どちらの画面もシートの高さは同じ（components/app/doc-sheets.tsx の DOC_BODY。選んでも大きさが変わらない）
import { Check, ChevronLeft, ChevronRight, ClipboardCopy, Compass, Crosshair, ExternalLink, ListChecks, Map as MapIcon, Navigation, Route, Share2 } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { docText, type Doc } from "@/lib/app/doc";
import type { ReportDetail } from "@/lib/app/report";
import { Sheet } from "../sheet";
import { DOC_GROUPS, MAIN_DOC, type DocDef, type DocKind } from "./doc-kinds";
import { DOC_BODY, DOC_PANE } from "./doc-sheets";
import { DocView } from "./doc-view";
import type { Ok } from "./use-property";

function Item({ icon, title, sub, href, onClick }: { icon: ReactNode; title: string; sub?: string; href?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-brand">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-ink">{title}</span>
        {sub && <span className="mt-0.5 block text-[12px] leading-[1.5] text-muted">{sub}</span>}
      </span>
      {href ? <ExternalLink className="h-4 w-4 shrink-0 text-muted" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted" />}
    </>
  );
  const cls = "flex w-full items-center gap-3 py-3 text-left active:bg-mint/50";
  return (
    <li>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>
          {body}
        </a>
      ) : (
        <button onClick={onClick} className={cls}>
          {body}
        </button>
      )}
    </li>
  );
}

export function MapAppsSheet({ result, open, onClose, onMichilu, onFix }: { result: Ok; open: boolean; onClose: () => void; onMichilu: () => void; onFix: () => void }) {
  if (!open) return null;
  const { lat, lng } = result;
  const ll = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const road = result.links.find((l) => l.kind !== "public_road") ?? result.links[0];
  return (
    <div className="theme-navy">
      <Sheet title="地図アプリで開く" open onClose={onClose}>
        <ul className="divide-y divide-line">
          <Item
            icon={<MapIcon className="h-[18px] w-[18px]" />}
            title="MICHILUの地図"
            sub="筆・用途地域・道路種別・ハザードを重ねて見る"
            onClick={() => {
              onClose();
              onMichilu();
            }}
          />
          <Item
            icon={<Crosshair className="h-[18px] w-[18px]" />}
            title="場所を直す"
            sub="ピンの場所が違うときは、地図で物件の場所を選び直す"
            onClick={() => {
              onClose();
              onFix();
            }}
          />
          {road && <Item icon={<Route className="h-[18px] w-[18px]" />} title={`${result.municipality.name}の道路の地図`} sub={road.label} href={road.url} />}
          <Item icon={<Compass className="h-[18px] w-[18px]" />} title="Googleマップ" sub="写真・口コミ・まわりのお店" href={`https://www.google.com/maps/search/?api=1&query=${ll}`} />
          <Item icon={<Navigation className="h-[18px] w-[18px]" />} title="ここまでの道順（Googleマップ）" sub="現在地から物件までの経路" href={`https://www.google.com/maps/dir/?api=1&destination=${ll}`} />
          <Item icon={<MapIcon className="h-[18px] w-[18px]" />} title="ストリートビュー" sub="前面道路の様子（撮影時点の写真）" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}`} />
          <Item icon={<MapIcon className="h-[18px] w-[18px]" />} title="Appleマップ（iPhone）" href={`https://maps.apple.com/?ll=${ll}&q=${encodeURIComponent(result.matchedAddress)}`} />
          <Item icon={<MapIcon className="h-[18px] w-[18px]" />} title="地理院地図（国土地理院）" sub="標高・地形・古い航空写真" href={`https://maps.gsi.go.jp/#18/${lat.toFixed(6)}/${lng.toFixed(6)}/`} />
        </ul>
        <p className="mt-2 text-[11.5px] leading-[1.6] text-muted">押した地図アプリに、物件の座標だけを渡して開きます。</p>
      </Sheet>
    </div>
  );
}

/** レポートに入れる項目（buildSummary の入力の鍵） */
export const REPORT_SECTIONS = [
  { key: "triage", label: "要注意点" },
  { key: "roads", label: "道路" },
  { key: "zoning", label: "都市計画・法令" },
  { key: "parcels", label: "地番" },
  { key: "hazard", label: "ハザード" },
  { key: "building", label: "建物" },
  { key: "landPrice", label: "地価" },
  { key: "stations", label: "駅" },
  { key: "schools", label: "学区" },
  { key: "pois", label: "施設" },
] as const;
export type SectionKey = (typeof REPORT_SECTIONS)[number]["key"];

/** 外した項目を入力から抜く（要注意点を外すと済んだ印も抜く） */
export function pickSections<T extends object>(input: T, off: ReadonlySet<SectionKey>): T {
  const out = { ...input } as Record<string, unknown>;
  for (const k of off) {
    delete out[k];
    if (k === "triage") delete out.done;
  }
  return out as T;
}

/** 書類のタイルの状態の行（宛先・筆の数・要確認の数など）。tone で頭の点の色 */
export type DocStatus = { text: string; tone?: "ok" | "warn" | "busy" | "muted" };

const TONE_DOT: Record<NonNullable<DocStatus["tone"]>, string> = { ok: "#1f8f5a", warn: "#d08a16", busy: "#5f7da8", muted: "#a3afc0" };
/** タイルの右上の、調査の流れの段（components/app/doc-kinds.tsx の組） */
const STEP_OF: Partial<Record<DocKind, string>> = { inquiry: "役所で", parcels: "法務局で", guide: "現地で", memo: "書類", draft: "書類", copy: "共有" };

export function ReportSheet({
  open,
  onClose,
  onDoc,
  todo,
  status,
  startText,
  onCopy,
  copied,
  onShare,
  doc,
  detail,
  onDetail,
  off,
  onToggle,
  motion,
}: {
  open: boolean;
  onClose: () => void;
  /** 書類を開く（要注意点・照会文・地番の一覧・案内図・調査メモ・下書き。このシートは閉じてから。結果の文面はこのシートの次の画面） */
  onDoc: (kind: DocKind) => void;
  /** 要注意点と次にやることの進み（済んだやること・要注意・要確認の数） */
  todo: { left: number; total: number; warns: number; checks: number; pending: boolean };
  /** 書類ごとの状態の行 */
  status: Partial<Record<DocKind, DocStatus>>;
  /** はじめから結果の文面の画面で開く（書類・出力のページで「結果の文面」を選んだとき） */
  startText?: boolean;
  onCopy: () => void;
  copied: boolean;
  /** 共有の画面（LINE・メールなど。出せる端末だけ渡す） */
  onShare?: () => void;
  /** いまの選択での文面の中身（lib/app/report.ts） */
  doc: Doc;
  /** 要点だけか、詳しくか */
  detail: ReportDetail;
  onDetail: (d: ReportDetail) => void;
  /** 外している項目 */
  off: ReadonlySet<SectionKey>;
  onToggle: (k: SectionKey) => void;
  /** 動きの演出（≡ の設定） */
  motion: boolean;
}) {
  if (!open) return null;
  return <ReportBody onClose={onClose} onDoc={onDoc} todo={todo} status={status} startText={startText} onCopy={onCopy} copied={copied} onShare={onShare} doc={doc} detail={detail} onDetail={onDetail} off={off} onToggle={onToggle} motion={motion} />;
}

function ReportBody({
  onClose,
  onDoc,
  todo,
  status,
  startText,
  onCopy,
  copied,
  onShare,
  doc,
  detail,
  onDetail,
  off,
  onToggle,
  motion,
}: Omit<Parameters<typeof ReportSheet>[0], "open">) {
  // 書類を選ぶ画面 → 結果の文面の画面（同じシートの中で横に送る）
  const [step, setStep] = useState<"docs" | "text">(startText ? "text" : "docs");
  const [moved, setMoved] = useState(false);
  const go = (s: "docs" | "text") => {
    setMoved(true);
    setStep(s);
  };
  const done = todo.total - todo.left;
  const tiles = DOC_GROUPS.flatMap((g) => g.docs);
  const length = docText(doc).length;
  return (
    <div className="theme-navy">
      <Sheet title={step === "docs" ? "レポートを作成" : "結果の文面"} open onClose={onClose}>
        <div className={DOC_BODY}>
          <div key={step} className="rp-pane flex min-h-0 flex-1 flex-col" data-dir={moved ? (step === "text" ? "r" : "l") : undefined} data-motion={motion ? "1" : "0"}>
            {step === "docs" ? (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
                {/* いちばん使う：要注意点と次にやること（進みの輪と、あと何件） */}
                <button onClick={() => onDoc("triage")} className="rp-in press relative flex w-full items-center gap-3 overflow-hidden rounded-[20px] px-4 py-3.5 text-left text-white" style={{ background: "linear-gradient(135deg, #1b4280 0%, #0f2f5f 58%, #0a2248 100%)", "--i": 0 } as CSSProperties}>
                  <MiniRing done={done} total={todo.total} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-bold leading-[1.35]">{MAIN_DOC.action}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-white/80">
                      <span>{todo.total && !todo.left ? "すべて済み" : `あと${todo.left}件／${todo.total}件`}</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-[6px] rounded-full bg-[#ff9c80]" />
                        要注意 {todo.warns}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-[6px] rounded-full bg-[#ffcb6b]" />
                        要確認 {todo.checks}
                      </span>
                      {todo.pending && <span className="text-white/60">確認中あり</span>}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-white/70" />
                </button>
                <p className="rp-in mt-3.5 text-[12px] leading-[1.5] text-muted" style={{ "--i": 1 } as CSSProperties}>
                  調査の流れの順（役所・法務局 → 現地 → 書類）。押すと開きます。
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {tiles.map((d, i) => (
                    <DocTile key={d.kind} doc={d} index={i + 2} status={status[d.kind]} onClick={() => (d.kind === "copy" ? go("text") : onDoc(d.kind))} />
                  ))}
                </div>
                <p className="mt-3 text-[11.5px] leading-[1.6] text-muted">どれも参考の資料です。重要事項説明などの最終確認は、役所の窓口・公的な資料で行ってください。</p>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <button onClick={() => go("docs")} className="press -ml-1.5 inline-flex h-[34px] items-center gap-0.5 pr-2 text-[14px] font-semibold" style={{ color: "#133664" }}>
                    <ChevronLeft className="h-5 w-5" />
                    書類を選ぶ
                  </button>
                  {/* 要点だけ（上司・同僚への一報）か、詳しく（社内の記録・報告書の元） */}
                  <div role="radiogroup" aria-label="文面の長さ" className="flex h-[34px] shrink-0 rounded-full bg-[#eef2f7] p-[3px]">
                    {(
                      [
                        ["short", "要点"],
                        ["full", "詳しく"],
                      ] as const
                    ).map(([k, label]) => (
                      <button key={k} role="radio" aria-checked={detail === k} onClick={() => onDetail(k)} className="press min-w-[64px] rounded-full px-3 text-[13px] font-bold transition-colors duration-150" style={detail === k ? { background: "#fff", color: "#133664", boxShadow: "0 1px 3px rgba(20,45,85,0.18)" } : { color: "#6b7890" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 入れる項目（1行。横にすべらせる） */}
                <div className="-mx-5 mt-2 flex shrink-0 gap-1.5 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="入れる項目">
                  {REPORT_SECTIONS.map((s) => {
                    const on = !off.has(s.key);
                    return (
                      <button key={s.key} onClick={() => onToggle(s.key)} aria-pressed={on} className="press inline-flex h-[32px] shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-colors duration-150" style={{ background: on ? "#133664" : "#eef2f7", color: on ? "#fff" : "#6b7890" }}>
                        <Check className={`h-3.5 w-3.5 ${on ? "" : "opacity-0"}`} strokeWidth={3} />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 flex shrink-0 items-baseline justify-between text-[11.5px] text-muted">
                  <span>{detail === "short" ? "要点だけ（上司・同僚への一報に）" : "詳しく（社内の記録・報告書の元に）"}</span>
                  <span className="tabular-nums">{length.toLocaleString("ja-JP")}文字</span>
                </p>
                <div className={`${DOC_PANE} mt-1`} aria-label="文面の中身">
                  <DocView doc={doc} />
                </div>
                <div className={`mt-2.5 grid shrink-0 gap-2 ${onShare ? "grid-cols-[1fr_auto]" : "grid-cols-1"}`}>
                  <button onClick={onCopy} className="press flex h-[48px] items-center justify-center gap-2 rounded-[16px] text-[15px] font-bold text-white transition-colors duration-200" style={{ background: copied ? "#1f8f5a" : "#133664" }}>
                    {copied ? <Check key="done" className="td-bump h-5 w-5" strokeWidth={3} /> : <ClipboardCopy className="h-[18px] w-[18px]" />}
                    {copied ? "コピーしました" : "コピー"}
                  </button>
                  {onShare && (
                    <button onClick={onShare} className="press flex h-[48px] items-center justify-center gap-2 rounded-[16px] px-5 text-[15px] font-bold" style={{ background: "#e3ebf6", color: "#133664" }}>
                      <Share2 className="h-[18px] w-[18px]" />
                      共有
                    </button>
                  )}
                </div>
                <p className="mt-2 shrink-0 text-[11px] leading-[1.55] text-muted [@media(max-height:720px)]:hidden">LINE・メール・チャットに貼ると、見出し（■）と行の形のまま読めます。確認した結果（あなたの記録）も入ります。</p>
              </>
            )}
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/** 書類のタイル（印・名前・状態の行。右上に調査の流れの段） */
function DocTile({ doc: d, index, status, onClick }: { doc: DocDef; index: number; status?: DocStatus; onClick: () => void }) {
  const tone = status?.tone ?? "muted";
  return (
    <button onClick={onClick} className="rp-in press flex min-h-[96px] min-w-0 flex-col rounded-[18px] bg-[#f4f7fb] p-3 text-left" style={{ "--i": index } as CSSProperties}>
      <span className="flex w-full items-start justify-between gap-1">
        <span className="flex size-[34px] items-center justify-center rounded-full" style={{ background: "#e3ebf6", color: "#133664" }}>
          <d.Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
        </span>
        {STEP_OF[d.kind] && <span className="rounded-full bg-white px-2 py-[2px] text-[10.5px] font-semibold text-[#6b7890]">{STEP_OF[d.kind]}</span>}
      </span>
      <span className="mt-2 block text-[14.5px] font-bold leading-[1.3] text-ink">{d.title}</span>
      <span className="mt-1 flex w-full min-w-0 items-center gap-1.5 text-[11.5px] leading-[1.4] text-muted">
        {tone === "busy" ? <span className="td-spin size-[9px] shrink-0 rounded-full border-[1.5px] border-[#5f7da8]/30 border-t-[#5f7da8]" /> : <span className="size-[7px] shrink-0 rounded-full" style={{ background: TONE_DOT[tone] }} />}
        <span className="min-w-0 truncate">{status?.text ?? d.short}</span>
      </span>
    </button>
  );
}

/** 進みの小さな輪（要注意点と次にやることのカード） */
function MiniRing({ done, total }: { done: number; total: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const all = total > 0 && done === total;
  return (
    <span className="relative flex size-[44px] shrink-0 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="4.5" />
        <circle className="td-ring" cx="22" cy="22" r={r} fill="none" stroke={all ? "#4fd18b" : "#fff"} strokeWidth="4.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - (total ? done / total : 0))} />
      </svg>
      {all ? <Check className="h-5 w-5" strokeWidth={3} color="#4fd18b" /> : <ListChecks className="h-[18px] w-[18px]" />}
    </span>
  );
}
