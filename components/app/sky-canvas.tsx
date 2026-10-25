"use client";

// 帯をコードで描く（WebGL）。写真の空は使わず、今の太陽の位置（lib/app/sun.ts）から大気の散乱（lib/app/atmosphere.ts と同じ式）で
// 空を計算し、その上に 雲（雲量は気象庁の観測から。lib/app/weather.ts）、太陽本体とにじみ、月（満ち欠けは太陽の向きから）、星、
// 街の写真（昼・夕焼け・薄暮・夜明け・夜を太陽の高度で混ぜる）、窓の明かり（時刻ごとに点いている割合を窓ごとに決める）、
// 霧・雨・雪 を重ねる。
//  1 枚目：空の散乱を小さな絵（1/4 の解像度）に描く。2 枚目：それを引き伸ばして、太陽・雲・街・明かり・天気を画素ごとに合成する。
//  1 分ごと（SKY_EVENT）と #t= / #w= の変更で描き直し、雲が流れる・雨や雪が降るときだけ 24fps で動かす（動きを減らす設定では止める）。
//  WebGL が使えない端末では何も描かず、下の CSS の層（同じ式の色・写真）が見える
import * as SunCalc from "suncalc";
import { useEffect, useRef, type CSSProperties } from "react";
import { ATMOS, dirFromAltAz, exposureFor, sunTransmittance } from "@/lib/app/atmosphere";
import { BASE, blend, HOME_CAMERA, overrideTime, PHOTO_ORDER, smoothstep, solar, type Camera } from "@/lib/app/sun";
import { currentWeather, jstHours, lightsVisibility, occupancy, towerLit } from "@/lib/app/weather";
import { SKY_EVENT } from "./sky-event";

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}`;

/** 大気の式（lib/app/atmosphere.ts と同じ。定数もそこから埋める） */
const ATMOS_GLSL = `
const float Re=${ATMOS.Re.toFixed(1)},Ra=${ATMOS.Ra.toFixed(1)},h0=${ATMOS.h0};
const vec3 betaR=vec3(${ATMOS.betaR.join(",")});const float HR=${ATMOS.HR.toFixed(1)};
const float betaM=${ATMOS.betaM},HM=${ATMOS.HM},g=${ATMOS.g},mieExt=${ATMOS.mieExt};
const vec3 betaO=vec3(${ATMOS.betaO.join(",")});
const float SUN=${ATMOS.sun.toFixed(1)};
const vec3 msColor=vec3(${ATMOS.msColor.join(",")});const float msStrength=${ATMOS.msStrength},msLow=${ATMOS.msLow.toFixed(1)},msHigh=${ATMOS.msHigh.toFixed(1)},msLowW=${ATMOS.msLowWeight};
const vec3 nightZenith=vec3(${ATMOS.nightZenith.join(",")}),nightHorizon=vec3(${ATMOS.nightHorizon.join(",")});const float nightFall=${ATMOS.nightHorizonFalloff.toFixed(1)};
const int N=${ATMOS.samples},NL=${ATMOS.lightSamples};
float hitFar(vec3 o,vec3 d,float r){float b=dot(o,d);float c=dot(o,o)-r*r;float q=b*b-c;if(q<0.0)return -1.0;return -b+sqrt(q);}
float hitNear(vec3 o,vec3 d,float r){float b=dot(o,d);float c=dot(o,o)-r*r;float q=b*b-c;if(q<0.0)return -1.0;float t=-b-sqrt(q);return t>0.0?t:-1.0;}
vec3 dens(float h){return vec3(exp(-h/HR),exp(-h/HM),max(0.0,1.0-abs(h-25.0)/15.0));}
bool depthToSun(vec3 p,vec3 s,out vec3 tau){if(hitNear(p,s,Re)>0.0){tau=vec3(0.0);return false;}float t=hitFar(p,s,Ra);float st=t/float(NL);vec3 d=vec3(0.0);
for(int i=0;i<NL;i++){float k=(float(i)+0.5)*st;vec3 q=p+s*k;d+=dens(length(q)-Re)*st;}
tau=betaR*d.x+vec3(betaM*mieExt*d.y)+betaO*d.z;return true;}
vec3 lit(vec3 s){vec3 a;vec3 b;float wa=depthToSun(vec3(0.0,0.0,Re+msLow),s,a)?1.0:0.0;float wb=depthToSun(vec3(0.0,0.0,Re+msHigh),s,b)?1.0:0.0;
return msLowW*wa*exp(-a)+(1.0-msLowW)*wb*exp(-b);}
vec3 radiance(vec3 v,vec3 s){vec3 o=vec3(0.0,0.0,Re+h0);float gr=hitNear(o,v,Re);float far=gr>0.0?gr:hitFar(o,v,Ra);float st=far/float(N);
float mu=dot(v,s);float pR=3.0/(16.0*3.14159265)*(1.0+mu*mu);float pM=3.0/(8.0*3.14159265)*((1.0-g*g)*(1.0+mu*mu))/((2.0+g*g)*pow(1.0+g*g-2.0*g*mu,1.5));
vec3 t=vec3(0.0);vec3 acc=vec3(0.0);
for(int i=0;i<N;i++){float k=(float(i)+0.5)*st;vec3 p=o+v*k;vec3 dn=dens(length(p)-Re);t+=dn*st;vec3 ds;if(!depthToSun(p,s,ds))continue;
vec3 tau=ds+betaR*t.x+vec3(betaM*mieExt*t.y)+betaO*t.z;acc+=exp(-tau)*(betaR*dn.x*pR+vec3(betaM*dn.y*pM))*st;}
vec3 thick=1.0-exp(-betaR*t.x-vec3(betaM*mieExt*t.y));acc+=msStrength*msColor*thick*lit(s);
return acc*SUN;}
vec3 viewDir(vec2 uv,vec3 f,vec3 r,vec3 u,vec2 tn){float sx=uv.x*2.0-1.0;float sy=uv.y*2.0-1.0;return normalize(f+r*(sx*tn.x)+u*(sy*tn.y));}`;

/** 1 枚目：空（露出をかけた線形の明るさ。夜の地も足す）。暗い所の階調を残すため平方根で保存する */
const FRAG_SKY = `precision highp float;
uniform vec2 u_res;uniform vec3 u_f,u_r,u_u;uniform vec2 u_tan;uniform vec3 u_sun;uniform float u_exposure;
${ATMOS_GLSL}
void main(){vec2 uv=gl_FragCoord.xy/u_res;vec3 v=viewDir(uv,u_f,u_r,u_u,u_tan);
float elev=degrees(asin(clamp(v.z,-1.0,1.0)));
vec3 c=radiance(v,u_sun)*u_exposure+nightZenith+nightHorizon*exp(-max(0.0,elev)/nightFall);
gl_FragColor=vec4(sqrt(clamp(c/4.0,0.0,1.0)),1.0);}`;

/** 2 枚目：合成（太陽・月・星・雲・街・明かり・霧・雨・雪） */
const FRAG_MAIN = `precision highp float;
uniform vec2 u_res;uniform vec3 u_f,u_r,u_u;uniform vec2 u_tan;
uniform vec3 u_sun;uniform vec3 u_sunT;uniform vec3 u_moon;uniform float u_moonOn;uniform float u_stars;uniform float u_day;
uniform sampler2D u_sky;uniform sampler2D u_p0;uniform sampler2D u_p1;uniform sampler2D u_p2;uniform sampler2D u_p3;uniform sampler2D u_p4;uniform sampler2D u_lights;uniform sampler2D u_mask;
uniform float u_w[5];uniform float u_city;uniform float u_lightsVis;uniform float u_occ;uniform float u_tower;
uniform float u_cloud;uniform float u_precip;uniform float u_snow;uniform float u_fog;uniform float u_time;uniform vec2 u_wind;uniform float u_horizon;
const float sunRad=${((ATMOS.sunRadius * Math.PI) / 180).toFixed(6)},moonRad=${((ATMOS.moonRadius * Math.PI) / 180).toFixed(6)};
float hash21(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y);}
float fbm(vec2 p){float a=0.5;float s=0.0;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+vec2(1.7,9.2);a*=0.5;}return s;}
vec3 skyAt(vec2 uv){vec3 e=texture2D(u_sky,uv).rgb;return e*e*4.0;}
vec3 tone(vec3 c){return pow(1.0-exp(-max(c,0.0)),vec3(1.0/2.2));}
vec3 viewDir(vec2 uv){float sx=uv.x*2.0-1.0;float sy=uv.y*2.0-1.0;return normalize(u_f+u_r*(sx*u_tan.x)+u_u*(sy*u_tan.y));}
/* 雲：高さ 1.5km の層を見上げた座標。濃さと陰影（太陽の側が明るい） */
vec2 cloudUV(vec3 v){float z=max(v.z,0.02);return v.xy/z*1.5;}
float cloudNoise(vec2 p){return fbm(p)*0.72+fbm(p*2.9+vec2(3.1,7.7))*0.28;}
float cloudDensity(vec3 v,out float shade){shade=0.6;if(v.z<0.012||u_cloud<=0.0)return 0.0;
vec2 p=cloudUV(v)*0.36+u_wind*u_time;float n=cloudNoise(p);float t=1.0-u_cloud*1.06;float d=smoothstep(t,t+0.3,n)*smoothstep(0.012,0.1,v.z);
vec2 sd=normalize(u_sun.xy+vec2(1e-4,0.0));float n2=cloudNoise(p+sd*0.1);shade=clamp(0.55+(n-n2)*5.0,0.0,1.0);return d;}
/* 雨：細長い枠の中を落ちる筋 */
float rain(vec2 uv,vec2 scale,float speed,float seed){vec2 q=vec2(uv.x*1.43+uv.y*0.1,uv.y)*scale;vec2 c=floor(q);vec2 f=fract(q);float h=hash21(c+seed);
if(h>u_precip*0.9+0.03)return 0.0;float x=0.15+0.7*fract(h*7.3);float y=fract(f.y+u_time*speed+h*3.0);
return smoothstep(0.07,0.0,abs(f.x-x))*smoothstep(0.0,0.2,y)*(1.0-smoothstep(0.5,0.95,y));}
/* 雪：ゆっくり揺れながら落ちる粒 */
float snow(vec2 uv,float scale,float speed,float seed){vec2 q=vec2(uv.x*1.43,uv.y+u_time*speed)*scale;vec2 c=floor(q);vec2 f=fract(q);float h=hash21(c+seed);
if(h>0.5)return 0.0;vec2 o=vec2(fract(h*13.1),fract(h*7.7));o.x+=0.22*sin(u_time*1.2+h*40.0);float r=0.07+0.09*fract(h*31.0);
return smoothstep(r,r*0.25,length(f-o));}
void main(){
vec2 uv=gl_FragCoord.xy/u_res;vec2 iuv=vec2(uv.x,1.0-uv.y);
vec3 v=viewDir(uv);
vec3 sky=skyAt(uv);
float skyLum=dot(sky,vec3(0.2126,0.7152,0.0722));
/* 雲 */
float shade;float d=cloudDensity(v,shade);float sh2;float dSun=cloudDensity(u_sun,sh2);float sunVis=(1.0-dSun)*(1.0-u_cloud*0.5);
vec3 zen=skyAt(vec2(0.5,0.96));
vec3 litCol=u_sunT*(1.05+0.25*u_day);vec3 amb=zen*0.8+vec3(0.06);
vec3 dayCol=mix(amb,litCol,(shade*0.75+0.1)*(1.0-0.55*u_cloud));
vec3 nightCol=sky*0.55+vec3(0.075,0.052,0.036)*(0.7+0.5*(1.0-clamp(v.z*4.0,0.0,1.0)))+vec3(0.006,0.007,0.012);
vec3 cloudCol=mix(nightCol,dayCol,u_day);
/* 太陽：本体とにじみ（雲でさえぎられる） */
float th=acos(clamp(dot(v,u_sun),-1.0,1.0));
float disc=1.0-smoothstep(sunRad*0.85,sunRad,th);
sky+=u_sunT*(disc*8.0*sunVis*sunVis+(4.0*exp(-th*th/(2.0*0.028*0.028))+0.9*exp(-th/0.052)+0.2*exp(-th/0.157))*sunVis);
/* 月 */
if(u_moonOn>0.5){vec3 m=u_moon;vec3 mu_=normalize(cross(m,vec3(0.0,0.0,1.0)));vec3 mv=cross(mu_,m);vec3 dl=v-m;float dx=dot(dl,mu_)/moonRad;float dy=dot(dl,mv)/moonRad;float rr=dx*dx+dy*dy;
float vis=clamp(1.0-skyLum*3.0,0.08,1.0)*(1.0-u_cloud*0.85);float tm=acos(clamp(dot(v,m),-1.0,1.0));
if(rr<1.0){float nz=sqrt(1.0-rr);vec3 n=-m*nz+mu_*dx+mv*dy;float l=max(0.0,dot(n,u_sun));float edge=1.0-smoothstep(0.9,1.0,rr);sky+=vec3(1.0,0.97,0.9)*(l*0.85+0.03)*edge*vis;}
sky+=vec3(0.9,0.92,1.0)*0.09*exp(-tm/0.04)*vis;}
/* 星（暗いときだけ。雲の後ろ。街明かりで地平線の近くは見えない） */
if(u_stars>0.0){float az=atan(v.x,v.y);vec2 cell=vec2(az,asin(clamp(v.z,-1.0,1.0)))/0.0061;vec2 id=floor(cell);float h1=hash21(id);
if(h1<0.013){vec2 cen=id+0.5+vec2(hash21(id+1.3),hash21(id+7.1))*0.6-0.3;float dd=length(cell-cen);float b=pow(hash21(id+3.7),3.0)*0.9+0.08;
sky+=vec3(0.85,0.9,1.0)*b*exp(-dd*dd*9.0)*u_stars*clamp(1.0-skyLum*6.0,0.0,1.0)*smoothstep(0.03,0.3,v.z);}}
sky=mix(sky,cloudCol,d*0.93);
vec3 col=tone(sky);
/* 街（写真を太陽の高度で混ぜる。街のマスクの中だけ） */
float m=texture2D(u_mask,iuv).a*u_city;
if(m>0.001){vec3 ph=u_w[0]*texture2D(u_p0,iuv).rgb+u_w[1]*texture2D(u_p1,iuv).rgb+u_w[2]*texture2D(u_p2,iuv).rgb+u_w[3]*texture2D(u_p3,iuv).rgb+u_w[4]*texture2D(u_p4,iuv).rgb;
float gy=dot(ph,vec3(0.2126,0.7152,0.0722));
ph=mix(ph,vec3(gy),u_cloud*0.22)*(1.0-u_cloud*0.08-u_precip*0.18);
ph=mix(ph,ph*vec3(0.9,0.94,1.06),u_precip*0.8);
ph=mix(ph,ph*0.9+vec3(0.06),u_snow*0.5);
col=mix(col,ph,m);
/* 窓の明かり：窓ごとに点いているか（時刻の割合）を決め、暗いときだけ見える。東京タワー（枠の中）は 24 時まで点灯。薄暮の写真には光が写っているので半分に */
vec4 L=texture2D(u_lights,iuv);vec2 cell=floor(iuv*vec2(98.0,69.0));float on=step(hash21(cell+11.7),u_occ);
bool tower=iuv.x>0.538&&iuv.x<0.619&&iuv.y>0.411&&iuv.y<0.728;if(tower)on=u_tower;
col+=L.rgb*L.a*u_lightsVis*on*(1.0+0.4*u_precip)*(1.0-0.5*u_w[1])*m;}
/* 霧・もや：遠い建物（スカイラインの近く）ほど空の色に溶ける */
vec3 haze=tone(skyAt(vec2(uv.x,1.0-u_horizon+0.02)));
float fogC=clamp(u_fog+u_precip*0.35+u_snow*0.3,0.0,1.0);
float fogA=m>0.5?fogC*smoothstep(0.8,u_horizon-0.05,iuv.y):fogC*0.55*smoothstep(0.25,u_horizon,iuv.y);
col=mix(col,haze,clamp(fogA,0.0,0.85));
/* 雨・雪 */
if(u_precip>0.0){if(u_snow>0.5){float s=snow(uv,26.0,0.075,1.0)+0.6*snow(uv,52.0,0.13,5.0);col=mix(col,vec3(0.96,0.97,1.0),clamp(s,0.0,1.0)*0.9);}
else{float r=rain(uv,vec2(62.0,7.0),1.4,1.0)+0.6*rain(uv,vec2(115.0,12.0),2.1,7.0);col+=vec3(0.72,0.78,0.88)*r*0.34*(0.5+0.5*u_precip);}}
col+=(hash21(gl_FragCoord.xy)-0.5)/255.0;
gl_FragColor=vec4(col,1.0);}`;

type Prog = { prog: WebGLProgram; loc: Record<string, WebGLUniformLocation | null> };
type Gl = {
  gl: WebGLRenderingContext;
  sky: Prog;
  main: Prog;
  fbo: WebGLFramebuffer;
  skyTex: WebGLTexture;
  skyW: number;
  skyH: number;
  tex: Record<string, WebGLTexture>;
};

const SKY_UNIFORMS = ["u_res", "u_f", "u_r", "u_u", "u_tan", "u_sun", "u_exposure"];
const MAIN_UNIFORMS = ["u_res", "u_f", "u_r", "u_u", "u_tan", "u_sun", "u_sunT", "u_moon", "u_moonOn", "u_stars", "u_day", "u_sky", "u_p0", "u_p1", "u_p2", "u_p3", "u_p4", "u_lights", "u_mask", "u_w[0]", "u_city", "u_lightsVis", "u_occ", "u_tower", "u_cloud", "u_precip", "u_snow", "u_fog", "u_time", "u_wind", "u_horizon"];

function compile(gl: WebGLRenderingContext, frag: string, names: string[]): Prog | null {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("sky shader:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT);
  const fs = sh(gl.FRAGMENT_SHADER, frag);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("sky program:", gl.getProgramInfoLog(prog));
    return null;
  }
  const loc: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) loc[n] = gl.getUniformLocation(prog, n);
  return { prog, loc };
}

/** 1 画素の絵（読み込みが終わるまでの仮） */
function blankTexture(gl: WebGLRenderingContext, rgba: [number, number, number, number]): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function init(canvas: HTMLCanvasElement, city: boolean): Gl | null {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
  if (!gl) return null;
  const sky = compile(gl, FRAG_SKY, SKY_UNIFORMS);
  const main = compile(gl, FRAG_MAIN, MAIN_UNIFORMS);
  if (!sky || !main) return null;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  for (const p of [sky, main]) {
    const a = gl.getAttribLocation(p.prog, "a");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  }
  // 1 枚目の絵（1/4 の解像度）
  const skyW = Math.max(64, Math.round(canvas.width / 4));
  const skyH = Math.max(48, Math.round(canvas.height / 4));
  const skyTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, skyTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, skyW, skyH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, skyTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const tex: Record<string, WebGLTexture> = {};
  for (const k of PHOTO_ORDER) tex[k] = blankTexture(gl, [128, 128, 128, 255]);
  tex.lights = blankTexture(gl, [0, 0, 0, 0]);
  tex.mask = blankTexture(gl, city ? [255, 255, 255, 255] : [0, 0, 0, 0]);
  return { gl, sky, main, fbo, skyTex, skyW, skyH, tex };
}

/** 写真を読み、テクスチャに入れる（全部読み終えたら知らせる） */
function loadTextures(g: Gl, dpr: number, onLoaded: () => void): () => void {
  let alive = true;
  const suffix = dpr >= 3 ? "@3x" : "@2x";
  const names: [string, string][] = [...PHOTO_ORDER.map((k): [string, string] => [k, `/home/sky/${k}${suffix}.webp`]), ["lights", `/home/sky/lights${suffix}.webp`], ["mask", "/home/sky/city-mask.png"]];
  let pending = names.length;
  for (const [key, url] of names) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!alive) return;
      const { gl } = g;
      gl.bindTexture(gl.TEXTURE_2D, g.tex[key]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      if (--pending === 0) onLoaded();
    };
    img.onerror = () => {
      if (alive && --pending === 0) onLoaded();
    };
    img.src = url;
  }
  return () => {
    alive = false;
  };
}

const R = Math.PI / 180;

/** カメラの基底（projectSun と同じ） */
function basis(cam: Camera) {
  const tanH = Math.tan((cam.hfov / 2) * R);
  const tanV = tanH / cam.aspect;
  const pitch = Math.atan((2 * cam.horizon - 1) * tanV);
  const y0 = cam.bearing * R;
  return {
    tanH,
    tanV,
    f: [Math.sin(y0) * Math.cos(pitch), Math.cos(y0) * Math.cos(pitch), Math.sin(pitch)],
    r: [Math.cos(y0), -Math.sin(y0), 0],
    u: [-Math.sin(y0) * Math.sin(pitch), -Math.cos(y0) * Math.sin(pitch), Math.cos(pitch)],
  };
}

function draw(g: Gl, cam: Camera, at: Date, city: boolean, seconds: number) {
  const { gl } = g;
  const s = solar(at);
  const sun = dirFromAltAz(s.altitude, s.azimuth);
  const mp = SunCalc.getMoonPosition(at, BASE.lat, BASE.lng);
  const moon = dirFromAltAz(mp.altitude, mp.azimuth);
  const b = basis(cam);
  const w = currentWeather();
  const T = sunTransmittance(sun);
  const setCam = (p: Prog, width: number, height: number) => {
    gl.uniform2f(p.loc.u_res, width, height);
    gl.uniform3f(p.loc.u_f, b.f[0], b.f[1], b.f[2]);
    gl.uniform3f(p.loc.u_r, b.r[0], b.r[1], b.r[2]);
    gl.uniform3f(p.loc.u_u, b.u[0], b.u[1], b.u[2]);
    gl.uniform2f(p.loc.u_tan, b.tanH, b.tanV);
    gl.uniform3f(p.loc.u_sun, sun[0], sun[1], sun[2]);
  };
  // 1 枚目：空
  gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo);
  gl.viewport(0, 0, g.skyW, g.skyH);
  gl.useProgram(g.sky.prog);
  setCam(g.sky, g.skyW, g.skyH);
  gl.uniform1f(g.sky.loc.u_exposure, exposureFor(s.altitude));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // 2 枚目：合成
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.useProgram(g.main.prog);
  setCam(g.main, gl.drawingBufferWidth, gl.drawingBufferHeight);
  const m = g.main.loc;
  gl.uniform3f(m.u_sunT, T[0], T[1], T[2]);
  gl.uniform3f(m.u_moon, moon[0], moon[1], moon[2]);
  gl.uniform1f(m.u_moonOn, mp.altitude > -0.5 ? 1 : 0);
  gl.uniform1f(m.u_stars, smoothstep(-8, -16, s.altitude));
  gl.uniform1f(m.u_day, smoothstep(-6, 4, s.altitude));
  const units: [string, WebGLTexture][] = [["u_sky", g.skyTex], ["u_p0", g.tex[PHOTO_ORDER[0]]], ["u_p1", g.tex[PHOTO_ORDER[1]]], ["u_p2", g.tex[PHOTO_ORDER[2]]], ["u_p3", g.tex[PHOTO_ORDER[3]]], ["u_p4", g.tex[PHOTO_ORDER[4]]], ["u_lights", g.tex.lights], ["u_mask", g.tex.mask]];
  units.forEach(([name, tex], i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(m[name], i);
  });
  const bl = blend(s.altitude, s.rising);
  gl.uniform1fv(m["u_w[0]"], new Float32Array(PHOTO_ORDER.map((k) => bl[k])));
  gl.uniform1f(m.u_city, city ? 1 : 0);
  gl.uniform1f(m.u_lightsVis, lightsVisibility(s.altitude));
  gl.uniform1f(m.u_occ, occupancy(jstHours(at)));
  gl.uniform1f(m.u_tower, towerLit(at) ? 1 : 0);
  gl.uniform1f(m.u_cloud, w.cloud);
  gl.uniform1f(m.u_precip, w.precip);
  gl.uniform1f(m.u_snow, w.kind === "snow" ? 1 : 0);
  gl.uniform1f(m.u_fog, w.fog);
  gl.uniform1f(m.u_time, seconds);
  // 雲の流れ：風は西寄り（画面の左から右へゆっくり）
  gl.uniform2f(m.u_wind, 0.004 + (w.wind ?? 2) * 0.0012, 0.0015);
  gl.uniform1f(m.u_horizon, cam.horizon);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** 今の日時（#t= で固定していればそれ） */
const now = () => overrideTime(location.hash) ?? new Date();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 帯のキャンバス。親いっぱいに広げて使う。city=true で街の写真と明かりも描く（ホーム）。描けたら 600ms で現れる。
 * 大きさは幅 393pt × 端末の倍率（3 倍まで）で固定し、CSS で引き伸ばす
 */
export function SkyCanvas({ camera = HOME_CAMERA, city = false, className = "", style }: { camera?: Camera; city?: boolean; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    canvas.width = Math.round(393 * dpr);
    canvas.height = Math.round((393 / camera.aspect) * dpr);
    let g = init(canvas, city);
    if (!g) return;
    let shown = false;
    let last: Date | null = null;
    let frame = 0;
    let loop = 0;
    let ready = !city;
    const t0 = performance.now();
    const seconds = () => ((performance.now() - t0) / 1000) % 3600;
    const render = (at: Date) => {
      if (!g) return;
      draw(g, camera, at, city, seconds());
      last = at;
      if (!shown && ready) {
        shown = true;
        canvas.style.opacity = "1";
      }
    };
    /** 雲が流れる・雨や雪が降るときだけ、見えている間 24fps で動かす */
    const animate = () => {
      cancelAnimationFrame(loop);
      const w = currentWeather();
      const moving = (w.cloud > 0.05 && w.cloud < 0.985) || w.precip > 0;
      if (!moving || reduced() || document.visibilityState !== "visible") return;
      let prev = 0;
      const tick = (t: number) => {
        loop = requestAnimationFrame(tick);
        if (t - prev < 1000 / 24) return;
        prev = t;
        render(now());
      };
      loop = requestAnimationFrame(tick);
    };
    /** 時刻が飛んだとき（#t= の変更など）は、前の時刻から 1.2 秒かけて動かす */
    const go = () => {
      const target = now();
      cancelAnimationFrame(frame);
      const from = last;
      if (!from || Math.abs(target.getTime() - from.getTime()) < 3 * 60e3 || reduced()) {
        render(target);
        animate();
        return;
      }
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / 1200);
        const e = 1 - Math.pow(1 - p, 3);
        render(new Date(from.getTime() + (target.getTime() - from.getTime()) * e));
        if (p < 1) frame = requestAnimationFrame(tick);
        else animate();
      };
      frame = requestAnimationFrame(tick);
    };
    const stopLoading = city
      ? loadTextures(g, dpr, () => {
          ready = true;
          render(now());
          animate();
        })
      : () => {};
    render(now());
    animate();
    addEventListener(SKY_EVENT, go);
    const onVisible = () => (document.visibilityState === "visible" ? animate() : cancelAnimationFrame(loop));
    document.addEventListener("visibilitychange", onVisible);
    const onLost = (e: Event) => {
      e.preventDefault();
      canvas.style.opacity = "0";
      cancelAnimationFrame(loop);
      g = null;
    };
    const onRestored = () => {
      g = init(canvas, city);
      shown = false;
      if (g && city) loadTextures(g, dpr, () => render(now()));
      render(now());
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      stopLoading();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(loop);
      removeEventListener(SKY_EVENT, go);
      document.removeEventListener("visibilitychange", onVisible);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const ext = g?.gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    };
  }, [camera, city]);
  return <canvas ref={ref} aria-hidden className={`sky-canvas block h-full w-full ${className}`} style={{ opacity: 0, transition: "opacity 600ms ease", ...style }} />;
}
