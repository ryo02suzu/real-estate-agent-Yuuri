// 石川県 全19市町（2026-11 調査）。出典は docs/ishikawa-research.md。
// 特定行政庁は石川県と金沢・七尾・小松・加賀・白山・野々市の6市。能美市は限定特定行政庁（2007年4月1日から。主に木造2階建てまでの住宅の確認と
// 道路位置指定の事務は市、ほかの建物は県）。残り12市町は県の4土木事務所の建築課（南加賀・津幡・中能登・奥能登）が扱う
// （県「建築基準法の施行に関すること」の個別物件の相談窓口、2025年8月7日更新）。
// 道路種別の地図は金沢市（まちづくり支援情報システム）・小松市（こまっぷ）・能美市（わがまちガイドマップ）が wagmap で公開。県は指定道路図をネットに出していない。
// 宝達志水町・中能登町は都市計画区域が無い（県の都市計画区域は17市町。中能登地域の広域都市圏マスタープランも「2市3町のうち3市町」）。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { sonicweb, wagmap } from "../vendors";

const pref = "石川県" as const;

const OFFICE: Record<string, Contact> = {
  minamikaga: { dept: "石川県 南加賀土木総合事務所 建築課", phone: "0761-21-3333" },
  tsubata: { dept: "石川県 津幡土木事務所 建築課", phone: "076-289-4162" },
  nakanoto: { dept: "石川県 中能登土木総合事務所 建築課", phone: "0767-52-7604" },
  okunoto: { dept: "石川県 奥能登土木総合事務所 建築課", phone: "0768-26-2353" },
};

const PREF_NOTE = "県が扱う市町（特定行政庁は石川県）。県は指定道路図をネットに出していない。道路種別は土木事務所の建築課へ。";

/** 県が扱う市町。市町の道路網図などがあれば添える */
const prefTown = (name: string, code: string, office: keyof typeof OFFICE, maps: MapLink[] = [], extra = ""): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps,
  contact: OFFICE[office],
  note: PREF_NOTE + extra,
});

/** 都市計画区域の無い町（県の17市町の都市計画区域に入っていない） */
const outsideTown = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: OFFICE[office],
  note: "全域が都市計画区域外（県の都市計画区域は17市町で、この町は入っていない）。建築確認が要る規模と建築の扱いは土木事務所の建築課で確認。",
});

/** PDF の分割図で公開している入口ページ */
const sheets = (label: string, url: string, tip: string): MapLink => ({ kind: "public_road", label, build: null, url, verified: true, tip });

const AGREE = "最初に利用条件に同意する。";

// --- 特定行政庁の6市と、限定特定行政庁の能美市 --------------------------------------

const KANAZAWA: Municipality = {
  pref,
  name: "金沢市",
  codes: ["17201"],
  coverage: "partial",
  maps: [
    {
      // まちづくり支援情報システム（wagmap）の「建築基準関係道路等情報」（mid=10）。地図の説明は「国道、県道、市道、位置指定道路等の情報」。
      // 凡例は国道・県道・市道・位置指定道路・開発行為による道路・既存道路・42条1項4号道路・道路扱いせず。2項道路の凡例は無い
      kind: "road_type",
      label: "建築基準関係道路等情報（金沢市まちづくり支援情報システム・国道/県道/市道と位置指定道路・開発行為による道路・既存道路・4号道路）",
      build: wagmap("kanazawa-mss", 10, { scale: 2500 }),
      verified: true,
      tip: `${AGREE}2項道路の凡例は無い。種別の確かめは建築指導課 宅地係へ`,
    },
    { kind: "public_road", label: "道路台帳情報（金沢市まちづくり支援情報システム・市道の路線網図と路線名）", build: wagmap("kanazawa-mss", 5, { scale: 2500 }), verified: true, tip: AGREE },
  ],
  contact: { dept: "都市整備局 建築指導課 宅地係", phone: "076-220-2329", note: "道路の相談・道路調査・道路位置指定の担当。建築指導課の指導係は 076-220-2326" },
  note: "特定行政庁。市の「位置指定道路について」のページが、建築基準法上の道路種別などをまちづくり支援情報システムで調べられると案内している。",
};

const NANAO: Municipality = {
  pref,
  name: "七尾市",
  codes: ["17202"],
  coverage: "none",
  maps: [],
  contact: { dept: "建設部 都市建築課 建築行政グループ（本庁2階）", phone: "0767-53-8429", note: "申請と事前の相談は原則、午前9時から正午まで" },
  note: "特定行政庁。道路種別の地図も市道の地図もネットで見つからない。道路位置指定は都市建築課 建築行政グループ。",
};

const KOMATSU: Municipality = {
  pref,
  name: "小松市",
  codes: ["17203"],
  coverage: "full",
  maps: [
    {
      // 地図情報サービス こまっぷ（wagmap）の「道路」（mid=2）。最初は市道の道路網図なので、mtl=204 で「道路（建築基準法 4m未満は2項道路）」を出す。
      // 凡例は第一号〜第五号・第三号、第五号に準ずるもの・法第86条第2項
      kind: "road_type",
      label: "道路（建築基準法・こまっぷ・第一号〜第五号/第三号・第五号に準ずるもの/法第86条第2項）",
      build: wagmap("komatsu", 2, { scale: 2500, extra: "&mtl=204" }),
      verified: true,
      tip: `${AGREE}地図の注記のとおり、幅4m未満の道路は2項道路。左の表示切替で「道路網図（市道）」にすると市道の路線名`,
    },
  ],
  contact: { dept: "都市創造部 建築住宅課", phone: "0761-24-8105" },
  note: "特定行政庁。市の「建築基準法上の道路種別」のページが、建築基準法の道路の路線網図を「こまっぷ」で見られると案内している（2024年4月1日更新）。",
};

