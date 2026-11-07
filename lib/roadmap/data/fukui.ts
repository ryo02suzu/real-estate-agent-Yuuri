// 福井県 全17市町（2026-11 調査）。出典は docs/fukui-research.md。
// 特定行政庁は福井県と福井市だけ。福井市以外の16市町は県の7つの土木事務所の建築課（福井・三国・奥越・丹南・丹南の鯖江丹生土木部・敦賀・小浜）が扱う
// （県「建築確認申請、完了（中間）検査申請の受付窓口について」2026年3月17日更新）。
// 県は「福井県指定道路等閲覧システム」（wagmap fukuidouro）で、県が指定した位置指定道路（42条1項5号）の位置を公開している（福井市は対象外）。
// 南越前町・池田町・おおい町は都市計画区域も準都市計画区域も無い（県の位置指定道路の公開のページ）。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { sonicweb, wagmap } from "../vendors";

const pref = "福井県" as const;

const OFFICE: Record<string, Contact> = {
  fukui: { dept: "福井県 福井土木事務所 建築営繕課", phone: "0776-24-5179" },
  mikuni: { dept: "福井県 三国土木事務所 建築課", phone: "0776-82-1110" },
  okuetsu: { dept: "福井県 奥越土木事務所 建築課", phone: "0779-66-8138" },
  tannan: { dept: "福井県 丹南土木事務所 建築課", phone: "0778-23-4538" },
  sabae: { dept: "福井県 丹南土木事務所 鯖江丹生土木部 建築課", phone: "0778-34-0465" },
  tsuruga: { dept: "福井県 嶺南振興局 敦賀土木事務所 建築課", phone: "0770-22-5486" },
  obama: { dept: "福井県 嶺南振興局 小浜土木事務所 建築課", phone: "0770-56-5914" },
};

const AGREE = "最初に利用条件に同意する。";

/** 県の指定道路マップ（福井県指定道路等閲覧システム、wagmap）。県が指定した位置指定道路（42条1項5号）だけ。福井市は載らない */
const PREF_MAP: MapLink = {
  kind: "designated_only",
  label: "福井県指定道路等閲覧システム（県が指定した位置指定道路＝42条1項5号）",
  build: wagmap("fukuidouro", 1, { scale: 2500 }),
  verified: true,
  tip: `${AGREE}位置指定道路（5号）だけで、ほかの種別は土木事務所の建築課へ`,
};

const PREF_NOTE = "県が扱う市町（特定行政庁は福井県）。県の地図は位置指定道路（5号）だけ。道路種別は土木事務所の建築課へ。";

/** 県が扱う市町。県の指定道路マップに、市町の道路網図などがあれば添える */
const prefTown = (name: string, code: string, office: keyof typeof OFFICE, maps: MapLink[] = [], contactNote?: string): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [PREF_MAP, ...maps],
  contact: contactNote ? { ...OFFICE[office], note: contactNote } : OFFICE[office],
  note: PREF_NOTE,
});

/** 都市計画区域も準都市計画区域も無い町（県のページで「位置指定道路はありません」） */
const outsideTown = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: OFFICE[office],
  note: "全域が都市計画区域外（都市計画区域も準都市計画区域も無く、位置指定道路も無い。県の位置指定道路の公開のページ）。建築確認が要る規模と建築の扱いは土木事務所の建築課で確認。",
});

/** PDF の分割図で公開している入口ページ */
const sheets = (label: string, url: string, tip: string): MapLink => ({ kind: "public_road", label, build: null, url, verified: true, tip });

// --- 特定行政庁の福井市 -------------------------------------------------------------

const FUKUI_CITY: Municipality = {
  pref,
  name: "福井市",
  codes: ["18201"],
  coverage: "none",
  maps: [
    {
      // 位置指定道路の一覧表（PDF）。地図ではない（長野県の建設事務所の調書と同じ扱い）
      kind: "designated_only",
      label: "位置指定道路一覧表（PDF・1978年4月以降の指定、2020年3月末現在）",
      build: null,
      url: "https://www.city.fukui.lg.jp/kurasi/jutaku/kentikubutu/p021602.html",
      verified: true,
      tip: "地図ではない一覧表。道路の正確な位置は建築指導課の窓口で",
    },
    {
      kind: "public_road",
      label: "ふくいマップ（公開型GIS・市道の認定路線と幅員）",
      build: null,
      url: "https://webgis.alandis.jp/fukui18/portal/main/index.html",
      verified: false,
      tip: "海外の回線からは開けないため、物件の位置で開く形は未確認。地図の中で住所を探す。市道は監理課（0776-20-5555）",
    },
    sheets("市道認定路線図（旧福井市・PDF・図郭割図から図面を選ぶ）", "https://www.city.fukui.lg.jp/kurasi/koutu/douro/p071093.html", "2016年更新の PDF。2025年1月からは「ふくいマップ」が新しい"),
  ],
  contact: { dept: "建設部 建築指導課（本館5階）", phone: "0776-20-5574" },
  note: "特定行政庁。道路種別の地図はネット非公開で、県の指定道路マップにも福井市は載らない（福井市の位置指定道路は市長が指定）。",
};

