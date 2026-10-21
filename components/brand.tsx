// 新しいロゴ（紺の「M」のマークと MICHILU の文字）。マークは本物のデータが届くまでの仮の絵
// （ChatGPT の案に合わせて描いたもの。public/ に正式なマークを置いたら差し替える）

/** 「M」のマーク。左が濃い紺、右がやや明るい紺で、2本の筆で描いたような形 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 56" className={className} aria-hidden>
      <defs>
        <linearGradient id="lm-l" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#163a6e" />
          <stop offset="1" stopColor="#0a2248" />
        </linearGradient>
        <linearGradient id="lm-r" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d8bb3" />
          <stop offset="1" stopColor="#2f5283" />
        </linearGradient>
        {/* 下の端を斜めに切る */}
        <clipPath id="lm-cut">
          <path d="M0 0H72V44L0 56Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#lm-cut)" fill="none" strokeWidth="11" strokeLinejoin="miter" strokeMiterlimit="8">
        <path d="M8 60V6L37 36" stroke="url(#lm-l)" />
        <path d="M33 36L64 6V60" stroke="url(#lm-r)" />
      </g>
    </svg>
  );
}

/** ロゴの横組み（マーク・MICHILU・一言）。ホームの左上 */
export function BrandLockup({ tagline = true }: { tagline?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="h-8 w-[41px] shrink-0" />
      <div className="min-w-0">
        <span className="font-latin block text-[22px] font-medium leading-none tracking-[0.14em] text-navy-deep" aria-label="MICHILU">
          MICHILU
        </span>
        {/* 一言。狭い画面（iPhone SE など）では出さない（折り返すと崩れる） */}
        {tagline && <span className="mt-1.5 block whitespace-nowrap text-[9px] leading-none tracking-[0.1em] text-steel [@media(max-width:385px)]:hidden">不動産の現場に、すぐ使える情報を。</span>}
      </div>
    </div>
  );
}
