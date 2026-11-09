"use client";

// シート・カードの下の注意書きと出典。大事な一言（lead）と出典の名前（source）だけを出し、全文（children）は「くわしく」を
// 押すと開く。注意書きが中身より長くなって、スマホで大事な値が小さく詰め込まれていたのを、たたんで読みやすくする
// （出典は名前が見えたまま、開けば全文。ライセンスの出典表示のため）
import { useState } from "react";
import { ChevronRightIcon, InfoIcon } from "./icons";

export function Notes({ lead, source, children }: { lead: React.ReactNode; source?: React.ReactNode; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const more = children && (
    // 文字は小さいので、押せる範囲を上下左右に広げる（見た目は変えない）
    <button
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="mui-hit relative ml-2 inline-flex items-center gap-0.5 whitespace-nowrap text-[11.5px] text-brand after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-['']"
    >
      くわしく
      <ChevronRightIcon className={`h-3 w-3 transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
    </button>
  );
  return (
    <div className="mt-3 flex items-start gap-1.5 text-[12px] leading-[1.6] text-muted dense:mt-2 densest:mt-1.5 densest:leading-[1.45]">
      <InfoIcon className="mt-[3px] h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p>
          {lead}
          {!source && more}
        </p>
        {source && (
          <p className="text-[11px]">
            出典：{source}
            {more}
          </p>
        )}
        {open && <div className="mt-1.5 space-y-1 border-t border-line/70 pt-1.5 text-[11.5px] leading-[1.65]">{children}</div>}
      </div>
    </div>
  );
}
