// 時間連動の空を CSS 変数に書く（天体の計算は lib/app/sun.ts、描くのは components/app/sky.tsx）。
// 大気差は SunCalc と同じく、地平線より下では 0° の値（約0.48°）を足す。
// 変数は <html> に置く：(1) 最初に描く前に <head> の小さなスクリプト（SKY_HEAD_SCRIPT）が入れ、(2) 表示中は useSkyClock が
// 1分ごと・復帰時・日時の固定（#t=）の変化で入れ直す。React は変数の値を描かないので、サーバーで作った HTML と食い違わず
// （Hydration の問題が出ない）、夜に開いても昼の空が一瞬出ない
import { AERO_SEASON, airFrom, RH_NORMAL, type Air } from "./air";
import { ATMOS, CLEAN_AIR, dirFromAltAz, exposureFor, radiance, skyColor, type AirParams, type Vec3 } from "./atmosphere";
import { blend, HOME_CAMERA, layerOpacity, light, lightX, overrideTime, PHOTO_ORDER, projectSun, solar, type Camera, type Light } from "./sun";
import { currentWeather, lightsLevel, type Weather } from "./weather";

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
  /** 街の窓の明かり（0〜1。暗さと、時刻ごとに点いている割合から） */
  lights: "--sky-lights",
  /** 天気（雲量・降水・霧。0〜1） */
  cloud: "--sky-cloud",
  precip: "--sky-precip",
  fog: "--sky-fog",
} as const;

const R = Math.PI / 180;

/** 帯の中の位置（横 sx・縦 sy は −1〜1）の、見る向き（projectSun と同じカメラ） */
export function viewDir(cam: Camera, sx: number, sy: number): Vec3 {
  const tanH = Math.tan((cam.hfov / 2) * R);
  const tanV = tanH / cam.aspect;
  const pitch = Math.atan((2 * cam.horizon - 1) * tanV);
  const y0 = cam.bearing * R;
  const f = [Math.sin(y0) * Math.cos(pitch), Math.cos(y0) * Math.cos(pitch), Math.sin(pitch)];
  const r = [Math.cos(y0), -Math.sin(y0), 0];
  const u = [-Math.sin(y0) * Math.sin(pitch), -Math.cos(y0) * Math.sin(pitch), Math.cos(pitch)];
  const d = [0, 1, 2].map((i) => f[i] + r[i] * sx * tanH + u[i] * sy * tanV);
  const n = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / n, d[1] / n, d[2] / n];
}

/**
 * カメラの自動露出：帯の地平線より上の空の明るさ（横 5 × 縦 3 で測った平均。露出込みの線形の輝度。太陽のすぐそばの極端な値は
 * knee で丸める）が target を超えたら、その分だけ絞る（min〜1）。逆光の午後に空全体が白く飛ばず、太陽の近くだけが白くなる。
 * 太陽がカメラの後ろにある昼と、沈んでからは 1（測らない）。<head> の最初の計算（SKY_HEAD_SCRIPT の meter）と、帯のシェーダー（u_expAdj）も同じ値
 */
export const METER = { target: 1.85, min: 0.4, nx: 5, ny: 3, knee: 10 } as const;
export function meterExposure(altitude: number, azimuth: number, cam: Camera = HOME_CAMERA, air: AirParams = CLEAN_AIR): number {
  const s = dirFromAltAz(altitude, azimuth);
  const fwd = viewDir(cam, 0, 0);
  if (altitude < -6 || s[0] * fwd[0] + s[1] * fwd[1] + s[2] * fwd[2] < 0) return 1;
  const e = exposureFor(altitude);
  const hy = 1 - 2 * cam.horizon;
  let sum = 0;
  for (let j = 0; j < METER.ny; j++) {
    const sy = hy + (1 - hy) * ((j + 0.5) / METER.ny);
    for (let i = 0; i < METER.nx; i++) {
      const L = radiance(viewDir(cam, -1 + 2 * ((i + 0.5) / METER.nx), sy), s, air.aero);
      const y = (0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2]) * e;
      sum += METER.knee * (1 - Math.exp(-y / METER.knee));
    }
  }
  const mean = sum / (METER.nx * METER.ny);
  return Math.round(Math.min(1, Math.max(METER.min, METER.target / Math.max(mean, 1e-6))) * 1000) / 1000;
}

