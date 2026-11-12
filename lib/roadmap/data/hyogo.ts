// 兵庫県（2026-11 調査）。出典は docs/hyogo-research.md。
// 特定行政庁は兵庫県と12市（神戸・尼崎・姫路・西宮・伊丹・明石・加古川・宝塚・川西・三田・芦屋・高砂。県「兵庫県指定道路情報（GIS）の公開に
// ついて」）。残りの29市町は県が扱い、県民局・県民センターの土木事務所のまちづくり建築課（姫路は第1課・第2課）が受け持つ。
// 県は29市町の道路種別を「兵庫県指定道路情報（GIS）」（ArcGIS。2024年4月1日から公開）で出している。開くと利用条件の画面が出て、
// 同意の先なので、凡例（載る種別）と物件の位置で開くかは MICHILU では確かめていない（県の説明は「建築基準法第42条に規定する道路種別の概要」）。
// 都市計画区域が無いのは市川町・神河町（国の令和7年都市計画現況調査の都市別一覧に無い。県「39市町における都市計画区域」）。準都市計画区域も県内に無い。
// 神戸市は区のコード（28101・28102・28105〜28111）をまとめて1つ。ここに無い市（神戸市のほかの特定行政庁の11市）は調べている途中で、
// data/kinki.ts の調査中の一覧に残す。県が扱う市町が出している地図（市町道の地図など）と市町の窓口も調べている途中。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { arcgisExperience, wagmap } from "../vendors";

const pref = "兵庫県" as const;

/** 姫路・加東の窓口の時間（県の各事務所のお知らせ） */
const CLOSED_WED_FRI = "9:00〜12:00・13:00〜17:00（水・金の午後は窓口を閉める）";

/**
 * 土木事務所のまちづくり建築課。電話は県「兵庫県指定道路情報（GIS）の公開について」の「所管土木事務所担当課」（姫路の第1課・第2課の
 * 受け持ちは県「建築確認等の電子申請」の提出窓口の表）。FAX・メールは各事務所のページ
 */
const OFFICE = {
  takarazuka: { dept: "兵庫県 阪神北県民局 宝塚土木事務所 まちづくり建築課", phone: "0797-61-4016", fax: "0797-86-6571", email: "Takarazuka_Machidukuri@pref.hyogo.lg.jp" },
  kakogawa: {
    dept: "兵庫県 東播磨県民局 加古川土木事務所 まちづくり建築課",
    phone: "079-421-9226",
    fax: "079-421-1213",
    email: "kakogawadoboku@pref.hyogo.lg.jp",
    note: "来庁は日時を事前に予約する（Web の来庁予約システムがある。事務所「来庁予約について」）。",
  },
  kato: {
    dept: "兵庫県 北播磨県民局 加東土木事務所 まちづくり建築課",
    phone: "0795-42-9406",
    fax: "0795-42-6422",
    email: "katodoboku@pref.hyogo.lg.jp",
    hours: CLOSED_WED_FRI,
    note: "来庁しての相談は Web 予約制で、希望の時間の1時間以上前までに予約する（2025年9月1日から。事務所のお知らせ）。",
  },
  himeji1: {
    dept: "兵庫県 中播磨県民センター 姫路土木事務所 まちづくり建築第1課",
    phone: "079-281-9653",
    fax: "079-281-9910",
    email: "himejidoboku@pref.hyogo.lg.jp",
    hours: CLOSED_WED_FRI,
    note: "担当者が現場検査などで居ないことがあるので、来庁は事前に予約する（事務所のお知らせ）。",
  },
  himeji2: {
    dept: "兵庫県 中播磨県民センター 姫路土木事務所 まちづくり建築第2課",
    phone: "079-281-9567",
    fax: "079-281-9910",
    email: "himejidoboku@pref.hyogo.lg.jp",
    hours: CLOSED_WED_FRI,
    note: "担当者が現場検査などで居ないことがあるので、来庁は事前に予約する（事務所のお知らせ）。",
  },
  toyooka: { dept: "兵庫県 但馬県民局 豊岡土木事務所 まちづくり建築課", phone: "0796-26-3756", fax: "0796-24-5593", email: "toyookadoboku@pref.hyogo.lg.jp" },
  tanba: { dept: "兵庫県 丹波県民局 丹波土木事務所 まちづくり建築課", phone: "0795-73-3862", fax: "0795-72-4596", email: "tanbadoboku@pref.hyogo.lg.jp" },
  sumoto: { dept: "兵庫県 淡路県民局 洲本土木事務所 まちづくり建築課", phone: "0799-26-3213", fax: "0799-24-4513", email: "sumotodoboku@pref.hyogo.lg.jp" },
} satisfies Record<string, Contact>;
type Office = keyof typeof OFFICE;

