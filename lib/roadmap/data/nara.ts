// 奈良県（2026-11 調査）。出典は docs/nara-research.md。
// 特定行政庁は奈良県と奈良市・橿原市・生駒市（県「奈良県建築基準法の手引き」の「取扱い資料について」）。残りの36市町村は県が扱い、道路種別の
// 相談の窓口は、郡山（7市町村）・高田（11）・中和（18）の3つの土木事務所の建築課（県「道路種別の判断フローと相談窓口」・「建築計画概要書の
// 閲覧について」のチラシの所管地域）。吉野土木事務所の分は2022年4月1日から中和。建築確認の審査は2020年4月1日から本庁の建築安全課で、
// 土木事務所には窓口の仕事（窓口対応・電話相談・概要書の閲覧・道路判定）が残っている（県「建築主事の確認区分等の変更に伴う業務について」）。
// 県の道路の地図は「奈良県建築基準法道路システム」。都市計画区域（奈良市・橿原市・生駒市を除く）が対象で、いま載っているのは18市町村。
// 天理市・上牧町・王寺町・広陵町・河合町・吉野町・下市町は「現在準備中」（県「建築基準法上の道路について」2026年4月22日更新）。
// 載る種別は 1項2号〜5号・2項・3項・非道路で、1項1号は載らない（同じページ）ので「一部」。利用規約に同意して使う決まりで、確かめに使った機械
// からはシステムの入口が開けなかったので、アプリは県のページ（注意事項とシステムへのリンクがある）を開く。凡例の色・住所の検索・データの時点は
// 確かめていない（高田土木事務所のページは、大和高田市・御所市・香芝市・葛城市・五條市の分を「令和8年8月1日時点」と書いている）。
// 都市計画区域の無い村は11（山添・曽爾・御杖・黒滝・天川・野迫川・十津川・下北山・上北山・川上・東吉野。国の令和7年都市計画現況調査の都市別
// 一覧・県「区域区分、地域地区、地区計画」）。準都市計画区域は県内に無い（県「法上の道路に関する詳細」・国の同じ調査）。
// 幅員4m未満の道や道路法の道路でない道は、窓口へ行って備え付けの資料を自分で見る決まり（3事務所とも）。高田は電話で道路種別を答えない。
// 奈良市・橿原市・生駒市は調べている途中で、data/kinki.ts の調査中の一覧に残す。県が扱う市町村が出している地図（市町村道の地図など）と
// 市町村の窓口も調べている途中。
import type { Contact, MapLink, Municipality } from "../municipalities";

const pref = "奈良県" as const;

/** 県の決まり（土木事務所「建築基準法上の道路種別について」・県「法上の道路に関する詳細」「建築計画概要書の閲覧について」） */
const PREF_NOTE =
  "幅員4m未満の道や、道路法の道路（国道・県道・市町村道）でない道は、窓口へ行って、備え付けの資料を自分で確かめる決まり（土木事務所「建築基準法上の道路種別について」）。判定の出ていない道は「道路判定依頼書」を出す（様式と添える資料の一覧は土木事務所のページ）。相談の前に、現場で道路の幅員を測っておく（県「法上の道路に関する詳細」）。国道・県道・市町村道で、認定と現況の幅員がどちらも4m以上なら1項1号にあたり、認定幅員は道路を管理する所で確かめる（土木事務所の同じページ）。4階以上か延べ面積2,000㎡超の建築物の建築計画概要書は、本庁の建築安全課 建築指導係（0742-27-7574）で見る（県のチラシ）。";

/** 建築課の窓口の時間（郡山は事務所のページ、高田・中和は建築課のページ。12時〜13時は休み） */
const HOURS = "9:30〜12:00・13:00〜16:30";

/** 土木事務所の建築課（電話は県「道路種別の判断フローと相談窓口」。FAX は各事務所の建築課のページ。メールアドレスは載っていない） */
const OFFICE = {
  koriyama: { dept: "奈良県 郡山土木事務所 建築課（建築担当。郡山総合庁舎 南館）", phone: "0743-51-0209", fax: "0743-55-3751" },
  takada: { dept: "奈良県 高田土木事務所 建築課 建築係（建築担当）", phone: "0745-44-3877", fax: "0745-52-1594" },
  chuwa: { dept: "奈良県 中和土木事務所 建築課 建築係", phone: "0744-48-3079", fax: "0744-48-3087" },
} as const;
type Office = keyof typeof OFFICE;

const SHORT = (o: Office) => OFFICE[o].dept.replace("奈良県 ", "").replace(/（.*$/, "").replace(/ 建築係$/, "");

