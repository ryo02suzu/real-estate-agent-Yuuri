// 鹿児島県（2026-11 調査）。出典は docs/kagoshima-research.md。
// 市が建築確認と道路を扱うのは、特定行政庁の鹿児島市と、限定特定行政庁の鹿屋市・薩摩川内市・霧島市（県「道路に接していない敷地に建築物を建てるには」：
// 特定行政庁等＝県知事・鹿児島市長・霧島市長・薩摩川内市長・鹿屋市長。3市は、位置指定道路と小さい建築物の43条の認定などを市が扱い、ほかは県）。
// ほかの39市町村は、県の地域振興局・支庁の建築の窓口（県「建築に関する相談や各種証明書等に係る電子メール対応について」の連絡先。電話・FAX・メール）：
//   鹿児島地域振興局：日置市・いちき串木野市・鹿児島郡／南薩地域振興局：枕崎市・指宿市・南さつま市・南九州市／
//   北薩地域振興局：阿久根市・出水市・薩摩郡・出水郡（と薩摩川内市の市が扱わないもの）／姶良・伊佐地域振興局：姶良市・姶良郡（と霧島市の同）・伊佐市（伊佐市駐在）／
//   大隅地域振興局：垂水市・曽於市・志布志市・曽於郡・肝属郡（と鹿屋市の同）／熊毛支庁：西之表市・熊毛郡（屋久島町は屋久島事務所）／
//   大島支庁：奄美市・大島郡（徳之島町・天城町・伊仙町は徳之島事務所）
// 県は、建築の相談を「原則として電子メール又はファックスでの対応」としている（建築相談票を送る。送ったら電話で届いたかを確かめる。難しいときは電話で予約して窓口へ）。
// 県の道路の地図は、さつま町の「指定道路図」（図郭ごとの PDF。1項1号・3号・5号・2項・43条ただし書き・非道路）だけ。ほかに、平成22年4月以降に
// 都市計画区域が指定された区域（さつま町・肝付町・出水市・姶良市・阿久根市・志布志市）の、2項道路の指定の公告（地番・延長・幅員の表）を出している。
// 都市計画区域の無い町村は8つ（三島村・十島村・長島町・東串良町・大和村・宇検村・伊仙町・与論町。国の令和7年都市計画現況調査。準都市計画区域も無い）。
// 県のサイトの決まり：リンクは原則フリー。鹿児島県ホームページだと書く。
// まだ：市が扱う4市は調べている途中（data/kyushu.ts の調査中の一覧）。県が扱う市町村も、市町村が出している地図（市町村道の地図など）と市町村の窓口は調べている途中。
import type { Contact, MapLink, Municipality } from "../municipalities";

const pref = "鹿児島県" as const;

/** 地域振興局・支庁の建築の窓口（電話・FAX・メールは県「建築に関する相談や各種証明書等に係る電子メール対応について」の連絡先） */
const OFFICE = {
  kagoshima: { dept: "鹿児島県 鹿児島地域振興局 建設部 土木建築課 建築係", phone: "099-805-7336", fax: "099-805-7389", email: "kago-archi@pref.kagoshima.lg.jp" },
  nansatsu: { dept: "鹿児島県 南薩地域振興局 建設部 土木建築課 建築係", phone: "0993-52-1395", fax: "0993-52-1371", email: "minami-kenchiku@pref.kagoshima.lg.jp" },
  hokusatsu: { dept: "鹿児島県 北薩地域振興局 建設部 土木建築課 建築係", phone: "0996-25-5292", fax: "0996-25-5293", email: "kita-kenchiku@pref.kagoshima.lg.jp" },
  aira: { dept: "鹿児島県 姶良・伊佐地域振興局 建設部 土木建築課 建築係", phone: "0995-63-8371", fax: "0995-63-8345", email: "airaisa-kenchiku@pref.kagoshima.lg.jp" },
  isa: { dept: "鹿児島県 姶良・伊佐地域振興局 建設部 土木建築課 伊佐市駐在", phone: "0995-23-5155", fax: "0995-23-5166", email: "ookuchi-k-douro@pref.kagoshima.lg.jp" },
  osumi: { dept: "鹿児島県 大隅地域振興局 建設部 土木建築課 建築係", phone: "0994-52-2188", fax: "0994-52-2180", email: "oosumi-kasen-kenchiku@pref.kagoshima.lg.jp" },
  kumage: { dept: "鹿児島県 熊毛支庁 建設部 建設課 建築係", phone: "0997-22-1867", fax: "0997-23-1460", email: "kumage-kentiku@pref.kagoshima.lg.jp" },
  yakushima: { dept: "鹿児島県 熊毛支庁 屋久島事務所 建設課", phone: "0997-46-2213", fax: "0997-46-3049", email: "yaku-kensetsu-kasenkouwan2@pref.kagoshima.lg.jp" },
  oshima: { dept: "鹿児島県 大島支庁 建設部 建設課 建築係", phone: "0997-57-7344", fax: "0997-57-7362", email: "oosima-k-kenchiku@pref.kagoshima.lg.jp" },
  tokunoshima: { dept: "鹿児島県 大島支庁 徳之島事務所 建設課", phone: "0997-82-1251", fax: "0997-83-3092", email: "toku-kensetsu-douro@pref.kagoshima.lg.jp" },
} as const;
type Office = keyof typeof OFFICE;