const SHORT = (o: Office) => OFFICE[o].dept.replace(/^兵庫県 \S+ /, "");

/** 県の決まり（県「兵庫県指定道路情報（GIS）の公開について」） */
const PREF_NOTE =
  "道路の情報についての質問は、受け持ちの土木事務所の担当課へ（県「兵庫県指定道路情報（GIS）の公開について」）。県の地図の情報は最新でないことや現況と違うことがあるので、現地を調べたうえで、必要なら土木事務所の窓口と道路の管理者に確かめる。";

const desk = (office: Office): Contact => {
  const o: Contact = OFFICE[office];
  return { ...o, note: `${PREF_NOTE}${o.note ?? ""}` };
};

/** 県の指定道路情報（GIS）。利用条件への同意の先なので、物件の位置で開くかは確かめていない */
const PREF_MAP: MapLink = {
  kind: "road_type",
  label: "兵庫県指定道路情報（GIS）（神戸市など12市を除く県内の道路種別。2026年6月末日現在）",
  build: arcgisExperience("f61fa10b4382421e981fabad05305c83", "widget_7"),
  verified: false,
  tip: "開くと利用条件の画面が出るので、読んで自分で同意すると地図になる。県が扱う区域（特定行政庁の12市を除く）の建築基準法42条の道路種別の概要を示す参考図で、公に証明する資料には使えない。線は道路の中心線・幅員・境界・始終端を示さず、敷地が接道しているかは判断できない。種別が混ざる所は路線単位で種別を書いていることがあるので、現地の幅員を確かめる。最新でないことがあるので、必要なら土木事務所の窓口と道路の管理者に確かめる（県のページ）。利用条件は営利目的での利用と無断の複製・転載を禁じている。",
};

/** 県が扱う市町（都市計画区域あり） */
const prefTown = (name: string, code: string, office: Office, extra = ""): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "full",
  maps: [PREF_MAP],
  contact: desk(office),
  note: `県が扱う市町（建築確認と道路の判定は${SHORT(office)}。県の所管土木事務所の表）。県の指定道路情報（GIS）で道路種別を見られる（利用条件への同意が要る。載る種別の凡例は同意の先なので MICHILU では確かめていない）。${name}が出している地図（市町道の地図など）は調べている途中。${extra}`,
});

/** 都市計画区域の無い町（国の令和7年都市計画現況調査の都市別一覧に無い。準都市計画区域も県内に無い） */
const outsideTown = (name: string, code: string, office: Office): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: desk(office),
  note: `全域が都市計画区域外（国の令和7年都市計画現況調査の都市別一覧・令和7年3月31日現在に無い。準都市計画区域も県内に無い）。建築確認などは${SHORT(office)}へ。`,
});