const KAGA: Municipality = {
  pref,
  name: "加賀市",
  codes: ["17206"],
  coverage: "none",
  // 加賀市地理情報システム（Sonicweb）の市道路線網図（テーマ th_29）。海外からは開けないので中心一致は未確認
  maps: [{ kind: "public_road", label: "市道路線網図（加賀市地理情報システム・市道の路線名）", build: sonicweb("kaga", "th_29"), verified: false, tip: "海外からは開けないので中心一致は未確認。市道は土木課（0761-72-7931）" }],
  contact: { dept: "建設部 建築課 建築指導室", phone: "0761-72-7935" },
  note: "特定行政庁。道路種別の地図はネット非公開。位置指定道路の申請・相談は建築指導室。",
};

const HAKUSAN: Municipality = {
  pref,
  name: "白山市",
  codes: ["17210"],
  coverage: "none",
  maps: [
    { kind: "public_road", label: "市道路線網図（白山市わが街ガイドマップ）", build: wagmap("hakusan", 3, { scale: 2500 }), verified: true, tip: AGREE },
    { kind: "public_road", label: "道路台帳附図（白山市わが街ガイドマップ）", build: wagmap("hakusan", 4, { scale: 2500 }), verified: true, tip: AGREE },
  ],
  contact: { dept: "建設部 建築住宅課", phone: "076-274-9561" },
  note: "特定行政庁。道路種別の地図はネット非公開。道路位置指定は白山市道路位置指定指導要綱で建築住宅課。",
};

const NOMI: Municipality = {
  pref,
  name: "能美市",
  codes: ["17211"],
  coverage: "partial",
  maps: [
    {
      // 能美市わがまちガイドマップ（wagmap）の「道路情報」（mid=5）。最初は市道なので、mtl=49 で「建築基準法道路」を出す。
      // 凡例は1号国道・1号県道・1号市道・2号道路・3号道路・5号道路・2項道路（4号は無い）
      kind: "road_type",
      label: "建築基準法道路（能美市わがまちガイドマップ・1号〜3号/5号/2項）",
      build: wagmap("nomi", 5, { scale: 2500, extra: "&mtl=49" }),
      verified: true,
      tip: `${AGREE}4号道路は凡例に無い。左の表示切替で「市道」にすると市道の地図`,
    },
  ],
  contact: { dept: "土木部 まち整備課（寺井分室1階）", phone: "0761-58-2251", note: "窓口の受付は午前9時から正午まで" },
  note: "限定特定行政庁（2007年4月1日から。主に木造2階建てまでの住宅の確認と道路位置指定の事務は市、ほかの建物は県の南加賀土木総合事務所 建築課 0761-21-3333）。",
};

const NONOICHI: Municipality = {
  pref,
  name: "野々市市",
  codes: ["17212"],
  coverage: "none",
  maps: [
    sheets(
      "道路台帳附図（PDF・路線網図で図面番号を確かめて開く）",
      "https://www.city.nonoichi.lg.jp/soshiki/29/48334.html",
      "道路法の道路区域で、境界を示すものではない（年1回4月更新）。電話では答えないので土木課 道路係（076-227-6086）の窓口で",
    ),
  ],
  contact: { dept: "土木部 建築住宅課 建築指導係", phone: "076-227-6136" },
  note: "特定行政庁。道路種別の地図はネット非公開。道路の位置指定の申請は建築住宅課（建築指導係）。",
};

// --- 県が扱う12市町 ----------------------------------------------------------------

const PREF_TOWNS: Municipality[] = [
  // 南加賀土木総合事務所（能美市の大きな建物も）
  prefTown("川北町", "17324", "minamikaga"),
  // 津幡土木事務所
  prefTown("かほく市", "17209", "tsubata", [
    sheets("かほく市道路線網図（PDF・市道の路線名、約41MB）", "https://www.city.kahoku.lg.jp/005/529/534/d000161.html", "路線名だけ。幅員などは都市建設課（076-283-7104）へ"),
  ]),
  prefTown("津幡町", "17361", "tsubata"),
  prefTown("内灘町", "17365", "tsubata"),
  // 中能登土木総合事務所
  prefTown("羽咋市", "17207", "nakanoto"),
  prefTown("志賀町", "17384", "nakanoto", [
    sheets(
      "町道路線網図（PDF・志賀地区と富来地区の地区ごとの図、2022年11月時点）",
      "https://www.town.shika.lg.jp/page/2213.html",
      "路線一覧と地区の図。幅員・境界・最新の認定はまち整備課（0767-32-9212）の窓口で",
    ),
  ]),
  outsideTown("宝達志水町", "17386", "nakanoto"),
  outsideTown("中能登町", "17407", "nakanoto"),
  // 奥能登土木総合事務所
  prefTown("輪島市", "17204", "okunoto", [
    sheets(
      "輪島市道路線網図（PDF・図郭割図で図面番号を選ぶ、2023年3月現在）",
      "https://www.city.wajima.ishikawa.jp/docs/2024080100014/",
      "路線名と路線番号だけ。幅員は土木課（0768-23-1151）へ",
    ),
  ]),
  prefTown("珠洲市", "17205", "okunoto"),
  prefTown("穴水町", "17461", "okunoto"),
  prefTown("能登町", "17463", "okunoto"),
];

export const ISHIKAWA: Municipality[] = [KANAZAWA, NANAO, KOMATSU, KAGA, HAKUSAN, NOMI, NONOICHI, ...PREF_TOWNS];
