"use client";

// 道路種別の地図の「色の見方」（凡例を文字にしたもの）。地図ごとに色の付け方が違うので、地図を開く前・開いたあとに見比べられるようにする
import { useState } from "react";
import type { LegendEntry } from "@/lib/roadmap/legends";
import { ChevronRightIcon, InfoIcon } from "./icons";
import { Sheet } from "./sheet";

/** 線の色の見本（地図の道路の線のように横長） */
function Line({ color }: { color: string }) {
  return (
    <span
      className="mt-[7px] inline-block h-[5px] w-5 shrink-0 rounded-full border border-black/10 short:mt-[6px]"
      style={{ background: color }}
    />
  );
}

/** 凡例の一覧（PC は地図ボタンの下にそのまま、スマホは下から出るシートの中） */
export function LegendList({ legend, compact }: { legend: LegendEntry[]; compact?: boolean }) {
  return (
    <ul className={compact ? "grid grid-cols-2 gap-x-3 gap-y-0.5" : "divide-y divide-line/70"}>
      {legend.map((e) => (
        <li
          key={e.label}
          className={`flex gap-1.5 ${
            compact
              ? "text-[11px] leading-[1.55]"
              : // 背の低い画面では、項目の多い凡例（豊島区など）もシートに収まるよう詰める
                "py-1.5 text-[12.5px] leading-[1.5] short:py-1 short:text-[12px] short:leading-[1.4]"
          } text-ink`}
        >
          <Line color={e.color} />
          <span className="min-w-0">{e.label}</span>
        </li>
      ))}
    </ul>
  );
}

const NOTE = "地図の凡例を文字にしたものです。地図の表示や凡例が変わっていることがあるので、最終確認は地図と窓口で行ってください。";

/** スマホ：地図ボタンの操作メモの後ろに置く「色の見方」。押すと凡例が下から出る */
export function LegendButton({ legend, title }: { legend: LegendEntry[]; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* 文字は小さいので、押せる範囲を上下左右に広げる（見た目は変えない） */}
      <button
        onClick={() => setOpen(true)}
        className="relative ml-1 whitespace-nowrap font-semibold text-brand underline underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-['']"
      >
        色の見方
      </button>
      <Sheet title="地図の色の見方" open={open} onClose={() => setOpen(false)}>
        <p className="mb-1 text-[13px] font-semibold text-muted">{title}</p>
        <LegendList legend={legend} />
        <p className="mt-3 flex gap-1.5 text-[12px] leading-[1.6] text-muted">
          <InfoIcon className="mt-[3px] h-3.5 w-3.5 shrink-0" />
          {NOTE}
        </p>
      </Sheet>
    </>
  );
}

/** PC：地図ボタンの下の凡例。押すと開く（いつも出しておくと、パネルの半分ほどを占めるので） */
export function LegendBlock({ legend }: { legend: LegendEntry[] }) {
  return (
    <details className="group mt-1.5 rounded-xl border border-line/80 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-semibold text-brand [&::-webkit-details-marker]:hidden">
        地図の色の見方（{legend.length}色）
        <ChevronRightIcon className="h-3.5 w-3.5 rotate-90 transition-transform group-open:-rotate-90" />
      </summary>
      <div className="mt-1.5">
        <LegendList legend={legend} compact />
        <p className="mt-1.5 text-[11px] leading-[1.6] text-muted">{NOTE}</p>
      </div>
    </details>
  );
}
