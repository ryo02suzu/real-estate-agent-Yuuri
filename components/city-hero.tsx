// ホームの上に敷く街並み（写真が届くまでの仮の絵。明るい空と、遠近3層のビルのシルエット）。
// 左側は白くぼかして、見出しと検索を重ねる。写真にするときは、この絵の代わりに <img> を置く。
// 枠いっぱいに伸ばして描く（preserveAspectRatio="none"。四角いビルなので縦に伸びても形は崩れない）

type Tower = [x: number, w: number, h: number];

const FAR: Tower[] = [
  [168, 20, 120], [192, 16, 160], [212, 24, 100], [240, 18, 190], [262, 28, 130], [294, 16, 215], [314, 22, 150], [340, 18, 175], [362, 28, 125], [394, 22, 155],
];
const MID: Tower[] = [[200, 22, 90], [226, 28, 150], [258, 20, 110], [282, 24, 205], [310, 32, 125], [346, 22, 160], [372, 18, 105], [394, 26, 135]];
const NEAR: Tower[] = [[236, 28, 80], [270, 38, 160], [314, 28, 118], [348, 40, 98], [392, 28, 140]];

const W = 400;
const H = 340;
const BASE = 322;

export function CityHero({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="ch-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f9fbfe" />
          <stop offset="0.55" stopColor="#e7eef7" />
          <stop offset="1" stopColor="#d3e0ee" />
        </linearGradient>
        <linearGradient id="ch-fade" x1="0" x2="1">
          <stop offset="0" stopColor="#f6f9fc" stopOpacity="1" />
          <stop offset="0.36" stopColor="#f6f9fc" stopOpacity="0.92" />
          <stop offset="0.6" stopColor="#f6f9fc" stopOpacity="0.3" />
          <stop offset="0.85" stopColor="#f6f9fc" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ch-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f9fc" stopOpacity="0" />
          <stop offset="1" stopColor="#f6f9fc" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="ch-near" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6f87a7" />
          <stop offset="1" stopColor="#3f587a" />
        </linearGradient>
        <pattern id="ch-win" width="7" height="9" patternUnits="userSpaceOnUse">
          <rect x="1.5" y="2" width="3" height="4" fill="#ffffff" opacity="0.3" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#ch-sky)" />
      {/* 遠く：薄いシルエット */}
      {FAR.map(([x, w, h]) => (
        <rect key={`f${x}`} x={x} y={BASE - h} width={w} height={h} fill="#a9bbd1" opacity="0.55" />
      ))}
      {/* 中ほど */}
      {MID.map(([x, w, h]) => (
        <g key={`m${x}`}>
          <rect x={x} y={BASE - h} width={w} height={h} fill="#8099b8" opacity="0.9" />
          <rect x={x} y={BASE - h} width={w} height={h} fill="url(#ch-win)" opacity="0.6" />
        </g>
      ))}
      {/* 手前：窓の明かり入り */}
      {NEAR.map(([x, w, h]) => (
        <g key={`n${x}`}>
          <rect x={x} y={BASE - h} width={w} height={h} fill="url(#ch-near)" />
          <rect x={x} y={BASE - h} width={w} height={h} fill="url(#ch-win)" />
          <rect x={x} y={BASE - h} width={w} height="2" fill="#ffffff" opacity="0.5" />
        </g>
      ))}
      {/* 足元のもや */}
      <rect x="0" y="250" width={W} height={H - 250} fill="url(#ch-haze)" />
      {/* 左は白くぼかして文字を置く */}
      <rect width={W} height={H} fill="url(#ch-fade)" />
    </svg>
  );
}

/** 「MICHILUの強み」のカードの右に敷く、色付きの道路の地図の絵（道路種別の地図のイメージ） */
export function RoadMapArt({ className }: { className?: string }) {
  const blocks: [number, number, number, number][] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) blocks.push([c * 36 + (r % 2) * 10 - 10, r * 30 - 6, 28, 22]);
  return (
    <svg viewBox="0 0 220 140" preserveAspectRatio="xMaxYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="rm-fade" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="rm-mask">
          <rect width="220" height="140" fill="url(#rm-fade)" />
        </mask>
      </defs>
      <g mask="url(#rm-mask)">
        {blocks.map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill="#ffffff" opacity={i % 4 === 0 ? 0.16 : 0.1} />
        ))}
        <path d="M-10 46H230" stroke="#35c46a" strokeWidth="4" strokeLinecap="round" />
        <path d="M-10 106H230" stroke="#35c46a" strokeWidth="4" strokeLinecap="round" />
        <path d="M60 -10V150" stroke="#f2c230" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M132 -10V150" stroke="#35c46a" strokeWidth="4" strokeLinecap="round" />
        <path d="M96 46V106" stroke="#f29a30" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M168 46V106" stroke="#f2c230" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M132 76H200" stroke="#e8463b" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M-10 76H60" stroke="#f29a30" strokeWidth="3.5" strokeLinecap="round" />
      </g>
      {/* 物件のピン */}
      <g transform="translate(118 52)">
        <ellipse cx="14" cy="38" rx="9" ry="2.6" fill="#000" opacity="0.25" />
        <path d="M14 0a14 14 0 0 0-14 14c0 10 14 24 14 24s14-14 14-24A14 14 0 0 0 14 0Z" fill="#e8463b" />
        <circle cx="14" cy="14" r="5" fill="#fff" />
      </g>
    </svg>
  );
}
