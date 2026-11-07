// 岐阜県 全42市町村（2026-11 調査）。出典は docs/gifu-research.md。
// 特定行政庁は岐阜・大垣・各務原の3市。限定特定行政庁は高山・多治見・可児の3市（小さな建築物の確認は市、残りは県の建築事務所）。
// 残り36市町村は県の4建築事務所（岐阜・西濃／中濃／東濃／飛騨）が特定行政庁だが、前面道路の種別は市町村の建築担当課が窓口
// （2項道路は事務所と市町村が共同で調べる）。県も市町村も指定道路図はネットに出していない（可児市だけ県域統合型GISに
// 42条1項2号・2項・位置指定の地図）。市道の認定路線図や道路台帳は県域統合型GIS「ぎふ」（gis-gifu.jp）や PDF で公開する市町が多い。
// 七宗町・白川町・東白川村・白川村は全域が都市計画区域外。
import type { MapLink, Municipality } from "../municipalities";
import { gisGifu } from "../vendors";

const pref = "岐阜県" as const;

/** 県の建築事務所（市町村の特定行政庁）。代表番号と建築指導の内線 */
const OFFICE = {
  gifuSeino: "岐阜・西濃建築事務所 0584-73-1111（内線384 岐阜地区係・387 西濃地区係）",
  chuno: "中濃建築事務所 0574-25-3111（内線332・333）",
  tono: "東濃建築事務所 0572-23-1111（内線332・333 建築指導係）",
  hida: "飛騨建築事務所 0577-33-1111（内線391・392 建築指導係）",
} as const;

const prefNote = (office: keyof typeof OFFICE, extra = "") =>
  `特定行政庁は岐阜県（${OFFICE[office]}）。前面道路の種別は市町村の建築担当課が窓口で、2項道路は事務所と市町村が共同で調べる。県も市町村も指定道路図はネットに出していない。${extra}`;

/** 県が扱う市町村。問い合わせ先は市町村の建築担当課（県の「市町村相談窓口」の表、2025年4月1日）。市道の認定路線図などがあれば添える */
const town = (name: string, code: string, office: keyof typeof OFFICE, dept: string, phone: string, maps: MapLink[] = [], extra = ""): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps,
  contact: { dept, phone },
  note: prefNote(office, extra),
});

/** 全域が都市計画区域外の町村（県の都市計画区域の一覧に無く、建築事務所の案内でも区域外） */
const outsideTown = (name: string, code: string, office: keyof typeof OFFICE, dept: string, phone: string): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: { dept, phone },
  note: `全域が都市計画区域外（県の都市計画区域の一覧に無い）。建築確認が要る規模と建築の扱いは${OFFICE[office]}で確認。`,
});

/** 県域統合型GIS「ぎふ」の市道の地図（認定路線図・道路台帳）。最初に利用条件に同意する */
const gifuGis = (label: string, mid: number, tip?: string): MapLink => ({ kind: "public_road", label, build: gisGifu(mid), verified: true, tip });

/** PDF の分割図で公開している入口ページ */
const sheets = (label: string, url: string, tip: string): MapLink => ({ kind: "public_road", label, build: null, url, verified: true, tip });

/** cloud-gis.jp の地図。利用規約のページで同意してから地図を選ぶ仕組みで、地図のURLに座標を付けられない（直接開くと空のページ） */
const cloudGisPortal = (label: string, url: string, tip: string): MapLink => ({ kind: "public_road", label, build: null, url, verified: false, tip });

// --- 特定行政庁の3市 ---------------------------------------------------------

const GIFU_CITY: Municipality = {
  pref,
  name: "岐阜市",
  codes: ["21201"],
  coverage: "none",
  maps: [gifuGis("岐阜市認定路線網図（県域統合型GISぎふ・市道の認定路線）", 20008, "市道かどうかが分かる。幅員は載っていないので土木調査課（市庁舎16階）の窓口で")],
  contact: { dept: "まちづくり推進部 建築指導課 指導係（市庁舎17階）", phone: "058-214-2428" },
  note: "特定行政庁。道路種別の地図はネット非公開で、道路位置指定と道路調査は建築指導課 指導係が担当。市道の認定は土木調査課 調査計画係（058-214-7075）で、電話だけでは答えず案内図や公図を送って確認。",
};

const OGAKI: Municipality = {
  pref,
  name: "大垣市",
  codes: ["21202"],
  coverage: "none",
  maps: [gifuGis("大垣市道路台帳図（県域統合型GISぎふ・市道の路線番号と路線名）", 429, "幅員は載っていない（管理課の窓口で）。国道・県道・私道は載らない")],
  contact: { dept: "建築指導課 建築指導グループ（市役所5階）", phone: "0584-47-8436" },
  note: "特定行政庁。建築基準法上の道路の種類は建築指導課へ。市道の幅員は管理課（0584-47-8526）の窓口で閲覧。",
};

