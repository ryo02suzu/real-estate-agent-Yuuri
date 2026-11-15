// 北海道（2026-11 調査）。出典は docs/hokkaido-research.md。
// 市町村が建築確認を扱うのは39市町（道「道内の特定行政庁」令和8年4月1日現在）：
//   建築主事を置く市（特定行政庁）＝札幌市・函館市・小樽市・釧路市・苫小牧市・室蘭市・旭川市・帯広市・北見市・江別市の10市
//   小さい建築物だけを扱う市町（限定特定行政庁）＝石狩市・北広島市・千歳市・恵庭市・当別町・森町・岩見沢市・砂川市・深川市・三笠市・長沼町・
//   名寄市・士別市・富良野市・東神楽町・留萌市・稚内市・網走市・紋別市・美幌町・遠軽町・登別市・伊達市・白老町・音更町・芽室町・幕別町・中標津町・根室市の29市町
// ほかの140市町村は北海道が扱う（同じページ）。小さい建築物（木造で2階建て以下・延べ300㎡以下・高さ16m以下、木造以外で平屋・延べ200㎡以下など）は
// 14の総合振興局・振興局の建設指導課、それより大きい建築物は本庁の建築指導課（011-204-5578）。確認申請の出し先は市町村役場。
// どの市町村がどの振興局かは、道のオープンデータ「北海道内の市町村」（179市町村の一覧。CC BY）。
// 道の道路種別の地図は、ネットに見つからなかった。指定道路図と指定道路調書は、その区域の総合振興局・振興局の建設指導課の中で閲覧できる
// （道の告示「建築基準法第93条の2の規定に基づく書類を閲覧に供する閲覧場所及び閲覧に関する規程」：閲覧日は道の休日以外の日、閲覧時間は午前9時から午後5時まで。
// 閲覧請求簿に書いて借りる。持ち出しはできない。個人名の公表や、個人名の入った名簿づくり・譲渡・売買などが目的の閲覧は、止められることがある）。
// 窓口の電話は「道内の特定行政庁」、場所は同じ規程と「定期報告提出先一覧」。
// 都市計画区域があるのは99市町（道「都市計画区域の指定状況」。国の令和7年都市計画現況調査の都市別一覧も同じ99）。無い80町村は、どれも道が扱う。
// このうちニセコ町には準都市計画区域がある（道の冊子「北海道の都市計画」令和8年3月：七飯・倶知安・ニセコ・洞爺湖・端野（北見市）の5区域）ので、「区域外」にしていない。
// 道のサイトの決まり：トップページへのリンクは原則自由。トップページ以外は、それぞれのページの管理者へ問い合わせる（いまの登録では、道のページへのリンクは置いていない）。
// まだ：市町が扱う39市町は調べている途中（data/hokkaido.ts の調査中の一覧）。道が扱う市町村も、市町村が出している地図（市町村道の地図など）と市町村の窓口は調べている途中。
import type { Contact, Municipality } from "../municipalities";

const pref = "北海道" as const;

