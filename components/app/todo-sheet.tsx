"use client";

// 「要注意点と次にやること」（スマホ）。上に進み（済んだやることの輪）と要注意・要確認の数、その下で「次にやること」と
// 「問題になりそうな所」を切り替える。次にやることは行き先ごと（法務局 → 市区町村の窓口 → ハザードマップ → 県などの担当 →
// 水道・ガス → 現地。lib/app/todo.ts）にまとめ、問題につながるやること（この物件で特に）をまとまりの先頭に。
// 行を開くと、確かめることと、確かめた結果をその場で書く欄（答えの札・データで読んだ値・方法）。「記録して済みにする」で
// 確認の記録（lib/records.ts。端末の中だけ）に入れ、済みの印（lib/checklist.ts）を付ける。問題になりそうな所からは、
// 確かめるやることへ飛べる。法令の判断はしない（答えの札は窓口で聞いた言葉を写すためのもの）。
// PC は今までどおり components/triage-sheet.tsx（この部品はスマホだけ）
import {
  ArrowRight,
  Building2,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Droplets,
  ExternalLink,
  Landmark,
  Map as MapIcon,
  MapPin,
  Mountain,
  PenLine,
  Phone,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { buildTodo, defaultMethod, fieldValue, mergeNote, RESULT_FIELDS, resultChips, withUnit, type ResultField, type TodoGroupKey, type TodoItem } from "@/lib/app/todo";
import { TRIAGE_NOTE, triageLines, type Action, type Issue, type Triage } from "@/lib/app/triage";
import { METHODS, writeRecord, type Method, type PropertyRecords } from "@/lib/records";
import { Sheet } from "../sheet";
import { useCopy } from "../use-copy";
import { Expand } from "./research";
import { reducedMotion, STATUS } from "./tokens";
import { SitePhotos, type SitePhotosState } from "./site-photos";
import { NAVY } from "./ui";
import type { Ok } from "./use-property";

const GREEN = STATUS.confirmed.color;
/** 要注意（データで制限・危険が見つかった）と要確認（データだけでは分からない）の色 */
const LEVEL = {
  warn: {
    color: "#c8432b",
    bg: "#fdeee9",
    onNavy: "#ff9c80",
    label: "要注意",
    Icon: TriangleAlert,
  },
  check: {
    color: "#b7791f",
    bg: "#fbf3e2",
    onNavy: "#ffcb6b",
    label: "要確認",
    Icon: CircleHelp,
  },
} as const;
const GROUP_ICON: Record<TodoGroupKey, LucideIcon> = {
  houmu: Landmark,
  city: Building2,
  map: MapIcon,
  pref: Mountain,
  life: Droplets,
  site: MapPin,
};

type Props = {
  open: boolean;
  onClose: () => void;
  result: Ok;
  triage: Triage;
  /** 済んだやること（物件の画面と同じ印。書類・出力のページの状態の行もこれで変わる） */
  done: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** 物件の鍵（lib/property-id.ts）と、記録に付ける名前（住所） */
  pid: string;
  label: string;
  records: PropertyRecords;
  onRecords: (r: PropertyRecords) => void;
  /** データで読んだ値（確認事項 topic.sub ごと。lib/app/todo.ts の dataHints） */
  hints: Record<string, string>;
  /** 動きの演出（≡ の設定）。切っていれば行が順に現れる動きを付けない */
  motion: boolean;
  /** 現地の写真メモ（「現地で確かめる」の中。components/app/site-photos.tsx） */
  photos?: SitePhotosState;
};

const noop = () => () => {};

export function TodoSheet(props: Props) {
  // document.body に出す（物件の画面の枠の外。見た目は body の .theme-navy に従う）
  const client = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!client) return null;
  return createPortal(
    <Sheet title="要注意点と次にやること" open={props.open} onClose={props.onClose}>
      <TodoBody {...props} />
    </Sheet>,
    document.body,
  );
}

type Tab = "todo" | "issues";

