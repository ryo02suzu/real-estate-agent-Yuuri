// 市町村が公開している地番図・地番参考図。物件の場所で開き、地番の目安を市町村の図でも見られるようにする（登記所の地図データに
// 筆が無い所・公図から推定した筆の確かめにも使う）。登記の地番・筆の形と違うことがある参考図なので、謄本・公図で確かめる旨を添える。
// 地図のデータは取り込まない（市のページ・地図を開くだけ）
import type { Municipality } from "./municipalities";
import { arcgisExperience, geocloud, sonicweb, takamatsuSmartMap, wagmap } from "./vendors";

type Build = (lat: number, lng: number) => string;

type Entry =
  /** 物件の場所で開く地図。unverified：海外の回線から開けないなどで、その場所で開くことを確かめていない地図 */
  | { label: string; build: Build; unverified?: true; tip?: string }
  /** 物件の場所を URL で渡せない（渡し方を確かめられない）地図・市のページ。入口を開き、そこからの手順を tip に書く */
  | { label: string; url: string; tip: string };

const w = (slug: string, mid: number) => wagmap(slug, mid, { scale: 1000 });
const s = (slug: string, theme: string, layers?: string) => sonicweb(slug, theme, 1000, layers);

const MAPS: Record<string, Entry> = {
  // 地図サービスの一覧（wagmap の Portal・sonicweb の map.js・geocloud の地図の一覧）から「地番」の地図を探し、市役所から離れた地点で
  // 開いて、その地点が中心に来て筆の線と地番が出ることを確かめた地図（2026年10月）
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

  // 地番図をオープンデータで出さず、見るだけで公開している市（2026-11-21。ほかの作業者の調べを、市のページで確かめ直した）。
  // 地図の名前・レイヤの番号は、市のページのリンクか、地図のサイトのページの題名で確かめた。開いたあとの手順と、市の利用条件の
  // 主な決まり（営利目的の利用を禁じるなど）を tip に書く（同意は利用者が自分でする。MICHILU は同意の先を開かない）。
  // 入れていない：横浜市（地籍図の PDF「ちせぴょん」は金沢区釜利谷東の一部の2地区だけ）、窓口で見るだけの市（大阪市・岡崎市・
  // 一宮市・松山市・鹿児島市）
  // 市「地番参考図・路線価図の窓口交付を終了いたします」「郡山市地理情報システムの利用について」（地番参考図マップ）。th_18 は地図のページの題名
  福島県郡山市: {
    label: "地番参考図",
    build: s("koriyama2", "th_18"),
    unverified: true,
    tip: "郡山市地理情報システムの地番参考図です。使う前に、市のページ「郡山市地理情報システムの利用について」の利用条件を読んでください（地理情報を不動産取引の資料とすることや、営利目的で利用することはできない、とされています）。",
  },
  // 市「地籍図（公図）の交付を廃止しました」（令和8年4月から、かわぐち案内マップで地番参考図を公開）
  埼玉県川口市: {
    label: "地番参考図",
    url: "https://kawaguchi.geocloud.jp/webgis/?p=1",
    tip: "かわぐち案内マップの入口が開きます。地番参考図を選んで、物件のあたりを探します（市は地籍図（公図）の交付を令和8年3月で終え、地番参考図をこの地図で公開しています）。",
  },
  // 市「固定資産の評価を行うために作成した地図の画像データを公開しています」（窓口での閲覧は令和8年6月30日で廃止）
  千葉県千葉市: {
    label: "土地調査図・公図副本",
    url: "https://www.city.chiba.jp/zaiseikyoku/zeimu/kazeikanri/koteishisan_zumen.html",
    tip: "市のページが開きます。土地調査図は、区ごとの索引図で物件の区画を探してから「図面データ」（画像）を開きます。公図副本は町名から開きます。どちらも固定資産の評価のための参考図で、市はこの図の問い合わせ・印刷・交付を受け付けていません。",
  },
  // 市「はちおうじマップ」の問い合わせ先の一覧（地番現況図マップ。資産税課）。地図は ArcGIS の「地番現況図マップ」（地図の部品は
  // widget_124）。2か所で、その地点が中心に開き、地番現況図のレイヤが縮尺の範囲（1/1,000〜1/10,000）で出ることを確かめた（利用規約の
  // 同意の画面の後ろ。同意はしていない）
  東京都八王子市: {
    label: "地番現況図",
    build: arcgisExperience("61d5eb7d071644cc85c944d737dcdcdf", "widget_124", 2000),
    tip: "はちおうじマップの地番現況図マップです。最初に利用規約が出るので、読んで自分で同意してください（規約は、営業活動・営利を目的とする行為への利用を、してはならない行為に挙げています）。",
  },
  // 市「公開型GIS「こうふMAP」にて地番参考図を公開しました」（令和8年1月1日時点）。地図の番号は年ごとに変わるので入口を開く
  山梨県甲府市: {
    label: "地番参考図",
    url: "https://kofu.geocloud.jp/webgis/?p=1",
    tip: "こうふMAPの入口が開きます。地番参考図を選んで、物件のあたりを探します（市「公開型GIS「こうふMAP」にて地番参考図を公開しました」）。",
  },
  // 市「固定資産（土地）地番参考図の閲覧」→ 市「マップなび すいた」のページの入口
  大阪府吹田市: {
    label: "地番参考図",
    url: "https://webgis.alandis.jp/suita27/portal/main/",
    tip: "マップなび すいたの入口が開きます。地番参考図を選び、利用条件を読んでから、物件のあたりを探します（市「固定資産（土地）地番参考図の閲覧」）。",
  },
  // 市「地番図の閲覧」のリンク（agreement?theme=th_17&layers=th_17%2Cblank）と同じテーマ・レイヤ
  大阪府八尾市: {
    label: "地番図",
    build: s("yao", "th_17", "th_17%2Cblank"),
    unverified: true,
    tip: "やおデジマップの公開用地番図です。利用の同意の画面が出たら、読んで自分で同意してください（市「地番図の閲覧」）。",
  },
  // 市「「土地参考図」をインターネット公開開始」（令和8年1月1日時点）。地図の番号は確かめられなかったので入口を開く
  大阪府枚方市: {
    label: "土地参考図",
    url: "https://www2.wagmap.jp/hirakata/Portal",
    tip: "きてみてひらかたマップの入口が開きます。土地参考図を選んで、物件のあたりを探します（市「「土地参考図」をインターネット公開開始」）。",
  },
  // 市「令和8年度東大阪市地籍図」（利用条件に同意すると、分冊の PDF の一覧へ進むページ）
  大阪府東大阪市: {
    label: "地籍図",
    url: "https://www.city.higashiosaka.lg.jp/0000028446.html",
    tip: "市のページで利用条件を読み、自分で同意すると、分冊の PDF の一覧に進みます。索引図で物件の分冊を探します。利用条件は、得られた情報を営利目的で利用すること・写しを第三者に渡すことを禁じています。",
  },
  // 市「神戸市固定資産（土地）地番参考図」（神戸市情報マップの「くらし・すまい」）。mid=105 は地図のページ（地番参考図の利用規約）で確かめた
  兵庫県神戸市: {
    label: "地番参考図",
    build: w("kobecity", 105),
    unverified: true,
    tip: "神戸市情報マップの「神戸市固定資産（土地）地番参考図」です。利用規約が出たら、読んで自分で同意してください（市「神戸市固定資産（土地）地番参考図」）。",
  },
  // 市「地番参考図閲覧について」（資産税課。地図情報あまがさきへ移転）
  兵庫県尼崎市: {
    label: "地番参考図",
    url: "https://amagasaki.geocloud.jp/webgis/?p=1",
    tip: "地図情報あまがさきの入口が開きます。地番参考図を選んで、物件のあたりを探します（市「地番参考図閲覧について」）。",
  },
  // 市「固定資産税・都市計画税Q＆A」Q203（あかし地図情報システムで地籍地番図を見られる）
  兵庫県明石市: {
    label: "地籍地番図",
    url: "https://webgis.alandis.jp/akashi-cp28/portal/",
    tip: "あかし地図情報の入口が開きます。地籍地番図を選んで、物件のあたりを探します（市「固定資産税・都市計画税Q＆A」）。",
  },
  // 市「「地番現況図」がご自宅から高松市スマートマップで閲覧できます」。2か所で、その地点が中心に開き、地番現況図が出ることを確かめた
  香川県高松市: { label: "地番現況図", build: takamatsuSmartMap("cGz"), tip: "高松市スマートマップの地番現況図です。" },
  // 市「長崎市地図情報サービスサイト（ながさきマップ）」（地番参考図情報）。th_5 は地図のページの題名
  長崎県長崎市: {
    label: "地番参考図",
    build: s("nagasakicity", "th_5"),
    unverified: true,
    tip: "ながさきマップの地番参考図です。利用条件が出たら、読んで自分で同意してください。",
  },
};

