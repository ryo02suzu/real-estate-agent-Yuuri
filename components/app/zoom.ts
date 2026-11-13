// スマホの画面の拡大率（画面の幅 ÷ 絵の幅 393pt。タブレットでは 1.3 まで）。CSS 変数 --app-zoom に入れ、
// スマホの画面（components/app）の style の zoom で使う。最初に描く前に決めるため、app/layout.tsx の <head> の小さなスクリプトで計算する
// （Next.js のガイド「Preventing Flash」の方法。node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md）。
// 幅はレイアウトの幅（documentElement.clientWidth）で測る（ピンチで拡大しても変わらない）

/** <head> で実行する文字列。画面を回したときも計算し直す */
export const APP_ZOOM_SCRIPT = `(function(){function z(){var d=document.documentElement;var w=d.clientWidth||window.innerWidth;d.style.setProperty("--app-zoom",String(Math.min(w/393,1.3)))}z();window.addEventListener("resize",z)})()`;

/** 同じ計算をもう一度（開発中の再マウントで <html> の style が消えたとき用） */
export function applyAppZoom(): void {
  const d = document.documentElement;
  const w = d.clientWidth || window.innerWidth;
  d.style.setProperty("--app-zoom", String(Math.min(w / 393, 1.3)));
}
