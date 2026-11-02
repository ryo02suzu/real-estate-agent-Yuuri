"use client";

// アプリを開いたときの演出（スマホの画面だけ）。種類は <head> で決める（components/app/launch-script.ts。html の data-launch）。
// ここは画面いちばん手前に重ねる幕とロゴ（指は通す）。動きは app/globals.css の .launch・.launch-*（CSS だけで動くので、
// 読み込みの途中でも最初に描いたときから始まる）。終わったら（または画面に触れたら）html の data-launch を done にして外す
// （中身の遅れ --launch も 0 に戻る）
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
      html.setAttribute("data-launch", "done");
      setOn(false);
    };
    // 画面に触れたら、すぐ終える（急いでいるときに待たせない）。幕がまだ覆っている所に触れたときは、幕をすぐ消すだけで、
    // その指では下のボタンを押さない（見えていないボタンを押して調べ始めないように。幕は少しの間だけ、透明のまま指を受け止める）
    let skipTimer = 0;
    const onDown = (e: Event) => {
      if (ended || skipTimer) return;
      html.classList.add("launch-skip");
      if (e.target instanceof Node && el.contains(e.target)) skipTimer = window.setTimeout(end, 380);
      else end();
    };
    // 幕の動き（.launch の launch-end）が終わったら外す。読み込みが遅く、もう終わっていたら、すぐ外す
    const onEnd = (e: AnimationEvent) => {
      if (e.target === el) end();
    };
    el.addEventListener("animationend", onEnd);
    if (getComputedStyle(el).visibility === "hidden") queueMicrotask(end);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", end, true);
    // 動きが止められていたとき（裏で開いた・省電力）も、外し忘れない
    const timer = window.setTimeout(end, 5000);
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
      <div className="launch-logo">
        <span className="launch-m" />
        {LETTERS.map(([a, b], i) => (
          <span key={i} className="launch-l" style={{ left: `${a - 0.6}%`, width: `${b - a + 1.2}%`, "--i": i - 3, "--x": `${a - 0.6}` } as CSSProperties} />
        ))}
        <span className="launch-glint" />
      </div>
    </div>
  );
}
