// 沖縄県（2026-11 調査）。出典は docs/okinawa-research.md。
// 市が建築確認と道路を扱うのは、特定行政庁の5市（那覇市・浦添市・宜野湾市・沖縄市・うるま市。県「土木事務所の所管区域（建築基準法関係）」）。
// ほかの36市町村は、県の5つの土木事務所の建築班（同じページ。場所・電話）：
//   北部：名護市・国頭村・大宜味村・東村・本部町・今帰仁村・宜野座村・金武町・恩納村・伊江村・伊平屋村・伊是名村
//   中部：読谷村・嘉手納町・北谷町・北中城村・中城村・西原町
//   南部：糸満市・豊見城市・南城市・南風原町・与那原町・八重瀬町・久米島町・渡嘉敷村・座間味村・粟国村・渡名喜村・南大東村・北大東村
//   宮古：宮古島市・多良間村／八重山：石垣市・竹富町・与那国町
// 建築班の窓口受付は 9:30〜11:30・13:00〜16:00、対応は原則30分以内（県「各土木事務所建築班における窓口対応」）。
// 県の道路の地図は「指定道路マップ」（参考図）。土木事務所ごとのページで出していて、注意事項に「同意する」で進む形。アプリは入口までを案内し、
// 同意の先は MICHILU では開いていない。北部の分は「名護市および本部町の都市計画区域内のみ」（北部土木事務所のページ）。
// 県の注意：参考図で内容を証明しない。不動産取引や建築確認などで正確な情報が要るときは必ず窓口で確かめる。権利関係を確かめる資料には使えない。
// 無断の複写・複製・転載・編集は禁じる。1項1号道路（国・県・市町村道）の位置は参考で、境界・幅員は道路管理者に確かめる。
// 建築基準法の道路かどうかの調査は、建築班の担当と調整して「道路調査依頼票」を出す（県「道路調査依頼票」）。
// 県のサイトの決まり：リンクは原則フリー（リンクしたら広報へ URL を知らせる）。トップページ以外へリンクしたいときは担当課へ問い合わせる。問い合わせが
// 済むまでは、県のトップページを開き、サイト内検索での探し方を書く（docs/road-data-permission.md の「リンクの連絡」）。
// 都市計画区域の無い町村は20（国の令和7年都市計画現況調査の都市別一覧。準都市計画区域も無い）。北部土木事務所のページも
// 「都市計画区域外の各市町村については、建築基準法第3章の規定（集団規定）の適用を受けず、接道義務がないため指定道路マップの整備はございません」と書く。
// まだ：市が扱う5市は調べている途中（data/kyushu.ts の調査中の一覧）。県が扱う市町村も、市町村が出している地図（市町村道の地図など）と市町村の窓口は調べている途中。
import type { Contact, MapLink, Municipality } from "../municipalities";

const pref = "沖縄県" as const;

/** 土木事務所の建築班（場所・電話は県「土木事務所の所管区域（建築基準法関係）」） */
const OFFICE = {
  hokubu: { dept: "沖縄県 北部土木事務所 建築班（名護市大南1-13-11 2階）", phone: "0980-53-2010" },
  chubu: { dept: "沖縄県 中部土木事務所 建築班（沖縄市美原1-6-34 3階）", phone: "098-894-6513" },
  nanbu: { dept: "沖縄県 南部土木事務所 建築班（那覇市旭町116-37 7階）", phone: "098-866-1762" },
  miyako: { dept: "沖縄県 宮古土木事務所 建築班（宮古島市平良字西里1125 3階）", phone: "0980-72-1437" },
  yaeyama: { dept: "沖縄県 八重山土木事務所 建築班（石垣市字真栄里438-1 3階）", phone: "0980-82-3077" },
} as const;
type Office = keyof typeof OFFICE;

const SHORT = (o: Office) => OFFICE[o].dept.replace("沖縄県 ", "").replace(/（.*$/, "");
const NAME = (o: Office) => SHORT(o).replace(" 建築班", "");

const SRC = "県「土木事務所の所管区域（建築基準法関係）」";

const desk = (office: Office): Contact => ({
  ...OFFICE[office],
  hours: "平日 9:30〜11:30・13:00〜16:00（建築班の窓口受付時間）",
  note: "窓口の対応は原則30分以内なので、相談の内容をまとめてから行く（県の「事前相談票」がある。県「各土木事務所建築班における窓口対応」）。建築基準法の道路かどうかの調査を頼むときは、建築班の担当と調整したうえで「道路調査依頼票」を出す（県「道路調査依頼票」）。",
});

/** 県のトップページ（県は、トップページ以外へリンクするときは担当課へ問い合わせるよう求めている） */
const PREF_TOP = "https://www.pref.okinawa.lg.jp/";

