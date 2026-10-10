"use client";

// 道路種別の地図の「色の見方」（凡例を文字にしたもの）。地図ごとに色の付け方が違うので、地図を開く前・開いたあとに見比べられるようにする
import { useState } from "react";
import type { LegendEntry } from "@/lib/roadmap/legends";
import { InfoIcon } from "./icons";
import { Sheet } from "./sheet";

/** 線の色の見本（地図の道路の線のように横長） */
function Line({ color }: { color: string }) {
  return (
    <span
      className="mt-[7px] inline-block h-[5px] w-5 shrink-0 rounded-full border border-black/10 [@media(max-height:720px)]:mt-[6px]"
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
                "py-1.5 text-[12.5px] leading-[1.5] [@media(max-height:720px)]:py-1 [@media(max-height:720px)]:text-[12px] [@media(max-height:720px)]:leading-[1.4]"
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
      <button onClick={() => setOpen(true)} className="ml-1 whitespace-nowrap font-semibold text-brand underline underline-offset-2">
        色の見方
      </button>
      <Sheet title="地図の色の見方" open={open} onClose={() => setOpen(false)}>
        <p className="mb-1 text-[12px] font-semibold text-muted">{title}</p>
        <LegendList legend={legend} />
        <p className="mt-3 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted">
          <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          {NOTE}
        </p>
      </Sheet>
    </>
  );
}

/** PC：地図ボタンの下に出す凡例 */
export function LegendBlock({ legend }: { legend: LegendEntry[] }) {
  return (
    <div className="mt-1.5 rounded-xl border border-line/80 px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold text-muted">地図の色の見方</p>
      <LegendList legend={legend} compact />
      <p className="mt-1.5 text-[10px] leading-[1.6] text-muted">{NOTE}</p>
    </div>
  );
}