const KAKAMIGAHARA: Municipality = {
  pref,
  name: "各務原市",
  codes: ["21213"],
  coverage: "none",
  maps: [gifuGis("各務原市道路台帳（県域統合型GISぎふ・市道の路線網図と幅員）", 12105)],
  contact: { dept: "建築指導課 審査係（市役所5階）", phone: "058-383-1482" },
  note: "特定行政庁。市道の道路台帳は建設管理課（058-383-1904）。",
};

// --- 限定特定行政庁の3市 -----------------------------------------------------

const TAKAYAMA: Municipality = {
  pref,
  name: "高山市",
  codes: ["21203"],
  coverage: "none",
  maps: [],
  contact: { dept: "都市政策部 建築住宅課 開発指導係", phone: "0577-35-3159" },
  note: `限定特定行政庁（小さな建築物は市、残りは${OFFICE.hida}）。市道の幅と名称は維持課（0577-35-3340）か支所の窓口で道路台帳を見る（電話での照会は受けない）。荘川町・一之宮町・久々野町・朝日町・高根町・上宝町・奥飛騨温泉郷は都市計画区域外。`,
};

const TAJIMI: Municipality = {
  pref,
  name: "多治見市",
  codes: ["21204"],
  coverage: "none",
  maps: [],
  contact: { dept: "都市計画部 開発指導課 建築指導グループ", phone: "0572-22-1336" },
  note: `限定特定行政庁（小さな建築物は市、残りは${OFFICE.tono}）。市道の道路台帳はネットに出ていない。`,
};

const KANI: Municipality = {
  pref,
  name: "可児市",
  codes: ["21214"],
  coverage: "partial",
  maps: [
    {
      kind: "road_type",
      label: "建築基準法の道路種別（県域統合型GISぎふ・42条1項2号/2項/位置指定のみ）",
      build: gisGifu(11017),
      verified: true,
      tip: "最初に利用条件に同意する。開発道路（2号）・位置指定道路（5号）・2項道路だけで、1号（道路法の道路）・3号・4号は載っていない。2項道路は道路中心が未確定の所がある",
    },
    gifuGis("可児市道路台帳図（県域統合型GISぎふ・市道の路線番号と平均幅員）", 20010, "道路法の道路の概要で、土地の境界は示さない"),
  ],
  contact: { dept: "建設部 建築指導課 建築係", phone: "0574-62-1111" },
  note: `限定特定行政庁（小さな建築物は市、残りは${OFFICE.chuno}）。権利や取引に関わる確認は建築指導課の窓口で。`,
};

// --- 県が扱う36市町村 ----------------------------------------------------------

