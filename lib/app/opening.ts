// PC のオープニング映像（PC の画面だけ。スマホでは出さない）の決まりごと。映像は scripts/pc-opening3 で Blender から作る。
// 構成「梓川を駆け抜ける」（約21秒・音なし。第3版）：10 月下旬の朝、大正池のすぐ上流から梓川の上 7〜10m を上流へ駆け抜ける
// （両岸に金のカラマツと暗い緑のモミ、川原の石、朝もや）→ 森の上へ上がりながら穂高へ向きを変える → 穂高へ近づき、カメラを
// 上げて穂高の上の空へ → ロゴ（出し方「朝日の光から生まれる」）→ 白い雲の中へ → PC のホーム。
// ロゴは映像に入れず、アプリが映像の上に描く（どの画面の大きさでもくっきり）。映像の時刻に合わせて動かすので、読み込みで
// 映像が止まればロゴも止まる。ここには、いつ流すか・ロゴの部品をいつどう見せるか（映像の秒の関数）を置く（テストできるように）。
import logo from "./opening-logo.json";

/** 2560×1440 の映像を出す画面（画面の横の画素が約 2000 を超える：細かい画面の 1200px 以上か、横 2100px 以上）。ほかは 1920×1080 */
export const OPENING_BIG_SCREEN = "(min-width: 1200px) and (min-resolution: 1.5dppx), (min-width: 2100px)";

export const OPENING = {
  /** 映像の長さ（秒）。最後のコマは END_COLOR の白い雲 */
  duration: 21.1,
  /** ロゴを置く位置の基準の大きさ（映像は 2560×1440。縦横の比は同じなので、1920×1080 に縮めた画素で決める） */
  frame: { w: 1920, h: 1080 },
  /** ロゴの真ん中と幅（上の大きさの画素）。穂高の稜線の上の空（文字ができる 18〜19 秒ごろ、ロゴの下の稜線は y≈300〜315） */
  logo: { cx: 960, cy: 180, w: 600 },
  /** 光の点がまたたく秒（峰のすぐ上の空で）。カメラが上を向いて稜線が下がっていくのに合わせ、円弧・山・文字が稜線の上にできる */
  logoStart: 16.9,
  /** ロゴが白い雲に溶けて消える間（秒） */
  logoOut: [20.35, 21.05] as const,
  /** 最後の白（映像の最後のコマと同じ色。ここからホームへ溶ける。path の END_WHITE） */
  endColor: "#f3f1ec",
  /** 読み込みが遅く、この秒数たっても流れ始めないときは流さない（ホームを待たせない） */
  startTimeout: 4.0,
  /**
   * 上から順に、再生できる最初のものを使う：大きい画面・細かい画面は AV1 の 2560×1440、ふつうの画面は AV1 の 1920×1080
   * （軽く、弱い PC でもなめらか）→ AV1 を再生できない Apple の機器は HEVC → ほかは H.264。media は読み込むときの画面で選ぶ
   * （media を見ない古いブラウザーは一番上）。?v= は映像を作り直したら変える（vercel.json で長く覚えさせるため）
   */
  sources: [
    { src: "/opening3/opening-av1.webm?v=2026112205", type: 'video/webm; codecs="av01.0.12M.10"', media: OPENING_BIG_SCREEN },
    { src: "/opening3/opening-av1-1080.webm?v=2026112205", type: 'video/webm; codecs="av01.0.08M.10"', media: undefined },
    { src: "/opening3/opening-hevc.mp4?v=2026112205", type: 'video/mp4; codecs="hvc1.2.4.L150.B0"', media: undefined },
    { src: "/opening3/opening.mp4?v=2026112205", type: 'video/mp4; codecs="avc1.640029"', media: undefined },
  ],
} as const;

/** 映像（public/opening3/）が入っているか。入っていないあいだは流さない（読めない映像で一瞬暗くならないように） */
export const OPENING_READY = true;

export const OPENING_SESSION_KEY = "michilu:opening-played";
/** 流さない設定（あとで設定の画面から変えられるようにする。今は "off" のときだけ流さない） */
export const OPENING_PREF_KEY = "michilu:opening";

/** 出典（映像に使ったデータ。映像の右下に出し、地理院タイル一覧へのリンクを付ける） */
export const OPENING_CREDIT = {
  text: "映像：国土地理院 地理院タイル（標高タイル・全国最新写真（シームレス））を加工して作成（Blender）",
  sub: "木・岩・草・地面の質感・空：Poly Haven（CC0）",
  href: "https://maps.gsi.go.jp/development/ichiran.html",
} as const;

/**
 * オープニングを流すか。流さないのは：動きを減らす設定（端末・アプリ）、物件のリンクから開いた（すぐ物件を見たい）、
 * このタブで流したことがある（読み込み直し）、流さない設定、通信量を減らす設定、裏のタブで開いた
 */
export function shouldPlayOpening(o: {
  reduced: boolean;
  motion: boolean;
  deepLink: boolean;
  played: boolean;
  off: boolean;
  saveData?: boolean;
  hidden?: boolean;
}): boolean {
  return !o.reduced && o.motion && !o.deepLink && !o.played && !o.off && !o.saveData && !o.hidden;
}

/**
 * 映像の 1 コマ（OPENING.frame）を画面いっぱいに（はみ出す所を切って）置いたときの、拡大率とずれ。
 * 横長の画面で上下を切るときは、上（空とロゴ）を多く残し、下（手前の森と川）を多く切る（CSS の object-position と同じ COVER_Y）。
 * ロゴは映像の上の方（穂高の稜線の上の空）にあるので、上はほとんど切らない（ブラウザーの枠で縦が縮んだ窓でも切れない）
 */
