"use client";

// 帯をコードで描く（WebGL）。写真は使わない。
//  空：今の太陽の位置（lib/app/sun.ts）から大気の散乱（lib/app/atmosphere.ts と同じ式）。雲（雲量は気象庁の観測から。lib/app/weather.ts）、
//      太陽本体とにじみ、月（満ち欠けは太陽の向きから）、星。
//  街（ホームだけ）：PLATEAU（国土交通省の 3D 都市モデル）の実在の建物と、地理院の空中写真・標高から、汐留の上空 260m の視点で
//      焼き込んだ層（public/home/city。色・面の向き・距離と種類・窓・塔と道路・影用の高さ地図）を、今の光で照らす。
//      太陽の直射（建物の影は高さ地図をたどって、今の太陽の向きから計算）、空からの光（向きごと）、雲の影、遠くの霞（見通し）、
//      雨で濡れる・雪が積もる、季節の木の色、富士山の雪線。夜は窓（建物の用途・曜日・時刻で 1 枚ずつ）、街灯と車、東京タワー
//      （公式の点灯の決まり。lib/app/tower.ts）、60m 以上の屋上の航空障害灯（点滅）。
//  1 枚目：空の散乱を小さな絵（1/4 の解像度）に。街の下ごしらえ（直射と影・窓の点灯・街灯）を 1 分ごとに別の絵に。
//  2 枚目：それらを引き伸ばして、太陽・雲・街・霞・天気を画素ごとに合成。3 枚目：航空障害灯（点）。
//  1 分ごと（SKY_EVENT）と #t= / #w= の変更で描き直し、雲が流れる・雨や雪・夜の点滅があるときだけ動かす（動きを減らす設定では止める）。
//  WebGL が使えない端末では何も描かず、下の CSS の層（同じ街を焼いた代わりの絵）が見える
import * as SunCalc from "suncalc";
import { useEffect, useRef, type CSSProperties } from "react";
import { ATMOS, dirFromAltAz, exposureFor, sunTransmittance } from "@/lib/app/atmosphere";
import { snowlineM, treeSeason, visibilityKm, windowOccupancy } from "@/lib/app/city";
import { artificialVisibility, cityAmbient, skyIrradianceSH, sunIrradiance } from "@/lib/app/city-light";
import { BASE, HOME_CAMERA, overrideTime, smoothstep, solar, type Camera } from "@/lib/app/sun";
import { towerLight } from "@/lib/app/tower";
import { currentWeather } from "@/lib/app/weather";
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

/** 距離（2 バイト、対数）・種類の復元と、視線の向き */
const CITY_GLSL = `
const float LOGR=${Math.log(2000).toFixed(6)};
float decodeDist(vec3 g){float v=(g.r*65280.0+g.g*255.0)/65535.0;return 100.0*exp(v*LOGR);}
float typeOf(vec3 g,out float aux){float code=floor(g.b*255.0+0.5);float t=floor(code/32.0);aux=code-t*32.0;return t;}`;