/** 総合振興局・振興局の建設指導課 建築住宅係（電話は道「道内の特定行政庁」、場所は道の閲覧規程と「定期報告提出先一覧」） */
const OFFICE = {
  sorachi: { dept: "北海道 空知総合振興局 札幌建設管理部 建設行政室 建設指導課 建築住宅係（岩見沢市8条西5丁目）", phone: "0126-20-0067" },
  ishikari: { dept: "北海道 石狩振興局 産業振興部 建設指導課 建築住宅係（札幌市中央区北3条西7丁目 道庁別館）", phone: "011-204-5833" },
  shiribeshi: { dept: "北海道 後志総合振興局 小樽建設管理部 建設行政室 建設指導課 建築住宅係（倶知安町北1条東2丁目）", phone: "0136-23-1373" },
  iburi: { dept: "北海道 胆振総合振興局 室蘭建設管理部 建設行政室 建設指導課 建築住宅係（室蘭市海岸町1丁目4番1号 むろらん広域センタービル）", phone: "0143-24-9594" },
  hidaka: { dept: "北海道 日高振興局 産業振興部 建設指導課 建築住宅係（浦河町栄丘東通56）", phone: "0146-22-9293" },
  oshima: { dept: "北海道 渡島総合振興局 函館建設管理部 建設行政室 建設指導課 建築住宅係（函館市美原4丁目6番16号）", phone: "0138-47-9466" },
  hiyama: { dept: "北海道 檜山振興局 産業振興部 建設指導課 建築住宅係（江差町字陣屋町336-3）", phone: "0139-52-6632" },
  kamikawa: { dept: "北海道 上川総合振興局 旭川建設管理部 建設行政室 建設指導課 建築住宅係（旭川市永山6条19丁目）", phone: "0166-46-5947" },
  rumoi: { dept: "北海道 留萌振興局 留萌建設管理部 建設行政室 建設指導課 建築住宅係（留萌市住之江町2丁目1番地2）", phone: "0164-42-8449" },
  soya: { dept: "北海道 宗谷総合振興局 稚内建設管理部 建設行政室 建設指導課 建築住宅係（稚内市末広4丁目2-27）", phone: "0162-33-2930" },
  okhotsk: { dept: "北海道 オホーツク総合振興局 網走建設管理部 建設行政室 建設指導課 建築住宅係（網走市北7条西3丁目）", phone: "0152-41-0642" },
  tokachi: { dept: "北海道 十勝総合振興局 帯広建設管理部 建設行政室 建設指導課 建築住宅係（帯広市東3条南3丁目）", phone: "0155-27-8601" },
  kushiro: { dept: "北海道 釧路総合振興局 釧路建設管理部 建設行政室 建設指導課 建築住宅係（釧路市浦見2丁目2番54号）", phone: "0154-43-9192" },
  nemuro: { dept: "北海道 根室振興局 産業振興部 建設指導課 建築住宅係（根室市常盤町3丁目28番地）", phone: "0153-23-6832" },
} as const;
type Office = keyof typeof OFFICE;

/** 「空知総合振興局の建設指導課」のような短い呼び名 */
const SHORT = (o: Office) => `${OFFICE[o].dept.split(" ")[1]}の建設指導課`;

const SRC = "道「道内の特定行政庁」令和8年4月1日現在";
const RULE = "道の閲覧規程";

/** 釧路総合振興局は、協議の受け方と時間をページに書いている（「建築基準法等に関すること」） */
const KUSHIRO = "相談（協議）は、あらかじめ連絡し、論点や図面を整理して行く。回答が後日になることがある（釧路総合振興局のページ）。";

const desk = (office: Office, outside = false): Contact => ({
  ...OFFICE[office],
  hours:
    office === "kushiro"
      ? "平日 9:00〜17:00（12:00〜13:00を除く。祝日・12月29日〜1月3日は休み。釧路総合振興局のページ）"
      : `平日 9:00〜17:00（${outside ? "建築の書類" : "指定道路図・指定道路調書"}の閲覧時間。${RULE}）`,
  note: `${
    outside ? "都市計画区域の無い町村。建築のことは窓口に問い合わせて確かめる。" : `道の道路種別の地図はネットに見つからなかったので、道路種別は窓口で確かめる。指定道路図と指定道路調書は、この課の中で閲覧できる（閲覧請求簿に書いて借りる。持ち出しはできない。${RULE}）。`
  }${office === "kushiro" ? KUSHIRO : ""}`,
});

/** 道が扱う市町村に共通の説明（建築確認の受け持ち） */
const WHO = (office: Office) =>
  `道が扱う市町村（建築確認は北海道。木造で2階建て以下・延べ300㎡以下・高さ16m以下などの小さい建築物は${SHORT(office)}、それより大きい建築物は本庁の建築指導課（電話 011-204-5578）。確認申請の出し先は市町村役場。${SRC}）。`;

const MAP_NOTE = (office: Office) => `道の道路種別の地図はネットに見つからなかった。指定道路図と指定道路調書は、${SHORT(office)}の中で閲覧できる（${RULE}）。`;