const SHORT = (o: Office) => OFFICE[o].dept.replace("鹿児島県 ", "");

const SRC = "県「建築に関する相談や各種証明書等に係る電子メール対応について」";

/** 県の決まり（同じページ） */
const PREF_NOTE = `建築の相談は、原則として電子メールか FAX で受けている。県の「建築相談（証明事項調査）票」に書き、必要な図面・資料を添えて送る（メールは件名の初めに【建築相談】と入れる。5MB未満。圧縮したファイルは受け取れない）。送ったら、電話で届いたかを確かめる。メール・FAX が難しいときは、電話で予約して窓口へ。「この敷地にこの建物は建てられますか」のような漠然とした質問には答えられない、と県は書いている（${SRC}）。`;

const desk = (office: Office): Contact => ({ ...OFFICE[office], note: PREF_NOTE });

/** 県のさつま町指定道路図（図郭ごとの PDF） */
const SATSUMA_MAP: MapLink = {
  kind: "road_type",
  label: "鹿児島県ホームページ さつま町指定道路図（図郭ごとの PDF。1項1号・3号・5号・2項など）",
  build: null,
  url: "https://www.pref.kagoshima.jp/ah12/infra/kentiku/shidou/kijunhou/satumachoushiteidouro.html",
  verified: true,
  tip: "鹿児島県ホームページの「さつま町指定道路図」が開く。索引図を見て、場所の図（番号）を選ぶと PDF が開く。凡例は、法42条1項1号・1項3号・1項5号・2項・法43条ただし書き・非道路（図の中の凡例）。図のファイルは2014年10月のものなので、そのあとの指定（県の「2項道路の指定に係る公告」に令和6年7月26日指定分がある）は載っていないことがある。最新の情報とくわしいことは、北薩地域振興局の建築の窓口で確かめる。",
};

/** 県の「2項道路の指定に係る公告」（平成22年4月1日以降に都市計画区域が指定された区域。地番・延長・幅員の表の PDF） */
const koukoku = (name: string, date: string): MapLink => ({
  kind: "designated_only",
  label: `鹿児島県ホームページ 2項道路の指定の公告（${name}。地番・延長・幅員の表）`,
  build: null,
  url: "https://www.pref.kagoshima.jp/ah12/shiteidouro/ichishiteidouro.html",
  verified: true,
  tip: `鹿児島県ホームページの「建築基準法第42条第2項（位置指定道路）の指定に係る公告について」が開く。${name}（${date}に都市計画区域が指定された）の「指定分」の PDF に、県が2項道路に指定した箇所の地番・延長・幅員の表がある（地図ではない）。平成22年4月1日以降に都市計画区域が指定された区域の分だけが載っている。指定された道路の内容は、ページの「窓口一覧」の窓口に問い合わせる（県のページ）。`,
});

/** 県が扱う市町（都市計画区域あり。どこも一部）。maps は県が出している図や公告 */
const prefTown = (name: string, code: string, office: Office, opt: { maps?: MapLink[]; mapNote?: string } = {}): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: opt.maps ? "partial" : "none",
  maps: opt.maps ?? [],
  contact: desk(office),
  note: `県が扱う市町（建築の相談は${SHORT(office)}。${SRC}）。${opt.mapNote ?? "県の道路種別の地図は、この市町の分が出ていない。"}道路種別は、建築の窓口に相談して確かめる（原則メールか FAX）。${name}の一部は都市計画区域の外（国の令和7年都市計画現況調査の都市別一覧）。${name}が出している地図（市町道の地図など）は調べている途中。`,
});