/** 街の下ごしらえ（1 分ごと）：R=太陽の直射（面の向き×影）、G=窓の点灯、B=街灯 */
const FRAG_PRE = `precision highp float;
uniform vec2 u_res;uniform vec3 u_f,u_r,u_u;uniform vec2 u_tan;uniform vec3 u_sun;
uniform sampler2D u_geo;uniform sampler2D u_nrm;uniform sampler2D u_win;uniform sampler2D u_emis;uniform sampler2D u_dsm;
uniform vec4 u_dsmGrid;uniform vec2 u_dsmZ;uniform vec4 u_occA;uniform vec2 u_occB;uniform float u_lightsVis;
${CITY_GLSL}
vec3 viewDir(vec2 uv){float sx=uv.x*2.0-1.0;float sy=uv.y*2.0-1.0;return normalize(u_f+u_r*(sx*u_tan.x)+u_u*(sy*u_tan.y));}
float dsmH(vec2 q){vec2 t=vec2((q.x-u_dsmGrid.x)/u_dsmGrid.z,(u_dsmGrid.y-q.y)/u_dsmGrid.z);
if(t.x<0.0||t.x>1.0||t.y<0.0||t.y>1.0)return -1e4;return texture2D(u_dsm,t).r*255.0*u_dsmZ.y+u_dsmZ.x;}
float occFor(float c){if(c<1.5)return u_occA.x;if(c<2.5)return u_occA.y;if(c<3.5)return u_occA.z;if(c<4.5)return u_occA.w;if(c<5.5)return u_occB.x;return u_occB.y;}
void main(){
vec2 uv=gl_FragCoord.xy/u_res;vec2 iuv=vec2(uv.x,1.0-uv.y);
vec3 g=texture2D(u_geo,iuv).rgb;float aux;float typ=typeOf(g,aux);
if(typ<0.5){gl_FragColor=vec4(0.0);return;}
float d=decodeDist(g);vec3 v=viewDir(uv);vec3 P=v*d;
vec3 n=normalize(texture2D(u_nrm,iuv).rgb*2.0-1.0);
float lit=max(dot(n,u_sun),0.0);
/* 影：今の太陽の向きへ高さ地図をたどり、途中の建物・地形が光線より高ければ影 */
if(lit>0.0){float hs=length(u_sun.xy);
if(hs>1e-4&&d<9000.0){vec2 sd=u_sun.xy/hs;float ta=u_sun.z/hs;vec2 q0=P.xy+n.xy*2.5;float z0=P.z+0.7+max(n.z,0.0)*0.6;
float s=4.0;float oc=0.0;
for(int i=0;i<30;i++){float h=dsmH(q0+sd*s);float ray=z0+s*ta;oc=max(oc,clamp((h-ray)/(1.5+s*0.015),0.0,1.0));s*=1.2;}
lit*=1.0-oc;}}
/* 窓：オフィスは階ごと（階の鍵）に、ほかは窓ごとに、用途の点灯率と比べる */
float wl=0.0;
if((typ==1.0||typ==2.0)&&u_lightsVis>0.0){vec3 w=texture2D(u_win,iuv).rgb;float oc=occFor(aux);
float on=aux<1.5?(step(w.b,oc)*step(w.g,0.93)+(1.0-step(w.b,oc))*step(w.g,oc*0.12)):step(w.g,oc);
wl=w.r*on;}
/* 街灯：道の太さ（国道・都道・高速は明るく） */
float rl=0.0;
if(typ==3.0){vec3 e=texture2D(u_emis,iuv).rgb;rl=e.r*(aux>1.5?1.0:0.55)*step(0.5,aux);}
gl_FragColor=vec4(lit,wl,rl,1.0);}`;