/** 雲で灰色に寄せる（雲量が多いほど彩度を落とし、少し暗く） */
export function cloudy(c: Vec3, cloud: number): Vec3 {
  const g = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const k = cloud * 0.85;
  return [0, 1, 2].map((i) => Math.round((c[i] * (1 - k) + g * k * [0.97, 0.98, 1][i]) * (1 - cloud * 0.1))) as Vec3;
}

/** 帯の上端・中ほど・地平線のすぐ上（横は中央）の空の色を、大気の式で出す（雲があれば灰色に寄せる） */
export function bandColors(altitude: number, azimuth: number, cam: Camera = HOME_CAMERA, weather: Weather = currentWeather(), air: Air = airFrom(weather, new Date())): { top: Vec3; mid: Vec3; horizon: Vec3 } {
  const s = dirFromAltAz(altitude, azimuth);
  const hy = 1 - 2 * cam.horizon;
  const c = weather.cloud;
  const x = meterExposure(altitude, azimuth, cam, air);
  return {
    top: cloudy(skyColor(viewDir(cam, 0, 1), s, altitude, air, x), c),
    mid: cloudy(skyColor(viewDir(cam, 0, (1 + hy) / 2), s, altitude, air, x), c),
    horizon: cloudy(skyColor(viewDir(cam, 0, hy + 0.04), s, altitude, air, x), c),
  };
}

