// 周知の埋蔵文化財包蔵地（遺跡）の確認先。都県・市区町村が公開している遺跡地図（物件の場所で開けるものは地点で開く）と、
// 確かめる窓口（市区町村の教育委員会の文化財の担当）を出す。地図のデータそのものは取り込まない（東京都の遺跡地図のように
// 複製を禁じている地図があり、どの地図も「包蔵地の内容を証明するものではない」としているため）。
// 埼玉・千葉・茨城・群馬は県の地図が県内全域（埼玉は川越市を除く）を載せている。東京都は都の地図が全域を載せているが
// 地点で開けないので、地点で開ける区市の地図があればそちらを使う。神奈川・栃木は県の地図が無く、見つかった市町の地図だけ
import type { Municipality, Prefecture } from "./municipalities";
import { arcgisExperience, geocloud, geocloudMp, sonicweb, wagmap } from "./vendors";

type Build = (lat: number, lng: number) => string;

export type IsekiMap = {
  /** 地図の名前（「埼玉県 埋蔵文化財包蔵地マップ」） */
  name: string;
  /** 物件の場所で開く URL（null なら入口のページ。url を使う） */
  build: Build | null;
  url?: string;
  /** 開いたあとに要る操作（利用規約への同意など） */
  tip?: string;
};

/** 地点の確認先。map が無ければ教育委員会で確かめる。note は県の地図に載っていない市などの注意 */
export type Iseki = { city: string; office: string; map?: { name: string; url: string; at: boolean; tip?: string }; note?: string };

/** 初めて開くと利用規約のページが出て、同意すると物件の場所の地図に進む地図 */
const AGREE = "利用規約に同意すると開きます";

// 実機（自動ブラウザ）で「物件の地点が中心に開き、包蔵地の範囲が出る」ことを確かめた地図（2026年10月）

const PREF_MAPS: Partial<Record<Prefecture, IsekiMap>> = {
  埼玉県: {
    name: "埼玉県 埋蔵文化財包蔵地マップ",
    build: arcgisExperience("6920299bacac4156a4b4240b2e420691", "widget_34", 2500),
    tip: "利用条件に同意すると開きます",
  },
  千葉県: {
    name: "ちば情報マップ（埋蔵文化財包蔵地）",
    build: wagmap("pref-chiba", 30, { host: "https://map.pref.chiba.lg.jp", scale: 2500 }),
    tip: "利用許諾に同意すると開きます",
  },
  茨城県: { name: "いばらきデジタルまっぷ（茨城県遺跡地図）", build: wagmap("ibaraki", 34, { scale: 2500 }) },
  群馬県: { name: "マッピングぐんま（遺跡）", build: wagmap("pref-gunma", 1601, { scale: 2500 }) },
  東京都: {
    name: "東京都遺跡地図",
    build: null,
    url: "https://tokyo-iseki.metro.tokyo.lg.jp/",
    tip: "利用条件に同意してから、町丁名などで探します",
  },
};