/** 道が扱う市町村（都市計画区域あり）。whole は都市計画区域が全域の町。jun は準都市計画区域もある町（区域の名前） */
const prefTown = (name: string, code: string, office: Office, opt: { whole?: boolean; jun?: string } = {}): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps: [],
  contact: desk(office),
  note: `${WHO(office)}${MAP_NOTE(office)}${
    opt.whole ? "" : `${name}の一部は都市計画区域の外（国の令和7年都市計画現況調査の都市別一覧）。`
  }${opt.jun ? `都市計画区域の外に、準都市計画区域（${opt.jun}準都市計画区域）もある（道の冊子「北海道の都市計画」令和8年3月）。建築基準法の接道の決まり（43条）は、準都市計画区域の中でもかかる。` : ""}${name}が出している地図（市町村道の地図など）は調べている途中。`,
});

/** 都市計画区域は無いが、準都市計画区域がある町（ニセコ町）。接道の決まりは準都市計画区域の中でもかかるので、「区域外」にしない */
const junTown = (name: string, code: string, office: Office, jun: string): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps: [],
  contact: desk(office),
  note: `${WHO(office)}${name}に都市計画区域は無いが、準都市計画区域（${jun}準都市計画区域。町の一部）がある（道の冊子「北海道の都市計画」令和8年3月・国の令和7年都市計画現況調査）。建築基準法の接道の決まり（43条）は、都市計画区域・準都市計画区域の中でかかる。${MAP_NOTE(office)}${name}が出している地図（町道の地図など）は調べている途中。`,
});

/** 都市計画区域も準都市計画区域も無い町村（国の令和7年都市計画現況調査の2つの一覧に無い。道「都市計画区域の指定状況」の未指定80町村） */
const outsideTown = (name: string, code: string, office: Office): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: desk(office, true),
  note: `全域が都市計画区域外（国の令和7年都市計画現況調査の都市別一覧に${name}の都市計画区域は無く、準都市計画区域の一覧にも無い）。建築基準法の接道の決まり（43条）は、都市計画区域・準都市計画区域の中でかかる。建築のことは北海道が受け持つ（小さい建築物は${SHORT(office)}、それより大きい建築物は本庁の建築指導課（電話 011-204-5578）。${SRC}）。`,
});