export const COVER_Y = 0.15;
export function coverRect(vw: number, vh: number): { scale: number; x: number; y: number } {
  const { w, h } = OPENING.frame;
  const scale = Math.max(vw / w, vh / h);
  return { scale, x: (vw - w * scale) / 2, y: (vh - h * scale) * COVER_Y };
}

/** ロゴの箱（画面の画素）：左・上・幅・高さ */
export function logoBox(vw: number, vh: number): { left: number; top: number; width: number; height: number } {
  const c = coverRect(vw, vh);
  const width = OPENING.logo.w * c.scale;
  const height = (width * logo.height) / logo.width;
  return { left: c.x + OPENING.logo.cx * c.scale - width / 2, top: c.y + OPENING.logo.cy * c.scale - height / 2, width, height };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** a 秒から b 秒へ、ゆっくり始まりゆっくり終わる 0→1 */
export function ease(t: number, a: number, b: number): number {
  const u = clamp01((t - a) / (b - a));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

export type LogoFrame = {
  /** ロゴ全体の濃さ（最後に白い雲へ溶ける） */
  all: number;
  /** ロゴの後ろを少しだけ落ち着かせる（文字を読みやすく）濃さ */
  backdrop: number;
  star: { opacity: number; glow: number };
  /** 円弧：見せる角度の範囲（画像の向き。右が 0°・下が +90°） */
  arc: { from: number; to: number; on: boolean };
  /** 山・波：左（朝日の側）から右へ、見せた所の右の端（ロゴの幅に対する割合） */
  mountain: number;
  wave: number;
  letters: { opacity: number; blur: number }[];
  /** 金の所を光がなでる：光の帯の真ん中（ロゴの幅に対する割合）と濃さ */
  glint: { at: number; opacity: number };
};

/**
 * 映像の秒 t のロゴの見え方（出し方「朝日の光から生まれる」）。光は朝日の側（左）から当てる。拡大・回転・跳ねる動きは使わない。
 *  0.0〜0.4 秒：光の点がまたたく → 0.25〜1.05：光の点から円弧が両側へ描かれる → 0.75〜1.35：山の線 →
 *  1.05〜2.15：文字が左から 1 字ずつ、ぼけた所からピントが合う → 1.95〜2.45：下の波 → 2.45〜3.05：光が金の所を 1 回なでる
 */
export function logoFrame(t: number): LogoFrame {
  const s = t - OPENING.logoStart;
  const [o0, o1] = OPENING.logoOut;
  const all = 1 - ease(t, o0, o1);
  const p = ease(s, 0.25, 1.05);
  const star = logo.starAngle;
  return {
    all,
    backdrop: 0.22 * ease(s, 0.0, 0.9) * all,
    star: { opacity: ease(s, 0.0, 0.4), glow: Math.max(0, Math.sin(Math.PI * clamp01((s - 0.05) / 0.7))) },
    arc: { from: star - p * (star - logo.arcFrom), to: star + p * (logo.arcTo - star), on: s > 0.25 },
    mountain: sweep(s, 0.75, 1.35, logo.mountain),
    wave: sweep(s, 1.95, 2.45, logo.wave),
    letters: logo.letters.map((_, i) => {
      const o = ease(s, 1.05 + 0.11 * i, 1.05 + 0.11 * i + 0.45);
      return { opacity: o, blur: 7 * (1 - o) };
    }),
    glint: { at: -0.15 + 1.3 * ease(s, 2.45, 3.05), opacity: s > 2.45 && s < 3.1 ? Math.sin(Math.PI * clamp01((s - 2.45) / 0.6)) : 0 },
  };
}

/** 左から右へ見せていく所の右の端（ロゴの幅に対する割合）。始まる前は形の左の端より左、終わったら右の端より右 */
function sweep(s: number, a: number, b: number, span: readonly number[] | number[]): number {
  const [x0, x1] = span;
  return x0 - 0.04 + (x1 - x0 + 0.12) * ease(s, a, b);
}

/** 円弧の見せ方（CSS の mask）。円の中心のまわりに、from°〜to° だけ見せる（ふちは柔らかく） */
export function arcMask(from: number, to: number): string {
  const [cx, cy] = logo.center;
  const span = Math.max(0, to - from);
  // CSS の conic-gradient は上が 0°・右回り。画像の向き（右が 0°・下が +90°）より 90° ずれる
  const start = from + 90 - 2;
  return `conic-gradient(from ${start.toFixed(2)}deg at ${(cx * 100).toFixed(2)}% ${(cy * 100).toFixed(2)}%, transparent 0deg, #000 2deg, #000 ${(span + 2).toFixed(2)}deg, transparent ${(span + 4).toFixed(2)}deg)`;
}

/** 左から見せる（山・波）の mask。edge はロゴの幅に対する割合 */
export function sweepMask(edge: number): string {
  const e = edge * 100;
  return `linear-gradient(90deg, #000 ${(e - 4).toFixed(2)}%, transparent ${e.toFixed(2)}%)`;
}

/** 光の帯（金の所をなでる光）の mask */
export function glintMask(at: number): string {
  const c = at * 100;
  return `linear-gradient(100deg, transparent ${(c - 10).toFixed(2)}%, #000 ${c.toFixed(2)}%, transparent ${(c + 10).toFixed(2)}%)`;
}