/** 2 枚目：合成（空・太陽・月・星・雲、街・霞、雨・雪） */
const FRAG_MAIN = `precision highp float;
uniform vec2 u_res;uniform vec3 u_f,u_r,u_u;uniform vec2 u_tan;
uniform vec3 u_sun;uniform vec3 u_sunT;uniform vec3 u_moon;uniform float u_moonOn;uniform float u_stars;uniform float u_day;
uniform sampler2D u_sky;uniform sampler2D u_alb;uniform sampler2D u_nrm;uniform sampler2D u_geo;uniform sampler2D u_win;uniform sampler2D u_emis;uniform sampler2D u_pre;
uniform float u_city;uniform float u_horizon;
uniform vec3 u_sunE;uniform vec3 u_sh0;uniform vec3 u_sh1;uniform vec3 u_sh2;uniform vec3 u_sh3;uniform vec3 u_amb;uniform float u_lightsVis;uniform float u_sigma;
uniform vec4 u_season;uniform float u_snowline;uniform float u_snowCover;uniform float u_wet;
uniform float u_towerOn;uniform float u_towerMode;uniform float u_towerWhite;uniform vec3 u_towerCol;uniform float u_sparkle;uniform float u_decks;
uniform float u_cloud;uniform float u_precip;uniform float u_snow;uniform float u_fog;uniform float u_time;uniform vec2 u_wind;uniform float u_expAdj;
const float sunRad=${((ATMOS.sunRadius * Math.PI) / 180).toFixed(6)},moonRad=${((ATMOS.moonRadius * Math.PI) / 180).toFixed(6)};
${CITY_GLSL}
float hash21(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y);}
float fbm(vec2 p){float a=0.5;float s=0.0;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+vec2(1.7,9.2);a*=0.5;}return s;}
vec3 skyAt(vec2 uv){vec3 e=texture2D(u_sky,uv).rgb;return e*e*4.0;}
vec3 tone(vec3 c){return pow(1.0-exp(-max(c,0.0)),vec3(1.0/2.2));}
vec3 lin(vec3 c){return pow(c,vec3(2.2));}
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
vec3 hz=skyAt(vec2(uv.x,1.0-u_horizon+0.03))*0.8;
vec3 haze=mix(hz,vec3(dot(hz,vec3(0.3,0.5,0.2))),u_cloud*0.6)+u_amb*1.6;
vec3 outc=sky;
/* 街：焼き込んだ色・向き・距離を、今の光で照らす */
vec4 al=texture2D(u_alb,iuv);float cov=al.a*u_city;
if(cov>0.002){
vec3 a=lin(al.rgb)*0.9;
vec3 g=texture2D(u_geo,iuv).rgb;float aux;float typ=typeOf(g,aux);float dd=decodeDist(g);vec3 P=v*dd;
vec4 nn=texture2D(u_nrm,iuv);vec3 n=normalize(nn.rgb*2.0-1.0);float ao=nn.a;
vec4 pre=texture2D(u_pre,uv);vec3 e=texture2D(u_emis,iuv).rgb;
float up=smoothstep(0.55,0.85,n.z);
/* 季節：木（桜・新緑・紅葉・冬枯れ）と、地面の緑（公園・芝）は控えめに */
float green=typ==5.0?1.0:(typ==3.0?smoothstep(0.012,0.05,a.g-(a.r+a.b)*0.5)*0.6:0.0);
if(green>0.0){float hh=hash21(floor(P.xy/7.0));
vec3 aut=mix(vec3(0.42,0.32,0.05),vec3(0.36,0.08,0.03),step(0.55,hh));
a=mix(a,aut,u_season.z*0.8*green*step(0.25,hh));
a=mix(a,vec3(0.16,0.13,0.1),u_season.w*0.55*green*step(0.4,hh));
a=mix(a,vec3(0.82,0.62,0.66),u_season.x*0.85*green*step(hh,0.3));
a*=mix(vec3(1.0),vec3(1.08,1.18,0.86),u_season.y*green);}
/* 富士山・丹沢の雪（雪線は月ごと） */
if(typ==6.0){float el=e.r*255.0*16.0;a=mix(a,vec3(0.78,0.8,0.86),smoothstep(u_snowline-180.0,u_snowline+120.0,el));}
/* 雪が積もる（上を向いた面）・雨で濡れる */
if(typ!=4.0&&typ!=6.0)a=mix(a,vec3(0.8,0.82,0.86),u_snowCover*up*(typ==5.0?0.6:1.0));
a*=1.0-0.38*u_wet*up*(1.0-u_snowCover);
/* 雲の影：太陽の向きにたどって雲の層（1.5km）に当たる所の雲の濃さ */
float cs=1.0;
if(u_cloud>0.0&&u_sun.z>0.0){vec3 Q=P+u_sun*((1500.0-P.z)/max(u_sun.z,0.06));float cn=cloudNoise(Q.xy/1000.0*0.36+u_wind*u_time);float t=1.0-u_cloud*1.06;cs=1.0-0.9*smoothstep(t,t+0.3,cn);}
vec3 E=max(u_sh0+u_sh1*n.x+u_sh2*n.y+u_sh3*n.z,vec3(0.0));
vec3 L=a*(u_sunE*pre.r*cs+E*ao*0.8)/3.14159265+a*u_amb*(0.35+0.65*ao);
/* 濡れた屋根・道は空を映す（夜は街灯も） */
L+=haze*0.10*u_wet*up*(1.0-u_snowCover);
/* 窓（用途で色が違う：オフィスは白、住宅は暖色が多い） */
if(pre.g>0.0){vec3 w=texture2D(u_win,iuv).rgb;
vec3 wc=aux<1.5?mix(vec3(0.86,0.92,1.0),vec3(1.0,0.9,0.74),step(0.6,fract(w.b*5.1))):(aux<2.5?vec3(1.0,0.84,0.62):(aux<3.5?vec3(1.0,0.76,0.5):(aux<4.5?mix(vec3(1.0,0.7,0.4),vec3(0.9,0.94,1.0),step(0.75,fract(w.g*7.3))):vec3(0.96,0.9,0.8))));
float wk=aux<1.5?0.95:(aux<2.5?1.2:(aux<3.5?0.85:(aux<4.5?0.8:0.7)));
L+=wc*pre.g*(0.3+0.8*fract(w.g*13.7))*wk*u_lightsVis;}
/* 街灯と車（国道・都道・高速は車の光が流れる） */
if(typ==3.0&&pre.b>0.0){vec3 sc=aux>1.5?vec3(1.0,0.74,0.45):vec3(0.86,0.92,1.0);L+=sc*pre.b*1.2*u_lightsVis*(1.0+0.8*u_wet);
if(aux>1.5){float uu=e.b*255.0;float hh=hash21(floor(gl_FragCoord.xy*0.5));float dir=hh>0.5?1.0:-1.0;
float car=smoothstep(0.84,0.98,fract((uu+dir*u_time*13.0)/21.0+hh*7.0));L+=(dir>0.0?vec3(1.0,0.95,0.85):vec3(1.0,0.12,0.06))*car*e.r*2.4*u_lightsVis;}}
/* 東京タワー：ランドマークライト（夏は白・冬はオレンジ）、ダイヤモンドヴェール、展望台の窓、毎正時の純白の煌めき */
if(typ==4.0&&u_towerOn>0.0){float code2=floor(e.r*255.0+0.5);float part=floor(code2/32.0);float tier=code2-part*32.0;float te=e.g;
vec3 tc=u_towerCol;if(u_towerMode>1.5)tc*=0.55+0.45*sin(tier*0.85+u_time*0.6);
tc=mix(tc,vec3(1.0),u_towerWhite);
float k=part<0.5?1.0:(part<2.5?0.0:(part<3.5?0.55:0.9));
L+=tc*te*k*2.8;
if(part>0.5&&part<2.5)L+=vec3(1.0,0.95,0.86)*1.7*u_decks;
if(u_sparkle>0.0&&part>4.5)L+=vec3(1.0)*step(0.78,hash21(floor(gl_FragCoord.xy*0.7)+floor(u_time*9.0)))*3.0;}
/* 遠くの霞：距離と見通しで空の地平線の色に溶ける（夜は街明かりの照り返しの色） */
float T=exp(-dd*u_sigma);
L=L*T+haze*(1.0-T);
outc=mix(sky,L,cov);}
vec3 col=tone(outc*u_expAdj);
/* 霧・雨・雪のときは、空も地平線の近くが白っぽく */
float fogC=clamp(u_fog+u_precip*0.35+u_snow*0.3,0.0,1.0);
col=mix(col,tone(haze),clamp(fogC*0.55*smoothstep(0.2,u_horizon,iuv.y)*(1.0-cov),0.0,0.85));
/* 雨・雪 */
if(u_precip>0.0){if(u_snow>0.5){float s=snow(uv,26.0,0.075,1.0)+0.6*snow(uv,52.0,0.13,5.0);col=mix(col,vec3(0.96,0.97,1.0),clamp(s,0.0,1.0)*0.9);}
else{float r=rain(uv,vec2(62.0,7.0),1.4,1.0)+0.6*rain(uv,vec2(115.0,12.0),2.1,7.0);col+=vec3(0.72,0.78,0.88)*r*0.34*(0.5+0.5*u_precip);}}
col+=(hash21(gl_FragCoord.xy)-0.5)/255.0;
gl_FragColor=vec4(col,1.0);}`;

