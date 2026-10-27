"use client";

// 帯をコードで描く（WebGL）。写真は使わない。
//  空：今の太陽の位置（lib/app/sun.ts）から大気の散乱（lib/app/atmosphere.ts と同じ式。霞の量は湿度と季節から。lib/app/air.ts）。
//      雲は本物（ひまわりの雲の場。低い雲と高い雲の 2 層。lib/app/satellite.ts。読めないときは雲量だけの模様）、雨の幕は雨雲レーダー、稲光は雷ナウキャスト、
//      太陽本体とにじみ、月（満ち欠けは太陽の向きから）、星と惑星（明るい恒星の実際の位置と金星・木星・火星・土星・水星。lib/app/stars.ts）。
//  街（ホームだけ）：PLATEAU（国土交通省の 3D 都市モデル）の実在の建物と、地理院の空中写真・標高から、汐留の上空 260m の視点で
//      焼き込んだ層（public/home/city。色・面の向き・距離と種類・窓・塔と道路・影用の高さ地図）を、今の光で照らす。
//      太陽の直射（建物の影は高さ地図をたどって、今の太陽の向きから計算）、空からの光（向きごと）、雲の影、遠くの霞（見通し）、
//      雨で濡れる・雪が積もる、季節の木の色、富士山の雪線。夜は窓（建物の用途・曜日・時刻で 1 枚ずつ）、街灯と車、東京タワー
//      （公式の点灯の決まり。lib/app/tower.ts）、60m 以上の屋上の航空障害灯（点滅）。
//  1 枚目：空の散乱を小さな絵（1/4 の解像度）に。街の下ごしらえ（直射と影・窓の点灯・街灯）を 1 分ごとに別の絵に。
//  2 枚目：それらを引き伸ばして、太陽・雲・街・霞・天気を画素ごとに合成（α に空の見える度合い）。3 枚目：星と惑星・航空障害灯（点）。
//  1 分ごと（SKY_EVENT）と #t= / #w= の変更で描き直し、雲が流れる・雨や雪・夜の点滅があるときだけ動かす（動きを減らす設定では止める）。
//  WebGL が使えない端末では何も描かず、下の CSS の層（同じ街を焼いた代わりの絵）が見える
import * as SunCalc from "suncalc";
import { useEffect, useRef, type CSSProperties } from "react";
import { ATMOS, dirFromAltAz, exposureFor, nightExposureRatio, sunTransmittance, sunTransmittanceAt } from "@/lib/app/atmosphere";
import { airFrom, type Air } from "@/lib/app/air";
import { snowlineM, treeSeason, visibilityKm, windowOccupancy } from "@/lib/app/city";
import { artificialExposure, artificialLevel, artificialVisibility, cityAmbient, skyIrradianceSH, sunIrradiance } from "@/lib/app/city-light";
import { CAM_LL, cloudDrift, currentSky, flashAt, parseTime, sunVisibility, type LiveSky } from "@/lib/app/satellite";
import { BASE, HOME_CAMERA, overrideTime, smoothstep, solar, type Camera } from "@/lib/app/sun";
import { towerLight } from "@/lib/app/tower";
import { currentWeather } from "@/lib/app/weather";
import { meterExposure } from "@/lib/app/sky-vars";
import { skyObjects, starColor, starLook, starVisibility } from "@/lib/app/stars";
import { SKY_EVENT } from "./sky-event";

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}`;

/** 大気の式（lib/app/atmosphere.ts と同じ。定数もそこから埋める） */
const ATMOS_GLSL = `
const float Re=${ATMOS.Re.toFixed(1)},Ra=${ATMOS.Ra.toFixed(1)},h0=${ATMOS.h0};
const vec3 betaR=vec3(${ATMOS.betaR.join(",")});const float HR=${ATMOS.HR.toFixed(1)};
const float betaM=${ATMOS.betaM},HM=${ATMOS.HM},bgMie=${ATMOS.bgMie},g=${ATMOS.g},mieExt=${ATMOS.mieExt};float AERO=1.0;
const vec3 betaO=vec3(${ATMOS.betaO.join(",")});
const float SUN=${ATMOS.sun.toFixed(1)};
const vec3 msColor=vec3(${ATMOS.msColor.join(",")});const float msStrength=${ATMOS.msStrength},msLow=${ATMOS.msLow.toFixed(1)},msHigh=${ATMOS.msHigh.toFixed(1)},msLowW=${ATMOS.msLowWeight};
const vec3 nightZenith=vec3(${ATMOS.nightZenith.join(",")}),nightHorizon=vec3(${ATMOS.nightHorizon.join(",")});const float nightFall=${ATMOS.nightHorizonFalloff.toFixed(1)};
const int N=${ATMOS.samples},NL=${ATMOS.lightSamples};
float hitFar(vec3 o,vec3 d,float r){float b=dot(o,d);float c=dot(o,o)-r*r;float q=b*b-c;if(q<0.0)return -1.0;return -b+sqrt(q);}
float hitNear(vec3 o,vec3 d,float r){float b=dot(o,d);float c=dot(o,o)-r*r;float q=b*b-c;if(q<0.0)return -1.0;float t=-b-sqrt(q);return t>0.0?t:-1.0;}
vec3 dens(float h){return vec3(exp(-h/HR),AERO*exp(-h/HM)+bgMie*exp(-h/HR),max(0.0,1.0-abs(h-25.0)/15.0));}
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
uniform vec2 u_res;uniform vec3 u_f,u_r,u_u;uniform vec2 u_tan;uniform vec3 u_sun;uniform float u_exposure;uniform float u_aero;uniform float u_glow;
${ATMOS_GLSL}
void main(){AERO=u_aero;vec2 uv=gl_FragCoord.xy/u_res;vec3 v=viewDir(uv,u_f,u_r,u_u,u_tan);
float elev=degrees(asin(clamp(v.z,-1.0,1.0)));
/* 薄明の空の色の補正（lib/app/atmosphere.ts の twilightTint と同じ式）：輝度はそのままに、高い所ほどブルーアワーの青へ */
vec3 c=radiance(v,u_sun)*u_exposure;float tw=${ATMOS.twilightStrength.toFixed(3)}*(1.0-smoothstep(-3.0,1.0,degrees(asin(clamp(u_sun.z,-1.0,1.0)))))*smoothstep(4.0,25.0,elev);
c=mix(c,dot(c,vec3(0.2126,0.7152,0.0722))*vec3(${ATMOS.twilightBlue.join(",")}),tw);
c+=(nightZenith+nightHorizon*exp(-max(0.0,elev)/nightFall))*u_glow;
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
/* 東京タワーは格子：どの向きから見ても日の当たる部材が透けて見えるので、面の向きによらず昼はおおむね照る（高さ地図では自分の影にしない） */
if(typ==4.0)lit=(0.35+0.5*lit)*step(0.0,u_sun.z);else if(lit>0.0){float hs=length(u_sun.xy);
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
uniform vec3 u_sun;uniform vec3 u_sunT;uniform vec3 u_moon;uniform float u_moonOn;uniform float u_day;
uniform sampler2D u_sky;uniform sampler2D u_alb;uniform sampler2D u_nrm;uniform sampler2D u_geo;uniform sampler2D u_win;uniform sampler2D u_emis;uniform sampler2D u_pre;
uniform float u_city;uniform float u_horizon;
uniform sampler2D u_twA;uniform sampler2D u_twD;uniform vec4 u_twRect;uniform vec3 u_twX;uniform vec3 u_twY;uniform float u_twDist;uniform float u_twOn;
uniform vec3 u_sunE;uniform vec3 u_sh0;uniform vec3 u_sh1;uniform vec3 u_sh2;uniform vec3 u_sh3;uniform vec3 u_amb;uniform float u_lightsVis;uniform float u_sigma;
uniform vec4 u_season;uniform float u_snowline;uniform float u_snowCover;uniform float u_wet;
uniform float u_towerOn;uniform float u_towerMode;uniform float u_towerWhite;uniform vec3 u_towerCol;uniform float u_sparkle;uniform float u_decks;
uniform float u_cloud;uniform float u_precip;uniform float u_snow;uniform float u_fog;uniform float u_time;uniform vec2 u_wind;uniform float u_expAdj;uniform float u_haze;
uniform sampler2D u_sat;uniform float u_satOn;uniform vec2 u_satLon;uniform vec2 u_satMerc;uniform vec3 u_camLL;uniform vec2 u_cloudH;uniform float u_cloudExtra;uniform vec2 u_drift;
uniform sampler2D u_rain;uniform float u_rainOn;uniform vec2 u_rainLon;uniform vec2 u_rainMerc;uniform float u_flash;uniform vec2 u_flashDir;uniform vec3 u_sunTH;uniform float u_litH;uniform float u_sunVis;
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
/* 雲：本物の雲（ひまわりの雲の場。R 低い雲・G 高い雲・B 明るさ）を、高さ u_cloudH（km）の 2 つの層として地球の丸みに沿って置く。
   衛星が読めないときは、雲量だけの模様（noiseCloud）。細かい模様（cloudNoise）は衛星の 2km の画素の中を埋める */
const float RE=6371.0,H0=0.26;
float cloudNoise(vec2 p){return fbm(p)*0.72+fbm(p*2.9+vec2(3.1,7.7))*0.28;}
/* 見る向き v が高さ h（km）の層に当たるまでの距離（km） */
float layerDist(vec3 v,float h){vec3 o=vec3(0.0,0.0,RE+H0);float b=dot(o,v);float c=dot(o,o)-(RE+h)*(RE+h);float q=b*b-c;if(q<0.0)return 1e5;return -b+sqrt(q);}
/* カメラからの東・北の距離（km）→ 画像の uv（メルカトル） */
vec2 geoUV(vec2 xy,vec2 lonP,vec2 mercP){float lat=u_camLL.x+xy.y/111.32*0.0174533;float lon=u_camLL.y+xy.x/(111.32*u_camLL.z)*0.0174533;float my=log(tan(0.7853982+lat*0.5));return vec2((lon-lonP.x)*lonP.y,(my-mercP.x)*mercP.y);}
vec4 satAt(vec2 xy){return texture2D(u_sat,geoUV(xy-u_drift,u_satLon,u_satMerc));}
float rainAt(vec2 xy){vec2 uv=geoUV(xy,u_rainLon,u_rainMerc);if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)return 0.0;return texture2D(u_rain,uv).r*100.0;}
/* 層の上の点 xy（km）の雲の濃さ：衛星の値 × 細かい模様。shade は太陽の側が明るい陰影 */
float cloudAt(vec2 xy,float satv,float scale,out float shade){vec2 p=xy*scale+u_wind*u_time;float n=cloudNoise(p);float d=smoothstep(0.1,0.55,satv*(0.5+n));
vec2 sd=normalize(u_sun.xy+vec2(1e-4,0.0));float n2=cloudNoise(p+sd*0.1);shade=clamp(0.55+(n-n2)*5.0,0.0,1.0);return d;}
float noiseCloud(vec2 xy,out float shade){vec2 p=xy*0.36+u_wind*u_time;float n=cloudNoise(p);float t=1.0-u_cloud*1.06;float d=smoothstep(t,t+0.3,n);
vec2 sd=normalize(u_sun.xy+vec2(1e-4,0.0));float n2=cloudNoise(p+sd*0.1);shade=clamp(0.55+(n-n2)*5.0,0.0,1.0);return d;}
/* 向き v の低い雲・高い雲の濃さと陰影、明るさ（衛星と模様を u_satOn で混ぜる＝読めたときに滑らかに切り替える） */
void clouds(vec3 v,out float dL,out float dH,out float shL,out float shH,out float bright,out float thick){dL=0.0;dH=0.0;shL=0.6;shH=0.6;bright=0.75;thick=u_cloud;
if(v.z<0.004)return;vec2 pL=v.xy*layerDist(v,u_cloudH.x);vec2 pH=v.xy*layerDist(v,u_cloudH.y);
float n0=0.6;float f=(u_cloud>0.0&&u_satOn<0.999)?noiseCloud(pL,n0):0.0;
if(u_satOn>0.001){vec4 sL=satAt(pL);vec4 sH=satAt(pH);float a=cloudAt(pL,sL.r+u_cloudExtra,0.36,shL);float b=cloudAt(pH,sH.g,0.14,shH);
bright=mix(0.75,max(sL.b,sH.b),u_satOn);dL=mix(f,a,u_satOn);dH=b*u_satOn;shL=mix(n0,shL,u_satOn);thick=mix(u_cloud,sL.r+u_cloudExtra,u_satOn);}
else{dL=f;shL=n0;}
/* 厚い雲（ほぼ全天の曇り）は地平線まで覆う（地平線の近くだけ晴れの空が見えると不自然） */
float ovc=smoothstep(0.75,0.95,max(u_cloud,thick));dL*=mix(smoothstep(0.004,0.06,v.z),1.0,ovc);dH*=smoothstep(0.004,0.025,v.z);}
/* 地面の点 Pk（km）に落ちる雲の影（太陽の向きへたどって層に当たる所の雲の濃さ） */
float cloudShadow(vec2 Pk,float Pz){if(u_sun.z<=0.0)return 1.0;float sh;float iz=1.0/max(u_sun.z,0.06);vec2 QL=Pk+u_sun.xy*((u_cloudH.x-Pz)*iz);
float f=(u_cloud>0.0&&u_satOn<0.999)?noiseCloud(QL,sh):0.0;if(u_satOn<=0.001)return 1.0-0.9*f;
vec2 QH=Pk+u_sun.xy*((u_cloudH.y-Pz)*iz);float a=cloudAt(QL,satAt(QL).r+u_cloudExtra,0.36,sh);float b=cloudAt(QH,satAt(QH).g,0.14,sh);
return (1.0-0.9*mix(f,a,u_satOn))*(1.0-0.75*b*u_satOn);}
/* 霞の濁りの係数（近いほど弱める。距離×係数が単調に増えるように）と、近い霞の色（青みを抜く）。
   本物の写真（スマートフォン）は 1〜3km の建物の日陰もほぼ黒く締まる（霞の明るさは日陰の明るさより小さい）。2km 以内は 5〜7%、20km より遠くはそのまま */
float hazeK(float d){return 0.05+0.95*smoothstep(1500.0,20000.0,d);}
vec3 hazeAt(vec3 hz0,float d){return mix(vec3(dot(hz0,vec3(0.2126,0.7152,0.0722))),hz0,smoothstep(2500.0,20000.0,d));}
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
/* 雲（低い層と高い層。高い雲は日没後もしばらく日が当たり、桃色に残る） */
float dL,dH,shL,shH,bright,thick;clouds(v,dL,dH,shL,shH,bright,thick);dL=max(dL,smoothstep(0.85,0.97,thick));float sunVis=u_sunVis;
vec3 zen=skyAt(vec2(0.5,0.96));
/* 雲の底を照らす空の光：曇るほど青みが抜けて灰色（本物の曇り空は灰色一色） */
float ovc0=smoothstep(0.5,0.95,u_cloud);vec3 zg=mix(zen,vec3(dot(zen,vec3(0.2126,0.7152,0.0722))),0.35+0.55*ovc0);vec3 amb=zg*0.8+vec3(0.06);
vec3 litL=u_sunT*(1.05+0.25*u_day);vec3 litH=u_sunTH*(1.1+0.2*u_litH);
/* 低い雲は下から見る：厚い雲ほど底が暗い（太陽が高いとき。低い太陽は横から当たって明るい） */
vec3 dayColL=mix(amb,litL,(shL*0.75+0.1)*(1.0-0.55*u_cloud))*(0.7+0.4*bright)*(1.0-0.45*smoothstep(0.45,1.0,thick)*clamp(u_sun.z*2.0,0.0,1.0));
vec3 dayColH=mix(amb*1.1,litH,shH*0.6+0.3)*(0.8+0.3*bright);
/* 夜・薄明の雲：薄い雲は後ろの空の色で光るが、厚い雲は夕焼けを通さず灰色（明るさは空に合わせる）。下から街明かりで茶灰色に */
vec3 nightCol=mix(sky*0.55,vec3(dot(sky,vec3(0.2126,0.7152,0.0722)))*0.45,ovc0)+vec3(0.075,0.052,0.036)*(0.7+0.5*(1.0-clamp(v.z*4.0,0.0,1.0)))+vec3(0.006,0.007,0.012);
vec3 cloudColL=mix(nightCol,dayColL,u_day);vec3 cloudColH=mix(nightCol*0.8,dayColH,u_litH);
/* 太陽：本体とにじみ（雲でさえぎられる） */
float th=acos(clamp(dot(v,u_sun),-1.0,1.0));
float disc=1.0-smoothstep(sunRad*0.85,sunRad,th);
/* 本体は空よりずっと明るい（地平線の近くで大気に弱められても空に溶けない。カメラでは白〜黄に飽和し、ごく低いと橙）。
   本体は雲を重ねた後で、雲のすき間からだけ見せる。にじみは届く光の色で、低い太陽でも金〜橙に光る（明るさは届く光の 0.4 乗） */
vec3 sunDisc=u_sunT*disc*3000.0*sunVis*sunVis;
vec3 sunG=u_sunT/max(max(u_sunT.r,u_sunT.g),max(u_sunT.b,1e-6))*pow(dot(u_sunT,vec3(0.2126,0.7152,0.0722)),0.4);
sky+=sunG*(4.0*exp(-th*th/(2.0*0.028*0.028))+(0.9*exp(-th/0.052)+0.2*exp(-th/0.157))*u_haze)*sunVis;
/* 月 */
if(u_moonOn>0.5){vec3 m=u_moon;vec3 mu_=normalize(cross(m,vec3(0.0,0.0,1.0)));vec3 mv=cross(mu_,m);vec3 dl=v-m;float dx=dot(dl,mu_)/moonRad;float dy=dot(dl,mv)/moonRad;float rr=dx*dx+dy*dy;
float vis=clamp(1.0-skyLum*3.0,0.08,1.0)*(1.0-u_cloud*0.85);float tm=acos(clamp(dot(v,m),-1.0,1.0));
if(rr<1.0){float nz=sqrt(1.0-rr);vec3 n=-m*nz+mu_*dx+mv*dy;float l=max(0.0,dot(n,u_sun));float edge=1.0-smoothstep(0.9,1.0,rr);sky+=vec3(1.0,0.97,0.9)*(l*0.85+0.03)*edge*vis;}
sky+=vec3(0.9,0.92,1.0)*0.09*exp(-tm/(0.04*u_haze))*vis;}
/* 星の見える度合い（出力の α に入れ、星と惑星の点を描くときに掛ける。lib/app/stars.ts と present()）：空が明るい（薄明・街明かりの照り返し・
   太陽と月のにじみ）ほど消え、地平線の近く（15° 以下）は街明かりで空が明るく見えない。雲・街・塔・雨の幕・霧の後ろも見えない */
float skyA=clamp(1.0-dot(sky,vec3(0.2126,0.7152,0.0722))*6.0,0.0,1.0)*smoothstep(0.02,0.25,v.z);
sky=mix(sky,cloudColH,dH*0.93);sky=mix(sky,cloudColL,dL*mix(0.95,1.0,smoothstep(0.8,0.97,thick)));
skyA*=(1.0-dH*0.93)*(1.0-dL);
sky+=sunDisc*pow(1.0-dL,3.0)*(1.0-0.9*dH);
/* 稲光：発雷域の向きの雲と空が一瞬明るくなる */
if(u_flash>0.0){float ang=acos(clamp(dot(normalize(v.xy+vec2(1e-5,0.0)),u_flashDir),-1.0,1.0));float k=u_flash*exp(-ang*ang/0.22)*smoothstep(-0.02,0.08,v.z);sky+=vec3(0.85,0.88,1.0)*k*(0.25+1.2*max(dL,dH));}
vec3 hz=skyAt(vec2(uv.x,1.0-u_horizon+0.03))*0.8;
/* 夜の街明かりが霞を照らす分（u_amb）は街の上の空気だけ。街より遠くの山は地平線の空より暗いシルエット。
   曇りの日の霞は雲の底の色（遠くの街は灰色の空に溶ける。晴れの地平線の白さは使わない） */
vec3 hazeB=mix(mix(hz,vec3(dot(hz,vec3(0.3,0.5,0.2))),u_cloud*0.6),cloudColL*0.97,smoothstep(0.55,0.9,u_cloud));vec3 haze=hazeB+u_amb*1.6;
vec3 outc=sky;float distKm=1e5;float twW=0.0;
/* 街：焼き込んだ色・向き・距離を、今の光で照らす */
vec4 al=texture2D(u_alb,iuv);float cov=al.a*u_city;
if(cov>0.002){
vec3 a=lin(al.rgb)*0.9;
vec3 g=texture2D(u_geo,iuv).rgb;float aux;float typ=typeOf(g,aux);float dd=decodeDist(g);vec3 P=v*dd;
distKm=dd/1000.0;vec4 nn=texture2D(u_nrm,iuv);vec3 n=normalize(nn.rgb*2.0-1.0);float ao=nn.a;
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
/* 雲の影：太陽の向きにたどって雲の層に当たる所の雲の濃さ（本物の雲の影） */
float cs=cloudShadow(P.xy/1000.0,P.z/1000.0);
vec3 E=max(u_sh0+u_sh1*n.x+u_sh2*n.y+u_sh3*n.z,vec3(0.0));
/* 空からの光は建物どうしの照り返しで青みが薄まる。建物の間（空の見え方が小さい所）は暗い */
E=mix(E,vec3(dot(E,vec3(0.2126,0.7152,0.0722))),0.45);
vec3 L=a*(u_sunE*pre.r*cs+E*ao*(0.45+0.45*ao))/3.14159265+a*u_amb*(0.35+0.65*ao);
/* 濡れた屋根・道は空を映す（夜は街灯も） */
L+=haze*0.10*u_wet*up*(1.0-u_snowCover);
/* ガラス：窓は空を映す（斜めから見るほど強く＝フレネル。オフィスの熱線反射ガラスは正面でも 12% ほど映す）。太陽の映り込みはきらりと光る。
   写真の質感のある建物（typ 1）は質感に窓が写っているので、窓の型（格子の決め打ち）ではなく用途ごとの一様なガラスの割合で映す（型がずれてざらつかない） */
if(typ<2.5){float glass=(typ<1.5?(aux<1.5?0.32:(aux<2.5?0.22:(aux<3.5?0.18:0.1))):texture2D(u_win,iuv).r*(aux<1.5?1.0:0.7))*(1.0-u_snowCover);
if(glass>0.01){float nv=max(dot(n,-v),0.0);float f0=aux<1.5?0.12:0.05;float F=f0+(1.0-f0)*pow(1.0-nv,5.0);vec3 rv=reflect(v,n);
vec3 refl=rv.z>0.0?mix(hz*0.9,zen,smoothstep(0.0,0.5,rv.z)):L*0.8;
float glint=pow(max(dot(rv,u_sun),0.0),180.0)*step(0.0,u_sun.z)*sunVis*min(pre.r*4.0,1.0);
L+=glass*(F*refl+glint*u_sunE*0.12);}}
/* 窓（用途で色が違う：オフィスは白、住宅は暖色が多い）。明るさは窓ごとに大きく違う（明るい事務所の階は白く飛ぶ）。
   遠くは 1 画素に窓がいくつも入るが、光は一様に広がらず点の集まり：画素ごとの明るさを裾の重い乱数で散らす（平均は同じ） */
if(pre.g>0.0){vec3 w=texture2D(u_win,iuv).rgb;
vec3 wc=aux<1.5?mix(vec3(0.86,0.92,1.0),vec3(1.0,0.9,0.74),step(0.6,fract(w.b*5.1))):(aux<2.5?vec3(1.0,0.84,0.62):(aux<3.5?vec3(1.0,0.76,0.5):(aux<4.5?mix(vec3(1.0,0.7,0.4),vec3(0.9,0.94,1.0),step(0.75,fract(w.g*7.3))):vec3(0.96,0.9,0.8))));
float wk=aux<1.5?0.95:(aux<2.5?1.2:(aux<3.5?0.85:(aux<4.5?0.8:0.7)));
float hx=-log(max(hash21(vec2(w.g,w.b)*255.0+vec2(17.0,3.0)),0.002));float wv=fract(w.g*13.7);
L+=wc*pre.g*(0.35+1.9*wv*wv)*wk*u_lightsVis*mix(1.0,hx*hx*0.5,smoothstep(1500.0,5000.0,dd));}
/* 街灯と車（国道・都道・高速は車の光が流れる） */
if(typ==3.0&&pre.b>0.0){vec3 sc=aux>1.5?vec3(1.0,0.74,0.45):vec3(0.86,0.92,1.0);L+=sc*pre.b*1.2*u_lightsVis*(1.0+0.8*u_wet);
if(aux>1.5){float uu=e.b*255.0;float hh=hash21(floor(gl_FragCoord.xy*0.5));float dir=hh>0.5?1.0:-1.0;
float car=smoothstep(0.84,0.98,fract((uu+dir*u_time*13.0)/21.0+hh*7.0));L+=(dir>0.0?vec3(1.0,0.95,0.85):vec3(1.0,0.12,0.06))*car*e.r*2.4*u_lightsVis;}}
/* 遠くの霞：距離と見通しで空の地平線の色に溶ける（夜は街明かりの照り返しの色）。
   カメラ（スマートフォン）の処理と同じく、近い所は霞を弱めて明暗と色を残す（濁りの係数を近いほど下げる。30km より遠くはそのまま）。
   近い霞は空の青ではなく中立の色（地表近くの霞の粒は色を選ばずに散らす） */
float T=exp(-dd*u_sigma*hazeK(dd));
L=L*T+(hazeAt(hazeB,dd)+u_amb*1.6*(1.0-smoothstep(12000.0,40000.0,dd)))*(1.0-T);
outc=mix(sky,L,cov);skyA*=1.0-cov;}
/* 東京タワー：塔だけを高い倍率で焼いた層（色と透け具合・面の向きの割合・照明の属性）を街の上に重ねる。透けた格子の向こうに街が見える */
if(u_twOn>0.5){vec2 tq=(iuv-u_twRect.xy)/(u_twRect.zw-u_twRect.xy);
if(tq.x>0.0&&tq.x<1.0&&tq.y>0.0&&tq.y<1.0){vec4 ta=texture2D(u_twA,tq);
/* 塔より手前の建物（汐留〜芝の建物）が塔の足元を隠す */
ta.a*=1.0-cov*step(distKm*1000.0,u_twDist-40.0);
if(ta.a>0.004){vec3 tn=texture2D(u_twD,vec2(tq.x,tq.y*0.5)).rgb;vec3 te=texture2D(u_twD,vec2(tq.x,0.5+tq.y*0.5)).rgb;
tn/=max(tn.x+tn.y+tn.z,0.001);vec3 nzt=vec3(0.0,0.0,v.z<0.0?1.0:-1.0);vec3 ab=lin(ta.rgb)*0.9;
/* 日：見えている面の向きごとの当たり（格子の向こう側の部材は手前の部材の影に入る分を引く） */
float sunF=tn.x*max(dot(u_twX,u_sun),0.0)+tn.y*max(dot(u_twY,u_sun),0.0)+tn.z*max(dot(nzt,u_sun),0.0);
vec3 Et=tn.x*max(u_sh0+u_sh1*u_twX.x+u_sh2*u_twX.y+u_sh3*u_twX.z,vec3(0.0))+tn.y*max(u_sh0+u_sh1*u_twY.x+u_sh2*u_twY.y+u_sh3*u_twY.z,vec3(0.0))+tn.z*max(u_sh0+u_sh3*nzt.z,vec3(0.0));
Et=mix(Et,vec3(dot(Et,vec3(0.2126,0.7152,0.0722))),0.45);
vec3 Pt=v*u_twDist;float cst=cloudShadow(Pt.xy/1000.0,Pt.z/1000.0);
vec3 Lt=ab*(u_sunE*sunF*0.8*cst+Et*0.85)/3.14159265+ab*u_amb*0.5;
/* 展望台のガラス：空を映す */
float gf=te.b;if(gf>0.0){vec3 rv=reflect(v,normalize(u_twX*tn.x+u_twY*tn.y+vec3(0.0,0.0,0.001)));vec3 refl=rv.z>0.0?mix(hz*0.9,zen,smoothstep(0.0,0.5,rv.z)):Lt*0.8;Lt+=gf*0.14*refl;}
/* 夜：ランドマークライト（夏は白・冬はオレンジ）、ダイヤモンドヴェール、展望台の窓、毎正時の純白の煌めき（大展望台とトップデッキの上部）。
   色は画面の色（sRGB）で決めてあるので線形に直す（直さないと橙が薄い桃色になる） */
if(u_towerOn>0.0){float code2=floor(te.r*255.0+0.5);float part=floor(code2/32.0);float tier=code2-part*32.0;float tem=te.g;
vec3 tc=pow(u_towerCol,vec3(2.2));if(u_towerMode>1.5)tc*=0.55+0.45*sin(tier*0.85+u_time*0.6);
tc=mix(tc,vec3(1.0),u_towerWhite);
float k=part<0.5?1.0:(part<2.5?0.0:(part<3.5?0.55:(part<4.5?0.0:0.9)));
Lt+=tc*tem*k*2.8*u_towerOn;
Lt+=vec3(1.0,0.95,0.86)*1.7*u_decks*gf*u_towerOn;
if(u_sparkle>0.0&&part>4.5)Lt+=vec3(1.0)*step(0.78,hash21(floor(gl_FragCoord.xy*0.7)+floor(u_time*9.0)))*3.0*u_towerOn;}
float Tt=exp(-u_twDist*u_sigma*hazeK(u_twDist));Lt=Lt*Tt+hazeAt(haze,u_twDist)*(1.0-Tt);
outc=mix(outc,Lt,ta.a);distKm=mix(distKm,u_twDist/1000.0,ta.a);twW=ta.a;skyA*=1.0-ta.a;}}}
/* 雨の幕：レーダーの雨の下を通る視線の分だけ灰色に溶ける（遠くの雨柱、近くの雨。雨の強さで見通しが決まる） */
if(u_rainOn>0.5){float tmax=cov>0.002?min(distKm,80.0):(v.z>0.001?min((u_cloudH.x-H0)/v.z,80.0):80.0);float od=0.0;float dt=tmax/8.0;
for(int i=0;i<8;i++){float t=(float(i)+0.5)*dt;float z=H0+v.z*t;if(z>u_cloudH.x||z<-0.3)continue;float mm=rainAt(v.xy*t);if(mm>0.2)od+=0.2*pow(mm,0.63)*dt;}
outc=mix(outc,haze*0.78,1.0-exp(-od));skyA*=exp(-od);}
/* 夜の光のにじみ（レンズと空気）：周りの窓と街灯の明かりを 2 つの輪で拾って足す */
if(u_lightsVis>0.0){vec3 gs=vec3(0.0);for(int i=0;i<8;i++){float an=float(i)*0.785398+0.39;vec2 o=vec2(cos(an),sin(an))/u_res;
vec4 p1=texture2D(u_pre,uv+o*2.5);vec4 p2=texture2D(u_pre,uv+o*6.0);gs+=vec3(0.95,0.9,0.8)*(p1.g*0.6+p2.g*0.3)+vec3(1.0,0.75,0.45)*(p1.b*0.6+p2.b*0.3);}
outc+=gs/8.0*0.12*u_lightsVis;}
vec3 col=tone(outc*u_expAdj);
/* 街と塔：カメラの色の処理（彩度を少し上げ、中間の明るさの差を広げる）。空は CSS の色とそろえるため変えない。昼ほど強く */
float cw=max(cov,twW)*(0.35+0.65*u_day);
if(cw>0.0){float yl=dot(col,vec3(0.2126,0.7152,0.0722));vec3 g2=clamp(vec3(yl)+(col-vec3(yl))*1.2,0.0,1.0);
g2=mix(g2,g2*g2*(3.0-2.0*g2),0.24);col=mix(col,g2,cw);}
/* 霧・雨・雪のときは、空も地平線の近くが白っぽく */
float fogC=clamp(u_fog+u_precip*0.35+u_snow*0.3,0.0,1.0);
col=mix(col,tone(haze*u_expAdj),clamp(fogC*0.55*smoothstep(0.2,u_horizon,iuv.y)*(1.0-cov),0.0,0.85));skyA*=1.0-fogC;
/* 雨・雪 */
if(u_precip>0.0){if(u_snow>0.5){float s=snow(uv,26.0,0.075,1.0)+0.6*snow(uv,52.0,0.13,5.0);col=mix(col,vec3(0.96,0.97,1.0),clamp(s,0.0,1.0)*0.9);}
else{float r=rain(uv,vec2(62.0,7.0),1.4,1.0)+0.6*rain(uv,vec2(115.0,12.0),2.1,7.0);col+=vec3(0.72,0.78,0.88)*r*0.34*(0.5+0.5*u_precip);}}
/* 撮像の細かい粒（暗い所ほど。動かない） */
float yl2=dot(col,vec3(0.2126,0.7152,0.0722));
col+=(hash21(gl_FragCoord.xy)-0.5)/255.0*(1.0+2.5*(1.0-smoothstep(0.05,0.45,yl2))*max(cov,0.3));
gl_FragColor=vec4(col,skyA);}`;

/** 3 枚目：航空障害灯（画面の点。航空法の決まり：60m 以上の屋上に赤、90m 以上は明滅、150m 以上と東京タワーの頂は昼は白い閃光。
 *  種類 a_i.y：0 不動の赤、1 赤の明滅、2 東京タワーの頂、3 東京タワーの展望台、4 150m 以上。u_white=1 のときは昼の白い閃光を描く */
const VERT_LIGHTS = `attribute vec2 a_p;attribute vec4 a_i;uniform float u_px;uniform float u_time;uniform float u_vis;uniform float u_sigma;uniform float u_still;uniform float u_white;varying float vB;varying vec3 vC;
void main(){gl_Position=vec4(a_p.x*2.0-1.0,1.0-a_p.y*2.0,0.0,1.0);
float kind=a_i.y;float t=fract(u_time/a_i.w+a_i.z);float att=u_vis*exp(-a_i.x*u_sigma);bool hi=kind==1.0||kind==2.0||kind==4.0;
if(u_white>0.5){
/* 昼：150m 以上の建物と東京タワーの頂の白い閃光（周期の 12%。動きを減らす設定では出さない） */
float on=(kind==4.0||kind==2.0)&&u_still<0.5?step(t,0.12):0.0;vB=on*att*1.5;vC=vec3(1.0,0.98,0.95);gl_PointSize=u_px*0.8*clamp(2400.0/a_i.x,0.5,1.3);}
else{
/* 夜：赤。90m 以上は明滅（周期の 45%）、60〜90m と中間の高さ・展望台は不動 */
float blink=hi&&u_still<0.5?step(t,0.45):1.0;vB=blink*att*(kind==2.0?1.1:(kind==3.0?0.75:(hi?1.0:0.6)));vC=vec3(1.0,0.16,0.07);
gl_PointSize=u_px*(kind==2.0?1.1:(kind==3.0?0.8:1.0))*clamp(2400.0/a_i.x,0.5,1.3);}}`;
const FRAG_LIGHTS = `precision mediump float;varying float vB;varying vec3 vC;
void main(){vec2 q=gl_PointCoord*2.0-1.0;float a=exp(-dot(q,q)*3.0)*vB;gl_FragColor=vec4(vC*a,1.0);}`;
/** 合成した絵（frameT）を画面に写す（点滅だけのコマで使い回す） */
const FRAG_COPY = `precision mediump float;uniform vec2 u_res;uniform sampler2D u_tex;void main(){gl_FragColor=texture2D(u_tex,gl_FragCoord.xy/u_res);}`;
/** 星と惑星（画面の点。位置・明るさ・色は lib/app/stars.ts）。合成した絵の α（空の見える度合い）を掛けて足すので、雲・街・塔の後ろと明るい空では消える。
 *  a_c：色×明るさ、a_s：点の大きさ（pt）、a_t：またたき（大きさ・種）。またたきは 5 回/秒の乱数をなめらかにつないだもの（低い星ほど大きい。動きを減らす設定では止める） */
const VERT_STARS = `attribute vec2 a_p;attribute vec3 a_c;attribute float a_s;attribute vec2 a_t;uniform float u_px;uniform float u_time;uniform float u_still;varying vec3 vC;
float h1(float x){return fract(sin(x*127.1+311.7)*43758.5453);}
void main(){gl_Position=vec4(a_p.x*2.0-1.0,1.0-a_p.y*2.0,0.0,1.0);
float t=mod(u_time*5.0,1024.0)+a_t.y*97.0;float f=fract(t);float tw=mix(h1(floor(t)),h1(floor(t)+1.0),f*f*(3.0-2.0*f));
vC=a_c*(u_still>0.5?1.0:1.0+a_t.x*(tw*2.0-1.0));gl_PointSize=a_s*u_px;}`;
const FRAG_STARS = `precision mediump float;uniform sampler2D u_tex;uniform vec2 u_res;varying vec3 vC;
void main(){vec2 q=gl_PointCoord*2.0-1.0;float r2=dot(q,q);if(r2>1.0)discard;float a=texture2D(u_tex,gl_FragCoord.xy/u_res).a;
gl_FragColor=vec4(vC*(exp(-r2*7.0)+0.05*exp(-r2*1.5))*a,1.0);}`;

type Prog = { prog: WebGLProgram; loc: Record<string, WebGLUniformLocation | null> };
type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };
type Gl = {
  gl: WebGLRenderingContext;
  sky: Prog;
  pre: Prog | null;
  main: Prog;
  lights: Prog | null;
  /** 星と惑星（点） */
  stars: Prog | null;
  copy: Prog;
  quad: WebGLBuffer;
  skyT: Target;
  preT: Target | null;
  /** 合成した絵（画面と同じ大きさ）。航空障害灯はこの上に描く */
  frameT: Target;
  /** 航空障害灯の見え方（夜の赤・昼の白い閃光・霞の係数）。最後の合成で決める */
  lightsState: { red: number; white: number; sigma: number } | null;
  tex: Record<string, WebGLTexture>;
  /** 航空障害灯（点の数と、位置・属性のバッファ） */
  pts: { buf: WebGLBuffer; n: number } | null;
  /** 星と惑星の点（位置・色×明るさ・大きさ・またたき。描くたびに入れ直す）と、その数 */
  starBuf: WebGLBuffer;
  starN: number;
  /** 街の層を読み終えたか */
  cityReady: boolean;
  /** 下ごしらえを最後に描いた条件（分・天気） */
  preKey: string;
  /** 入れてある衛星の雲・レーダーの雨の時刻と、雲が読めた時刻（滑らかに切り替えるため） */
  satTime: string;
  rainTime: string;
  satSince: number;
  dsmGrid: [number, number, number, number];
  dsmZ: [number, number];
};

const SKY_UNIFORMS = ["u_res", "u_f", "u_r", "u_u", "u_tan", "u_sun", "u_exposure", "u_aero", "u_glow"];
const PRE_UNIFORMS = ["u_res", "u_f", "u_r", "u_u", "u_tan", "u_sun", "u_geo", "u_nrm", "u_win", "u_emis", "u_dsm", "u_dsmGrid", "u_dsmZ", "u_occA", "u_occB", "u_lightsVis"];
const MAIN_UNIFORMS = ["u_res", "u_f", "u_r", "u_u", "u_tan", "u_sun", "u_sunT", "u_moon", "u_moonOn", "u_day", "u_sky", "u_alb", "u_nrm", "u_geo", "u_win", "u_emis", "u_pre", "u_city", "u_horizon", "u_sunE", "u_sh0", "u_sh1", "u_sh2", "u_sh3", "u_amb", "u_lightsVis", "u_sigma", "u_season", "u_snowline", "u_snowCover", "u_wet", "u_towerOn", "u_towerMode", "u_towerWhite", "u_towerCol", "u_sparkle", "u_decks", "u_cloud", "u_precip", "u_snow", "u_fog", "u_time", "u_wind", "u_expAdj", "u_haze", "u_sat", "u_satOn", "u_satLon", "u_satMerc", "u_camLL", "u_cloudH", "u_cloudExtra", "u_drift", "u_rain", "u_rainOn", "u_rainLon", "u_rainMerc", "u_flash", "u_flashDir", "u_sunTH", "u_litH", "u_sunVis", "u_twA", "u_twD", "u_twRect", "u_twX", "u_twY", "u_twDist", "u_twOn"];
const LIGHT_UNIFORMS = ["u_px", "u_time", "u_vis", "u_sigma", "u_still", "u_white"];
const COPY_UNIFORMS = ["u_res", "u_tex"];
const STAR_UNIFORMS = ["u_px", "u_time", "u_still", "u_tex", "u_res"];

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
const CITY_LAYERS: [string, boolean][] = [["alb", false], ["nrm", false], ["geo", true], ["win", true], ["emis", true], ["twa", false], ["twd", true]];
/**
 * 東京タワーの層（塔だけを 1pt あたり 24 画素で焼いて縮めたもの）の場所：画面 393×275pt の中の [x, y, 幅, 高さ]、塔までの平均の距離（m）、
 * 塔の向き（カメラの ENU。ローカルの x・y 軸）。焼き込み（scripts/city-bake の post5.py）が layers/tower.json に書く値
 */
const TOWER = { pt: [184, 112, 48, 84], dist: 1581.4, at: [-1460.6, -602.2], ax: [0.55933, 0.82895, 0.0002], ay: [-0.82895, 0.55933, -0.00014] } as const;
/** 雲の層の高さ（km）：低い雲（層雲・積雲）と高い雲（巻雲・積乱雲の頂） */
const CLOUD_H: [number, number] = [1.4, 7.5];

function init(canvas: HTMLCanvasElement, city: boolean): Gl | null {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
  if (!gl) return null;
  const sky = compile(gl, FRAG_SKY, SKY_UNIFORMS);
  const main = compile(gl, FRAG_MAIN, MAIN_UNIFORMS);
  if (!sky || !main) return null;
  // 街の下ごしらえと航空障害灯（ホームだけ。作れなくても空は描く）
  const pre = city ? compile(gl, FRAG_PRE, PRE_UNIFORMS) : null;
  const lights = city ? compile(gl, FRAG_LIGHTS, LIGHT_UNIFORMS, VERT_LIGHTS) : null;
  // 星と惑星（作れなくても空は描く）
  const stars = compile(gl, FRAG_STARS, STAR_UNIFORMS, VERT_STARS);
  const copy = compile(gl, FRAG_COPY, COPY_UNIFORMS);
  if (!copy) return null;
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  // 1 枚目の絵（1/4 の解像度）と、街の下ごしらえ（画面と同じ大きさ）
  const skyT = target(gl, Math.max(64, Math.round(canvas.width / 4)), Math.max(48, Math.round(canvas.height / 4)));
  const preT = city && pre ? target(gl, canvas.width, canvas.height) : null;
  const frameT = target(gl, canvas.width, canvas.height);
  const tex: Record<string, WebGLTexture> = {};
  for (const [k] of CITY_LAYERS) tex[k] = blankTexture(gl, [0, 0, 0, 0]);
  tex.dsm = blankTexture(gl, [0, 0, 0, 255]);
  tex.sat = blankTexture(gl, [0, 0, 191, 255]);
  tex.rain = blankTexture(gl, [0, 0, 0, 255]);
  return { gl, sky, pre, main, lights, stars, copy, quad, skyT, preT, frameT, lightsState: null, tex, pts: null, starBuf: gl.createBuffer()!, starN: 0, cityReady: false, preKey: "", satTime: "", rainTime: "", satSince: 0, dsmGrid: DSM_GRID, dsmZ: DSM_Z };
}

/** キャンバスの大きさを変える（ピンチで拡大したとき高い解像度で描き直す）。描く先の絵も作り直す */
function resizeTargets(g: Gl, canvas: HTMLCanvasElement, w: number, h: number) {
  const { gl } = g;
  canvas.width = w;
  canvas.height = h;
  for (const t of [g.skyT, g.preT, g.frameT]) {
    if (!t) continue;
    gl.deleteFramebuffer(t.fbo);
    gl.deleteTexture(t.tex);
  }
  g.skyT = target(gl, Math.max(64, Math.round(w / 4)), Math.max(48, Math.round(h / 4)));
  g.preT = g.preT ? target(gl, w, h) : null;
  g.frameT = target(gl, w, h);
  g.preKey = "";
}

/** 合成した絵を画面に写し、星と惑星、航空障害灯（夜の赤・昼の白い閃光）を足す。またたき・点滅だけのコマはこれだけを描く */
function present(g: Gl, seconds: number, still: boolean) {
  const { gl } = g;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.disable(gl.BLEND);
  gl.useProgram(g.copy.prog);
  bindQuad(g, g.copy);
  gl.uniform2f(g.copy.loc.u_res, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, g.frameT.tex);
  gl.uniform1i(g.copy.loc.u_tex, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // 星と惑星（合成した絵の α＝空の見える度合いを掛けて足す。合成した絵は 0 番の単位に入ったまま）
  if (g.stars && g.starN > 0) {
    const p = g.stars;
    gl.useProgram(p.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.starBuf);
    const attrs: [string, number, number][] = [["a_p", 2, 0], ["a_c", 3, 8], ["a_s", 1, 20], ["a_t", 2, 24]];
    const locs = attrs.map(([name, size, off]) => {
      const a = gl.getAttribLocation(p.prog, name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, size, gl.FLOAT, false, 32, off);
      return a;
    });
    gl.uniform1f(p.loc.u_px, gl.drawingBufferWidth / 393);
    gl.uniform1f(p.loc.u_time, seconds);
    gl.uniform1f(p.loc.u_still, still ? 1 : 0);
    gl.uniform2f(p.loc.u_res, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1i(p.loc.u_tex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, g.starN);
    gl.disable(gl.BLEND);
    locs.forEach((a) => gl.disableVertexAttribArray(a));
  }
  const L = g.lightsState;
  if (!L || !g.lights || !g.pts) return;
  const p = g.lights;
  gl.useProgram(p.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.pts.buf);
  const ap = gl.getAttribLocation(p.prog, "a_p");
  const ai = gl.getAttribLocation(p.prog, "a_i");
  gl.enableVertexAttribArray(ap);
  gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(ai);
  gl.vertexAttribPointer(ai, 4, gl.FLOAT, false, 24, 8);
  // 点の大きさ：1.6pt（本物の灯は小さな点で、まわりに少しにじむ）
  gl.uniform1f(p.loc.u_px, (gl.drawingBufferWidth / 393) * 1.6);
  gl.uniform1f(p.loc.u_time, seconds);
  gl.uniform1f(p.loc.u_sigma, L.sigma);
  gl.uniform1f(p.loc.u_still, still ? 1 : 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  if (L.red > 0.01) {
    gl.uniform1f(p.loc.u_vis, L.red);
    gl.uniform1f(p.loc.u_white, 0);
    gl.drawArrays(gl.POINTS, 0, g.pts.n);
  }
  if (L.white > 0.01 && !still) {
    gl.uniform1f(p.loc.u_vis, L.white);
    gl.uniform1f(p.loc.u_white, 1);
    gl.drawArrays(gl.POINTS, 0, g.pts.n);
  }
  gl.disable(gl.BLEND);
  gl.disableVertexAttribArray(ai);
  gl.disableVertexAttribArray(ap);
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
    ["twa", `${CITY_DIR}/${set}/twa.webp`, false],
    ["twd", `${CITY_DIR}/${set}/twd.webp`, true],
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
  const air = airFrom(w, at);
  const sh = skyIrradianceSH(sun, altitude, w.cloud, air);
  const occ = windowOccupancy(at);
  const rainLive = w.source !== "override" && !!currentSky().rain?.any;
  const vis = visibilityKm(w, at, rainLive);
  const season = treeSeason(at);
  const tower = towerLight(at, altitude);
  return {
    sh,
    sunE: sunIrradiance(sun, altitude, air.aero),
    amb: cityAmbient(altitude),
    lightsVis: artificialLevel(altitude),
    /** タワーの明かりの露出の比（点灯は日没から。日没のころは目立たない） */
    artExp: artificialExposure(altitude),
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
  const key = `${Math.floor(at.getTime() / 60e3)}|${w.kind}|${w.cloud}|${w.precip}|${w.fog}|${w.humidity}|${off}|${currentSky().rain?.time ?? ""}`;
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

let meterCache: { key: string; v: number } | null = null;
function meterCached(altitude: number, azimuth: number, cam: Camera, air: Air): number {
  const key = `${altitude.toFixed(2)}|${azimuth.toFixed(2)}|${cam.bearing}|${cam.horizon}|${air.aero}`;
  if (!meterCache || meterCache.key !== key) meterCache = { key, v: meterExposure(altitude, azimuth, cam, air) };
  return meterCache.v;
}
/**
 * 星と惑星の点の頂点（画面の位置、色×明るさ、大きさ pt、またたきの大きさと種。8 つの数で 1 点）。
 * 見える度合いは太陽の高度（明るいものほど早く見える）と霞（lib/app/air.ts）。帯の外のものは入れない
 */
function starVertices(at: Date, sunAlt: number, b: ReturnType<typeof basis>, air: Air): Float32Array {
  if (sunAlt > -0.5) return new Float32Array(0);
  const out: number[] = [];
  skyObjects(at, BASE.lat, BASE.lng).forEach((o, i) => {
    const vis = starVisibility(o.mag, sunAlt) * air.stars;
    if (vis < 0.02) return;
    const d = dirFromAltAz(o.alt, o.az);
    const df = d[0] * b.f[0] + d[1] * b.f[1] + d[2] * b.f[2];
    if (df < 0.1) return;
    const x = 0.5 + (d[0] * b.r[0] + d[1] * b.r[1] + d[2] * b.r[2]) / df / b.tanH / 2;
    const y = 0.5 - (d[0] * b.u[0] + d[1] * b.u[1] + d[2] * b.u[2]) / df / b.tanV / 2;
    if (x < -0.03 || x > 1.03 || y < -0.03 || y > 1.03) return;
    const { intensity, size, twinkle } = starLook(o);
    const c = starColor(o.bv);
    const k = intensity * vis;
    out.push(x, y, c[0] * k, c[1] * k, c[2] * k, size, twinkle, (i % 89) / 89);
  });
  return new Float32Array(out);
}

function draw(g: Gl, cam: Camera, at: Date, city: boolean, seconds: number, still: boolean) {
  const { gl } = g;
  const s = solar(at);
  const sun = dirFromAltAz(s.altitude, s.azimuth);
  const mp = SunCalc.getMoonPosition(at, BASE.lat, BASE.lng);
  const moon = dirFromAltAz(mp.altitude, mp.azimuth);
  const b = basis(cam);
  const w = currentWeather();
  const air = airFrom(w, at);
  const T = sunTransmittance(sun, air.aero);
  const TH = sunTransmittanceAt(CLOUD_H[1], sun, air.aero);
  const showCity = city && g.cityReady && !!g.pre && !!g.preT;
  // 本物の雲・雨・雷（#w= で天気を固定しているときは使わない）
  const live: LiveSky = w.source === "override" ? { cloud: null, rain: null, thunder: null } : currentSky(Date.now());
  const upload = (tex: WebGLTexture, data: Uint8ClampedArray, size: number) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    texParams(gl, false);
  };
  if (live.cloud && live.cloud.time !== g.satTime) {
    upload(g.tex.sat, live.cloud.data, live.cloud.size);
    g.satTime = live.cloud.time;
    if (!g.satSince) g.satSince = performance.now();
  }
  if (live.rain && live.rain.time !== g.rainTime) {
    upload(g.tex.rain, live.rain.data, live.rain.size);
    g.rainTime = live.rain.time;
  }
  const satOn = live.cloud && g.satTime ? Math.min(1, (performance.now() - g.satSince) / 1500) : 0;
  const lv = showCity ? lightValues(at, sun, s.altitude) : null;
  // 星と惑星の点（描くたびに位置を出し直す。数十個なので軽い）
  const starData = starVertices(at, s.altitude, b, air);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.starBuf);
  gl.bufferData(gl.ARRAY_BUFFER, starData, gl.DYNAMIC_DRAW);
  g.starN = starData.length / 8;
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
  gl.uniform1f(g.sky.loc.u_aero, air.aero);
  gl.uniform1f(g.sky.loc.u_glow, air.glow * nightExposureRatio(s.altitude));
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
  // 2 枚目：合成（画面と同じ大きさの絵に。航空障害灯の点滅だけのコマはこの絵を使い回す）
  gl.bindFramebuffer(gl.FRAMEBUFFER, g.frameT.fbo);
  gl.viewport(0, 0, g.frameT.w, g.frameT.h);
  gl.useProgram(g.main.prog);
  bindQuad(g, g.main);
  setCam(g.main, g.frameT.w, g.frameT.h);
  const m = g.main.loc;
  gl.uniform3f(m.u_sunT, T[0], T[1], T[2]);
  gl.uniform3f(m.u_moon, moon[0], moon[1], moon[2]);
  gl.uniform1f(m.u_moonOn, mp.altitude > -0.5 ? 1 : 0);
  gl.uniform1f(m.u_haze, Math.min(2.2, Math.max(0.7, air.aero)));
  gl.uniform1f(m.u_day, smoothstep(-6, 4, s.altitude));
  bindTex(g.main, [["u_sky", g.skyT.tex], ["u_alb", g.tex.alb], ["u_nrm", g.tex.nrm], ["u_geo", g.tex.geo], ["u_win", g.tex.win], ["u_emis", g.tex.emis], ["u_pre", g.preT ? g.preT.tex : g.tex.dsm], ["u_sat", g.tex.sat], ["u_rain", g.tex.rain], ["u_twA", g.tex.twa], ["u_twD", g.tex.twd]]);
  // 衛星の雲・レーダーの雨・雷
  gl.uniform3f(m.u_camLL, CAM_LL.lat * R, CAM_LL.lon * R, Math.cos(CAM_LL.lat * R));
  gl.uniform2f(m.u_cloudH, CLOUD_H[0], CLOUD_H[1]);
  gl.uniform1f(m.u_satOn, satOn);
  if (live.cloud) {
    const b = live.cloud.bounds;
    gl.uniform2f(m.u_satLon, b.lonW * R, 1 / ((b.lonE - b.lonW) * R));
    gl.uniform2f(m.u_satMerc, b.mercN, 1 / (b.mercS - b.mercN));
    gl.uniform1f(m.u_cloudExtra, live.cloud.night ? Math.max(0, w.cloud - live.cloud.fraction) : 0);
    const elapsed = Math.min(1200, Math.max(0, (Date.now() - parseTime(live.cloud.time).getTime()) / 1000));
    const drift = cloudDrift(w, elapsed);
    gl.uniform2f(m.u_drift, drift[0], drift[1]);
  } else {
    gl.uniform1f(m.u_cloudExtra, 0);
    gl.uniform2f(m.u_drift, 0, 0);
  }
  gl.uniform1f(m.u_rainOn, live.rain && live.rain.any ? 1 : 0);
  if (live.rain) {
    const b = live.rain.bounds;
    gl.uniform2f(m.u_rainLon, b.lonW * R, 1 / ((b.lonE - b.lonW) * R));
    gl.uniform2f(m.u_rainMerc, b.mercN, 1 / (b.mercS - b.mercN));
  }
  {
    const drift = live.cloud ? cloudDrift(w, Math.min(1200, Math.max(0, (Date.now() - parseTime(live.cloud.time).getTime()) / 1000))) : ([0, 0] as [number, number]);
    const extra = live.cloud && live.cloud.night ? Math.max(0, w.cloud - live.cloud.fraction) : 0;
    const vis = sunVisibility(satOn >= 0.999 ? live.cloud : null, sun, w.cloud, CLOUD_H, drift, extra);
    gl.uniform1f(m.u_sunVis, vis);
  }
  const fl = flashAt(seconds, still ? null : live.thunder);
  gl.uniform1f(m.u_flash, fl.k);
  gl.uniform2f(m.u_flashDir, fl.dir[0], fl.dir[1]);
  gl.uniform3f(m.u_sunTH, TH[0], TH[1], TH[2]);
  gl.uniform1f(m.u_litH, smoothstep(-4.5, -1, s.altitude));
  gl.uniform1f(m.u_city, showCity ? 1 : 0);
  // 東京タワーの層：画面の中の場所と、見えている面の向き（カメラの側を向く軸）
  {
    const [tx, ty, tw, th] = TOWER.pt;
    gl.uniform4f(m.u_twRect, tx / 393, ty / 275, (tx + tw) / 393, (ty + th) / 275);
    // 塔からカメラへの向きに表が向いている側の軸（その向きの面が見えている）
    const side = (a: readonly number[]) => (a[0] * -TOWER.at[0] + a[1] * -TOWER.at[1] > 0 ? 1 : -1);
    const sx = side(TOWER.ax), sy = side(TOWER.ay);
    gl.uniform3f(m.u_twX, sx * TOWER.ax[0], sx * TOWER.ax[1], sx * TOWER.ax[2]);
    gl.uniform3f(m.u_twY, sy * TOWER.ay[0], sy * TOWER.ay[1], sy * TOWER.ay[2]);
    gl.uniform1f(m.u_twDist, TOWER.dist);
    gl.uniform1f(m.u_twOn, showCity ? 1 : 0);
  }
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
    gl.uniform1f(m.u_towerOn, t.on ? lv.artExp : 0);
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
  // カメラの自動露出：帯に入る空が明るすぎる（逆光の午後）ときは絞る。CSS の空の色（lib/app/sky-vars.ts）と同じ値
  gl.uniform1f(m.u_expAdj, meterCached(s.altitude, s.azimuth, cam, air));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // 3 枚目：画面に写し、航空障害灯を足す（夜の赤は日没から、昼の白い閃光は日の出の少し前から。霧で弱まる）
  g.lightsState =
    showCity && lv && g.lights && g.pts && !lightsOff()
      ? { red: smoothstep(0, -6, s.altitude) * (1 - 0.6 * w.fog), white: smoothstep(-3, 1, s.altitude) * (1 - 0.6 * w.fog), sigma: lv.sigma }
      : null;
  present(g, seconds, still);
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
    let fade = 0;
    const render = (at: Date) => {
      if (!g) return;
      draw(g, camera, at, city, seconds(), reduced());
      last = at;
      // 衛星の雲が読めた直後は 1.5 秒かけて切り替える
      if (g.satSince && performance.now() - g.satSince < 1600) {
        cancelAnimationFrame(fade);
        fade = requestAnimationFrame(() => render(now()));
      }
      // ホームは街がそろってから見せる（それまでは下の CSS の層）
      if (!shown && (!city || g.cityReady)) {
        shown = true;
        canvas.style.opacity = "1";
      }
    };
    /** 雲が流れる・雨や雪・夜の点滅（航空障害灯・タワーの煌めき）・昼の白い閃光があるときだけ、見えている間動かす */
    const animate = () => {
      cancelAnimationFrame(loop);
      const w = currentWeather();
      const at = now();
      const alt = solar(at).altitude;
      const live = currentSky();
      const weatherMoving = (w.cloud > 0.05 && w.cloud < 0.985) || w.precip > 0 || !!live.thunder?.on;
      const nightMoving = city && artificialVisibility(alt) > 0.05;
      const dayStrobe = city && !!g?.pts && alt > -3;
      if ((!weatherMoving && !nightMoving && !dayStrobe) || reduced() || document.visibilityState !== "visible" || !onScreen) return;
      // 点滅だけなら 6 コマ/秒で足りる（電池のため）。昼の閃光だけのときは合成した絵を使い回し、分が変わったら描き直す
      const fps = weatherMoving ? 24 : 6;
      let prev = 0;
      let minute = Math.floor(at.getTime() / 60e3);
      const tick = (t: number) => {
        loop = requestAnimationFrame(tick);
        if (t - prev < 1000 / fps) return;
        prev = t;
        const at2 = now();
        const m = Math.floor(at2.getTime() / 60e3);
        if (weatherMoving || nightMoving || m !== minute || !g) {
          minute = m;
          render(at2);
        } else present(g, seconds(), false);
      };
      loop = requestAnimationFrame(tick);
    };
    /** ピンチで拡大しているときは、その倍率（2 倍まで）で描き直す（引き伸ばしで四角くならない） */
    const vv = typeof visualViewport === "undefined" ? null : visualViewport;
    let zoomTimer = 0;
    const onZoom = () => {
      clearTimeout(zoomTimer);
      zoomTimer = window.setTimeout(() => {
        if (!g || !vv) return;
        const sc = vv.scale > 1.05 ? Math.min(2, vv.scale) : 1;
        const w = Math.round(393 * dpr * sc);
        if (w === canvas.width) return;
        resizeTargets(g, canvas, w, Math.round((393 / camera.aspect) * dpr * sc));
        render(now());
        animate();
      }, 150);
    };
    vv?.addEventListener("resize", onZoom);
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
      cancelAnimationFrame(fade);
      clearTimeout(zoomTimer);
      vv?.removeEventListener("resize", onZoom);
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