export const HYOGO: Municipality[] = [
  // --- 特定行政庁（政令市） ---------------------------------------------------------
  {
    pref,
    name: "神戸市",
    codes: ["28101", "28102", "28105", "28106", "28107", "28108", "28109", "28110", "28111"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "建築基準法指定道路情報（神戸市情報マップ）",
        build: wagmap("kobecity", 35),
        verified: false,
        tip: "最初に利用許諾の画面が出るので、読んで自分で「同意する」を押すと、物件の位置の地図に進む。路線を押すと種別と指定番号などが出る。色で1項1号〜5号・2項・3項（水平距離指定）と「建築基準法の道路でない」道が分かれ、色の無い道は未判定で種別は分からない（建築安全課の4番窓口で判定を頼める）。自動車専用道路など接道の対象にならない道路は表示しない。注意マークの付いた路線は窓口で確かめる（電話では答えない。市「道路の調べ方（インターネット）」）。",
      },
      {
        kind: "designated_only",
        label: "指定図の閲覧（位置指定道路の一部と水平距離指定道路の指定図の PDF）",
        build: null,
        url: "https://www.city.kobe.lg.jp/a81042/business/todokede/jutakutoshikyoku/building/procedure/road/shiteidourozu.html",
        verified: true,
        tip: "場所ではなく指定番号ごとの図。先に情報マップで路線を押して指定番号を調べる。ネットに無い指定図は建築安全課の4番窓口で指定番号を伝えて見る（写真を撮れる。写しは公文書公開請求で、通常1〜2週間ほど・手数料が要る）。",
      },
      {
        kind: "public_road",
        label: "道路台帳平面図（神戸市情報マップ。公道の名前・おおよその幅員と区域）",
        build: wagmap("kobecity", 97),
        verified: false,
        tip: "最初に利用許諾の画面が出るので、読んで自分で「同意する」を押す。公道（道路法の道路）か私道か、公道の名前とおおよその幅員を見られる。幅員の記載が無い所は 1/1000 で印刷して図の上で測る（図の1mmが現地の1m）。建築基準法の道路種別は載っていない。道路法の道路でなくても市が管理していることがある（市「公道か私道か調べる」）。",
      },
    ],
    contact: {
      dept: "建築住宅局 建築指導部 建築安全課 整備係（4番窓口。三宮国際ビル5階）",
      phone: "078-595-6553",
      fax: "078-595-6663",
      email: "kenchikuanzen_douro@city.kobe.lg.jp",
      hours: "9:00〜12:00・13:00〜16:00（窓口と電話相談。2026年11月2日から。窓口の端末の閲覧は 9:00〜17:00）",
      note: "窓口の端末で情報マップと同じ道路種別の情報を見られる（印刷は無い）。情報マップで注意マークの付いた路線の情報は窓口で確かめる（電話では答えない）。現地に道の形があるのに情報マップに路線の表記が無い道（未判定路線）は、4番窓口に道路調査依頼書を出すと判定して結果を知らせる（結果は通常1〜2週間ほどで情報マップに入る）。公道の名前・幅員・区域は建設局 道路管理課 台帳担当（078-322-6397。市役所4号館7階）。",
    },
    note: "特定行政庁（政令市。9つの区とも窓口は建築安全課）。神戸市情報マップの「建築基準法指定道路情報」で、1項1号〜5号・2項・3項と、建築基準法の道路でない道・未判定の道が分かる（利用許諾への同意が要る）。",
  },

  // --- 県が扱う市町（都市計画区域あり・27） ----------------------------------------
  prefTown("猪名川町", "28301", "takarazuka"),
  prefTown("稲美町", "28381", "kakogawa"),
  prefTown("播磨町", "28382", "kakogawa"),
  prefTown("西脇市", "28213", "kato"),
  prefTown("三木市", "28215", "kato"),
  prefTown("小野市", "28218", "kato"),
  prefTown("加西市", "28220", "kato"),
  prefTown("加東市", "28228", "kato"),
  prefTown("多可町", "28365", "kato"),
  prefTown("福崎町", "28443", "himeji1"),
  prefTown("太子町", "28464", "himeji1"),
  prefTown("相生市", "28208", "himeji2"),
  prefTown("たつの市", "28229", "himeji2"),
  prefTown("赤穂市", "28212", "himeji2"),
  prefTown("宍粟市", "28227", "himeji2"),
  prefTown("上郡町", "28481", "himeji2"),
  prefTown("佐用町", "28501", "himeji2"),
  prefTown("豊岡市", "28209", "toyooka"),
  prefTown("養父市", "28222", "toyooka"),
  prefTown("朝来市", "28225", "toyooka"),
  prefTown("香美町", "28585", "toyooka"),
  prefTown("新温泉町", "28586", "toyooka"),
  prefTown("丹波篠山市", "28221", "tanba"),
  prefTown("丹波市", "28223", "tanba"),
  prefTown("洲本市", "28205", "sumoto"),
  prefTown("南あわじ市", "28224", "sumoto"),
  prefTown("淡路市", "28226", "sumoto"),

  // --- 都市計画区域の無い2町 --------------------------------------------------------
  outsideTown("市川町", "28442", "himeji1"),
  outsideTown("神河町", "28446", "himeji1"),
];
