// PC のオープニング映像（PC の画面だけ。スマホでは出さない）の決まりごと。映像は scripts/pc-opening で Blender から作る。
// 構成「ひとつの夜明け」（約16秒・音なし）：夜明け前の日本を宇宙に近い高さから見る → 朝日の光が太平洋の側から列島をなでる →
// 北アルプスへ降りて雲を抜ける → 晩秋の上高地を鷹の目で飛ぶ → 雲海の上で朝日と白鳥 → ロゴ（出し方「朝日の光から生まれる」）
// → 高く上がって白い雲の中へ → PC のホーム。
// ロゴは映像に入れず、アプリが映像の上に描く（どの画面の大きさでもくっきり）。映像の時刻に合わせて動かすので、読み込みで
// 映像が止まればロゴも止まる。ここには、いつ流すか・ロゴの部品をいつどう見せるか（映像の秒の関数）を置く（テストできるように）。
import logo from "./opening-logo.json";

export const OPENING = {
  /** 映像の長さ（秒）。最後のコマは END_COLOR の白い雲 */
  duration: 16.0,
  /** 映像の 1 コマの大きさ（ロゴを置く位置の基準） */
  frame: { w: 1920, h: 1080 },
  /** ロゴの真ん中と幅（映像の画素。朝日の右の空。文字は雲海の地平線より上） */
  logo: { cx: 1250, cy: 282, w: 770 },
  /** 光の点がまたたく秒（白鳥が朝日の中へ消えたところ。scripts/pc-opening/path.py の LOGO_START と同じ） */
  logoStart: 11.6,
  /** ロゴが白い雲に溶けて消える間（秒） */
  logoOut: [15.25, 15.95] as const,
  /** 最後の白（映像の最後のコマと同じ色。ここからホームへ溶ける。path の END_WHITE） */
  endColor: "#f3f1ec",
  /** 読み込みが遅く、この秒数たっても流れ始めないときは流さない（ホームを待たせない） */
  startTimeout: 4.0,
  sources: [
    { src: "/opening/opening-av1.webm", type: 'video/webm; codecs="av01.0.08M.08"' },
    { src: "/opening/opening.mp4", type: 'video/mp4; codecs="avc1.640028"' },
  ],
} as const;

/** 映像（public/opening/）を入れたら true にする。入れるまでは流さない（読めない映像で一瞬暗くならないように） */
export const OPENING_READY = false;

export const OPENING_SESSION_KEY = "michilu:opening-played";
/** 流さない設定（あとで設定の画面から変えられるようにする。今は "off" のときだけ流さない） */
export const OPENING_PREF_KEY = "michilu:opening";

/** 出典（映像に使ったデータ。映像の右下に出し、地理院タイル一覧へのリンクを付ける） */
export const OPENING_CREDIT = {
  text: "映像：国土地理院 地理院タイル（標高タイル・全国最新写真（シームレス）・全国ランドサットモザイク画像・世界衛星モザイク画像）と AWS Terrain Tiles（ETOPO1（NOAA）・SRTM・GMTED2010（USGS）など）を加工して作成（Blender）",
  sub: "データソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO）／ Images on 世界衛星モザイク画像 obtained from site https://lpdaac.usgs.gov/data_access maintained by the NASA Land Processes Distributed Active Archive Center (LP DAAC), USGS/Earth Resources Observation and Science (EROS) Center, Sioux Falls, South Dakota, (Year). Source of image data product.",
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
 * 横長の画面で上下を切るときは、上（空とロゴ）を多く残し、下（雲海）を多く切る（CSS の object-position と同じ COVER_Y）
 */
export const COVER_Y = 0.3;
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
