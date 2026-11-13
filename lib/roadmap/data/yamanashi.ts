// 山梨県 全27市町村（2026-11 調査）。出典は docs/yamanashi-research.md。
// 特定行政庁は山梨県と甲府市だけ（富士吉田市の限定特定行政庁は2015年3月末で廃止）。甲府市以外の26市町村の道路種別は県の4建設事務所
// （中北・峡東・峡南・富士・東部）が扱い、指定道路図（4号・5号・2項）は県GIS「まっぷDE山梨」に建設事務所ごとの地図として公開されている。
// 北杜市・早川町・南部町・道志村・鳴沢村・小菅村・丹波山村は全域が都市計画区域外（県の都市計画区域マスタープランの区域の市町村に無い）。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { geocloud, geocloudMp, wagmap } from "../vendors";

const pref = "山梨県" as const;

/**
 * まっぷDE山梨（県GIS、geocloud 旧版）の「建築基準法指定道路図」。建設事務所ごとに地図が分かれ、凡例はどれも 4号・5号・2項道路だけ。
 * URL の形は県のポータルのリンク（?p=0&bt=0&mp=502-125&）と同じだが、地図の画面は海外からの自動ブラウザに空の応答（202）を返すため中心一致は未確認
 */
const prefRoadMap = (office: string, mp: string): MapLink => ({
  kind: "designated_only",
  label: `山梨県 建築基準法指定道路図（まっぷDE山梨・${office}・4号/5号/2項のみ）`,
  build: geocloud("https://gis.pref.yamanashi.jp/webgis/", `mp=${mp}&bt=0`),
  verified: false,
  tip: "最初に利用規約に同意する。1号（公道）などは載っていない",
});

const OFFICE: Record<string, { contact: Contact; map: MapLink }> = {
  chuhoku: { contact: { dept: "山梨県 中北建設事務所 建築課", phone: "055-224-1674" }, map: prefRoadMap("中北建設事務所", "502-125") },
  kyoto: { contact: { dept: "山梨県 峡東建設事務所 都市計画・建築課", phone: "0553-20-2718" }, map: prefRoadMap("峡東建設事務所", "500-61") },
  kyonan: { contact: { dept: "山梨県 峡南建設事務所 都市計画・建築課 建築住宅担当", phone: "055-240-4133" }, map: prefRoadMap("峡南建設事務所", "501-31") },
  fujitobu: { contact: { dept: "山梨県 富士・東部建設事務所 都市計画・建築課", phone: "0554-22-7817" }, map: prefRoadMap("富士・東部建設事務所", "503-67") },
};

const PREF_NOTE = "県の地図は指定道路（4号・5号・2項）だけ。公道（1号）かどうかと色の無い道は建設事務所で確認。";

/** 県が扱う市町村（建設事務所の管内）。県GISの指定道路図が見られる */
const prefTown = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [OFFICE[office].map],
  contact: OFFICE[office].contact,
  note: PREF_NOTE,
});

/** 全域が都市計画区域外の市町村（県の都市計画区域マスタープラン・都市計画総括図の12区域のどれにも入らない） */
const outsideTown = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: OFFICE[office].contact,
  note: "全域が都市計画区域外（県の資料）。建築基準法6条1項4号の知事指定区域の有無と建築の扱いは建設事務所で確認。",
});

// --- 特定行政庁の甲府市 ------------------------------------------------------------

const KOFU: Municipality = {
  pref,
  name: "甲府市",
  codes: ["19201"],
  coverage: "none",
  // 道路種別はネット非公開。こうふMAP（geocloud 新版）に市道の認定路線情報（地図 329）と道路台帳平面図（地図 339）
  maps: [
    { kind: "public_road", label: "甲府市道認定路線情報（こうふMAP）", build: geocloudMp("kofu.geocloud.jp", 329), verified: true },
    { kind: "public_road", label: "甲府市道路台帳平面図（こうふMAP）", build: geocloudMp("kofu.geocloud.jp", 339), verified: true },
  ],
  contact: {
    dept: "まちづくり部 まち開発室 建築指導課 審査係（本庁舎7階）",
    phone: "055-237-5824",
    note: "道路種別は「道路相談カード」と案内図・公図の写し・現況図を持って窓口へ。回答は2週間程度（長い道は約1か月）",
    noPhoneInquiry: true,
  },
  note: "道路種別の地図はネット非公開。市道かどうかはこうふMAPの認定路線情報で見る。",
};

// --- 県が扱う26市町村 ----------------------------------------------------------------

const PREF_TOWNS: Municipality[] = [
  // 中北建設事務所
  prefTown("韮崎市", "19207", "chuhoku"),
  prefTown("南アルプス市", "19208", "chuhoku"),
  outsideTown("北杜市", "19209", "chuhoku"),
  prefTown("甲斐市", "19210", "chuhoku"),
  prefTown("中央市", "19214", "chuhoku"),
  prefTown("昭和町", "19384", "chuhoku"),
  // 峡東建設事務所
  prefTown("山梨市", "19205", "kyoto"),
  {
    // 笛吹市の「ふえふきわが街ガイドマップ」（wagmap）に市道の路線網図（mid=4）
    ...prefTown("笛吹市", "19211", "kyoto"),
    maps: [OFFICE.kyoto.map, { kind: "public_road", label: "路線網図（ふえふきわが街ガイドマップ・市道）", build: wagmap("fuefuki", 4), verified: true }],
  },
  prefTown("甲州市", "19213", "kyoto"),
  // 峡南建設事務所
  prefTown("市川三郷町", "19346", "kyonan"),
  outsideTown("早川町", "19364", "kyonan"),
  prefTown("身延町", "19365", "kyonan"),
  outsideTown("南部町", "19366", "kyonan"),
  prefTown("富士川町", "19368", "kyonan"),
  // 富士・東部建設事務所
  prefTown("富士吉田市", "19202", "fujitobu"),
  prefTown("都留市", "19204", "fujitobu"),
  prefTown("大月市", "19206", "fujitobu"),
  prefTown("上野原市", "19212", "fujitobu"),
  outsideTown("道志村", "19422", "fujitobu"),
  prefTown("西桂町", "19423", "fujitobu"),
  prefTown("忍野村", "19424", "fujitobu"),
  prefTown("山中湖村", "19425", "fujitobu"),
  outsideTown("鳴沢村", "19429", "fujitobu"),
  prefTown("富士河口湖町", "19430", "fujitobu"),
  outsideTown("小菅村", "19442", "fujitobu"),
  outsideTown("丹波山村", "19443", "fujitobu"),
];

export const YAMANASHI: Municipality[] = [KOFU, ...PREF_TOWNS];
