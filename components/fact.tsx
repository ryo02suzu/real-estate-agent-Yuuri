"use client";

// スマホの結果の要点の1マス（都市計画・災害リスク・地番・最寄り駅・地価・学区）。名前の行と値の行の2段にして2列に並べ、
// 形と大きさをそろえる（チップの幅がまちまちで、ごちゃごちゃして見えていた）。背の低い画面・入りきらないとき（short。
// app/globals.css）は名前の行を外し（読み上げには残す）、アイコン・値・矢印の1段にする（グリッドの位置を入れ替えるだけ）
import { ChevronRightIcon, ExternalIcon } from "./icons";

const TILE =
  "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1 rounded-xl border border-line bg-[#fcfaf6] px-2 py-1 text-left text-ink active:bg-mint/60";

/** 値の行。チップが入りきらなければ折り返して隠れる（途中で切れない）。全部は押して開くシートで見る */
const VALUE =
  "col-span-3 col-start-1 row-start-2 mt-0.5 flex h-5 min-w-0 flex-wrap items-center gap-x-1 overflow-hidden text-[14px] font-semibold leading-5 short:col-span-1 short:col-start-2 short:row-start-1 short:mt-0 short:text-[12.5px]";

export function Fact({
  icon,
  label,
  value,
  onClick,
  disabled,
  href,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  /** 値（読み込み中は「確認中…」など） */
  value: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** 外のサイトを開く（市町村の地番図など） */
  href?: string;
  className?: string;
}) {
  const inner = (
    <>
      <span className="col-start-1 row-start-1 flex text-brand-light">{icon}</span>
      <span className="col-start-2 row-start-1 truncate text-[11px] leading-[1.35] text-muted short:sr-only">{label}</span>
      {href ? (
        <ExternalIcon className="col-start-3 row-start-1 h-3 w-3 text-muted" />
      ) : (
        <ChevronRightIcon className={`col-start-3 row-start-1 h-3.5 w-3.5 text-muted ${disabled ? "invisible" : ""}`} />
      )}
      <span className={`${VALUE} ${disabled ? "font-normal text-muted" : ""}`}>{value}</span>
    </>
  );
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" title={label} className={`${TILE} ${className}`}>
        {inner}
      </a>
    );
  return (
    <button onClick={onClick} disabled={disabled} className={`${TILE} ${className}`}>
      {inner}
    </button>
  );
}
