// 上下水道の確認先。市町村が公開している下水道台帳・水道台帳の地図を、物件の場所で開く（重説の「飲用水・電気・ガスの
// 供給施設及び排水施設」の欄の下調べ）。前面道路の本管・口径・引込みの有無は地図だけでは分からないことがあり、
// 市町村の上下水道の担当（水道局・下水道課）で確かめる旨を添える。地図のデータは取り込まない
import type { Municipality } from "./municipalities";
import { geocloud, geocloudMp, sonicweb, wagmap } from "./vendors";

type Build = (lat: number, lng: number) => string;

export type SuidoKind = "下水道" | "上水道";

type SuidoMap = { kind: SuidoKind; label: string; build: Build };

const sewer = (label: string, build: Build): SuidoMap => ({ kind: "下水道", label, build });
const water = (label: string, build: Build): SuidoMap => ({ kind: "上水道", label, build });
const w = (slug: string, mid: number) => wagmap(slug, mid, { scale: 1000 });
const s = (slug: string, theme: string) => sonicweb(slug, theme, 1000);

// 地図サービスの一覧（wagmap の Portal・sonicweb の map.js・geocloud の地図の一覧）から探し、市役所の地点で開いて台帳の管が出ることを確かめた地図（2026年10月）
const MAPS: Record<string, SuidoMap[]> = {
  埼玉県上尾市: [sewer("下水道台帳図", w("ageocity", 12))],
  埼玉県朝霞市: [sewer("下水道台帳図", w("asaka", 15)), water("水道管網図", w("asaka", 14))],
  埼玉県本庄市: [sewer("下水道台帳", w("honjo", 7)), water("水道台帳図", w("honjo", 17))],
  埼玉県入間市: [sewer("下水道台帳マップ", w("iruma", 5)), water("水道台帳マップ", w("iruma", 6))],
  埼玉県川越市: [sewer("下水道台帳マップ", w("kawagoe", 303))],
  埼玉県加須市: [sewer("下水道台帳図", w("kazo", 55)), water("水道配管図", w("kazo", 53))],
  埼玉県熊谷市: [sewer("下水道台帳", w("kumagaya", 150))],
  埼玉県深谷市: [sewer("下水道台帳", geocloud("https://fukaya.geocloud.jp/webgis/", "mp=39"))],
  埼玉県白岡市: [
    sewer("公共下水道台帳", geocloud("https://shiraoka.geocloud.jp/webgis/", "mp=21")),
    water("上水道台帳", geocloud("https://shiraoka.geocloud.jp/webgis/", "mp=20")),
  ],
  埼玉県蓮田市: [sewer("下水道台帳図", s("hasuda", "th_33")), water("水道台帳図", s("hasuda", "th_38"))],
  埼玉県鴻巣市: [sewer("下水道台帳", s("konosu", "th_36")), water("水道台帳", s("konosu", "th_32"))],
  埼玉県三郷市: [sewer("下水道台帳", s("misato", "th_7"))],
  埼玉県さいたま市: [sewer("下水道台帳", s("saitama", "th_90"))],
  埼玉県狭山市: [sewer("下水道台帳（汚水）", s("sayama", "th_7")), water("上水道配給水管図", s("sayama", "th_8"))],
  千葉県木更津市: [sewer("下水道情報", w("kisarazu", 6))],
  千葉県茂原市: [sewer("下水道管網図", w("mobara", 18))],
  千葉県柏市: [sewer("下水道台帳図", s("kashiwa", "th_11")), water("上水道台帳図", s("kashiwa", "th_36"))],
  千葉県我孫子市: [sewer("公共下水道台帳（汚水）", geocloudMp("abiko.geocloud.jp", 30))],
  千葉県浦安市: [sewer("下水道台帳図（汚水）", s("urayasu", "th_92"))],
  茨城県水戸市: [sewer("公共下水道台帳図", w("ibaraki", 93)), water("上水道台帳図", w("ibaraki", 141))],
  茨城県土浦市: [sewer("下水道台帳図", w("ibaraki", 96))],
  茨城県五霞町: [sewer("下水道台帳図", w("ibaraki", 109))],
  東京都国立市: [sewer("下水道台帳", geocloud("https://kunitachi.geocloud.jp/webgis/", "mp=9"))],
  東京都国分寺市: [sewer("下水道施設平面図", w("kokubunji", 12))],
  東京都三鷹市: [sewer("下水道台帳図", w("mitakacity", 2000))],
  東京都狛江市: [sewer("下水道台帳マップ", w("komaecity", 132))],
  東京都青梅市: [sewer("下水道情報", w("omecity", 47))],
  東京都小平市: [sewer("公共下水道台帳施設平面図", s("kodaira", "th_26"))],
  東京都多摩市: [sewer("下水道台帳（汚水）", s("tama", "th_21"))],
  東京都町田市: [sewer("下水道台帳図", geocloud("https://machida.kukanjoho.jp/webgis/", "mp=45"))],
  神奈川県川崎市: [sewer("公共下水道台帳施設平面図", geocloud("https://kawasaki.geocloud.jp/webgis/", "mp=36"))],
  神奈川県相模原市: [sewer("下水道施設台帳平面図", geocloud("https://sagamihara.geocloud.jp/webgis/", "mp=5"))],
  神奈川県厚木市: [sewer("下水道情報", w("atsugi", 5))],
  神奈川県秦野市: [sewer("公共下水道台帳（汚水）参考図", w("hadano", 14))],
  神奈川県鎌倉市: [sewer("公共下水道情報", w("kamakura-hazard", 242))],
  神奈川県小田原市: [sewer("公共下水道台帳（汚水）参考図", w("navi-odawara", 90))],
  神奈川県横須賀市: [sewer("上下水道管路", w("yokosuka", 52))],
  神奈川県南足柄市: [sewer("下水道台帳図", w("minamiashigara", 29))],
  神奈川県海老名市: [sewer("下水道施設マップ", w("ebina", 3))],
  神奈川県伊勢原市: [sewer("公共下水道台帳施設平面図", w("isehara", 11))],
  神奈川県葉山町: [sewer("下水道台帳マップ", w("hayama", 4))],
  栃木県足利市: [sewer("下水道台帳図", s("ashikaga", "th_61"))],
  栃木県佐野市: [sewer("下水道マップ", s("sano", "th_18"))],
  栃木県日光市: [water("水道管網図", w("nikko", 105))],
  栃木県下野市: [sewer("公共下水道", s("shimotsuke", "th_42")), water("上水道", s("shimotsuke", "th_44"))],
};

/** 台帳の地図を書いた市区町村（テストで市区町村の一覧と突き合わせる） */
export const SUIDO_CITIES = Object.keys(MAPS);

export type SuidoLink = { kind: SuidoKind; name: string; url: string };

/** 物件の市区町村・地点の、上下水道の台帳の地図（無ければ空） */
export function suidoFor(m: Pick<Municipality, "pref" | "name">, lat: number, lng: number): SuidoLink[] {
  return (MAPS[`${m.pref}${m.name}`] ?? []).map((x) => ({ kind: x.kind, name: `${m.name}の${x.label}`, url: x.build(lat, lng) }));
}