/** 地番図を書いた市町村（「埼玉県熊谷市」。テストで市区町村の一覧と突き合わせる） */
export const CHIBANZU_CITIES = Object.keys(MAPS);

/**
 * 開き方。place：物件の場所で開く（開いて確かめた）・aim：物件の場所を指定して開く（その場所で開くことは確かめていない）・
 * entry：市のページか地図の入口が開く（そこから物件のあたりを探す）
 */
export type ChibanzuOpens = "place" | "aim" | "entry";

export type ChibanzuLink = {
  name: string;
  url: string;
  opens: ChibanzuOpens;
  /** 開いたあとの手順と、市の利用条件の主な決まり */
  tip?: string;
};

/** 物件の場所で開く市町村の地番図（公開していない・見つかっていない市町村は undefined） */
export function chibanzuFor(m: Pick<Municipality, "pref" | "name">, lat: number, lng: number): ChibanzuLink | undefined {
  const map = MAPS[`${m.pref}${m.name}`];
  if (!map) return undefined;
  const name = `${m.name}の${map.label}`;
  if ("url" in map) return { name, url: map.url, opens: "entry", tip: map.tip };
  return { name, url: map.build(lat, lng), opens: map.unverified ? "aim" : "place", ...(map.tip ? { tip: map.tip } : {}) };
}

/** 地番図の注意（画面・共有の文面・下書き） */
export const CHIBANZU_NOTE = "市町村が公開している地番の参考図。登記の地番・筆の形と違うことがあるので、謄本・公図で確認";
