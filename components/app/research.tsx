"use client";

// 調査の状況のカード（基本情報タブの一番上）と、状態の札、その場で1段広がる部品、シートの上の「確認を記録」の入口。
// 6つの項目（道路・都市計画・建築の注意点・ハザード・周辺環境・地番・土地）に、取得済み・公式図を確認・確認済み・一部確認・
// 未確認・読み込めずの札を付ける（色は components/app/tokens.ts の STATUS。警告の色と混ぜない）。項目を押すと確認の記録の画面
import { Building2, CheckCircle2, ChevronRight, Circle, ExternalLink, LandPlot, LoaderCircle, Route, RotateCw, Store, TriangleAlert, Waves, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { RecordTopic } from "@/lib/records";
import { CARD, Head, TEXT } from "./r-ui";
import type { TopicStatus } from "./status";
import { STATUS, type StatusKey } from "./tokens";

/** 半分だけ塗った丸（一部確認済み） */
function HalfCircle({ size, color }: { size: number; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill={color} />
    </svg>
  );
}

/** 状態の印（自動取得済み ✓、公式図を確認 ↗、確認済み ✓、一部確認 ◐、未確認 ○、読み込めず ↻、確認中は回る） */
export function StatusIcon({ status, size = 14 }: { status: StatusKey | "loading"; size?: number }) {
  if (status === "loading") return <LoaderCircle size={size} strokeWidth={2} absoluteStrokeWidth className="animate-spin" color="#6b7890" />;
  const c = STATUS[status].color;
  switch (status) {
    case "auto":
    case "confirmed":
      return <CheckCircle2 size={size} strokeWidth={2} absoluteStrokeWidth color={c} />;
    case "official":
      return <ExternalLink size={size} strokeWidth={2} absoluteStrokeWidth color={c} />;
    case "partial":
      return <HalfCircle size={size} color={c} />;
    case "failed":
      return <RotateCw size={size} strokeWidth={2} absoluteStrokeWidth color={c} />;
    default:
      return <Circle size={size} strokeWidth={2} absoluteStrokeWidth color={c} />;
  }
}

/** 状態の札（丸い小さなピル） */
export function StatusChip({ status, children, size = 11.5 }: { status: StatusKey | "loading"; children: ReactNode; size?: number }) {
  const c = status === "loading" ? { color: "#6b7890", bg: "#eef1f5" } : STATUS[status];
  return (
    <span className="inline-flex max-w-full shrink-0 items-center gap-[4px] whitespace-nowrap rounded-full px-[7px] font-bold leading-none" style={{ height: 22, fontSize: size, color: c.color, background: c.bg }}>
      <StatusIcon status={status} size={12} />
      <span className="truncate">{children}</span>
    </span>
  );
}

const TOPIC_ICON: Record<RecordTopic, LucideIcon> = { road: Route, zoning: Building2, law: TriangleAlert, hazard: Waves, around: Store, parcel: LandPlot };

/** カードの札は短く（「確認済み 10/24」→「確認済み」、「一部確認 1/4」→「一部 1/4」）。全文は確認の記録の画面に */
const shortChip = (s: TopicStatus) => (s.status === "partial" ? s.chip.replace("一部確認", "一部") : s.chip.split(" ")[0]);

/** 調査の状況：6つの項目の札（3列×2段）。押すと確認の記録の画面（取れた情報・次にやること・確認事項） */
export function ResearchCard({ statuses, summary, onTopic }: { statuses: TopicStatus[]; summary: string; onTopic: (t: RecordTopic) => void }) {
  return (
    <section>
      <Head title="調査の状況" note={summary} className="-mt-[4px]" />
      <div className="grid grid-cols-3 gap-[6px]">
        {statuses.map((s) => {
          const Icon = TOPIC_ICON[s.topic];
          return (
            <button key={s.topic} onClick={() => onTopic(s.topic)} aria-label={`${s.label}：${s.chip}。確認を記録する`} className={`press-soft flex min-w-0 flex-col items-start px-[9px] pb-[8px] pt-[8px] text-left ${CARD}`} style={{ minHeight: 58 }}>
              <span className="flex w-full items-center gap-[5px]">
                <Icon size={14} strokeWidth={1.9} absoluteStrokeWidth color="#1d3264" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate font-semibold leading-none" style={{ fontSize: 12, color: TEXT }}>
                  {s.label}
                </span>
              </span>
              <span className="mt-[7px] flex w-full">
                <StatusChip status={s.status} size={10.5}>
                  {shortChip(s)}
                </StatusChip>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * その場で1段広がる（高さが伸び、中身は少し遅れて現れる。app/globals.css の .expand）。中身は1つの要素で包む。
 * 内容が多いものはシートへ
 */
export function Expand({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="expand" data-open={open ? "1" : "0"} aria-hidden={!open}>
      {children}
    </div>
  );
}

/** 詳しい画面（シート）の上に出す「この項目の確認を記録」の入口（シートの中なので端末の字の大きさ） */
export function RecordEntry({ status, onClick }: { status: TopicStatus; onClick: () => void }) {
  return (
    <button onClick={onClick} className="press mb-3 flex h-[48px] w-full items-center gap-2 rounded-2xl bg-mint px-3 text-left">
      <StatusChip status={status.status}>{status.chip}</StatusChip>
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{status.label}の確認を記録</span>
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </button>
  );
}
