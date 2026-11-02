// スマホの時刻・電池の帯（ステータスバー）の色。
// ホーム画面に追加したアプリ（iPhone）は、帯の字が白（app/layout.tsx の apple-mobile-web-app-status-bar-style が black-translucent）で、
// 帯の後ろはページの上の色（body の背景色。components/app/mobile-app.tsx が入れる）。ページの上の色が明るいと白い字が読めないので、
// 読める濃さ（白い字との明るさの比が 3 以上。大きな字の目安）まで紺に寄せて暗くする。

/** 寄せる先の紺（下のメニューの色に近い） */
const NAVY: [number, number, number] = [11, 20, 36];

/** "#rrggbb" か "#rgb" を [r, g, b] に。読めなければ null */
function parse(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const toHex = (c: [number, number, number]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** 明るさ（WCAG の相対輝度。0〜1） */
function luminance(c: [number, number, number]): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 白い字との明るさの比（1〜21） */
export function contrastWithWhite(hex: string): number {
  const c = parse(hex);
  return c ? 1.05 / (luminance(c) + 0.05) : 21;
}

/**
 * 白い字の帯に敷く色：ページの上の色のまま（白い字が読めるとき）か、読める濃さまで紺に寄せた色。
 * 読めない色の書き方（hex 以外）は、そのまま返す
 */
export function statusBarColor(hex: string, minContrast = 3): string {
  const c = parse(hex);
  if (!c || contrastWithWhite(hex) >= minContrast) return hex;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const m = c.map((v, i) => v * (1 - t) + NAVY[i] * t) as [number, number, number];
    if (1.05 / (luminance(m) + 0.05) >= minContrast) return toHex(m);
  }
  return toHex(NAVY);
}