/**
 * 県が管理する国道・県道の土木事務所（県「土木事務所一覧」の管轄市町村。建築の受け持ちとは分け方が違う）。番号は各事務所のページの
 * 道路の管理の係。宇陀・吉野は事務所のページの原文が取れなかったので、一覧にある代表の番号
 */
const ROAD_OFFICE = {
  nara: "奈良土木事務所 管理課 道路管理係（0742-23-8024）",
  koriyama: "郡山土木事務所 管理課 管理係（0743-51-0205）",
  takada: "高田土木事務所 管理課 管理係（0745-44-3873）",
  chuwa: "中和土木事務所 管理課（0744-48-3073）",
  uda: "宇陀土木事務所（代表 0745-84-9510）",
  yoshino: "吉野土木事務所（代表 0746-32-4051）",
  gojo: "五條土木事務所 用地・管理課 管理係（0747-23-1154）",
} as const;
type RoadOffice = keyof typeof ROAD_OFFICE;

/** 高田土木事務所だけの決まり（建築課のページの「よくある質問」） */
const TAKADA_NOTE =
  "高田土木事務所は、特定の場所の道路種別・開発・概要書の確認に電話では答えない（建築課「よくある質問」。窓口で、地図などで場所を確かめながら答える）。窓口の書類・資料・台帳の写真は撮れない（同じページ）。";

const desk = (office: Office, road: RoadOffice): Contact => ({
  ...OFFICE[office],
  hours: HOURS,
  note: `${office === "takada" ? TAKADA_NOTE : ""}${PREF_NOTE}県が管理する国道・県道のことは、県の${ROAD_OFFICE[road]}（建築の窓口とは受け持ちの分け方が違う）。`,
  ...(office === "takada" ? { noPhoneInquiry: true } : {}),
});

/** 県の道路の地図（奈良県建築基準法道路システム）。利用規約への同意が要り、物件の位置では開けないので、県のページ（入口）を開く */
const PREF_MAP: MapLink = {
  kind: "road_type",
  label: "奈良県建築基準法道路システム（県のページから開く。1項1号は載らない）",
  build: null,
  url: "https://www.pref.nara.lg.jp/n155/33833.html",
  verified: true,
  tip: "県のページの「3.奈良県建築基準法道路システムについて」の注意事項を読み、「奈良県道路閲覧システムはこちら」から開いて、物件のあたりを探す。利用規約に同意して使う決まりなので、規約を読んで自分で同意する（MICHILU は同意の操作をしない。確かめに使った機械からはシステムの入口が開けず、凡例の色・住所の検索の有無・データの時点は確かめていない）。載る種別は、1項2号・3号・4号・5号・2項・3項と「非道路」。1項1号（幅員4m以上の国道・県道・市町村道）は載らず、表示が無くても1項1号にあたることがある（道路法の幅員は道路を管理する所で確かめる）。1項2号は時期によって出ていないものがある。県の2項道路は、幅員4m未満1.8m以上の道（県の告示。県「法上の道路に関する詳細」）。図は種別の大まかな位置だけで、幅員・境界・始点や終点などの形は示さない。接道の状況は必ず現地で確かめ、建築を計画する時点の情報を確かめる（どれも県のページの注意事項）。",
};

/** 県が扱う市町村で、県の道路システムに載っているところ。partlyOutside は都市計画区域が一部だけの市、asOf は土木事務所のページにある時点 */
const prefTown = (name: string, code: string, office: Office, road: RoadOffice, opt: { partlyOutside?: boolean; asOf?: string } = {}): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [PREF_MAP],
  contact: desk(office, road),
  note: `県が扱う市町村（道路種別の相談の窓口は${SHORT(office)}。県「道路種別の判断フローと相談窓口」）。県の「奈良県建築基準法道路システム」で、1項2号〜5号・2項・3項・非道路の大まかな位置を見られる（1項1号は載らない。利用規約に同意して使う。県「建築基準法上の道路について」）。${opt.asOf ? `${SHORT(office).replace(" 建築課", "")}のページは、${name}の分を「${opt.asOf}」と書いている。` : ""}表示の無い道・幅員4m未満の道は窓口で確かめる。${opt.partlyOutside ? `${name}の一部は都市計画区域の外で、県のシステムは都市計画区域の中だけ（国の令和7年都市計画現況調査の都市別一覧・県の同じページ）。` : ""}${name}が出している地図（市町村道の地図など）は調べている途中。`,
});

