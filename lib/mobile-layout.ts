// スマホの新UI（components/mobile-shell.tsx）の画面の向きによる配置。
// 縦向き：日本地図の上に、下から重なるパネル（小・中・大）。
// 横向きの背の低い画面（iPhone の横向きなど）：下からのパネルだと高さのほとんどを覆い、地図がほぼ見えないので、
// パネルを左に寄せた縦長の列にし、右側に地図を見せる（地図アプリと同じ配置）。PC（横幅 1024px 以上）はこの画面を使わない。

/** 横向きの背の低い画面（パネルを左、地図を右に）。iPhone の横向きは高さ 320〜440px、iPad は横幅 1024px 以上で PC の画面 */
export const SIDE_QUERY = "(orientation: landscape) and (max-height: 500px)";

/** 左のパネルの幅(px)：画面の幅の46%を目安に 300〜380px（読める幅を保ち、残りを地図に） */
export function sidePanelWidth(vw: number): number {
  return Math.round(Math.min(380, Math.max(300, vw * 0.46)));
}

/** 左の列（ロゴの帯とパネル）の左端。横向きのノッチ・角の丸み（セーフエリア）を避ける */
export const SIDE_LEFT = "max(8px, env(safe-area-inset-left))";
/** 左の列のロゴの帯の上端 */
export const SIDE_TOP = "max(8px, env(safe-area-inset-top))";
/** ロゴの帯（ロゴ 42px＋上下の余白）の高さと、パネルとの間（px） */
export const SIDE_HEADER_PX = 54;
export const SIDE_GAP_PX = 6;
/** パネルの上端（ロゴの帯の下） */
export const SIDE_PANEL_TOP = `calc(${SIDE_TOP} + ${SIDE_HEADER_PX + SIDE_GAP_PX}px)`;