/** 3 枚目：航空障害灯（画面の点。60m 以上の屋上と東京タワー。赤く、高い建物は点滅） */
const VERT_LIGHTS = `attribute vec2 a_p;attribute vec4 a_i;uniform float u_px;uniform float u_time;uniform float u_vis;uniform float u_sigma;uniform float u_still;varying float vB;
void main(){gl_Position=vec4(a_p.x*2.0-1.0,1.0-a_p.y*2.0,0.0,1.0);
float kind=a_i.y;float blink=kind==1.0&&u_still<0.5?step(fract(u_time/a_i.w+a_i.z),0.32):1.0;
vB=blink*u_vis*exp(-a_i.x*u_sigma)*(kind>=2.0?1.15:(kind==1.0?1.0:0.6));
gl_PointSize=u_px*(kind>=2.0?1.3:1.0)*clamp(2400.0/a_i.x,0.5,1.5);}`;
const FRAG_LIGHTS = `precision mediump float;varying float vB;
void main(){vec2 q=gl_PointCoord*2.0-1.0;float a=exp(-dot(q,q)*3.0)*vB;gl_FragColor=vec4(vec3(1.0,0.16,0.07)*a,1.0);}`;

type Prog = { prog: WebGLProgram; loc: Record<string, WebGLUniformLocation | null> };
type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };
type Gl = {
  gl: WebGLRenderingContext;
  sky: Prog;
  pre: Prog | null;
  main: Prog;
  lights: Prog | null;
  quad: WebGLBuffer;
  skyT: Target;
  preT: Target | null;
  tex: Record<string, WebGLTexture>;
  /** 航空障害灯（点の数と、位置・属性のバッファ） */
  pts: { buf: WebGLBuffer; n: number } | null;
  /** 街の層を読み終えたか */
  cityReady: boolean;
  /** 下ごしらえを最後に描いた条件（分・天気） */
  preKey: string;
  dsmGrid: [number, number, number, number];
  dsmZ: [number, number];
};

