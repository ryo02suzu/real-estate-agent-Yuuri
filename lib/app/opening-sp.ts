// スマホのオープニング「富士の目覚め」（スマホの画面だけ。その日に最初に開いたとき）の決まりごと。映像は scripts/sp-opening で
// Blender から作る（約 7.5 秒・30 コマ/秒・音なし。1080×2340 の縦長）。構成：夜明け前の雲の中を真上へ昇る → 雲海を抜ける
// （映画の横長の帯がここで開く）→ 富士と向き合い、山頂の縁から太陽が出る（ダイヤモンド富士）→ 山頂の光の点からロゴが生まれる →
// ホームへ溶ける。帯とロゴは映像に入れず、アプリが映像の上に描く（どの機種でもくっきり）。ロゴの出し方は PC と同じ
// 「朝日の光から生まれる」（lib/app/opening.ts の logoFrame）を、縦の画面用に速くしたもの。
import logo from "./opening-logo.json";
import { ease, logoFrame, OPENING, type LogoFrame } from "./opening";

export const SP_OPENING = {
  /** 映像の長さ（秒） */
  duration: 7.5,
  /** 映像の 1 コマの大きさ（ロゴ・太陽の位置の基準） */
  frame: { w: 1080, h: 2340 },
  /** 映画の横長の帯（2.39:1）。雲の中の間はかぶせ、雲海を抜ける瞬間に開く（scripts/sp-opening/post.py の letterbox と同じ） */
  bars: { ratio: 2.39, open: [2.4, 3.2] as const },
  /** 太陽（山頂の縁から出ている）の、映像の中の位置（scripts/sp-opening/work/sun_px.json の 5.0〜7.5 秒。ほとんど動かない） */
  sun: { x: 531, y: 852 },
  /** ロゴの真ん中と幅（映像の画素）。富士の上の空（ロゴの下の端は山頂の約 150 画素上） */
  logo: { cx: 540, cy: 560, w: 760 },
  /** 光の点が、山頂の太陽から昇り始める秒と、ロゴの光の点の所に着く秒 */
  rise: [4.75, 5.35] as const,
  /** ロゴの光の点がまたたく秒（ここから PC と同じ出し方を speed 倍の速さで） */
  logoStart: 5.35,
  logoSpeed: 1.6,
  /** 映像の終わりから、ロゴと映像がホームへ溶けて消えるまで（秒） */
  fadeOut: 0.7,
  /** 読み込みが遅く、この秒数たっても流れ始めないときは流さない（ホームを待たせない） */
  startTimeout: 2.5,
  /** 上から順に、再生できる最初のもの（AV1 → AV1 を再生できない iPhone は HEVC → ほかは H.264）。?v= は作り直したら変える */
  sources: [
    { src: "/opening-sp/opening-av1.webm?v=__V__", type: 'video/webm; codecs="av01.0.12M.10"' },
    { src: "/opening-sp/opening-hevc.mp4?v=__V__", type: 'video/mp4; codecs="hvc1.2.4.L153.B0"' },
    { src: "/opening-sp/opening.mp4?v=__V__", type: 'video/mp4; codecs="avc1.640020"' },
  ],
} as const;

/** 映像（public/opening-sp/）が入っているか。入っていないあいだは、いつもの起動の演出のまま（components/app/launch-script.ts） */
export const SP_OPENING_READY = false;

/** 出典（映像に使ったデータ。映像の下に出し、地理院タイル一覧へのリンクを付ける） */
export const SP_OPENING_CREDIT = {
  text: "映像：国土地理院 標高タイル（5m・10m）を加工して作成（Blender）",
  href: "https://maps.gsi.go.jp/development/ichiran.html",
} as const;

/** 映像を画面いっぱいに（はみ出す所を切って）置いたときの拡大率とずれ。縦長のスマホでは左右、古い 16:9 の機種では上下を、真ん中で切る */
export function spCover(vw: number, vh: number): { scale: number; x: number; y: number } {
  const { w, h } = SP_OPENING.frame;
  const scale = Math.max(vw / w, vh / h);
  return { scale, x: (vw - w * scale) / 2, y: (vh - h * scale) / 2 };
}

/** 映像の中の点（映像の画素）→ 画面の点 */
export function spPoint(vw: number, vh: number, x: number, y: number): { x: number; y: number } {
  const c = spCover(vw, vh);
  return { x: c.x + x * c.scale, y: c.y + y * c.scale };
}

/** ロゴの箱（画面の画素）：左・上・幅・高さ */
export function spLogoBox(vw: number, vh: number): { left: number; top: number; width: number; height: number } {
  const c = spCover(vw, vh);
  const width = SP_OPENING.logo.w * c.scale;
  const height = (width * logo.height) / logo.width;
  return { left: c.x + SP_OPENING.logo.cx * c.scale - width / 2, top: c.y + SP_OPENING.logo.cy * c.scale - height / 2, width, height };
}

/** 映画の帯（上と下の黒い帯）の高さ（画面の画素）。帯の中の高さは画面の幅 / 2.39。雲海を抜ける瞬間に、上下へ開く */
export function spBars(t: number, vw: number, vh: number): number {
  const band = vw / SP_OPENING.bars.ratio;
  const [a, b] = SP_OPENING.bars.open;
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  const k = u * u * (3 - 2 * u); // post.py の smoothstep と同じ
  const visible = band + (vh - band) * k;
  return Math.max(0, (vh - visible) / 2);
}

/** 山頂の太陽から昇る光の点：位置（映像の画素）・濃さ。着いたら、ロゴの光の点（star）に入れ替わる */
export function spRise(t: number): { x: number; y: number; opacity: number } {
  const [a, b] = SP_OPENING.rise;
  const k = ease(t, a, b);
  const box = { w: SP_OPENING.logo.w, h: (SP_OPENING.logo.w * logo.height) / logo.width };
  const sx = SP_OPENING.logo.cx - box.w / 2 + logo.star[0] * box.w;
  const sy = SP_OPENING.logo.cy - box.h / 2 + logo.star[1] * box.h;
  // ゆるい弧を描いて昇る（真上へ出てから、ロゴの光の点の方へ寄る）
  const x = SP_OPENING.sun.x + (sx - SP_OPENING.sun.x) * k * k;
  const y = SP_OPENING.sun.y + (sy - SP_OPENING.sun.y) * k;
  const opacity = t < a || t > b + 0.25 ? 0 : Math.min(1, (t - a) / 0.15) * (1 - ease(t, b, b + 0.25));
  return { x, y, opacity };
}

/** 映像の秒 t のロゴの見え方（PC と同じ出し方を、logoSpeed 倍の速さで）。出しきったら、そのまま（消すのはホームへ溶けるとき） */
export function spLogoFrame(t: number): LogoFrame {
  // logoFrame は PC の映像の秒で動くので、PC の光の点の秒へずらして渡す（PC の白い雲へ溶ける所の手前で止める）
  const pc = OPENING.logoStart + (t - SP_OPENING.logoStart) * SP_OPENING.logoSpeed;
  return { ...logoFrame(Math.min(pc, OPENING.logoOut[0])), all: 1 };
}