/** 変数の値を計算する（画面に書く前の形） */
export function skyValues(at: Date): { vars: Record<string, string>; light: Light } {
  const s = solar(at);
  const b = blend(s.altitude, s.rising);
  const w = currentWeather();
  const l = light(s.altitude, s.rising, b, bandColors(s.altitude, s.azimuth, HOME_CAMERA, w, airFrom(w, at)));
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
    [SKY_VARS.lights]: lightsLevel(at, s.altitude).toFixed(2),
    [SKY_VARS.cloud]: w.cloud.toFixed(2),
    [SKY_VARS.precip]: w.precip.toFixed(2),
    [SKY_VARS.fog]: w.fog.toFixed(2),
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
var V=${JSON.stringify(SKY_VARS)},P=Math.PI/180,RHN=${JSON.stringify(RH_NORMAL)},AS=${JSON.stringify(AERO_SEASON)},AR=1,GL=1,A=${JSON.stringify({ Re: ATMOS.Re, Ra: ATMOS.Ra, h0: ATMOS.h0, bR: ATMOS.betaR, HR: ATMOS.HR, bM: ATMOS.betaM, HM: ATMOS.HM, bg: ATMOS.bgMie, g: ATMOS.g, mE: ATMOS.mieExt, bO: ATMOS.betaO, sun: ATMOS.sun, ek: ATMOS.exposureKnots, msC: ATMOS.msColor, msS: ATMOS.msStrength, msL: ATMOS.msLow, msH: ATMOS.msHigh, msW: ATMOS.msLowWeight, nZ: ATMOS.nightZenith, nH: ATMOS.nightHorizon, nF: ATMOS.nightHorizonFalloff, tb: ATMOS.twilightBlue, ts: ATMOS.twilightStrength, N: ATMOS.samples, NL: ATMOS.lightSamples })},CAM=${JSON.stringify(HOME_CAMERA)};
function dt(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function hitF(o,d,r){var b=dt(o,d),c=dt(o,o)-r*r,q=b*b-c;return q<0?-1:-b+Math.sqrt(q)}
function hitN(o,d,r){var b=dt(o,d),c=dt(o,o)-r*r,q=b*b-c;if(q<0)return -1;var t=-b-Math.sqrt(q);return t>0?t:-1}
function dens(h){return[Math.exp(-h/A.HR),AR*Math.exp(-h/A.HM)+A.bg*Math.exp(-h/A.HR),Math.max(0,1-Math.abs(h-25)/15)]}
function d2s(p,s){if(hitN(p,s,A.Re)>0)return null;var t=hitF(p,s,A.Ra),st=t/A.NL,a=0,b=0,c=0;for(var i=0;i<A.NL;i++){var k=(i+0.5)*st,q=[p[0]+s[0]*k,p[1]+s[1]*k,p[2]+s[2]*k],h=Math.sqrt(dt(q,q))-A.Re,e=dens(h);a+=e[0]*st;b+=e[1]*st;c+=e[2]*st}
return[A.bR[0]*a+A.bM*A.mE*b+A.bO[0]*c,A.bR[1]*a+A.bM*A.mE*b+A.bO[1]*c,A.bR[2]*a+A.bM*A.mE*b+A.bO[2]*c]}
function rad(v,s){var bm=A.bM,o=[0,0,A.Re+A.h0],gr=hitN(o,v,A.Re),far=gr>0?gr:hitF(o,v,A.Ra),st=far/A.N,mu=dt(v,s),pR=3/(16*Math.PI)*(1+mu*mu),g=A.g,pM=3/(8*Math.PI)*((1-g*g)*(1+mu*mu))/((2+g*g)*Math.pow(1+g*g-2*g*mu,1.5)),tR=0,tM=0,tO=0,out=[0,0,0],j;
for(var i=0;i<A.N;i++){var k=(i+0.5)*st,p=[o[0]+v[0]*k,o[1]+v[1]*k,o[2]+v[2]*k],h=Math.sqrt(dt(p,p))-A.Re,e=dens(h);tR+=e[0]*st;tM+=e[1]*st;tO+=e[2]*st;var ds=d2s(p,s);if(!ds)continue;
for(j=0;j<3;j++){var tau=ds[j]+A.bR[j]*tR+bm*A.mE*tM+A.bO[j]*tO;out[j]+=Math.exp(-tau)*(A.bR[j]*e[0]*pR+bm*e[1]*pM)*st}}
var lo=d2s([0,0,A.Re+A.msL],s),hi=d2s([0,0,A.Re+A.msH],s);
for(j=0;j<3;j++){var lit=A.msW*(lo?Math.exp(-lo[j]):0)+(1-A.msW)*(hi?Math.exp(-hi[j]):0),th=1-Math.exp(-A.bR[j]*tR-bm*A.mE*tM);out[j]=(out[j]+A.msS*A.msC[j]*th*lit)*A.sun}
return out}
function expo(a){var k=A.ek;if(a>=k[0][0])return k[0][1];for(var i=0;i<k.length-1;i++){if(a<=k[i][0]&&a>=k[i+1][0]){var t=(k[i][0]-a)/(k[i][0]-k[i+1][0]);return Math.exp(Math.log(k[i][1])*(1-t)+Math.log(k[i+1][1])*t)}}return k[k.length-1][1]}
function skyc(v,s,alt,x){var L=rad(v,s),e=expo(alt),el=Math.asin(Math.max(-1,Math.min(1,v[2])))/P,f=Math.exp(-Math.max(0,el)/A.nF),o=[0,0,0],g=GL*Math.min(1,e/A.ek[A.ek.length-1][1]),w=A.ts*(1-ss(-3,1,alt))*ss(4,25,el),c=[L[0]*e,L[1]*e,L[2]*e],Y=0.2126*c[0]+0.7152*c[1]+0.0722*c[2];for(var j=0;j<3;j++){c[j]+=(Y*A.tb[j]-c[j])*Math.max(0,w);o[j]=Math.round(255*Math.pow(1-Math.exp(-Math.max(0,(c[j]+(A.nZ[j]+A.nH[j]*f)*g)*x)),1/2.2))}return o}
function meter(s,alt){if(alt<-6||dt(s,vdir(0,0))<0)return 1;var e=expo(alt),hy=1-2*CAM.horizon,sum=0,K=${METER.knee};for(var j=0;j<${METER.ny};j++){var sy=hy+(1-hy)*((j+0.5)/${METER.ny});for(var i=0;i<${METER.nx};i++){var L=rad(vdir(-1+2*((i+0.5)/${METER.nx}),sy),s),y=(0.2126*L[0]+0.7152*L[1]+0.0722*L[2])*e;sum+=K*(1-Math.exp(-y/K))}}var m=sum/${METER.nx * METER.ny};return Math.round(Math.min(1,Math.max(${METER.min},${METER.target}/Math.max(m,1e-6)))*1000)/1000}
function vdir(sx,sy){var tH=Math.tan(CAM.hfov/2*P),tV=tH/CAM.aspect,pi=Math.atan((2*CAM.horizon-1)*tV),y0=CAM.bearing*P,f=[Math.sin(y0)*Math.cos(pi),Math.cos(y0)*Math.cos(pi),Math.sin(pi)],r=[Math.cos(y0),-Math.sin(y0),0],u=[-Math.sin(y0)*Math.sin(pi),-Math.cos(y0)*Math.sin(pi),Math.cos(pi)],d=[0,1,2].map(function(i){return f[i]+r[i]*sx*tH+u[i]*sy*tV}),n=Math.sqrt(dt(d,d));return[d[0]/n,d[1]/n,d[2]/n]}
function sdir(alt,az){return[Math.cos(alt*P)*Math.sin(az*P),Math.cos(alt*P)*Math.cos(az*P),Math.sin(alt*P)]}
function weather(){try{var hs=location.hash.replace(/^#/,""),m=hs.match(/(?:^|&)w=([^&]+)/),hm=hs.match(/(?:^|&)h=(\d{1,3})/),rh=hm?Math.min(100,Number(hm[1])):null;if(m){var kd=decodeURIComponent(m[1]).split(":")[0],n=Number(decodeURIComponent(m[1]).split(":")[1]),a=isNaN(n)?0.5:Math.min(1,Math.max(0,n));
if(kd==="clear")return{cloud:0.05,precip:0,fog:0,humidity:rh};if(kd==="partly")return{cloud:isNaN(n)?0.5:a,precip:0,fog:0,humidity:rh};if(kd==="cloudy")return{cloud:isNaN(n)?0.97:Math.max(0.85,a),precip:0,fog:0,humidity:rh};
if(kd==="rain")return{cloud:0.97,precip:a,fog:0.25,humidity:rh};if(kd==="snow")return{cloud:0.95,precip:a,fog:0.3,humidity:rh};if(kd==="fog")return{cloud:0.9,precip:0,fog:isNaN(n)?0.7:a,humidity:rh===null?99:rh}}
var raw=localStorage.getItem("michilu:weather");if(raw){var v=JSON.parse(raw);if(v&&v.w&&typeof v.t==="number"&&Date.now()-v.t<=${30 * 60e3})return v.w}}catch(e){}return{cloud:0.08,precip:0,fog:0,humidity:null}}
function air(W,d){var mo=new Date(d.getTime()+32400000).getUTCMonth()+1,rh=W.humidity===null||W.humidity===undefined?RHN[mo]:Math.min(100,Math.max(0,W.humidity)),r=Math.min(97,Math.max(10,rh))/100,ae=Math.round(Math.min(2.5,Math.max(0.1,Math.pow(0.5/(1-r),0.8)*AS[mo]))*1000)/1000;AR=ae;GL=Math.round(Math.min(1.9,Math.max(0.85,0.65+0.35*ae))*1000)/1000}
function cloudy(c,cl){var gy=0.2126*c[0]+0.7152*c[1]+0.0722*c[2],k=cl*0.85,m=[0.97,0.98,1],o=[0,0,0];for(var i=0;i<3;i++)o[i]=Math.round((c[i]*(1-k)+gy*k*m[i])*(1-cl*0.1));return o}
var OCC=${JSON.stringify([[0, 0.55], [1, 0.42], [2, 0.32], [3, 0.28], [4, 0.28], [5, 0.36], [6, 0.5], [7, 0.62], [8, 0.75], [9, 0.8], [16, 0.8], [17, 0.9], [18, 1], [21, 1], [22, 0.92], [23, 0.75], [24, 0.55]])};
function occ(h){h=((h%24)+24)%24;for(var i=0;i<OCC.length-1;i++){if(h>=OCC[i][0]&&h<=OCC[i+1][0])return OCC[i][1]+(OCC[i+1][1]-OCC[i][1])*(h-OCC[i][0])/(OCC[i+1][0]-OCC[i][0])}return 0.55}
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
function hex(c){var s="#";for(var i=0;i<3;i++){var v=Math.round(Math.min(255,Math.max(0,c[i]))).toString(16);s+=(v.length<2?"0":"")+v}return s}
function at(){var m=location.hash.replace(/^#/,"").match(/(?:^|&)t=([^&]+)/);if(m){var v=decodeURIComponent(m[1]),d=new Date(/[zZ]|[+-]\\d\\d:?\\d\\d$/.test(v)?v:v+(v.length<=10?"T12:00":"")+"+09:00");if(!isNaN(d.getTime()))return d}return new Date()}
var d0=at(),s=sun(d0),a=s[0],up=s[1],az=s[2],b=blend(a,up),sd=sdir(a,az),hy=1-2*CAM.horizon,W=weather();air(W,d0);var X=meter(sd,a),top=cloudy(skyc(vdir(0,1),sd,a,X),W.cloud),md=cloudy(skyc(vdir(0,(1+hy)/2),sd,a,X),W.cloud),hz=cloudy(skyc(vdir(0,hy+0.04),sd,a,X),W.cloud);
var jh=(((d0.getTime()+32400000)%86400000)+86400000)%86400000/3600000,lightsV=ss(4,-6,a)*occ(jh);
var lum=(0.2126*top[0]+0.7152*top[1]+0.0722*top[2])/255,dark=lum<0.42;
var near=Math.exp(-((a+1)*(a+1))/(2*4.5*4.5)),warm=a<8&&a>-8?ss(8,0,a)*(1-ss(-2,-8,a)):0,n=b.night+0.5*(b.twilight+b.dawn);
var hl=[0,1,2].map(function(i){return [255,255,255][i]*(1-warm)*(1-n)+[255,222,160][i]*warm*(1-n)+[190,208,245][i]*n});
var st=document.documentElement.style,set=function(k,v){st.setProperty(k,v)};
set(V.day,b.day.toFixed(3));set(V.golden,b.golden.toFixed(3));set(V.twilight,b.twilight.toFixed(3));set(V.dawn,b.dawn.toFixed(3));set(V.night,b.night.toFixed(3));
var O=["night","twilight","dawn","golden","day"],sm=0;for(var j=0;j<O.length;j++){sm+=b[O[j]];set("--sky-l-"+O[j],(sm>0?b[O[j]]/sm:0).toFixed(3))}
set(V.top,hex(top));set(V.mid,hex(md));set(V.horizon,hex(hz));set(V.glow,up?"#ffd6aa":"#ffb278");set(V.glowA,near.toFixed(2));set(V.hl,hex(hl));set(V.lights,lightsV.toFixed(2));set(V.cloud,W.cloud.toFixed(2));set(V.precip,W.precip.toFixed(2));set(V.fog,W.fog.toFixed(2));
set(V.ink,dark?"255,255,255":"15,27,51");set(V.inkSoft,dark?"232,238,248":"38,50,74");set(V.halo,dark?"0,12,40":"255,255,255");
set(V.dark,dark?"1":"0");set(V.nightness,n.toFixed(2));set(V.lightX,String(Math.round(Math.min(100,Math.max(0,(az-60)/240*100)))));set(V.sunIn,"0");
document.documentElement.dataset.skyDark=dark?"1":"0";
}catch(e){}})()`;