const SKY_UNIFORMS = ["u_res", "u_f", "u_r", "u_u", "u_tan", "u_sun", "u_exposure"];
const PRE_UNIFORMS = ["u_res", "u_f", "u_r", "u_u", "u_tan", "u_sun", "u_geo", "u_nrm", "u_win", "u_emis", "u_dsm", "u_dsmGrid", "u_dsmZ", "u_occA", "u_occB", "u_lightsVis"];
const MAIN_UNIFORMS = ["u_res", "u_f", "u_r", "u_u", "u_tan", "u_sun", "u_sunT", "u_moon", "u_moonOn", "u_stars", "u_day", "u_sky", "u_alb", "u_nrm", "u_geo", "u_win", "u_emis", "u_pre", "u_city", "u_horizon", "u_sunE", "u_sh0", "u_sh1", "u_sh2", "u_sh3", "u_amb", "u_lightsVis", "u_sigma", "u_season", "u_snowline", "u_snowCover", "u_wet", "u_towerOn", "u_towerMode", "u_towerWhite", "u_towerCol", "u_sparkle", "u_decks", "u_cloud", "u_precip", "u_snow", "u_fog", "u_time", "u_wind", "u_expAdj"];
const LIGHT_UNIFORMS = ["u_px", "u_time", "u_vis", "u_sigma", "u_still"];

function compile(gl: WebGLRenderingContext, frag: string, names: string[], vert = VERT): Prog | null {
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
  const vs = sh(gl.VERTEX_SHADER, vert);
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

function texParams(gl: WebGLRenderingContext, nearest: boolean) {
  const f = nearest ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** 1 画素の絵（読み込みが終わるまでの仮） */
function blankTexture(gl: WebGLRenderingContext, rgba: [number, number, number, number]): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
  texParams(gl, false);
  return t;
}

function target(gl: WebGLRenderingContext, w: number, h: number): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  texParams(gl, false);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h };
}

/** 街の層の場所（public/home/city。焼き込みの手順は docs/features.md） */
const CITY_DIR = "/home/city";
/** 焼き込みのときの影用の高さ地図の範囲（カメラの ENU。西端・北端・幅）と高さの符号（z = 値×1.6 − 300） */
const DSM_GRID: [number, number, number, number] = [-7700, 3080, 9000, 2048];
const DSM_Z: [number, number] = [-300, 1.6];
const CITY_LAYERS: [string, boolean][] = [["alb", false], ["nrm", false], ["geo", true], ["win", true], ["emis", true]];

function init(canvas: HTMLCanvasElement, city: boolean): Gl | null {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
  if (!gl) return null;
  const sky = compile(gl, FRAG_SKY, SKY_UNIFORMS);
  const main = compile(gl, FRAG_MAIN, MAIN_UNIFORMS);
  if (!sky || !main) return null;
  // 街の下ごしらえと航空障害灯（ホームだけ。作れなくても空は描く）
  const pre = city ? compile(gl, FRAG_PRE, PRE_UNIFORMS) : null;
  const lights = city ? compile(gl, FRAG_LIGHTS, LIGHT_UNIFORMS, VERT_LIGHTS) : null;
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  // 1 枚目の絵（1/4 の解像度）と、街の下ごしらえ（画面と同じ大きさ）
  const skyT = target(gl, Math.max(64, Math.round(canvas.width / 4)), Math.max(48, Math.round(canvas.height / 4)));
  const preT = city && pre ? target(gl, canvas.width, canvas.height) : null;
  const tex: Record<string, WebGLTexture> = {};
  for (const [k] of CITY_LAYERS) tex[k] = blankTexture(gl, [0, 0, 0, 0]);
  tex.dsm = blankTexture(gl, [0, 0, 0, 255]);
  return { gl, sky, pre, main, lights, quad, skyT, preT, tex, pts: null, cityReady: false, preKey: "", dsmGrid: DSM_GRID, dsmZ: DSM_Z };
}

