// 時間連動の空を CSS 変数に書く（天体の計算は lib/app/sun.ts、描くのは components/app/sky.tsx）。
// 大気差は SunCalc と同じく、地平線より下では 0° の値（約0.48°）を足す。
// 変数は <html> に置く：(1) 最初に描く前に <head> の小さなスクリプト（SKY_HEAD_SCRIPT）が入れ、(2) 表示中は useSkyClock が
// 1分ごと・復帰時・日時の固定（#t=）の変化で入れ直す。React は変数の値を描かないので、サーバーで作った HTML と食い違わず
// （Hydration の問題が出ない）、夜に開いても昼の空が一瞬出ない
import { blend, HOME_CAMERA, layerOpacity, light, lightX, overrideTime, PHOTO_ORDER, projectSun, SKY_HORIZON, SKY_MID, SKY_TOP, solar, type Light } from "./sun";

/** 空の変数の名前と意味 */
export const SKY_VARS = {
  /** 写真の混ぜ方（重み。合計 1） */
  day: "--sky-day",
  golden: "--sky-golden",
  twilight: "--sky-twilight",
  dawn: "--sky-dawn",
  night: "--sky-night",
  /** 重ねた写真それぞれの不透明度（lib/app/sun.ts の layerOpacity。下から night, twilight, dawn, golden, day） */
  lNight: "--sky-l-night",
  lTwilight: "--sky-l-twilight",
  lDawn: "--sky-l-dawn",
  lGolden: "--sky-l-golden",
  lDay: "--sky-l-day",
  /** 写真の上端・中ほど・地平線の近くの色（時刻・電池の帯と、各ページの帯のグラデーション） */
  top: "--sky-top",
  mid: "--sky-mid",
  horizon: "--sky-horizon",
  /** 地平線の光の色と強さ（0〜1） */
  glow: "--sky-glow",
  glowA: "--sky-glow-a",
  /** ガラスのカードの縁のハイライトの色 */
  hl: "--sky-hl",
  /** 見出しの字の色（r,g,b）と、字のにじみの色（r,g,b）。空が暗いと白い字に黒いにじみ */
  ink: "--sky-ink",
  inkSoft: "--sky-ink-soft",
  halo: "--sky-halo",
  /** 空が暗い（ロゴを白に）か 0/1 */
  dark: "--sky-dark",
  /** 夜らしさ 0〜1 */
  nightness: "--sky-nightness",
  /** 光の差す向き（画面の左 0 〜 右 100。書類・出力の帯など） */
  lightX: "--sky-light-x",
  /** 太陽本体の位置（写真の中の割合 0〜1）と、画角の中にあるか 0/1。カメラが未設定なら入れない */
  sunX: "--sun-x",
  sunY: "--sun-y",
  sunIn: "--sun-in",
} as const;

/** 変数の値を計算する（画面に書く前の形） */
export function skyValues(at: Date): { vars: Record<string, string>; light: Light } {
  const s = solar(at);
  const b = blend(s.altitude, s.rising);
  const l = light(s.altitude, s.rising, b);
  const sun = projectSun(s, HOME_CAMERA);
  const lo = layerOpacity(b);
  const vars: Record<string, string> = {
    [SKY_VARS.day]: b.day.toFixed(3),
    [SKY_VARS.golden]: b.golden.toFixed(3),
    [SKY_VARS.twilight]: b.twilight.toFixed(3),
    [SKY_VARS.dawn]: b.dawn.toFixed(3),
    [SKY_VARS.night]: b.night.toFixed(3),
    ...Object.fromEntries(PHOTO_ORDER.map((k) => [`--sky-l-${k}`, lo[k].toFixed(3)])),
    [SKY_VARS.top]: l.top,
    [SKY_VARS.mid]: l.mid,
    [SKY_VARS.horizon]: l.horizon,
    [SKY_VARS.glow]: l.glow.color,
    [SKY_VARS.glowA]: l.glow.strength.toFixed(2),
    [SKY_VARS.hl]: l.highlight,
    [SKY_VARS.ink]: l.dark ? "255,255,255" : "15,27,51",
    [SKY_VARS.inkSoft]: l.dark ? "232,238,248" : "38,50,74",
    [SKY_VARS.halo]: l.dark ? "0,12,40" : "255,255,255",
    [SKY_VARS.dark]: l.dark ? "1" : "0",
    [SKY_VARS.nightness]: l.nightness.toFixed(2),
    [SKY_VARS.lightX]: String(lightX(s.azimuth)),
    [SKY_VARS.sunIn]: sun && sun.inside && s.altitude > -1 ? "1" : "0",
    ...(sun ? { [SKY_VARS.sunX]: sun.x.toFixed(4), [SKY_VARS.sunY]: sun.y.toFixed(4) } : {}),
  };
  return { vars, light: l };
}

/** 今の空を <html> の変数に書き、時刻の帯の色などを返す。日時は #t= の固定があればそれ */
export function applySky(at: Date = overrideTime(location.hash) ?? new Date(), el: HTMLElement = document.documentElement): Light {
  const v = skyValues(at);
  for (const [k, val] of Object.entries(v.vars)) el.style.setProperty(k, val);
  el.dataset.skyDark = v.light.dark ? "1" : "0";
  return v.light;
}

/**
 * <head> で最初に描く前に実行する文字列。SunCalc は読めないので、NOAA の簡単な式で太陽の高度（大気差込み）・方位と昇っているかを出し、
 * sun.ts の blend・light と同じ混ぜ方で変数を入れる（同じ結果になることは lib/app/sun.test.ts で確かめる）。
 * 太陽本体の位置はここでは入れない（表示のあとの applySky が入れる）
 */
