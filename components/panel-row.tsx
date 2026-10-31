"use client";

// スマホの結果パネルの「調べた項目」の行で、読み込めなかったときの1行。行は消さず、理由と「再読み込み」を出す（押すと読み込み直す）。
// 通信と関係なく行ける公式の確認先（路線価の地図・わがまちハザードマップ・地番図・登記情報提供サービスなど）や、別に読めた中身
// （周辺施設・建物）があれば、行の下に並べて、失敗していてもたどり着けるようにする（children）。
// データが無い（近くに地点が無い・学区のデータが無い）ときは、各項目の行が理由と確認先を出す（components/school-card.tsx など）。
// PC の要点の行・カードは使わない（従来どおり）。
import { ExternalIcon, RetryIcon } from "./icons";

export function RetryRow({ label, icon, onRetry, children }: { label: string; icon?: React.ReactNode; onRetry: () => void; children?: React.ReactNode }) {
  const row = (
    <button type="button" onClick={onRetry} aria-label={`${label}：読み込めませんでした。押すと読み込み直します`} className="mui-row-btn">
      {icon}
      <span className="mui-row-label">{label}</span>
      {/* 狭い画面・文字の拡大でも切らずに折り返す */}
      <span className="min-w-0 flex-1 text-[var(--mui-warn-ink)]">読み込めませんでした</span>
      <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[var(--mui-primary)]">
        <RetryIcon className="h-4 w-4" />
        再読み込み
      </span>
    </button>
  );
  if (!children) return row;
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {row}
      <p className="flex flex-wrap items-center gap-x-3 px-2 text-[13px] text-[var(--mui-muted)]">
        <span className="shrink-0">確認先：</span>
        {children}
      </p>
    </div>
  );
}

/** 失敗した行の下の確認先（外のサイト）。押せる高さは 44px（隣の行と重ならないよう、広げる面は使わない） */
export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mui-row-link inline-flex min-h-11 items-center gap-1 font-semibold text-[var(--mui-primary)]">
      <ExternalIcon className="h-3 w-3 shrink-0" />
      {children}
    </a>
  );
}

/** 失敗した行の下の、別に読めた中身を開くボタン（周辺施設・建物など）。押せる高さは 44px */
export function RowAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mui-row-link inline-flex min-h-11 items-center font-semibold text-[var(--mui-primary)] underline underline-offset-2">
      {children}
    </button>
  );
}
