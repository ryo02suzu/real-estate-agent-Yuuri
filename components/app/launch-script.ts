// アプリを開いたときの演出の種類を、最初に描く前に決める（app/layout.tsx の <head> で実行。演出は components/app/launch.tsx と
// app/globals.css の .launch）。html の data-launch に入れる：
//   full  … 長い版（紺の幕の真ん中で、ロゴのマークが光で描かれ、MICHILU の字が寄って並び、光が走る。ロゴが左上の定位置へ飛び、
//            幕が上がって街の写真が奥から落ち着き、ひとこと・検索欄・最近の検索・下のメニューが順に現れる。約1.8秒）
//   quick … 短い版（紺からふわっと街が現れ、中身が順に浮き上がる。約0.9秒）。前に開いてから10分以内・≡ の「動きの演出」がオフのとき
//   （無し）… PC の幅・動きを減らす設定・住所や地点のリンク（#q= / #ll=）で開いたとき
// #launch=full / #launch=quick で選べる（確かめる用）。開いた時刻は端末だけに覚える（michilu:launch）
/** 続けて開いたとき（前に開いてから、この時間のうち）は短い版 */
export const LAUNCH_QUICK_WITHIN_MS = 10 * 60 * 1000;

export const LAUNCH_SCRIPT = `(function(){try{var d=document.documentElement,h=location.hash,m="full",n=Date.now(),l=0,f;if(matchMedia("(min-width: 1024px)").matches||matchMedia("(prefers-reduced-motion: reduce)").matches)return;if(/(^|[#?&])(q|ll)=/.test(h+location.search))return;try{l=Number(localStorage.getItem("michilu:launch"))||0;localStorage.setItem("michilu:launch",String(n));if(localStorage.getItem("michilu:motion")==="off")m="quick"}catch(e){}if(m==="full"&&n-l<${LAUNCH_QUICK_WITHIN_MS})m="quick";f=/(?:^|[#&])launch=(full|quick)/.exec(h);if(f)m=f[1];d.setAttribute("data-launch",m)}catch(e){}})();`;
