"use client";

// アプリを開いたときの演出（スマホの画面だけ）。種類は <head> で決める（components/app/launch-script.ts。html の data-launch）。
// ここは画面いちばん手前に重ねる幕・街の光を描くキャンバス・ロゴ。動きは app/globals.css の .launch・.launch-*（CSS だけで動くので、
// 読み込みの途中でも最初に描いたときから始まる）と、長い版の「光の道の街」（components/app/launch-city.js。<head> で動き、
// このキャンバスに描く。描き始めると html に data-grand が付き、CSS が長い版の時間割になる）。
// 終わったら（または画面に触れたら）html の data-launch を done にして外す（中身の遅れ --launch も 0 に戻る）
import { useEffect, useRef, useState, type CSSProperties } from "react";

/** MICHILU の7文字（ロゴの絵の中の位置。幅に対する %） */
const LETTERS: [number, number][] = [
  [36.28, 45.64],
  [50.12, 51.5],
  [54.99, 63.22],
  [66.83, 74.06],
  [78.3, 79.68],
  [84.04, 89.65],
  [92.39, 99.63],
];

export function LaunchIntro() {
  const root = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = root.current;
    const html = document.documentElement;
    const mode = html.getAttribute("data-launch");
    if (!el || (mode !== "full" && mode !== "quick")) {
      queueMicrotask(() => setOn(false));
      return;
    }
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      html.classList.remove("launch-skip");
      html.removeAttribute("data-grand");
      html.setAttribute("data-launch", "done");
      setOn(false);
    };
    // 画面に触れたら、すぐ終える（急いでいるときに待たせない）。幕がまだ覆っている所に触れたときは、幕をすぐ消すだけで、
    // その指では下のボタンを押さない（見えていないボタンを押して調べ始めないように。幕は少しの間だけ、透明のまま指を受け止める）
    let skipTimer = 0;
    const onDown = (e: Event) => {
      if (ended || skipTimer) return;
      // 写真・中身・下のメニューを、すぐ終わりの形に（CSS の .launch-skip）。長い版の時間割（data-grand）は、ここでは外さない
      // （外すと幕の時計が短い版に戻って、その場で終わり、この指の「押す」が見えていないボタンに届いてしまう）
      html.classList.add("launch-skip");
      if (e.target instanceof Node && el.contains(e.target)) skipTimer = window.setTimeout(end, 380);
      else end();
    };
    // 幕の動き（.launch の launch-end）が終わったら外す。読み込みが遅く、もう終わっていたら、すぐ外す。
    // 飛ばしている間（幕が消えていく 0.38 秒）は、指を受け止め終わるまで外さない
    const onEnd = (e: AnimationEvent) => {
      if (e.target === el && !skipTimer) end();
    };
    el.addEventListener("animationend", onEnd);
    if (getComputedStyle(el).visibility === "hidden") queueMicrotask(end);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", end, true);
    // 動きが止められていたとき（裏で開いた・省電力）も、外し忘れない（長い版は約5.2秒）
    const timer = window.setTimeout(end, 8000);
    return () => {
      el.removeEventListener("animationend", onEnd);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", end, true);
      clearTimeout(timer);
      clearTimeout(skipTimer);
    };
  }, []);
  if (!on) return null;
  return (
    <div ref={root} aria-hidden className="launch">
      <div className="launch-veil" />
      <canvas className="launch-canvas" />
      <div className="launch-logo">
        {/* M がロゴのマークに入れ替わる瞬間の、光のはじけと輪 */}
        <span className="launch-burst" />
        <span className="launch-ring" />
        <span className="launch-m" />
        {LETTERS.map(([a, b], i) => (
          <span key={i} className="launch-l" style={{ left: `${a - 0.6}%`, width: `${b - a + 1.2}%`, "--i": i - 3, "--x": `${a - 0.6}` } as CSSProperties} />
        ))}
        <span className="launch-glint" />
      </div>
    </div>
  );
}