/** 都市計画区域も準都市計画区域も無い町村（国の令和7年都市計画現況調査の2つの一覧に無い） */
const outsideTown = (name: string, code: string, office: Office): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: desk(office),
  note: `全域が都市計画区域外（国の令和7年都市計画現況調査の都市別一覧に${name}の都市計画区域は無く、準都市計画区域の一覧にも無い）。建築基準法の接道の決まり（43条）は、都市計画区域・準都市計画区域の中でかかる（県も「都市計画区域内で建築物を建てる場合」と書く。県「道路に接していない敷地に建築物を建てるには」）。建築のことは${SHORT(office)}が受け持つ（${SRC}）。`,
});

const KOUKOKU_NOTE = (date: string) =>
  `県の道路種別の地図は、この市町の分が出ていない。${date}に都市計画区域が指定され、そのとき県が2項道路に指定した箇所の公告（地番・延長・幅員の表）を、県がページに出している。`;

export const KAGOSHIMA: Municipality[] = [
  // 鹿児島地域振興局（日置市・いちき串木野市・鹿児島郡）
  prefTown("日置市", "46216", "kagoshima"),
  prefTown("いちき串木野市", "46219", "kagoshima"),
  outsideTown("三島村", "46303", "kagoshima"),
  outsideTown("十島村", "46304", "kagoshima"),
  // 南薩地域振興局
  prefTown("枕崎市", "46204", "nansatsu"),
  prefTown("指宿市", "46210", "nansatsu"),
  prefTown("南さつま市", "46220", "nansatsu"),
  prefTown("南九州市", "46223", "nansatsu"),
  // 北薩地域振興局（阿久根市・出水市・薩摩郡・出水郡）
  prefTown("阿久根市", "46206", "hokusatsu", { maps: [koukoku("阿久根市", "令和2年3月6日")], mapNote: KOUKOKU_NOTE("令和2年3月6日") }),
  prefTown("出水市", "46208", "hokusatsu", { maps: [koukoku("出水市", "平成28年4月1日")], mapNote: KOUKOKU_NOTE("平成28年4月1日") }),
  prefTown("さつま町", "46392", "hokusatsu", {
    maps: [SATSUMA_MAP, koukoku("さつま町", "平成26年3月18日")],
    mapNote: "県の「さつま町指定道路図」（図郭ごとの PDF）で、道路種別を見られる（図のファイルは2014年10月のもの）。県は、2項道路の指定の公告（地番・延長・幅員の表）も出している。",
  }),
  outsideTown("長島町", "46404", "hokusatsu"),
  // 姶良・伊佐地域振興局（姶良市・姶良郡）
  prefTown("姶良市", "46225", "aira", { maps: [koukoku("姶良市", "平成28年11月1日")], mapNote: KOUKOKU_NOTE("平成28年11月1日") }),
  prefTown("湧水町", "46452", "aira"),
  // 姶良・伊佐地域振興局 伊佐市駐在
  prefTown("伊佐市", "46224", "isa"),
  // 大隅地域振興局（垂水市・曽於市・志布志市・曽於郡・肝属郡）
  prefTown("垂水市", "46214", "osumi"),
  prefTown("曽於市", "46217", "osumi"),
  prefTown("志布志市", "46221", "osumi", { maps: [koukoku("志布志市", "令和3年3月30日")], mapNote: KOUKOKU_NOTE("令和3年3月30日") }),
  prefTown("大崎町", "46468", "osumi"),
  outsideTown("東串良町", "46482", "osumi"),
  prefTown("錦江町", "46490", "osumi"),
  prefTown("南大隅町", "46491", "osumi"),
  prefTown("肝付町", "46492", "osumi", { maps: [koukoku("肝付町", "平成26年10月10日")], mapNote: KOUKOKU_NOTE("平成26年10月10日") }),
  // 熊毛支庁（西之表市・熊毛郡。屋久島町は屋久島事務所）
  prefTown("西之表市", "46213", "kumage"),
  prefTown("中種子町", "46501", "kumage"),
  prefTown("南種子町", "46502", "kumage"),
  prefTown("屋久島町", "46505", "yakushima"),
  // 大島支庁（奄美市・大島郡。徳之島町・天城町・伊仙町は徳之島事務所）
  prefTown("奄美市", "46222", "oshima"),
  outsideTown("大和村", "46523", "oshima"),
  outsideTown("宇検村", "46524", "oshima"),
  prefTown("瀬戸内町", "46525", "oshima"),
  prefTown("龍郷町", "46527", "oshima"),
  prefTown("喜界町", "46529", "oshima"),
  prefTown("和泊町", "46533", "oshima"),
  prefTown("知名町", "46534", "oshima"),
  outsideTown("与論町", "46535", "oshima"),
  prefTown("徳之島町", "46530", "tokunoshima"),
  prefTown("天城町", "46531", "tokunoshima"),
  outsideTown("伊仙町", "46532", "tokunoshima"),
];
