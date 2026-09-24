// ホーム画面の飾り絵（SVG で描いたもの。写真素材は使わない）

/** 斜めから見た街区とゴールドのピン */
export function MapIllustration({ className }: { className?: string }) {
  const blocks: [number, number, number, number][] = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) blocks.push([c * 34 + (r % 2) * 6, r * 30, 26 + ((r * 7 + c) % 3) * 3, 22]);
  return (
    <svg viewBox="0 0 220 180" className={className} aria-hidden>
      <defs>
        <linearGradient id="mi-fade" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="mi-mask">
          <rect width="220" height="180" fill="url(#mi-fade)" />
        </mask>
        <linearGradient id="mi-pin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3c79a" />
          <stop offset="1" stopColor="#8a6632" />
        </linearGradient>
        <radialGradient id="mi-glow">
          <stop offset="0" stopColor="#f6e6c6" stopOpacity="0.9" />
          <stop offset="1" stopColor="#f6e6c6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g mask="url(#mi-mask)">
        <g transform="translate(40 20) skewX(-28) scale(1 .8)">
          <rect x="-10" y="-10" width="260" height="230" fill="#f3efe8" />
          {blocks.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill={i % 5 === 0 ? "#e6ece4" : "#fdfcfa"} stroke="#e4ddd1" strokeWidth=".8" />
          ))}
          <path d="M-10 96 C60 90 120 110 250 70" stroke="#d9bd8c" strokeWidth="3" fill="none" />
          <path d="M100 -10 C104 60 96 140 118 230" stroke="#e8d6b4" strokeWidth="2" fill="none" />
        </g>
        <circle cx="140" cy="92" r="46" fill="url(#mi-glow)" />
      </g>
      <g transform="translate(128 58)">
        <ellipse cx="12" cy="40" rx="7" ry="2.2" fill="#8a6632" opacity=".25" />
        <path d="M12 0a12 12 0 0 0-12 12c0 9 12 27 12 27s12-18 12-27A12 12 0 0 0 12 0Z" fill="url(#mi-pin)" />
        <circle cx="12" cy="12" r="4.2" fill="#fff" />
      </g>
    </svg>
  );
}

/** 画面下の街並みと橋（淡いシルエット） */
export function SkylineIllustration({ className }: { className?: string }) {
  // [x, 幅, 高さ]
  const towers: [number, number, number][] = [
    [150, 10, 38], [162, 8, 52], [172, 12, 44], [186, 7, 70], [195, 12, 58], [209, 9, 96], [220, 14, 62],
    [236, 8, 80], [246, 13, 110], [261, 10, 74], [273, 8, 90], [283, 13, 66], [298, 9, 84], [309, 12, 52], [323, 10, 70], [335, 12, 46],
  ];
  return (
    <svg viewBox="0 0 360 150" preserveAspectRatio="xMaxYMax meet" className={className} aria-hidden>
      <defs>
        <linearGradient id="sk-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9ced6" stopOpacity=".85" />
          <stop offset="1" stopColor="#eef0f2" stopOpacity=".35" />
        </linearGradient>
        <linearGradient id="sk-fadeL" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".45" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="sk-mask">
          <rect width="360" height="150" fill="url(#sk-fadeL)" />
        </mask>
      </defs>
      <g mask="url(#sk-mask)">
        {towers.map(([x, w, h], i) => (
          <g key={i}>
            <rect x={x} y={118 - h} width={w} height={h} fill="url(#sk-b)" />
            {h > 85 && <path d={`M${x + w / 2} ${118 - h - 12}v12`} stroke="#c9ced6" strokeWidth="1" />}
          </g>
        ))}
        {/* 橋 */}
        <path d="M60 116 Q150 96 250 114" stroke="#d4d8de" strokeWidth="2" fill="none" />
        <path d="M60 118 H360" stroke="#d4d8de" strokeWidth="1.5" />
        {[80, 100, 120, 140, 160, 180, 200, 220].map((x) => (
          <path key={x} d={`M${x} ${116 - Math.max(0, 14 - Math.abs(x - 150) / 7)}V118`} stroke="#dde0e5" strokeWidth=".8" />
        ))}
        {/* 水面 */}
        <rect x="0" y="118" width="360" height="32" fill="#f1efeb" />
        {[124, 130, 137, 145].map((y, i) => (
          <path key={y} d={`M${150 + i * 10} ${y} H${340 - i * 8}`} stroke="#e2e5e9" strokeWidth=".8" />
        ))}
      </g>
    </svg>
  );
}
