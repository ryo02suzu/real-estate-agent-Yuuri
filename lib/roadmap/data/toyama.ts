// 富山県 全15市町村（2026-11 調査）。出典は docs/toyama-research.md。
// 特定行政庁は富山市・高岡市と富山県。残り13市町村は県の4土木センター 建築課（新川・富山・高岡・砺波）が扱う。
// 県は2025年4月から「富山県指定道路図」（位置指定道路＝42条1項5号の大まかな位置。富山市・高岡市は載らない）を富山データ連携基盤で公開。
// 15市町村すべてに都市計画区域がある（県の14都市計画区域）。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { geogeo, wagmap } from "../vendors";

const pref = "富山県" as const;

const OFFICE: Record<string, Contact> = {
  niikawa: { dept: "富山県 新川土木センター 建築課", phone: "0765-22-9117" },
  toyama: { dept: "富山県 富山土木センター 建築課", phone: "076-444-4449" },
  takaoka: { dept: "富山県 高岡土木センター 建築課", phone: "0766-26-8426" },
  tonami: { dept: "富山県 砺波土木センター 建築課", phone: "0763-22-6271" },
};

/** 県の指定道路図（富山データ連携基盤）。座標では開けないので地図の中で探す */
const PREF_MAP: MapLink = {
  kind: "designated_only",
  label: "富山県指定道路図（富山データ連携基盤・位置指定道路＝42条1項5号の大まかな位置）",
  build: null,
  url: "https://publicsite.tdcp.pref.toyama.jp/panel/1741240937690",
  verified: false,
  tip: "座標では開けないので地図の中で住所を探す。参考図で載っていない道路もあり、取引や確認申請には使えない。詳しくは土木センターの建築課へ",
};

const PREF_NOTE = "県が扱う市町村（特定行政庁は富山県）。県の指定道路図は位置指定道路（5号）の大まかな位置だけ。道路種別は土木センターの建築課へ（窓口相談は予約制）。";

const prefTown = (name: string, code: string, office: keyof typeof OFFICE, maps: MapLink[] = [], extra = ""): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [PREF_MAP, ...maps],
  contact: OFFICE[office],
  note: PREF_NOTE + extra,
});

/** PDF の分割図で公開している入口ページ */
const sheets = (label: string, url: string, tip: string): MapLink => ({ kind: "public_road", label, build: null, url, verified: true, tip });

// --- 特定行政庁の2市 ---------------------------------------------------------

const TOYAMA_CITY: Municipality = {
  pref,
  name: "富山市",
  codes: ["16201"],
  coverage: "none",
  maps: [{ kind: "public_road", label: "路線網図（インフォマップとやま・市道の認定区間）", build: wagmap("toyama", 21, { scale: 2500 }), verified: true, tip: "最初に利用条件に同意する。認定幅員は載っていない（道路河川管理課 076-443-2220 の窓口で）" }],
  contact: { dept: "活力都市創造部 建築指導課 建築指導係（市役所東館6階）", phone: "076-443-2107", noPhoneInquiry: true, note: "道路の取扱いは電話では答えず、建築指導課の窓口で確認" },
  note: "特定行政庁。道路種別の地図はネット非公開。県の指定道路図にも富山市は載らない。",
};

const TAKAOKA: Municipality = {
  pref,
  name: "高岡市",
  codes: ["16202"],
  coverage: "none",
  maps: [sheets("高岡市道路網図（PDF・索引図から分割図を開く、2024年4月1日現在）", "https://www.city.takaoka.toyama.jp/soshiki/dobokuijika/2/4/2/4192.html", "路線番号と路線名。幅員は土木維持課（0766-20-1389）へ")],
  contact: { dept: "建築政策課", phone: "0766-20-1429" },
  note: "特定行政庁。道路種別の地図はネット非公開。県の指定道路図にも高岡市は載らない。県道は県のGIS、市道は市の道路網図で。",
};

// --- 県が扱う13市町村 ----------------------------------------------------------

const PREF_TOWNS: Municipality[] = [
  // 新川土木センター
  prefTown("魚津市", "16204", "niikawa", [sheets("魚津市市道網図（PDF 2枚と市道名一覧表）", "https://www.city.uozu.toyama.jp/faq/svFaqDtl.aspx?servno=226", "太い線が市道。地図は最新ではない。建設課 0765-23-1028")]),
  prefTown("滑川市", "16206", "niikawa", [{ kind: "public_road", label: "道路台帳情報（なめりかわデジタルマップ・路線名・延長・幅員）", build: wagmap("namerikawacity", 7, { scale: 2500 }), verified: true, tip: "最初に利用条件に同意する" }]),
  prefTown("黒部市", "16207", "niikawa"),
  prefTown("入善町", "16342", "niikawa"),
  prefTown("朝日町", "16343", "niikawa"),
  // 富山土木センター
  prefTown("舟橋村", "16321", "toyama"),
  prefTown("上市町", "16322", "toyama"),
  prefTown("立山町", "16323", "toyama"),
  // 高岡土木センター
  prefTown("氷見市", "16205", "takaoka"),
  prefTown("小矢部市", "16209", "takaoka"),
  prefTown("射水市", "16211", "takaoka"),
  // 砺波土木センター
  prefTown("砺波市", "16208", "tonami", [
    {
      kind: "public_road",
      label: "砺波市道路網図（Google マイマップ・認定路線網図、2025年3月）",
      build: (lat, lng) => `https://www.google.com/maps/d/viewer?mid=1kE1n5Zls8Cn5RRjPi5c0IcsbckU&ll=${lat.toFixed(6)},${lng.toFixed(6)}&z=17`,
      verified: true,
      tip: "市のオープンデータの案内から。路線名は線を押して見る",
    },
  ]),
  prefTown("南砺市", "16210", "tonami", [{ kind: "public_road", label: "道路（なんとデジマップ・国道/県道/市道1級・2級・その他）", build: geogeo("https://nanto.geogeo.jp", 0, 7), verified: true, tip: "線を押すと路線の名称・番号・起終点" }]),
];

export const TOYAMA: Municipality[] = [TOYAMA_CITY, TAKAOKA, ...PREF_TOWNS];