/** 県が扱う市町で、県の道路システムにまだ載っていないところ（県「その他の市町村は現在準備中です」） */
const preparingTown = (name: string, code: string, office: Office, road: RoadOffice, opt: { partlyOutside?: boolean; extra?: string } = {}): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps: [],
  contact: desk(office, road),
  note: `県が扱う市町村（道路種別の相談の窓口は${SHORT(office)}。県「道路種別の判断フローと相談窓口」）。県の「奈良県建築基準法道路システム」に${name}の分はまだ載っていない（県「建築基準法上の道路について」2026年4月22日更新は、載せている18市町村のほかを「現在準備中」としている）。道路種別は土木事務所の窓口で確かめる。${opt.extra ?? ""}${opt.partlyOutside ? `${name}の一部は都市計画区域の外（国の令和7年都市計画現況調査の都市別一覧）。` : ""}${name}が出している地図（市町村道の地図など）は調べている途中。`,
});

/** 都市計画区域の無い村（国の令和7年都市計画現況調査の都市別一覧に無い。県「区域区分、地域地区、地区計画」の構成市町村にも無い） */
const outsideTown = (name: string, code: string, office: Office, road: RoadOffice): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: desk(office, road),
  note: `全域が都市計画区域外（国の令和7年都市計画現況調査の都市別一覧・令和7年3月31日現在に無い。準都市計画区域も県内に無い）。県の「奈良県建築基準法道路システム」は都市計画区域の中だけなので載らない。建築のことの窓口は${SHORT(office)}（県のチラシ「建築計画概要書の閲覧について」の所管地域）。`,
});

const TAKADA_ASOF = "令和8年8月1日時点";

export const NARA: Municipality[] = [
  // --- 郡山土木事務所 建築課（7市町村） ----------------------------------------------
  prefTown("大和郡山市", "29203", "koriyama", "koriyama"),
  preparingTown("天理市", "29204", "koriyama", "nara"),
  prefTown("平群町", "29342", "koriyama", "koriyama"),
  prefTown("三郷町", "29343", "koriyama", "koriyama"),
  prefTown("斑鳩町", "29344", "koriyama", "koriyama"),
  prefTown("安堵町", "29345", "koriyama", "koriyama"),
  outsideTown("山添村", "29322", "koriyama", "nara"),

  // --- 高田土木事務所 建築課（11市町村） ---------------------------------------------
  prefTown("大和高田市", "29202", "takada", "takada", { asOf: TAKADA_ASOF }),
  prefTown("五條市", "29207", "takada", "gojo", { partlyOutside: true, asOf: TAKADA_ASOF }),
  prefTown("御所市", "29208", "takada", "takada", { asOf: TAKADA_ASOF }),
  prefTown("香芝市", "29210", "takada", "takada", { asOf: TAKADA_ASOF }),
  prefTown("葛城市", "29211", "takada", "takada", { asOf: TAKADA_ASOF }),
  preparingTown("上牧町", "29424", "takada", "takada"),
  preparingTown("王寺町", "29425", "takada", "takada"),
  preparingTown("広陵町", "29426", "takada", "takada"),
  preparingTown("河合町", "29427", "takada", "takada"),
  outsideTown("野迫川村", "29447", "takada", "gojo"),
  outsideTown("十津川村", "29449", "takada", "gojo"),

  // --- 中和土木事務所 建築課（18市町村） ---------------------------------------------
  prefTown("桜井市", "29206", "chuwa", "chuwa"),
  prefTown("宇陀市", "29212", "chuwa", "uda", { partlyOutside: true }),
  prefTown("川西町", "29361", "chuwa", "chuwa"),
  prefTown("三宅町", "29362", "chuwa", "chuwa"),
  prefTown("田原本町", "29363", "chuwa", "chuwa"),
  prefTown("高取町", "29401", "chuwa", "chuwa"),
  prefTown("明日香村", "29402", "chuwa", "chuwa"),
  prefTown("大淀町", "29442", "chuwa", "yoshino"),
  preparingTown("吉野町", "29441", "chuwa", "yoshino", {
    partlyOutside: true,
    extra: "町内に、42条3項の規定による道の指定がある（奈良県告示488号。中和土木事務所「建築基準法上の道路種別について」）。",
  }),
  preparingTown("下市町", "29443", "chuwa", "yoshino", { partlyOutside: true }),
  outsideTown("曽爾村", "29385", "chuwa", "uda"),
  outsideTown("御杖村", "29386", "chuwa", "uda"),
  outsideTown("黒滝村", "29444", "chuwa", "yoshino"),
  outsideTown("天川村", "29446", "chuwa", "yoshino"),
  outsideTown("下北山村", "29450", "chuwa", "yoshino"),
  outsideTown("上北山村", "29451", "chuwa", "yoshino"),
  outsideTown("川上村", "29452", "chuwa", "yoshino"),
  outsideTown("東吉野村", "29453", "chuwa", "uda"),
];