export const SKY_HEAD_SCRIPT = `(function(){try{
var V=${JSON.stringify(SKY_VARS)},T=${JSON.stringify(SKY_TOP)},MD=${JSON.stringify(SKY_MID)},HZ=${JSON.stringify(SKY_HORIZON)},P=Math.PI/180;
function ss(a,b,x){var t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)}
function sun(d){var lat=35.6812,lng=139.7671,jd=d.getTime()/864e5+2440587.5,C=(jd-2451545)/36525;
var L0=((280.46646+C*(36000.76983+C*3.032e-4))%360+360)%360,M=357.52911+C*(35999.05029-1.537e-4*C),e=0.016708634-C*4.2037e-5;
var Cc=Math.sin(M*P)*(1.914602-C*(0.004817+1.4e-5*C))+Math.sin(2*M*P)*(0.019993-1.01e-4*C)+Math.sin(3*M*P)*2.89e-4;
var om=125.04-1934.136*C,lam=L0+Cc-0.00569-0.00478*Math.sin(om*P),eps=23.439291-0.0130042*C+0.00256*Math.cos(om*P);
var dec=Math.asin(Math.sin(eps*P)*Math.sin(lam*P)),y=Math.tan(eps/2*P);y*=y;
var eqt=4/P*(y*Math.sin(2*L0*P)-2*e*Math.sin(M*P)+4*e*y*Math.sin(M*P)*Math.cos(2*L0*P)-0.5*y*y*Math.sin(4*L0*P)-1.25*e*e*Math.sin(2*M*P));
var mn=((d.getTime()%864e5)+864e5)%864e5/6e4,tst=((mn+eqt+4*lng)%1440+1440)%1440,ha=(tst/4-180)*P;
var sa=Math.sin(lat*P)*Math.sin(dec)+Math.cos(lat*P)*Math.cos(dec)*Math.cos(ha),zen=Math.acos(Math.max(-1,Math.min(1,sa))),h=90-zen/P;
var hh=h<0?0:h,r=1.02/Math.tan((hh+10.26/(hh+5.1))*P)/60;
var ac=(Math.sin(lat*P)*Math.cos(zen)-Math.sin(dec))/(Math.cos(lat*P)*Math.sin(zen)),a=Math.acos(Math.max(-1,Math.min(1,ac)))/P,az=ha>0?(a+180)%360:(540-a)%360;
return[h+r,ha<0,az]}
function blend(a,up){var b={day:0,golden:0,twilight:0,dawn:0,night:0};
if(!up){if(a>=0){b.day=ss(0,10,a);b.golden=1-b.day}else if(a>=-6){b.golden=ss(-6,0,a);b.twilight=1-b.golden}else{b.twilight=ss(-12,-6,a);b.night=1-b.twilight}}
else if(a>=0){b.day=ss(0,10,a);b.dawn=1-b.day}else if(a>=-6){b.dawn=ss(-6,0,a);b.night=1-b.dawn}else b.night=1;return b}
function mix(c,b){var o=[0,0,0],k;for(k in b)for(var i=0;i<3;i++)o[i]+=c[k][i]*b[k];return o}
function hex(c){var s="#";for(var i=0;i<3;i++){var v=Math.round(Math.min(255,Math.max(0,c[i]))).toString(16);s+=(v.length<2?"0":"")+v}return s}
function at(){var m=location.hash.replace(/^#/,"").match(/(?:^|&)t=([^&]+)/);if(m){var v=decodeURIComponent(m[1]),d=new Date(/[zZ]|[+-]\\d\\d:?\\d\\d$/.test(v)?v:v+(v.length<=10?"T12:00":"")+"+09:00");if(!isNaN(d.getTime()))return d}return new Date()}
var s=sun(at()),a=s[0],up=s[1],az=s[2],b=blend(a,up),top=mix(T,b);
var lum=(0.2126*top[0]+0.7152*top[1]+0.0722*top[2])/255,dark=lum<0.42;
var near=Math.exp(-((a+1)*(a+1))/(2*4.5*4.5)),warm=a<8&&a>-8?ss(8,0,a)*(1-ss(-2,-8,a)):0,n=b.night+0.5*(b.twilight+b.dawn);
var hl=[0,1,2].map(function(i){return [255,255,255][i]*(1-warm)*(1-n)+[255,222,160][i]*warm*(1-n)+[190,208,245][i]*n});
var st=document.documentElement.style,set=function(k,v){st.setProperty(k,v)};
set(V.day,b.day.toFixed(3));set(V.golden,b.golden.toFixed(3));set(V.twilight,b.twilight.toFixed(3));set(V.dawn,b.dawn.toFixed(3));set(V.night,b.night.toFixed(3));
var O=["night","twilight","dawn","golden","day"],sm=0;for(var j=0;j<O.length;j++){sm+=b[O[j]];set("--sky-l-"+O[j],(sm>0?b[O[j]]/sm:0).toFixed(3))}
set(V.top,hex(top));set(V.mid,hex(mix(MD,b)));set(V.horizon,hex(mix(HZ,b)));set(V.glow,up?"#ffd6aa":"#ffb278");set(V.glowA,near.toFixed(2));set(V.hl,hex(hl));
set(V.ink,dark?"255,255,255":"15,27,51");set(V.inkSoft,dark?"232,238,248":"38,50,74");set(V.halo,dark?"0,12,40":"255,255,255");
set(V.dark,dark?"1":"0");set(V.nightness,n.toFixed(2));set(V.lightX,String(Math.round(Math.min(100,Math.max(0,(az-60)/240*100)))));set(V.sunIn,"0");
document.documentElement.dataset.skyDark=dark?"1":"0";
}catch(e){}})()`;