export const HOKKAIDO: Municipality[] = [
  // 空知総合振興局（19。市が扱うのは岩見沢市・三笠市・砂川市・深川市・長沼町）
  prefTown("夕張市", "01209", "sorachi"),
  prefTown("美唄市", "01215", "sorachi"),
  prefTown("芦別市", "01216", "sorachi"),
  prefTown("赤平市", "01218", "sorachi"),
  prefTown("滝川市", "01225", "sorachi"),
  prefTown("歌志内市", "01227", "sorachi"),
  prefTown("南幌町", "01423", "sorachi", { whole: true }),
  prefTown("奈井江町", "01424", "sorachi"),
  outsideTown("上砂川町", "01425", "sorachi"),
  outsideTown("由仁町", "01427", "sorachi"),
  prefTown("栗山町", "01429", "sorachi"),
  outsideTown("月形町", "01430", "sorachi"),
  outsideTown("浦臼町", "01431", "sorachi"),
  prefTown("新十津川町", "01432", "sorachi"),
  outsideTown("妹背牛町", "01433", "sorachi"),
  outsideTown("秩父別町", "01434", "sorachi"),
  outsideTown("雨竜町", "01436", "sorachi"),
  outsideTown("北竜町", "01437", "sorachi"),
  outsideTown("沼田町", "01438", "sorachi"),
  // 石狩振興局（1。市が扱うのは札幌市・江別市・千歳市・恵庭市・北広島市・石狩市・当別町）
  outsideTown("新篠津村", "01304", "ishikari"),
  // 後志総合振興局（19。市が扱うのは小樽市）
  outsideTown("島牧村", "01391", "shiribeshi"),
  outsideTown("寿都町", "01392", "shiribeshi"),
  outsideTown("黒松内町", "01393", "shiribeshi"),
  outsideTown("蘭越町", "01394", "shiribeshi"),
  junTown("ニセコ町", "01395", "shiribeshi", "ニセコ"),
  outsideTown("真狩村", "01396", "shiribeshi"),
  outsideTown("留寿都村", "01397", "shiribeshi"),
  outsideTown("喜茂別町", "01398", "shiribeshi"),
  outsideTown("京極町", "01399", "shiribeshi"),
  prefTown("倶知安町", "01400", "shiribeshi", { jun: "倶知安" }),
  prefTown("共和町", "01401", "shiribeshi"),
  prefTown("岩内町", "01402", "shiribeshi"),
  outsideTown("泊村", "01403", "shiribeshi"),
  outsideTown("神恵内村", "01404", "shiribeshi"),
  outsideTown("積丹町", "01405", "shiribeshi"),
  prefTown("古平町", "01406", "shiribeshi"),
  outsideTown("仁木町", "01407", "shiribeshi"),
  prefTown("余市町", "01408", "shiribeshi"),
  outsideTown("赤井川村", "01409", "shiribeshi"),
  // 胆振総合振興局（6。市が扱うのは室蘭市・苫小牧市・登別市・伊達市・白老町）
  outsideTown("豊浦町", "01571", "iburi"),
  prefTown("壮瞥町", "01575", "iburi"),
  prefTown("厚真町", "01581", "iburi"),
  prefTown("洞爺湖町", "01584", "iburi", { jun: "洞爺湖" }),
  prefTown("安平町", "01585", "iburi"),
  prefTown("むかわ町", "01586", "iburi"),
  // 日高振興局（7）
  prefTown("日高町", "01601", "hidaka"),
  outsideTown("平取町", "01602", "hidaka"),
  outsideTown("新冠町", "01604", "hidaka"),
  prefTown("浦河町", "01607", "hidaka"),
  outsideTown("様似町", "01608", "hidaka"),
  outsideTown("えりも町", "01609", "hidaka"),
  prefTown("新ひだか町", "01610", "hidaka"),
  // 渡島総合振興局（9。市が扱うのは函館市・森町）
  prefTown("北斗市", "01236", "oshima"),
  outsideTown("松前町", "01331", "oshima"),
  prefTown("福島町", "01332", "oshima"),
  outsideTown("知内町", "01333", "oshima"),
  prefTown("木古内町", "01334", "oshima"),
  prefTown("七飯町", "01337", "oshima", { jun: "七飯" }),
  outsideTown("鹿部町", "01343", "oshima"),
  prefTown("八雲町", "01346", "oshima"),
  prefTown("長万部町", "01347", "oshima"),
  // 檜山振興局（7）
  prefTown("江差町", "01361", "hiyama"),
  outsideTown("上ノ国町", "01362", "hiyama"),
  outsideTown("厚沢部町", "01363", "hiyama"),
  outsideTown("乙部町", "01364", "hiyama"),
  outsideTown("奥尻町", "01367", "hiyama"),
  prefTown("今金町", "01370", "hiyama"),
  prefTown("せたな町", "01371", "hiyama"),
  // 上川総合振興局（18。市が扱うのは旭川市・士別市・名寄市・富良野市・東神楽町）
  prefTown("鷹栖町", "01452", "kamikawa"),
  outsideTown("当麻町", "01454", "kamikawa"),
  outsideTown("比布町", "01455", "kamikawa"),
  outsideTown("愛別町", "01456", "kamikawa"),
  prefTown("上川町", "01457", "kamikawa"),
  outsideTown("東川町", "01458", "kamikawa"),
  prefTown("美瑛町", "01459", "kamikawa"),
  prefTown("上富良野町", "01460", "kamikawa"),
  outsideTown("中富良野町", "01461", "kamikawa"),
  outsideTown("南富良野町", "01462", "kamikawa"),
  outsideTown("占冠村", "01463", "kamikawa"),
  outsideTown("和寒町", "01464", "kamikawa"),
  outsideTown("剣淵町", "01465", "kamikawa"),
  prefTown("下川町", "01468", "kamikawa"),
  prefTown("美深町", "01469", "kamikawa"),
  outsideTown("音威子府村", "01470", "kamikawa"),
  outsideTown("中川町", "01471", "kamikawa"),
  outsideTown("幌加内町", "01472", "kamikawa"),
  // 留萌振興局（7。市が扱うのは留萌市）
  prefTown("増毛町", "01481", "rumoi"),
  outsideTown("小平町", "01482", "rumoi"),
  outsideTown("苫前町", "01483", "rumoi"),
  prefTown("羽幌町", "01484", "rumoi"),
  outsideTown("初山別村", "01485", "rumoi"),
  outsideTown("遠別町", "01486", "rumoi"),
  outsideTown("天塩町", "01487", "rumoi"),
  // 宗谷総合振興局（9。市が扱うのは稚内市）
  outsideTown("猿払村", "01511", "soya"),
  prefTown("浜頓別町", "01512", "soya"),
  outsideTown("中頓別町", "01513", "soya"),
  prefTown("枝幸町", "01514", "soya"),
  outsideTown("豊富町", "01516", "soya"),
  outsideTown("礼文町", "01517", "soya"),
  outsideTown("利尻町", "01518", "soya"),
  outsideTown("利尻富士町", "01519", "soya"),
  outsideTown("幌延町", "01520", "soya"),
  // オホーツク総合振興局（13。市が扱うのは北見市・網走市・紋別市・美幌町・遠軽町）
  outsideTown("津別町", "01544", "okhotsk"),
  prefTown("斜里町", "01545", "okhotsk"),
  outsideTown("清里町", "01546", "okhotsk"),
  outsideTown("小清水町", "01547", "okhotsk"),
  outsideTown("訓子府町", "01549", "okhotsk"),
  outsideTown("置戸町", "01550", "okhotsk"),
  outsideTown("佐呂間町", "01552", "okhotsk"),
  outsideTown("湧別町", "01559", "okhotsk"),
  prefTown("滝上町", "01560", "okhotsk"),
  prefTown("興部町", "01561", "okhotsk"),
  outsideTown("西興部村", "01562", "okhotsk"),
  prefTown("雄武町", "01563", "okhotsk"),
  prefTown("大空町", "01564", "okhotsk"),
  // 十勝総合振興局（15。市が扱うのは帯広市・音更町・芽室町・幕別町）
  outsideTown("士幌町", "01632", "tokachi"),
  outsideTown("上士幌町", "01633", "tokachi"),
  outsideTown("鹿追町", "01634", "tokachi"),
  prefTown("新得町", "01635", "tokachi"),
  prefTown("清水町", "01636", "tokachi"),
  outsideTown("中札内村", "01638", "tokachi"),
  outsideTown("更別村", "01639", "tokachi"),
  prefTown("大樹町", "01641", "tokachi"),
  prefTown("広尾町", "01642", "tokachi"),
  prefTown("池田町", "01644", "tokachi"),
  outsideTown("豊頃町", "01645", "tokachi"),
  prefTown("本別町", "01646", "tokachi"),
  prefTown("足寄町", "01647", "tokachi"),
  outsideTown("陸別町", "01648", "tokachi"),
  prefTown("浦幌町", "01649", "tokachi"),
  // 釧路総合振興局（7。市が扱うのは釧路市）
  prefTown("釧路町", "01661", "kushiro"),
  prefTown("厚岸町", "01662", "kushiro"),
  outsideTown("浜中町", "01663", "kushiro"),
  prefTown("標茶町", "01664", "kushiro"),
  prefTown("弟子屈町", "01665", "kushiro"),
  outsideTown("鶴居村", "01667", "kushiro"),
  prefTown("白糠町", "01668", "kushiro"),
  // 根室振興局（3。市が扱うのは根室市・中標津町）
  outsideTown("別海町", "01691", "nemuro"),
  outsideTown("標津町", "01693", "nemuro"),
  outsideTown("羅臼町", "01694", "nemuro"),
];