/** 区市の遺跡地図（「東京都世田谷区」のように都県名＋市区町村名で引く）。県の地図より優先する */
const CITY_MAPS: Record<string, IsekiMap> = {
  東京都世田谷区: { name: "せたがやiMap（埋蔵文化財包蔵地）", build: sonicweb("setagaya", "th_58", 2500), tip: AGREE },
  東京都新宿区: { name: "新宿区みんなのGIS（埋蔵文化財情報）", build: sonicweb("shinjuku2", "th_1150", 2500) },
  東京都墨田区: { name: "すみだまちづくりマップ（埋蔵文化財包蔵地情報）", build: sonicweb("sumida", "th_20", 2500) },
  東京都杉並区: { name: "すぎナビ（埋蔵文化財包蔵地）", build: geocloudMp("suginami.geocloud.jp", 600) },
  東京都小平市: { name: "こだいら地図情報システム（文化財・遺跡）", build: sonicweb("kodaira", "th_19", 2500) },
  東京都国分寺市: { name: "わがまちマップ国分寺（史跡・埋蔵文化財包蔵地）", build: wagmap("kokubunji", 9, { scale: 2500 }) },
  東京都狛江市: { name: "狛江市地図情報サービス（埋蔵文化財包蔵地マップ）", build: wagmap("komaecity", 90, { scale: 2500 }), tip: AGREE },
  東京都清瀬市: { name: "きよせデジマップ（清瀬市遺跡）", build: sonicweb("kiyose", "th_24", 2500) },
  東京都多摩市: { name: "多摩市地理情報システム（埋蔵文化財包蔵地）", build: sonicweb("tama", "th_15", 2500), tip: AGREE },
  // 「その他の土地規制」の地図の、遺跡・地形図・注記だけを出す（景観の区域の色で遺跡が隠れないように）。遺跡は z16 まで描かれる
  東京都町田市: {
    name: "地図情報まちだ（その他の土地規制・遺跡）",
    build: geocloud("https://machida.kukanjoho.jp/webgis/", "mp=53&vlf=53-36-000160", 16),
    tip: AGREE,
  },
  神奈川県横浜市: { name: "文化財ハマSite（横浜市行政地図情報提供システム）", build: wagmap("yokohama", 9, { host: "https://wwwm.city.yokohama.lg.jp", scale: 2500 }) },
  // 相模原市の地図は z15 まで（約1/16,000）
  神奈川県相模原市: { name: "さがみはら地図情報（埋蔵文化財包蔵地）", build: geocloud("https://sagamihara.geocloud.jp/webgis/", "mp=13", 15) },
  神奈川県鎌倉市: { name: "かまくらわが街マップ（遺跡地図）", build: wagmap("kamakura-hazard", 246, { scale: 2500 }) },
  神奈川県秦野市: { name: "はだのWEBマップ（埋蔵文化財包蔵地）", build: wagmap("hadano", 8, { scale: 2500 }) },
  神奈川県三浦市: { name: "みうらわが街ガイド（文化財情報）", build: wagmap("miura", 3, { scale: 2500 }), tip: AGREE },
  神奈川県南足柄市: { name: "南足柄市地理情報システム（文化財）", build: wagmap("minamiashigara", 13, { scale: 2500 }), tip: AGREE },
  神奈川県箱根町: { name: "はこねMAP（文化財地図）", build: sonicweb("hakone", "th_29", 2500) },
  神奈川県湯河原町: { name: "湯河原町地理情報システム（埋蔵文化包蔵地）", build: wagmap("yugawara", 29, { scale: 2500 }) },
  栃木県足利市: { name: "足利市遺跡地図（埋蔵文化財包蔵地情報）", build: sonicweb("ashikaga", "th_30", 2500) },
  栃木県小山市: { name: "おやまわが街ガイドマップ（埋蔵文化財情報）", build: wagmap("oyamacity", 5, { scale: 2500 }) },
  栃木県大田原市: { name: "おおたわらデジタルマップ（文化財情報）", build: wagmap("ohtawaracity", 6, { scale: 2500 }) },
  栃木県日光市: { name: "日光市わが街ガイド（日光市遺跡等地図）", build: wagmap("nikko", 103, { scale: 2500 }), tip: AGREE },
  栃木県下野市: { name: "しもつけシティーガイド（史跡・遺跡・古墳）", build: sonicweb("shimotsuke", "th_36", 2500) },
};

/** 県の地図に載っていない市（県の地図を出さない） */
const NOT_IN_PREF_MAP: Record<string, string> = {
  埼玉県川越市: "川越市の包蔵地は埼玉県の地図に載っていません",
};

/** 区市ごとに書いた確認先（「東京都世田谷区」。テストで市区町村の一覧と突き合わせる） */
export const ISEKI_CITIES = [...Object.keys(CITY_MAPS), ...Object.keys(NOT_IN_PREF_MAP)];

/** 物件の市区町村・地点の、埋蔵文化財の確認先 */
export function isekiFor(m: Pick<Municipality, "pref" | "name">, lat: number, lng: number): Iseki {
  const key = `${m.pref}${m.name}`;
  const city = m.name;
  const office = `${city}の教育委員会（文化財の担当）`;
  const note = NOT_IN_PREF_MAP[key];
  const map = CITY_MAPS[key] ?? (note ? undefined : PREF_MAPS[m.pref]);
  if (!map) return { city, office, note };
  const url = map.build ? map.build(lat, lng) : map.url!;
  return { city, office, map: { name: map.name, url, at: !!map.build, tip: map.tip }, note };
}

// ---- 画面・共有・下書きの文字 ----

/** 画面の短い補足（「利用条件に同意すると開きます。包蔵地（遺跡）に入るかは行田市の教育委員会で確認」）。地図の名前はリンクの説明に */
export function isekiNote(i: Iseki): string {
  const before = i.map ? i.map.tip : i.note;
  return `${before ? `${before}。` : ""}包蔵地（遺跡）に入るかは${i.city}の教育委員会で確認`;
}

/** 共有・印刷の1行（「埼玉県 埋蔵文化財包蔵地マップで確認（物件の場所で開く）」） */
export function isekiLine(i: Iseki): string {
  return i.map ? `${i.map.name}で確認${i.map.at ? "（物件の場所で開く）" : ""}` : `${i.office}で確認`;
}