// --- 県が扱う16市町 -----------------------------------------------------------------

const PREF_TOWNS: Municipality[] = [
  // 福井土木事務所
  prefTown("永平寺町", "18322", "fukui"),
  // 三国土木事務所
  prefTown("坂井市", "18210", "mikuni", [
    {
      // 坂井市WebMap（地理院地図と同じ作りの Leaflet）。#ズーム/緯度/経度/ と ls= の shidou で市道の認定路線網図を重ねて開く
      kind: "public_road",
      label: "認定路線網図（坂井市WebMap・2013年3月時点の市道）",
      build: (lat, lng) => `https://www.city.fukui-sakai.lg.jp/webmap/index.html#17/${lat.toFixed(6)}/${lng.toFixed(6)}/&base=std&ls=std%7Cshidou&disp=11`,
      verified: true,
      tip: "2013年3月時点の認定路線で最新ではない。最新は建設課（0776-50-3051）へ",
    },
  ]),
  prefTown("あわら市", "18208", "mikuni", [
    sheets("市道認定路線図（PDF・索引図と01〜19、2026年2月時点）", "https://www.city.awara.lg.jp/mokuteki/life/life0701/p013276.html", "幅員は載っていない。建設課の窓口か電話で"),
  ]),
  // 奥越土木事務所
  prefTown("大野市", "18205", "okuetsu", [
    sheets(
      "市道認定路線図（PDF・索引図から図面を選ぶ、2024年4月1日時点）",
      "https://www.city.ono.fukui.jp/kurashi/douro-kotsu/kansendouro/shidoumouzu.html",
      "図の番号は管理番号で、市道名は名称一覧表で照合。幅員は載っていない。建設整備課は電話では答えない（窓口・FAX・メール）",
    ),
  ]),
  prefTown("勝山市", "18206", "okuetsu"),
  // 丹南土木事務所（南越前町・池田町は区域外）
  prefTown("越前市", "18209", "tannan", [
    {
      // 越前市ぐるぐるマップ（Sonicweb）の市道網図（テーマ th_7）。海外からは開けないので中心一致は未確認
      kind: "public_road",
      label: "市道網図（越前市ぐるぐるマップ）",
      build: sonicweb("echizen2", "th_7"),
      verified: false,
      tip: "海外からは開けないので中心一致は未確認。都市整備課（0778-22-3010）",
    },
  ]),
  outsideTown("池田町", "18382", "tannan"),
  outsideTown("南越前町", "18404", "tannan"),
  // 丹南土木事務所 鯖江丹生土木部
  prefTown("鯖江市", "18207", "sabae", [
    sheets("鯖江市市道路線網図（PDF・2026年4月1日現在）", "https://www.city.sabae.fukui.jp/kurashi_tetsuduki/doro_kasen_koen/dorokoji/Dobokusidou.html", "路線番号を路線名リストで照合。管理幅員は土木課（0778-53-2246）へ"),
  ]),
  prefTown("越前町", "18423", "sabae"),
  // 嶺南振興局 敦賀土木事務所（若狭町は旧三方町の地域）
  prefTown("敦賀市", "18202", "tsuruga", [
    { kind: "public_road", label: "認定路線網図（つるがマップ・市道の認定路線と境界明示）", build: wagmap("tsuruga", 10, { scale: 2500 }), verified: true, tip: AGREE },
    { kind: "public_road", label: "道路台帳（つるがマップ）", build: wagmap("tsuruga", 12, { scale: 2500 }), verified: true, tip: AGREE },
  ]),
  prefTown("美浜町", "18442", "tsuruga"),
  prefTown("若狭町", "18501", "tsuruga", [], "旧三方町の地域。旧上中町の地域は小浜土木事務所 建築課（0770-56-5914）"),
  // 嶺南振興局 小浜土木事務所（おおい町は区域外）
  prefTown("小浜市", "18204", "obama"),
  prefTown("高浜町", "18481", "obama"),
  outsideTown("おおい町", "18483", "obama"),
];

export const FUKUI: Municipality[] = [FUKUI_CITY, ...PREF_TOWNS];