/** 県の指定道路マップ（土木事務所ごとのページ。注意事項に同意して進む）。県のトップページから進む */
const prefMap = (office: Office, area = ""): MapLink => ({
  kind: "designated_only",
  label: `沖縄県 指定道路マップ（参考図。${NAME(office)}の分。指定道路と、参考の1項1号道路）※沖縄県のトップページから進む`,
  build: null,
  url: PREF_TOP,
  verified: true,
  tip: `沖縄県のトップページが開く（県が、トップページ以外へリンクするときは担当課へ問い合わせるよう求めているため）。サイト内検索で「指定道路マップ」と探し、「指定道路マップ」のページから「指定道路マップ（${NAME(office)}）」を開く。${area}注意事項を読み、自分で「同意する」を押して進む（見た人は注意事項に同意したものとみなされる。MICHILU は同意の先を開いていない）。県が、いま分かっている情報で作った参考図で、内容を証明するものではない。不動産取引や建築確認などで正確な情報が要るときは、必ず窓口で確かめる（県の注意事項）。権利関係を確かめる資料には使えない。国道・県道・市町村道（1項1号道路）の位置は参考で、道路の境界と幅員は道路管理者に確かめる。誤記や現況との誤差がありうるので、必ず現地も確かめる。無断の複写・複製・転載・編集は禁じられている。いままでの調査による指定道路を表示していて、追加・訂正・廃止で変わる。現地と図が合わないとき・最新の情報が要るときは、建築班に確かめる。`,
});

/** 県が扱う市町村（都市計画区域あり）。whole は都市計画区域が全域 */
const prefTown = (name: string, code: string, office: Office, opt: { whole?: boolean; area?: string } = {}): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [prefMap(office, opt.area)],
  contact: desk(office),
  note: `県が扱う市町村（建築確認と道路のことは${SHORT(office)}。${SRC}）。県の「指定道路マップ」（参考図。注意事項に同意して開く）で、指定道路のおおよその位置が分かる。正確な情報は建築班の窓口で確かめ、未調査の道は「道路調査依頼票」で調査を頼む。${opt.whole ? "" : `${name}の一部は都市計画区域の外（国の令和7年都市計画現況調査の都市別一覧）。`}${name}が出している地図（市町村道の地図など）は調べている途中。`,
});

/** 都市計画区域も準都市計画区域も無い町村（国の令和7年都市計画現況調査の2つの一覧に無い） */
const outsideTown = (name: string, code: string, office: Office): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: desk(office),
  note: `全域が都市計画区域外（国の令和7年都市計画現況調査の都市別一覧に${name}の都市計画区域は無く、準都市計画区域の一覧にも無い）。県は「都市計画区域外の各市町村については、建築基準法第3章の規定（集団規定）の適用を受けず、接道義務がないため指定道路マップの整備はございません」と書いている（北部土木事務所の指定道路マップのページ）。建築のことは${SHORT(office)}が受け持つ（${SRC}）。`,
});

const HOKUBU_AREA = "北部土木事務所の分は、名護市と本部町の都市計画区域の中だけ。";

export const OKINAWA: Municipality[] = [
  // 北部土木事務所
  prefTown("名護市", "47209", "hokubu", { whole: true, area: HOKUBU_AREA }),
  prefTown("本部町", "47308", "hokubu", { whole: true, area: HOKUBU_AREA }),
  outsideTown("国頭村", "47301", "hokubu"),
  outsideTown("大宜味村", "47302", "hokubu"),
  outsideTown("東村", "47303", "hokubu"),
  outsideTown("今帰仁村", "47306", "hokubu"),
  outsideTown("恩納村", "47311", "hokubu"),
  outsideTown("宜野座村", "47313", "hokubu"),
  outsideTown("金武町", "47314", "hokubu"),
  outsideTown("伊江村", "47315", "hokubu"),
  outsideTown("伊平屋村", "47359", "hokubu"),
  outsideTown("伊是名村", "47360", "hokubu"),
  // 中部土木事務所
  prefTown("読谷村", "47324", "chubu", { whole: true }),
  prefTown("嘉手納町", "47325", "chubu", { whole: true }),
  prefTown("北谷町", "47326", "chubu", { whole: true }),
  prefTown("北中城村", "47327", "chubu", { whole: true }),
  prefTown("中城村", "47328", "chubu", { whole: true }),
  prefTown("西原町", "47329", "chubu", { whole: true }),
  // 南部土木事務所
  prefTown("糸満市", "47210", "nanbu", { whole: true }),
  prefTown("豊見城市", "47212", "nanbu", { whole: true }),
  prefTown("南城市", "47215", "nanbu"),
  prefTown("与那原町", "47348", "nanbu", { whole: true }),
  prefTown("南風原町", "47350", "nanbu", { whole: true }),
  prefTown("八重瀬町", "47362", "nanbu"),
  outsideTown("渡嘉敷村", "47353", "nanbu"),
  outsideTown("座間味村", "47354", "nanbu"),
  outsideTown("粟国村", "47355", "nanbu"),
  outsideTown("渡名喜村", "47356", "nanbu"),
  outsideTown("南大東村", "47357", "nanbu"),
  outsideTown("北大東村", "47358", "nanbu"),
  outsideTown("久米島町", "47361", "nanbu"),
  // 宮古土木事務所
  prefTown("宮古島市", "47214", "miyako"),
  outsideTown("多良間村", "47375", "miyako"),
  // 八重山土木事務所
  prefTown("石垣市", "47207", "yaeyama", { whole: true }),
  outsideTown("竹富町", "47381", "yaeyama"),
  outsideTown("与那国町", "47382", "yaeyama"),
];