function TodoBody({ result, triage, done, onToggle, pid, label, records, onRecords, hints, motion, photos }: Props) {
  const m = result.municipality;
  const { groups, linked } = useMemo(() => buildTodo(triage, m.name, m.pref), [triage, m.name, m.pref]);
  const byId = useMemo(() => new Map(triage.actions.map((a) => [a.id, a])), [triage.actions]);
  const total = triage.actions.length;
  const left = triage.actions.filter((a) => !done.has(a.id)).length;
  const warns = triage.issues.filter((i) => i.level === "warn");
  const checks = triage.issues.filter((i) => i.level === "check");

  const [tab, setTab] = useState<Tab>("todo");
  // 切り替えた向き（最初に開いたときは動かさない）
  const [dir, setDir] = useState<"l" | "r" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // 行を開いた回数（開くたびに結果の欄を記録から読み直す）
  const [gen, setGen] = useState(0);
  // 問題から飛んできた行を光らせる・押したチェックを弾ませる・全部済んだときの光
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const [popped, setPopped] = useState<string | null>(null);
  const [cheer, setCheer] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const copy = useCopy();

  /** 切り替えの帯より下まで読み進めていたら、帯がいちばん上に来る所まで戻す */
  const toBar = () => {
    const panel = root.current?.closest<HTMLElement>(".sheet-panel");
    const at = mark.current;
    if (!panel || !at) return;
    const y = at.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    if (panel.scrollTop > y) panel.scrollTop = y;
  };
  const switchTab = (t: Tab) => {
    if (t === tab) return;
    setDir(t === "issues" ? "r" : "l");
    setTab(t);
    toBar();
  };
  const toggleRow = (id: string) => {
    setOpenId((cur) => (cur === id ? null : id));
    if (openId !== id) setGen((g) => g + 1);
  };
  const toggle = (id: string) => {
    const willDone = !done.has(id);
    if (willDone) {
      try {
        navigator.vibrate?.(12);
      } catch {
        // 震わせられない端末（iPhone など）はそのまま
      }
      if (left === 1) setCheer((c) => c + 1);
    }
    setPopped(willDone ? id : null);
    onToggle(id);
  };
  /** 問題から、確かめるやることへ飛ぶ（開いて光らせる） */
  const jump = (id: string) => {
    setDir("l");
    setTab("todo");
    if (openId !== id) setGen((g) => g + 1);
    setOpenId(id);
    setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  };
  useEffect(() => {
    if (!flash) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-todo-row="${flash.id}"]`);
    el?.scrollIntoView({
      block: "start",
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }, [flash]);
  /** 記録できたら、少し見せてから行を閉じる */
  const saved = (id: string) => {
    setTimeout(() => setOpenId((cur) => (cur === id ? null : cur)), reducedMotion() ? 300 : 950);
  };

  const copyText = () =>
    [
      result.matchedAddress,
      ...triageLines(triage, done, (a) => {
        const r = resultChips(a.id, records);
        return r.length ? [`  → 確かめた結果：${r.join("・")}`] : [];
      }),
    ].join("\n");

  let index = 0;
  return (
    <div ref={root} className="text-ink" data-motion={motion ? "1" : "0"}>
      <Summary done={total - left} total={total} left={left} warns={warns.length} checks={checks.length} pending={triage.pending} failed={triage.failed} cheer={cheer} />

      {/* 切り替え（読み進めても上に残る） */}
      <div ref={mark} />
      <div className="sticky -top-4 z-10 -mx-5 bg-white/95 px-5 pb-2.5 pt-2.5 backdrop-blur-md [@media(max-height:720px)]:-top-2">
        <div role="tablist" aria-label="表示の切り替え" className="relative grid h-[40px] grid-cols-2 rounded-full bg-[#eef2f7] p-[3px]">
          <span
            aria-hidden
            className="td-seg-pill absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-white shadow-[0_1px_4px_rgba(20,45,85,0.16)]"
            style={{
              transform: tab === "issues" ? "translateX(100%)" : "none",
            }}
          />
          <SegButton on={tab === "todo"} onClick={() => switchTab("todo")} count={left} label="次にやること" />
          <SegButton on={tab === "issues"} onClick={() => switchTab("issues")} count={triage.issues.length} label="問題になりそうな所" warn={warns.length > 0} />
        </div>
      </div>

      <div key={tab} role="tabpanel" aria-label={tab === "todo" ? "次にやること" : "問題になりそうな所"} className="td-pane" data-dir={dir ?? undefined}>
        {tab === "todo" ? (
          <div className="space-y-4 pt-1">
            {groups.map((g) => {
              const Icon = GROUP_ICON[g.key];
              const gDone = g.items.filter((i) => done.has(i.action.id)).length;
              const all = gDone === g.items.length;
              return (
                <section key={g.key}>
                  <div className="td-in mb-2 flex items-center gap-2.5 px-0.5" style={{ "--i": index++ } as CSSProperties}>
                    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full" style={{ background: "#e8eef7", color: NAVY }}>
                      <Icon size={16} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold leading-[1.3]">{g.title}</span>
                      <span className="block truncate text-[12px] leading-[1.4] text-muted">{g.sub}</span>
                    </span>
                    <span
                      className="flex h-[24px] shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-semibold transition-colors duration-300"
                      style={all ? { background: STATUS.confirmed.bg, color: GREEN } : { background: "#eef2f7", color: "#5f6f86" }}
                    >
                      {all && <Check size={13} strokeWidth={3} />}
                      {gDone}/{g.items.length}
                    </span>
                  </div>
                  <ul className="overflow-hidden rounded-[18px] bg-[#f4f7fb]">
                    {g.items.map((item) => (
                      <TodoRow
                        key={item.action.id}
                        item={item}
                        index={index++}
                        done={done.has(item.action.id)}
                        open={openId === item.action.id}
                        gen={gen}
                        pop={popped === item.action.id}
                        flash={flash?.id === item.action.id ? flash.n : 0}
                        records={records}
                        hints={hints}
                        pid={pid}
                        label={label}
                        onToggle={toggle}
                        onOpen={toggleRow}
                        onRecords={onRecords}
                        onSaved={saved}
                        photos={item.action.id === "site" ? photos : undefined}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="pt-1">
            {!triage.issues.length ? (
              <div className="td-in flex flex-col items-center px-4 py-8 text-center">
                <span
                  className="flex size-12 items-center justify-center rounded-full"
                  style={{
                    background: triage.pending.length ? "#eef2f7" : STATUS.confirmed.bg,
                    color: triage.pending.length ? NAVY : GREEN,
                  }}
                >
                  {triage.pending.length ? <span className="td-spin size-5 rounded-full border-2 border-[#133664]/25 border-t-[#133664]" /> : <Check size={22} strokeWidth={3} />}
                </span>
                <p className="mt-3 text-[15px] font-semibold">{triage.pending.length ? `${triage.pending.join("・")}を確認しています` : "データで見つかった注意はありません"}</p>
                <p className="mt-1 text-[13px] leading-[1.6] text-muted">確かめる所は「次にやること」にまとめています。</p>
              </div>
            ) : (
              [warns, checks].map((list) =>
                list.length ? (
                  <section key={list[0].level} className="mb-4">
                    <h3
                      className="td-in mb-2 flex items-center gap-1.5 px-0.5 text-[13px] font-bold"
                      style={
                        {
                          color: LEVEL[list[0].level].color,
                          "--i": index++,
                        } as CSSProperties
                      }
                    >
                      {LEVEL[list[0].level].label}
                      <span className="font-semibold text-muted">{list.length}件</span>
                      <span className="ml-1 text-[11.5px] font-normal text-muted">{list[0].level === "warn" ? "データで制限・危険が見つかった所" : "データだけでは分からない所"}</span>
                    </h3>
                    <ul className="space-y-2">
                      {list.map((i) => {
                        const a = byId.get(linked.get(i.id) ?? "");
                        return <IssueCard key={i.id} issue={i} index={index++} action={a} actionDone={!!a && done.has(a.id)} onJump={jump} />;
                      })}
                    </ul>
                  </section>
                ) : null,
              )
            )}
          </div>
        )}
      </div>

      <p className="mt-4 text-[11.5px] leading-[1.6] text-muted">{TRIAGE_NOTE}</p>
      <button
        onClick={() => copy.copy(copyText())}
        className="press mt-2.5 flex h-[46px] w-full items-center justify-center gap-2 rounded-[14px] text-[14.5px] font-bold transition-colors duration-200"
        style={copy.done ? { background: STATUS.confirmed.bg, color: GREEN } : { background: "#eef2f7", color: NAVY }}
      >
        {copy.done ? <Check size={17} strokeWidth={3} /> : <Copy size={16} />}
        {copy.done ? "コピーしました" : "この一覧をコピー（確かめた結果つき）"}
      </button>
    </div>
  );
}

/** 上の紺の板：進みの輪・あと何件・要注意と要確認の数・読み込み中と読めなかったデータ */
function Summary({
  done,
  total,
  left,
  warns,
  checks,
  pending,
  failed,
  cheer,
}: {
  done: number;
  total: number;
  left: number;
  warns: number;
  checks: number;
  pending: string[];
  failed: string[];
  cheer: number;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[20px] px-4 py-3.5 text-white"
      style={{
        background: "linear-gradient(135deg, #1b4280 0%, #0f2f5f 58%, #0a2248 100%)",
      }}
    >
      {cheer > 0 && <span key={cheer} aria-hidden className="td-cheer" />}
      <div className="flex items-center gap-3.5">
        <Ring done={done} total={total} cheer={cheer} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-none text-white/70">次にやること</p>
          <p className="mt-1.5 text-[22px] font-bold leading-none" aria-live="polite">
            {total > 0 && !left ? (
              <span key="all" className="td-bump">
                すべて済み
              </span>
            ) : (
              <>
                あと
                <span key={left} className="td-bump mx-0.5 tabular-nums">
                  {left}
                </span>
                件<span className="ml-1 text-[13px] font-semibold text-white/60">／{total}件</span>
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] font-semibold">
            {(["warn", "check"] as const).map((l) => (
              <span key={l} className="inline-flex h-[24px] items-center gap-1.5 rounded-full bg-white/12 px-2.5">
                <span className="size-[7px] rounded-full" style={{ background: LEVEL[l].onNavy }} />
                {LEVEL[l].label} {l === "warn" ? warns : checks}件
              </span>
            ))}
          </div>
        </div>
      </div>
      {pending.length > 0 && (
        <p className="mt-3 flex items-center gap-2 text-[12px] leading-[1.5] text-white/80">
          <span className="td-spin size-3.5 shrink-0 rounded-full border-2 border-white/25 border-t-white" />
          {pending.join("・")}を確認しています。わかり次第ここに足します
        </p>
      )}
      {failed.length > 0 && (
        <p className="mt-2 text-[12px] leading-[1.5] text-[#ffc7b0]">
          読めなかったデータ：{failed.join("・")}
          （時間をおいて調べ直してください）
        </p>
      )}
    </div>
  );
}

/** 済んだやることの輪（開いたときに伸びる。全部済んだら緑と印） */
function Ring({ done, total, cheer }: { done: number; total: number; cheer: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const all = total > 0 && done === total;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const p = ready && total ? done / total : 0;
  return (
    <div className="relative size-[64px] shrink-0" role="img" aria-label={`次にやること ${total}件のうち ${done}件済み`}>
      {cheer > 0 && <span key={cheer} aria-hidden className="td-ring-pulse" />}
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="6" />
        <circle className="td-ring" cx="32" cy="32" r={r} fill="none" stroke={all ? "#4fd18b" : "#ffffff"} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[14px] font-bold tabular-nums">{all ? <Check size={24} strokeWidth={3} color="#4fd18b" /> : `${done}/${total}`}</span>
    </div>
  );
}

function SegButton({ on, onClick, count, label, warn }: { on: boolean; onClick: () => void; count: number; label: string; warn?: boolean }) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className="relative z-[1] flex min-w-0 items-center justify-center gap-1.5 px-1 text-[13.5px] font-semibold transition-colors duration-200"
      style={{ color: on ? NAVY : "#5f6f86" }}
    >
      <span className="truncate">{label}</span>
      <span
        className="flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums transition-colors duration-200"
        style={on ? { background: warn ? LEVEL.warn.color : NAVY, color: "#fff" } : { background: "#dfe6ef", color: "#5f6f86" }}
      >
        {count}
      </span>
    </button>
  );
}

/** 済んだ印の丸（押すと弾んで印が描かれる） */
function CheckButton({ on, pop, label, onClick }: { on: boolean; pop: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} aria-label={`${label}を${on ? "まだにする" : "済みにする"}`} className="press flex size-[52px] shrink-0 items-center justify-center">
      <span
        className={`td-box flex size-[26px] items-center justify-center rounded-full border-2 ${pop && on ? "td-pop" : ""}`}
        data-on={on ? "1" : "0"}
        style={{
          borderColor: on ? GREEN : "#b4bfcf",
          background: on ? GREEN : "#fff",
        }}
      >
        {pop && on && <span aria-hidden className="td-burst" />}
        <svg viewBox="0 0 24 24" className="size-[16px]" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path className="td-tick" d="M5 12.5l4.2 4.2L19 7" pathLength={1} />
        </svg>
      </span>
    </button>
  );
}

type RowProps = {
  item: TodoItem;
  index: number;
  done: boolean;
  open: boolean;
  gen: number;
  pop: boolean;
  flash: number;
  records: PropertyRecords;
  hints: Record<string, string>;
  pid: string;
  label: string;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onRecords: (r: PropertyRecords) => void;
  onSaved: (id: string) => void;
  /** 現地の写真（「現地で確かめる」の行だけ） */
  photos?: SitePhotosState;
};

function TodoRow({ item, index, done, open, gen, pop, flash, records, hints, pid, label, onToggle, onOpen, onRecords, onSaved, photos }: RowProps) {
  const a = item.action;
  const results = resultChips(a.id, records);
  const shown = item.issues.slice(0, 2);
  return (
    <li data-todo-row={a.id} className="td-in relative scroll-mt-[72px] border-t border-[#e3e9f1] first:border-t-0" style={{ "--i": index } as CSSProperties}>
      {flash > 0 && <span key={flash} aria-hidden className="td-flash pointer-events-none absolute inset-0" />}
      <div className="relative flex items-start">
        <CheckButton on={done} pop={pop} label={a.title} onClick={() => onToggle(a.id)} />
        <div className="min-w-0 flex-1 py-[13px] pr-3">
          <button onClick={() => onOpen(a.id)} aria-expanded={open} className="flex w-full items-start gap-2 text-left">
            <span className="min-w-0 flex-1">
              <span className={`td-strike text-[15px] font-semibold leading-[1.4] ${done ? "text-muted" : "text-ink"}`} data-on={done ? "1" : "0"}>
                {a.title}
              </span>
              <span className={`mt-0.5 block text-[12.5px] leading-[1.5] text-muted ${open ? "" : "line-clamp-2"}`}>{a.where}</span>
              {/* 問題の札・書いた結果の札（開いたら下の詳しい所に出すので畳む） */}
              <span className="expand" data-open={open ? "0" : "1"} aria-hidden={open}>
                <span>
                  <span className="block">
                    {item.special ? (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {shown.map((i) => {
                          const lv = LEVEL[i.level];
                          return (
                            <span key={i.id} className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-[3px] text-[11.5px] font-semibold leading-[1.3]" style={{ background: lv.bg, color: lv.color }}>
                              <lv.Icon size={11} strokeWidth={2.6} className="shrink-0" aria-hidden />
                              <span className="truncate">{i.title}</span>
                            </span>
                          );
                        })}
                        {item.issues.length > shown.length && <span className="inline-flex items-center rounded-full bg-[#e8edf4] px-2 py-[3px] text-[11.5px] font-semibold text-muted">ほか{item.issues.length - shown.length}件</span>}
                      </span>
                    ) : (
                      !done && !results.length && <span className="mt-1 block text-[11.5px] font-semibold text-[#8593a8]">いつもの確認</span>
                    )}
                    {(results.length > 0 || !!photos?.items.length) && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {!!photos?.items.length && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#e3ebf6] px-2 py-[3px] text-[11.5px] font-semibold leading-[1.3]" style={{ color: NAVY }}>
                            <Camera size={11} strokeWidth={2.6} className="shrink-0" />
                            写真 {photos.items.length}枚
                          </span>
                        )}
                        {results.map((r) => (
                          <span key={r} className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-[3px] text-[11.5px] font-semibold leading-[1.3]" style={{ background: STATUS.confirmed.bg, color: GREEN }}>
                            <Check size={11} strokeWidth={3.2} className="shrink-0" />
                            <span className="truncate">{r}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </span>
              </span>
            </span>
            <ChevronDown size={18} className="td-chev mt-[2px] shrink-0 text-[#8593a8]" data-open={open ? "1" : "0"} aria-hidden />
          </button>
          {a.phone && (
            <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} aria-label={`${a.where}に電話（${a.phone}）`} className="press mt-2 inline-flex h-[32px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold tabular-nums" style={{ background: "#e3ebf6", color: NAVY }}>
              <Phone size={14} strokeWidth={2.4} />
              {a.phone}
            </a>
          )}
        </div>
      </div>
      <Expand open={open}>
        <div>
          <div className="pb-3.5 pl-[52px] pr-3">
            <Details action={a} issues={item.issues} />
            <ResultEditor key={`${a.id}:${gen}`} action={a} done={done} records={records} hints={hints} pid={pid} label={label} onToggle={onToggle} onRecords={onRecords} onSaved={onSaved} />
            {photos && <SitePhotos photos={photos} />}
          </div>
        </div>
      </Expand>
    </li>
  );
}

/** 開いた行の中：確かめること・問題・やり方・持ち物・リンク */
function Details({ action: a, issues }: { action: Action; issues: Issue[] }) {
  return (
    <div className="text-[13px] leading-[1.6] text-[#2c3a52]">
      {issues.length > 0 && (
        <div className="mb-2.5 space-y-1.5">
          {issues.map((i) => {
            const lv = LEVEL[i.level];
            return (
              <p key={i.id} className="rounded-xl px-2.5 py-2 text-[12.5px] leading-[1.55]" style={{ background: lv.bg }}>
                <span className="flex items-start gap-1 font-semibold" style={{ color: lv.color }}>
                  <lv.Icon size={13} strokeWidth={2.6} className="mt-[3px] shrink-0" aria-hidden />
                  <span>
                    <span className="sr-only">{lv.label}：</span>
                    {i.title}
                  </span>
                </span>
                <span className="mt-0.5 block text-[#3d4a60]">{i.detail}</span>
              </p>
            );
          })}
        </div>
      )}
      <p className="text-[12px] font-semibold text-[#5f6f86]">確かめること</p>
      <ul className="mt-1 space-y-1">
        {a.what.map((w) => (
          <li key={w} className="relative pl-3.5">
            <span aria-hidden className="absolute left-0 top-[0.62em] size-[5px] rounded-full bg-[#9fb0c7]" />
            {w}
          </li>
        ))}
      </ul>
      {a.how && <p className="mt-2 text-[12.5px] leading-[1.6] text-muted">{a.how}</p>}
      {a.bring && <p className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">持ち物：{a.bring.join("・")}</p>}
      {a.links && a.links.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {a.links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="press inline-flex min-h-[34px] max-w-full items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold leading-[1.35] shadow-[0_1px_3px_rgba(20,45,85,0.1)]"
              style={{ color: NAVY }}
            >
              <span className="min-w-0">{l.label}</span>
              <ExternalLink size={13} className="shrink-0 opacity-60" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const keyOf = (f: ResultField) => `${f.topic}.${f.sub}`;

/** 確かめた結果を書く欄（答えの札・データで読んだ値・ほかの答え・方法）と「記録して済みにする」 */
function ResultEditor({
  action: a,
  done,
  records,
  hints,
  pid,
  label,
  onToggle,
  onRecords,
  onSaved,
}: {
  action: Action;
  done: boolean;
  records: PropertyRecords;
  hints: Record<string, string>;
  pid: string;
  label: string;
  onToggle: (id: string) => void;
  onRecords: (r: PropertyRecords) => void;
  onSaved: (id: string) => void;
}) {
  const fields = RESULT_FIELDS[a.id] ?? [];
  const rec = (f: ResultField) => records.items[f.topic]?.[f.sub];
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [keyOf(f), fieldValue(rec(f)?.note, f)])));
  const [free, setFree] = useState<Record<string, boolean>>({});
  const [method, setMethod] = useState<Method>(() => fields.map(rec).find((r) => r?.method)?.method ?? defaultMethod(a.id));
  const [state, setState] = useState<"idle" | "saved" | "fail">("idle");
  const any = fields.some((f) => (vals[keyOf(f)] ?? "").trim());
  const set = (f: ResultField, v: string) => {
    setVals((cur) => ({ ...cur, [keyOf(f)]: v }));
    if (state !== "idle") setState("idle");
  };

  const save = () => {
    let cur = records;
    let ok = true;
    let wrote = 0;
    for (const f of fields) {
      const v = withUnit(f, vals[keyOf(f)] ?? "");
      const prev = cur.items[f.topic]?.[f.sub];
      if (!v && !fieldValue(prev?.note, f)) continue;
      const note = mergeNote(prev?.note, f, v);
      const r = writeRecord(pid, label, f.topic, f.sub, {
        done: v ? true : !!prev?.done && !!note,
        method,
        source: prev?.source || a.where,
        note,
      });
      cur = r.records;
      ok &&= r.saved;
      wrote++;
    }
    if (wrote) onRecords(cur);
    if (!ok) {
      setState("fail");
      return;
    }
    if (!done) onToggle(a.id);
    setState("saved");
    onSaved(a.id);
  };

  const button = !done ? (any ? "記録して済みにする" : "済みにする") : any ? "記録を直す" : null;
  // 書く欄の無いやること（建物の確認など）は、済みにするボタンだけ
  if (!fields.length)
    return done && state !== "saved" ? null : (
      <button
        onClick={save}
        className={`press mt-3 flex h-[46px] w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold text-white transition-colors duration-200 ${state === "saved" ? "td-saved" : ""}`}
        style={{ background: state === "saved" ? GREEN : NAVY }}
      >
        <Check size={17} strokeWidth={3} />
        {state === "saved" ? "済みにしました" : "済みにする"}
      </button>
    );
  return (
    <div className="mt-3 rounded-[16px] bg-white p-3 shadow-[0_1px_4px_rgba(20,45,85,0.08)]">
      <p className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: NAVY }}>
        <PenLine size={14} strokeWidth={2.4} />
        確かめた結果
        <span className="text-[11.5px] font-normal text-muted">窓口・現地で聞いた答え</span>
      </p>
      {fields.map((f) => {
        const k = keyOf(f);
        const v = vals[k] ?? "";
        const hint = hints[k];
        const custom = !!v && v !== hint && !f.chips.includes(v);
        const input = !f.chips.length || !!f.unit || free[k] || custom;
        const numeric = !v || /^[\d.．０-９]+$/.test(v);
        return (
          <div key={k} className="mt-3">
            <p className="text-[12.5px] font-semibold text-[#41506a]">{f.label}</p>
            {(hint || f.chips.length > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {hint && (
                  <Answer on={v === hint} data onClick={() => set(f, v === hint ? "" : hint)}>
                    <span className="text-[10.5px] font-bold opacity-70">データ</span>
                    {hint}
                  </Answer>
                )}
                {f.chips.map((c) => (
                  <Answer key={c} on={v === c} onClick={() => set(f, v === c ? "" : c)}>
                    {c}
                  </Answer>
                ))}
                {f.chips.length > 0 && !input && (
                  <Answer on={false} onClick={() => setFree((cur) => ({ ...cur, [k]: true }))}>
                    <PenLine size={12} />
                    ほかの答え
                  </Answer>
                )}
              </div>
            )}
            {input && (
              <div className="relative mt-1.5">
                <input
                  value={v}
                  onChange={(e) => set(f, e.target.value)}
                  placeholder={f.placeholder ?? (f.chips.length ? "ほかの答え・メモ" : "窓口で聞いた答え")}
                  aria-label={`${f.label}（確かめた結果）`}
                  inputMode={f.unit && numeric ? "decimal" : undefined}
                  className="h-[42px] w-full rounded-xl border border-line bg-[#f8fafc] px-3 text-[16px] text-ink placeholder:text-muted/70"
                  style={f.unit && numeric ? { paddingRight: 34 } : undefined}
                />
                {f.unit && numeric && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-muted">{f.unit}</span>}
              </div>
            )}
          </div>
        );
      })}
      <p className="mt-3.5 text-[12.5px] font-semibold text-[#41506a]">確かめた方法</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {METHODS.map((x) => (
          <Answer key={x} on={method === x} onClick={() => setMethod(x)}>
            {x}
          </Answer>
        ))}
      </div>
      {button && (
        <button
          onClick={save}
          className={`press mt-3.5 flex h-[46px] w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold text-white transition-colors duration-200 ${state === "saved" ? "td-saved" : ""}`}
          style={{ background: state === "saved" ? GREEN : NAVY }}
        >
          {state === "saved" ? (
            <>
              <Check size={18} strokeWidth={3} />
              {any ? "記録しました" : "済みにしました"}
            </>
          ) : (
            <>
              {any ? <PenLine size={16} /> : <Check size={17} strokeWidth={3} />}
              {button}
            </>
          )}
        </button>
      )}
      {state === "fail" && <p className="mt-1.5 text-[12px] leading-[1.6] text-[#c2561f]">保存できませんでした。端末の空き容量と、プライベートブラウズでないことを確かめてください。</p>}
      <p className="mt-2 text-[11.5px] leading-[1.55] text-muted">書いた結果は「確認の記録」に入り、調査メモ・重説の下書き・結果の文面に載ります（この端末の中だけ）。</p>
    </div>
  );
}

function Answer({ on, data, onClick, children }: { on: boolean; data?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="press inline-flex min-h-[34px] max-w-full items-center gap-1 rounded-full px-3 py-[6px] text-left text-[13px] font-semibold leading-[1.35] transition-colors duration-150"
      style={
        on
          ? { background: NAVY, color: "#fff" }
          : data
            ? {
                background: "#fff",
                color: NAVY,
                boxShadow: "inset 0 0 0 1.5px rgba(19,54,100,0.32)",
              }
            : { background: "#eef2f7", color: "#26324a" }
      }
    >
      {children}
    </button>
  );
}

/** 問題になりそうな所の1つ（左の色の帯・詳しく・確認先・確かめるやることへ） */
function IssueCard({ issue: i, index, action, actionDone, onJump }: { issue: Issue; index: number; action?: Action; actionDone: boolean; onJump: (id: string) => void }) {
  const lv = LEVEL[i.level];
  return (
    <li className="td-in relative overflow-hidden rounded-[16px] bg-[#f4f7fb] py-3 pl-4 pr-3" style={{ "--i": index } as CSSProperties}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-[4px]" style={{ background: lv.color }} />
      <div className="flex items-start gap-2">
        <lv.Icon size={16} strokeWidth={2.4} color={lv.color} className="mt-[3px] shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold leading-[1.45] text-ink">{i.title}</p>
          <p className="mt-0.5 text-[13px] leading-[1.6] text-[#3d4a60]">{i.detail}</p>
          {i.confirm && <p className="mt-1 text-[12px] leading-[1.5] text-muted">確認先：{i.confirm}</p>}
          {action && (
            <button
              onClick={() => onJump(action.id)}
              className="press mt-2 inline-flex min-h-[34px] max-w-full items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-left text-[12.5px] font-semibold leading-[1.35] shadow-[0_1px_3px_rgba(20,45,85,0.1)]"
              style={{ color: actionDone ? GREEN : NAVY }}
            >
              {actionDone && <Check size={13} strokeWidth={3} className="shrink-0" />}
              <span className="min-w-0">{action.title}</span>
              {actionDone ? <span className="shrink-0 text-[11.5px]">済み</span> : <ArrowRight size={14} className="shrink-0" />}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
