// 市町村が公開している地番図・地番参考図。物件の場所で開き、地番の目安を市町村の図でも見られるようにする（登記所の地図データに
// 筆が無い所・公図から推定した筆の確かめにも使う）。登記の地番・筆の形と違うことがある参考図なので、謄本・公図で確かめる旨を添える。
// 地図のデータは取り込まない
import type { Municipality } from "./municipalities";
import { geocloud, sonicweb, wagmap } from "./vendors";

type Build = (lat: number, lng: number) => string;

const w = (slug: string, mid: number) => wagmap(slug, mid, { scale: 1000 });
const s = (slug: string, theme: string) => sonicweb(slug, theme, 1000);

// 地図サービスの一覧（wagmap の Portal・sonicweb の map.js・geocloud の地図の一覧）から「地番」の地図を探し、市役所から離れた地点で
// 開いて、その地点が中心に来て筆の線と地番が出ることを確かめた地図（2026年10月）
const MAPS: Record<string, { label: string; build: Build }> = {
  埼玉県熊谷市: { label: "地番情報", build: w("kumagaya", 260) },
  埼玉県本庄市: { label: "参考地番図", build: w("honjo", 9) },
  埼玉県加須市: { label: "地番図（参考）", build: w("kazo", 30) },
  埼玉県鴻巣市: { label: "地番参考図", build: s("konosu", "th_15") },
  埼玉県三郷市: { label: "参考地番図", build: s("misato", "th_3") },
  埼玉県上里町: { label: "参考地番図", build: s("kamisato", "th_2") },
  千葉県印西市: { label: "地番参考図", build: w("inzai", 25) },
  千葉県南房総市: { label: "地番図", build: w("minamiboso", 5) },
  栃木県大田原市: { label: "地番参考図", build: w("ohtawaracity", 22) },
  栃木県塩谷町: { label: "地番参考図", build: s("shioya", "th_2") },
  群馬県高崎市: { label: "地番図", build: s("takasaki2", "th_66") },
  神奈川県相模原市: { label: "地番参考図", build: geocloud("https://sagamihara.geocloud.jp/webgis/", "mp=101") },
  神奈川県箱根町: { label: "地番図", build: s("hakone", "th_33") },
};

/** 地番図を書いた市町村（「埼玉県熊谷市」。テストで市区町村の一覧と突き合わせる） */
export const CHIBANZU_CITIES = Object.keys(MAPS);

export type ChibanzuLink = { name: string; url: string };

/** 物件の場所で開く市町村の地番図（公開していない・見つかっていない市町村は undefined） */
export function chibanzuFor(m: Pick<Municipality, "pref" | "name">, lat: number, lng: number): ChibanzuLink | undefined {
  const map = MAPS[`${m.pref}${m.name}`];
  return map && { name: `${m.name}の${map.label}`, url: map.build(lat, lng) };
}

/** 地番図の注意（画面・共有の文面・下書き） */
export const CHIBANZU_NOTE = "市町村が公開している地番の参考図。登記の地番・筆の形と違うことがあるので、謄本・公図で確認";
