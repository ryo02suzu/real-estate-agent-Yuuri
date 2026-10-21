"use client";

// シートの中のタブ（「謄本・公図用の地番」「建物」、「最寄り駅」「周辺施設」など）。押したタブの中身だけを出す
import { useState } from "react";

export function Tabs({ names, panels }: { names: string[]; panels: React.ReactNode[] }) {
  const [tab, setTab] = useState(0);
  return (
    <div>
      <div role="tablist" className="mb-2 flex gap-1.5 densest:mb-1">
        {names.map((n, i) => (
          <button
            key={n}
            role="tab"
            aria-selected={i === tab}
            onClick={() => setTab(i)}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] dense:py-1 densest:py-0.5 ${i === tab ? "border-brand bg-brand text-white" : "border-line text-ink"}`}
          >
            {n}
          </button>
        ))}
      </div>
      {panels[tab]}
    </div>
  );
}
