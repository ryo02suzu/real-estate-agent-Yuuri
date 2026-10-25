"use client";

// 空をコードで描く（WebGL）。写真の空は使わず、今の太陽の位置（lib/app/sun.ts）から大気の散乱（lib/app/atmosphere.ts と同じ式）で
// 空の色を画素ごとに計算し、太陽本体とそのにじみ、月（満ち欠けは太陽の向きから自然に決まる）、星、夜の街明かりの照り返しを描く。
// 1分ごと（空の合図 SKY_EVENT）と、#t= で時刻が飛んだときに描き直す（飛んだときは 1.2 秒かけて動かす）。
// WebGL が使えない端末では何も描かず、下の CSS のグラデーション（同じ式から出した色）が見える
import * as SunCalc from "suncalc";
import { useEffect, useRef, type CSSProperties } from "react";
import { ATMOS, dirFromAltAz, exposureFor } from "@/lib/app/atmosphere";
import { BASE, HOME_CAMERA, overrideTime, smoothstep, solar, type Camera } from "@/lib/app/sun";
import { SKY_EVENT } from "./sky-event";

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}`;

/** 大気の式は lib/app/atmosphere.ts と同じ（定数もそこから埋める） */
const FRAG = `precision highp float;
uniform vec2 u_res;uniform vec3 u_f,u_r,u_u;uniform vec2 u_tan;uniform vec3 u_sun;uniform float u_exposure;
uniform vec3 u_moon;uniform float u_moonOn;uniform float u_stars;
const float Re=${ATMOS.Re.toFixed(1)},Ra=${ATMOS.Ra.toFixed(1)},h0=${ATMOS.h0};
const vec3 betaR=vec3(${ATMOS.betaR.join(",")});const float HR=${ATMOS.HR.toFixed(1)};
const float betaM=${ATMOS.betaM},HM=${ATMOS.HM},g=${ATMOS.g},mieExt=${ATMOS.mieExt};
const vec3 betaO=vec3(${ATMOS.betaO.join(",")});
const float SUN=${ATMOS.sun.toFixed(1)};
const vec3 msColor=vec3(${ATMOS.msColor.join(",")});const float msStrength=${ATMOS.msStrength},msLow=${ATMOS.msLow.toFixed(1)},msHigh=${ATMOS.msHigh.toFixed(1)},msLowW=${ATMOS.msLowWeight};
const vec3 nightZenith=vec3(${ATMOS.nightZenith.join(",")}),nightHorizon=vec3(${ATMOS.nightHorizon.join(",")});const float nightFall=${ATMOS.nightHorizonFalloff.toFixed(1)};
const float sunRad=${((ATMOS.sunRadius * Math.PI) / 180).toFixed(6)},moonRad=${((ATMOS.moonRadius * Math.PI) / 180).toFixed(6)};
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
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
vec2 uv=gl_FragCoord.xy/u_res;float sx=uv.x*2.0-1.0;float sy=uv.y*2.0-1.0;
vec3 v=normalize(u_f+u_r*(sx*u_tan.x)+u_u*(sy*u_tan.y));
float elev=degrees(asin(clamp(v.z,-1.0,1.0)));
vec3 L=radiance(v,u_sun)*u_exposure;
vec3 night=nightZenith+nightHorizon*exp(-max(0.0,elev)/nightFall);
vec3 c=L+night;
float skyLum=dot(L,vec3(0.2126,0.7152,0.0722));
/* 太陽：本体（届く光の色）と、にじみ */
float th=acos(clamp(dot(v,u_sun),-1.0,1.0));vec3 ts;
if(depthToSun(vec3(0.0,0.0,Re+h0),u_sun,ts)){vec3 T=exp(-ts);float disc=1.0-smoothstep(sunRad*0.85,sunRad,th);
c+=T*(disc*8.0+4.0*exp(-th*th/(2.0*0.028*0.028))+0.9*exp(-th/0.052)+0.2*exp(-th/0.157));}
/* 月：満ち欠けは太陽の向きから（球の明るい側）。昼は空に埋もれる */
if(u_moonOn>0.5){vec3 m=u_moon;vec3 mu_=normalize(cross(m,vec3(0.0,0.0,1.0)));vec3 mv=cross(mu_,m);vec3 dl=v-m;float dx=dot(dl,mu_)/moonRad;float dy=dot(dl,mv)/moonRad;float rr=dx*dx+dy*dy;
float vis=clamp(1.0-skyLum*3.0,0.08,1.0);float tm=acos(clamp(dot(v,m),-1.0,1.0));
if(rr<1.0){float nz=sqrt(1.0-rr);vec3 n=-m*nz+mu_*dx+mv*dy;float l=max(0.0,dot(n,u_sun));float edge=1.0-smoothstep(0.9,1.0,rr);c+=vec3(1.0,0.97,0.9)*(l*0.85+0.03)*edge*vis;}
c+=vec3(0.9,0.92,1.0)*0.09*exp(-tm/0.04)*vis;}
/* 星：向きで決まる位置に。暗いときだけ */
if(u_stars>0.0){float az=atan(v.x,v.y);vec2 cell=vec2(az,asin(v.z))/0.0061;vec2 id=floor(cell);float h1=hash(id);
if(h1<0.018){vec2 cen=id+0.5+vec2(hash(id+1.3),hash(id+7.1))*0.6-0.3;float d=length(cell-cen);float b=pow(hash(id+3.7),3.0)*0.9+0.08;
c+=vec3(0.85,0.9,1.0)*b*exp(-d*d*9.0)*u_stars*clamp(1.0-skyLum*6.0,0.0,1.0);}}
vec3 col=pow(1.0-exp(-max(c,0.0)),vec3(1.0/2.2));
col+=(hash(gl_FragCoord.xy)-0.5)/255.0;
gl_FragColor=vec4(col,1.0);}`;

type Gl = {
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  loc: Record<string, WebGLUniformLocation | null>;
};

function init(canvas: HTMLCanvasElement): Gl | null {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
  if (!gl) return null;
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
  const fs = sh(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("sky program:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const loc: Record<string, WebGLUniformLocation | null> = {};
  for (const n of ["u_res", "u_f", "u_r", "u_u", "u_tan", "u_sun", "u_exposure", "u_moon", "u_moonOn", "u_stars"]) loc[n] = gl.getUniformLocation(prog, n);
  return { gl, prog, loc };
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

function draw(g: Gl, cam: Camera, at: Date) {
  const { gl, loc } = g;
  const s = solar(at);
  const sun = dirFromAltAz(s.altitude, s.azimuth);
  const mp = SunCalc.getMoonPosition(at, BASE.lat, BASE.lng);
  const moon = dirFromAltAz(mp.altitude, mp.azimuth);
  const b = basis(cam);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.uniform2f(loc.u_res, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.uniform3f(loc.u_f, b.f[0], b.f[1], b.f[2]);
  gl.uniform3f(loc.u_r, b.r[0], b.r[1], b.r[2]);
  gl.uniform3f(loc.u_u, b.u[0], b.u[1], b.u[2]);
  gl.uniform2f(loc.u_tan, b.tanH, b.tanV);
  gl.uniform3f(loc.u_sun, sun[0], sun[1], sun[2]);
  gl.uniform1f(loc.u_exposure, exposureFor(s.altitude));
  gl.uniform3f(loc.u_moon, moon[0], moon[1], moon[2]);
  gl.uniform1f(loc.u_moonOn, mp.altitude > -0.5 ? 1 : 0);
  gl.uniform1f(loc.u_stars, smoothstep(-8, -16, s.altitude));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** 今の日時（#t= で固定していればそれ） */
const now = () => overrideTime(location.hash) ?? new Date();

/**
 * 空のキャンバス。親いっぱいに広げて使う（帯の切り抜きと同じカメラ）。描けたら 600ms で現れる。
 * 大きさは幅 393pt × 端末の倍率（3倍まで）で固定し、CSS で引き伸ばす
 */
export function SkyCanvas({ camera = HOME_CAMERA, className = "", style }: { camera?: Camera; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    canvas.width = Math.round(393 * dpr);
    canvas.height = Math.round((393 / camera.aspect) * dpr);
    let g = init(canvas);
    if (!g) return;
    let shown = false;
    let last: Date | null = null;
    let frame = 0;
    const render = (at: Date) => {
      if (!g) return;
      draw(g, camera, at);
      last = at;
      if (!shown) {
        shown = true;
        canvas.style.opacity = "1";
      }
    };
    /** 時刻が飛んだとき（#t= の変更など）は、前の時刻から 1.2 秒かけて動かす */
    const go = () => {
      const target = now();
      cancelAnimationFrame(frame);
      const from = last;
      if (!from || Math.abs(target.getTime() - from.getTime()) < 3 * 60e3 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        render(target);
        return;
      }
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1200);
        const e = 1 - Math.pow(1 - p, 3);
        render(new Date(from.getTime() + (target.getTime() - from.getTime()) * e));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    render(now());
    addEventListener(SKY_EVENT, go);
    const onLost = (e: Event) => {
      e.preventDefault();
      canvas.style.opacity = "0";
      g = null;
    };
    const onRestored = () => {
      g = init(canvas);
      shown = false;
      render(now());
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener(SKY_EVENT, go);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const ext = g?.gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    };
  }, [camera]);
  return <canvas ref={ref} aria-hidden className={`sky-canvas block h-full w-full ${className}`} style={{ opacity: 0, transition: "opacity 600ms ease", ...style }} />;
}