const PREF_TOWNS: Municipality[] = [
  // 岐阜・西濃建築事務所
  town("羽島市", "21209", "gifuSeino", "都市計画課 建築指導係", "058-392-1111", [
    cloudGisPortal("羽島市地理情報システム 道路マップ（市道の路線名と幅員）", "https://www.cloud-gis.jp/HashimaMap/terms.html", "利用規約に同意して「道路マップ」を開く。幅員は現況の車道幅員で、路肩を含まない"),
  ]),
  town("山県市", "21215", "gifuSeino", "建設課 開発・建築係", "0581-22-6832"),
  town("瑞穂市", "21216", "gifuSeino", "都市開発課 都市計画・建築係", "058-327-4111", [gifuGis("瑞穂市道路認定路線網図（県域統合型GISぎふ・1級/2級/その他）", 3400)]),
  town("本巣市", "21218", "gifuSeino", "都市計画課 都市管理係", "058-323-7758", [
    cloudGisPortal("本巣市地理情報システム 道路マップ（道路台帳図・道路網図）", "https://www.cloud-gis.jp/MotosuMap/terms.html", "利用規約に同意して「道路マップ」を開く"),
  ]),
  town("海津市", "21221", "gifuSeino", "建設都市計画課 住宅都市係", "0584-53-1425", [
    sheets("海津市道路認定路線網図（PDF 5枚と索引、2024年3月31日時点）", "https://www.city.kaizu.lg.jp/kurashi/0000000117.html", "索引で番号を見て路線網図を開く。路線番号と起終点だけで、幅員は建設都市計画課へ"),
  ]),
  town("岐南町", "21302", "gifuSeino", "くらし安全課", "058-247-1360"),
  town("笠松町", "21303", "gifuSeino", "建設課 基盤整備担当", "058-388-1111"),
  town("養老町", "21341", "gifuSeino", "建設課 都市建築係", "0584-32-5081"),
  town("垂井町", "21361", "gifuSeino", "建設課 都市計画推進室 都市計画整備係", "0584-22-1151"),
  town("関ケ原町", "21362", "gifuSeino", "産業建設課 都市計画係", "0584-43-1111"),
  town("神戸町", "21381", "gifuSeino", "建設課 管理係", "0584-27-3111"),
  town("輪之内町", "21382", "gifuSeino", "建設課 建設係", "0584-69-3137"),
  town("安八町", "21383", "gifuSeino", "まちづくり推進課", "0584-64-7112"),
  town("揖斐川町", "21401", "gifuSeino", "建設課 まちづくり係", "0585-22-2111", [gifuGis("揖斐川町道認定路線網図（県域統合型GISぎふ）", 2402)]),
  town("大野町", "21403", "gifuSeino", "建設課 都市計画係", "0585-34-1111"),
  town("池田町", "21404", "gifuSeino", "建設課 都市計画係", "0585-45-3111"),
  town("北方町", "21421", "gifuSeino", "都市環境課 都市計画係", "058-323-1111"),
  // 中濃建築事務所
  town("関市", "21205", "chuno", "都市計画課 開発建築係", "0575-22-3131", [gifuGis("関市道路台帳（県域統合型GISぎふ・市道の路線番号と認定幅員）", 3000, "橙の線が認定された市道。幅員は認定幅員で、車道は両側0.5mの路肩を引いた幅")], "一部が都市計画区域外。"),
  town("美濃市", "21207", "chuno", "都市整備課 住宅・建築係", "0575-33-1122", [
    sheets("美濃市道路台帳図（PDF・索引図から選ぶ、2024年4月1日時点）", "https://www.city.mino.gifu.jp/docs/952459.html", "利用規約に同意して索引図の番号の図を開く。幅員は現況で、道路の境界は示さない。土木課は電話での道路の照会を受けない"),
  ]),
  town("美濃加茂市", "21211", "chuno", "都市計画課 住宅政策係", "0574-25-2111", [
    cloudGisPortal("美濃加茂市 道路台帳（市道の名称と幅員）", "https://www.cloud-gis.jp/minokamomap/terms_iji.html", "利用規約に同意し、表示切替で「市道路線網図」を選んで道路を押す"),
  ]),
  town("郡上市", "21219", "chuno", "都市住宅課 建築住宅係", "0575-67-1814", [], "一部が都市計画区域外。"),
  town("坂祝町", "21501", "chuno", "産業建設課 都市計画係", "0574-66-2408"),
  town("富加町", "21502", "chuno", "建設課 都市計画係", "0574-54-2111", [gifuGis("富加町道路台帳（県域統合型GISぎふ・路線名と起終点）", 3600)]),
  town("川辺町", "21503", "chuno", "基盤整備課 管理・庶務", "0574-53-7214"),
  outsideTown("七宗町", "21504", "chuno", "総務課 防災係", "0574-48-1111"),
  town("八百津町", "21505", "chuno", "建設課 管理係", "0574-43-2111", [], "一部が都市計画区域外。"),
  outsideTown("白川町", "21506", "chuno", "総務課 危機管理係", "0574-72-1311"),
  outsideTown("東白川村", "21507", "chuno", "産業建設課 環境係", "0574-78-3111"),
  town("御嵩町", "21521", "chuno", "建設課 都市計画係", "0574-67-2111"),
  // 東濃建築事務所
  town("中津川市", "21206", "tono", "建築住宅課 建築係", "0573-66-1111", [gifuGis("中津川市道路台帳網図（県域統合型GISぎふ・市道の路線番号）", 5003, "市道の路線と起終点。幅員は管理課（0573-66-1111）で")]),
  town("瑞浪市", "21208", "tono", "都市計画課 土地建築係", "0572-68-9890", [
    sheets("瑞浪市道路網図（PDF・1/5,000、索引図から選ぶ）", "https://www.city.mizunami.lg.jp/sangyou_business/doboku/1009547.html", "索引図の番号の図を開く。市道の路線で、幅員は土木課管理係（0572-68-9814）へ"),
  ]),
  town("恵那市", "21210", "tono", "建築住宅課 建築係", "0573-26-6839", [
    sheets("恵那市道路網図（PDF・索引図と23枚、2024年3月時点）", "https://www.city.ena.lg.jp/soshikiichiran/kensetsubu/kensetsuka/1/3/1/1872.html", "索引図で番号を見て路線網図を開く。○が起点、→が終点。取引に関わる確認は建設課管理係（0573-26-6834）へ"),
  ]),
  town("土岐市", "21212", "tono", "都市計画課 建築係", "0572-54-1111"),
  // 飛騨建築事務所
  town("飛騨市", "21217", "hida", "建築住宅課 住宅政策係", "0577-73-0153", [], "河合町・宮川町の全域と古川町・神岡町の一部が都市計画区域外。"),
  town("下呂市", "21220", "hida", "建設総務課 建築係", "0576-53-2010", [], "市道の道路台帳図は建設総務課と各振興事務所の窓口で閲覧。小坂町・馬瀬の全域と旧下呂町・萩原町・金山町の一部が都市計画区域外。"),
  outsideTown("白川村", "21604", "hida", "建設課 建設係", "05769-6-1311"),
];

export const GIFU: Municipality[] = [GIFU_CITY, OGAKI, KAKAMIGAHARA, TAKAYAMA, TAJIMI, KANI, ...PREF_TOWNS];