/** 街の層（倍率ごと）・影用の高さ地図・航空障害灯を読む。全部そろったら知らせる */
function loadCity(g: Gl, dpr: number, onLoaded: () => void): () => void {
  let alive = true;
  const set = dpr >= 3 ? "3x" : "2x";
  const files: [string, string, boolean][] = [
    ["alb", `${CITY_DIR}/${set}/albedo.webp`, false],
    ["nrm", `${CITY_DIR}/${set}/normal.webp`, false],
    ["geo", `${CITY_DIR}/${set}/geo.webp`, true],
    ["win", `${CITY_DIR}/${set}/win.webp`, true],
    ["emis", `${CITY_DIR}/${set}/emis.webp`, true],
    ["dsm", `${CITY_DIR}/dsm.webp`, false],
  ];
  let pending = files.length + 1;
  const done = () => {
    if (alive && --pending === 0) {
      g.cityReady = true;
      g.preKey = "";
      onLoaded();
    }
  };
  for (const [key, url, nearest] of files) {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!alive) return;
      const { gl } = g;
      gl.bindTexture(gl.TEXTURE_2D, g.tex[key]);
      // データの層は色の変換や乗算をせず、そのままの値で
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      // 影用の高さ地図は 1 チャンネル（GPU のメモリを 4 分の 1 に）
      const fmt = key === "dsm" ? gl.LUMINANCE : gl.RGBA;
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, fmt, gl.UNSIGNED_BYTE, img);
      texParams(gl, nearest);
      done();
    };
    img.onerror = done;
    img.src = url;
  }
  fetch(`${CITY_DIR}/lights.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((list: number[][]) => {
      if (!alive || !Array.isArray(list)) return;
      const { gl } = g;
      // [x, y, 距離, 種類, 位相, 周期] → a_p(2) + a_i(4)
      const data = new Float32Array(list.length * 6);
      list.forEach((l, i) => data.set([l[0], l[1], l[2], l[3], l[4], l[5]], i * 6));
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      g.pts = { buf, n: list.length };
    })
    .catch(() => {})
    .finally(done);
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

function bindQuad(g: Gl, p: Prog) {
  const { gl } = g;
  gl.bindBuffer(gl.ARRAY_BUFFER, g.quad);
  const a = gl.getAttribLocation(p.prog, "a");
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
}

/** 街の光の値（1 分ごとに変わるもの）。描くたびに作り直すと重いので、分と天気が同じなら前の値 */
let lightCache: { key: string; v: ReturnType<typeof cityLightValues> } | null = null;
function cityLightValues(at: Date, sun: [number, number, number], altitude: number) {
  const w = currentWeather();
  const sh = skyIrradianceSH(sun, altitude, w.cloud);
  const occ = windowOccupancy(at);
  const vis = visibilityKm(w, at);
  const season = treeSeason(at);
  const tower = towerLight(at, altitude);
  return {
    sh,
    sunE: sunIrradiance(sun, altitude),
    amb: cityAmbient(altitude),
    lightsVis: artificialVisibility(altitude),
    occ,
    sigma: 3.912 / (vis * 1000),
    season: [season.blossom, season.fresh, season.autumn, season.bare] as [number, number, number, number],
    snowline: snowlineM(at),
    snowCover: w.kind === "snow" ? Math.min(1, 0.45 + 0.6 * w.precip) : 0,
    wet: w.kind === "rain" ? Math.min(1, 0.45 + w.precip) : 0,
    tower,
  };
}
/** 代わりの絵（CSS の層）を作るときだけ使う：#…&l=0 で人工の明かり（窓・街灯・タワー・航空障害灯）を消す */
const lightsOff = () => /(?:^#|&)l=0(?:&|$)/.test(location.hash);
function lightValues(at: Date, sun: [number, number, number], altitude: number) {
  const w = currentWeather();
  const off = lightsOff();
  const key = `${Math.floor(at.getTime() / 60e3)}|${w.kind}|${w.cloud}|${w.precip}|${w.fog}|${w.humidity}|${off}`;
  if (!lightCache || lightCache.key !== key) {
    const v = cityLightValues(at, sun, altitude);
    if (off) {
      v.lightsVis = 0;
      v.amb = [0, 0, 0];
      v.tower = { ...v.tower, on: false, decks: false, sparkle: false };
    }
    lightCache = { key, v };
  }
  return lightCache.v;
}

function draw(g: Gl, cam: Camera, at: Date, city: boolean, seconds: number, still: boolean) {
  const { gl } = g;
  const s = solar(at);
  const sun = dirFromAltAz(s.altitude, s.azimuth);
  const mp = SunCalc.getMoonPosition(at, BASE.lat, BASE.lng);
  const moon = dirFromAltAz(mp.altitude, mp.azimuth);
  const b = basis(cam);
  const w = currentWeather();
  const T = sunTransmittance(sun);
  const showCity = city && g.cityReady && !!g.pre && !!g.preT;
  const lv = showCity ? lightValues(at, sun, s.altitude) : null;
  const setCam = (p: Prog, width: number, height: number) => {
    gl.uniform2f(p.loc.u_res, width, height);
    gl.uniform3f(p.loc.u_f, b.f[0], b.f[1], b.f[2]);
    gl.uniform3f(p.loc.u_r, b.r[0], b.r[1], b.r[2]);
    gl.uniform3f(p.loc.u_u, b.u[0], b.u[1], b.u[2]);
    gl.uniform2f(p.loc.u_tan, b.tanH, b.tanV);
    gl.uniform3f(p.loc.u_sun, sun[0], sun[1], sun[2]);
  };
  const bindTex = (p: Prog, units: [string, WebGLTexture][]) =>
    units.forEach(([name, tex], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(p.loc[name], i);
    });
  // 1 枚目：空
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, g.skyT.fbo);
  gl.viewport(0, 0, g.skyT.w, g.skyT.h);
  gl.useProgram(g.sky.prog);
  bindQuad(g, g.sky);
  setCam(g.sky, g.skyT.w, g.skyT.h);
  gl.uniform1f(g.sky.loc.u_exposure, exposureFor(s.altitude));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // 街の下ごしらえ（分・天気が変わったときだけ）
  if (showCity && lv) {
    const key = `${Math.floor(at.getTime() / 60e3)}|${w.kind}|${w.cloud}|${lv.lightsVis}`;
    if (key !== g.preKey) {
      const pre = g.pre!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, g.preT!.fbo);
      gl.viewport(0, 0, g.preT!.w, g.preT!.h);
      gl.useProgram(pre.prog);
      bindQuad(g, pre);
      setCam(pre, g.preT!.w, g.preT!.h);
      bindTex(pre, [["u_geo", g.tex.geo], ["u_nrm", g.tex.nrm], ["u_win", g.tex.win], ["u_emis", g.tex.emis], ["u_dsm", g.tex.dsm]]);
      gl.uniform4f(pre.loc.u_dsmGrid, g.dsmGrid[0], g.dsmGrid[1], g.dsmGrid[2], g.dsmGrid[3]);
      gl.uniform2f(pre.loc.u_dsmZ, g.dsmZ[0], g.dsmZ[1]);
      gl.uniform4f(pre.loc.u_occA, lv.occ[1], lv.occ[2], lv.occ[3], lv.occ[4]);
      gl.uniform2f(pre.loc.u_occB, lv.occ[5], lv.occ[6]);
      gl.uniform1f(pre.loc.u_lightsVis, lv.lightsVis);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      g.preKey = key;
    }
  }
  // 2 枚目：合成
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.useProgram(g.main.prog);
  bindQuad(g, g.main);
  setCam(g.main, gl.drawingBufferWidth, gl.drawingBufferHeight);
  const m = g.main.loc;
  gl.uniform3f(m.u_sunT, T[0], T[1], T[2]);
  gl.uniform3f(m.u_moon, moon[0], moon[1], moon[2]);
  gl.uniform1f(m.u_moonOn, mp.altitude > -0.5 ? 1 : 0);
  gl.uniform1f(m.u_stars, smoothstep(-8, -16, s.altitude));
  gl.uniform1f(m.u_day, smoothstep(-6, 4, s.altitude));
  bindTex(g.main, [["u_sky", g.skyT.tex], ["u_alb", g.tex.alb], ["u_nrm", g.tex.nrm], ["u_geo", g.tex.geo], ["u_win", g.tex.win], ["u_emis", g.tex.emis], ["u_pre", g.preT ? g.preT.tex : g.tex.dsm]]);
  gl.uniform1f(m.u_city, showCity ? 1 : 0);
  gl.uniform1f(m.u_horizon, cam.horizon);
  if (lv) {
    gl.uniform3f(m.u_sunE, lv.sunE[0], lv.sunE[1], lv.sunE[2]);
    lv.sh.forEach((c, i) => gl.uniform3f(m[`u_sh${i}`], c[0], c[1], c[2]));
    gl.uniform3f(m.u_amb, lv.amb[0], lv.amb[1], lv.amb[2]);
    gl.uniform1f(m.u_lightsVis, lv.lightsVis);
    gl.uniform1f(m.u_sigma, lv.sigma);
    gl.uniform4f(m.u_season, lv.season[0], lv.season[1], lv.season[2], lv.season[3]);
    gl.uniform1f(m.u_snowline, lv.snowline);
    gl.uniform1f(m.u_snowCover, lv.snowCover);
    gl.uniform1f(m.u_wet, lv.wet);
    const t = lv.tower;
    gl.uniform1f(m.u_towerOn, t.on ? 1 : 0);
    gl.uniform1f(m.u_towerMode, t.mode);
    gl.uniform1f(m.u_towerWhite, t.white);
    gl.uniform3f(m.u_towerCol, t.color[0], t.color[1], t.color[2]);
    gl.uniform1f(m.u_sparkle, t.sparkle && !still ? 1 : 0);
    gl.uniform1f(m.u_decks, t.decks ? 1 : 0);
  } else {
    gl.uniform3f(m.u_amb, 0, 0, 0);
    gl.uniform1f(m.u_sigma, 0);
  }
  gl.uniform1f(m.u_cloud, w.cloud);
  gl.uniform1f(m.u_precip, w.precip);
  gl.uniform1f(m.u_snow, w.kind === "snow" ? 1 : 0);
  gl.uniform1f(m.u_fog, w.fog);
  gl.uniform1f(m.u_time, seconds);
  // 雲の流れ：風は西寄り（画面の左から右へゆっくり）
  gl.uniform2f(m.u_wind, 0.004 + (w.wind ?? 2) * 0.0012, 0.0015);
  // 太陽が画面の近くにある逆光のときは、カメラのように露出を絞る（明るい空に合わせて街は暗く）
  const facing = sun[0] * b.f[0] + sun[1] * b.f[1] + sun[2] * b.f[2];
  const backlit = smoothstep(Math.cos(50 * R), Math.cos(6 * R), facing) * smoothstep(22, 1, s.altitude) * smoothstep(-5, -0.5, s.altitude);
  gl.uniform1f(m.u_expAdj, showCity ? 1 - 0.42 * backlit : 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // 3 枚目：航空障害灯（足し合わせ）
  if (showCity && lv && g.lights && g.pts && lv.lightsVis > 0.01 && !lightsOff()) {
    const p = g.lights;
    gl.useProgram(p.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.pts.buf);
    const ap = gl.getAttribLocation(p.prog, "a_p");
    const ai = gl.getAttribLocation(p.prog, "a_i");
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(ai);
    gl.vertexAttribPointer(ai, 4, gl.FLOAT, false, 24, 8);
    gl.uniform1f(p.loc.u_px, (gl.drawingBufferWidth / 393) * 2.5);
    gl.uniform1f(p.loc.u_time, seconds);
    gl.uniform1f(p.loc.u_vis, smoothstep(0, -6, s.altitude) * (1 - 0.6 * w.fog));
    gl.uniform1f(p.loc.u_sigma, lv.sigma);
    gl.uniform1f(p.loc.u_still, still ? 1 : 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, g.pts.n);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(ai);
    gl.disableVertexAttribArray(ap);
  }
}

/** 今の日時（#t= で固定していればそれ） */
const now = () => overrideTime(location.hash) ?? new Date();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 帯のキャンバス。親いっぱいに広げて使う。city=true で街も描く（ホーム）。描けたら 600ms で現れる。
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
    let onScreen = true;
    let last: Date | null = null;
    let frame = 0;
    let loop = 0;
    const t0 = performance.now();
    const seconds = () => ((performance.now() - t0) / 1000) % 3600;
    const render = (at: Date) => {
      if (!g) return;
      draw(g, camera, at, city, seconds(), reduced());
      last = at;
      // ホームは街がそろってから見せる（それまでは下の CSS の層）
      if (!shown && (!city || g.cityReady)) {
        shown = true;
        canvas.style.opacity = "1";
      }
    };
    /** 雲が流れる・雨や雪・夜の点滅（航空障害灯・タワーの煌めき）があるときだけ、見えている間動かす */
    const animate = () => {
      cancelAnimationFrame(loop);
      const w = currentWeather();
      const at = now();
      const alt = solar(at).altitude;
      const weatherMoving = (w.cloud > 0.05 && w.cloud < 0.985) || w.precip > 0;
      const nightMoving = city && artificialVisibility(alt) > 0.05;
      if ((!weatherMoving && !nightMoving) || reduced() || document.visibilityState !== "visible" || !onScreen) return;
      // 夜の点滅だけなら 6 コマ/秒で足りる（電池のため）
      const fps = weatherMoving ? 24 : 6;
      let prev = 0;
      const tick = (t: number) => {
        loop = requestAnimationFrame(tick);
        if (t - prev < 1000 / fps) return;
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
      ? loadCity(g, dpr, () => {
          render(now());
          animate();
        })
      : () => {};
    render(now());
    animate();
    addEventListener(SKY_EVENT, go);
    const onVisible = () => (document.visibilityState === "visible" ? animate() : cancelAnimationFrame(loop));
    document.addEventListener("visibilitychange", onVisible);
    // 帯が画面の外（下へスクロールした）なら動かさない
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver((es) => {
            onScreen = es.some((e) => e.isIntersecting);
            if (onScreen) animate();
            else cancelAnimationFrame(loop);
          })
        : null;
    io?.observe(canvas);
    let stopReload = () => {};
    const onLost = (e: Event) => {
      e.preventDefault();
      canvas.style.opacity = "0";
      cancelAnimationFrame(loop);
      g = null;
    };
    const onRestored = () => {
      g = init(canvas, city);
      shown = false;
      if (g && city) stopReload = loadCity(g, dpr, () => render(now()));
      render(now());
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      stopLoading();
      stopReload();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(loop);
      removeEventListener(SKY_EVENT, go);
      document.removeEventListener("visibilitychange", onVisible);
      io?.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const ext = g?.gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    };
  }, [camera, city]);
  return <canvas ref={ref} aria-hidden className={`sky-canvas block h-full w-full ${className}`} style={{ opacity: 0, transition: "opacity 600ms ease", ...style }} />;
}
