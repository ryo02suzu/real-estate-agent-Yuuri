// 新潟県 全30市町村（2026-11 調査）。出典は docs/niigata-research.md。
// 特定行政庁は新潟・長岡・上越・柏崎・三条・新発田の6市（県の「建築課の所管区域」）。残り24市町村は県の地域振興局 地域整備部 建築課
// （新発田・新潟・三条・長岡・南魚沼・上越・佐渡）が扱う。県も市も「全種別の指定道路図」は出しておらず、位置指定道路（5号）や2項道路の地図を
// 市の公開型GIS（geogeo・wagmap・ArcGIS）で出す市がある。出雲崎町・津南町・刈羽村・関川村・粟島浦村は都市計画区域が無い（県の開発許可権者一覧 2026年3月1日現在）。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { arcgisExperience, arcgisWebApp, geogeo, wagmap } from "../vendors";

const pref = "新潟県" as const;

const OFFICE: Record<string, Contact> = {
  shibata: { dept: "新潟県 新発田地域振興局 地域整備部 建築課", phone: "0254-26-9199" },
  niigata: { dept: "新潟県 新潟地域振興局 地域整備部 建築課", phone: "025-273-3204" },
  sanjo: { dept: "新潟県 三条地域振興局 地域整備部 建築課", phone: "0256-36-2319" },
  nagaoka: { dept: "新潟県 長岡地域振興局 地域整備部 建築課", phone: "0258-38-2625" },
  minamiuonuma: { dept: "新潟県 南魚沼地域振興局 地域整備部 建築課", phone: "025-772-3958" },
  joetsu: { dept: "新潟県 上越地域振興局 地域整備部 建築課", phone: "025-526-9529" },
  sado: { dept: "新潟県 佐渡地域振興局 地域整備部 建築課", phone: "0259-74-3339" },
};

const PREF_NOTE = "県が扱う市町村（特定行政庁は新潟県）。県は指定道路図をネットに出していない。道路種別は地域振興局の建築課へ（指定道路調書は建築課で閲覧できる）。";

/** 県が扱う市町村。市の道路網図などがあれば添える */
const prefTown = (name: string, code: string, office: keyof typeof OFFICE, maps: MapLink[] = [], extra = ""): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps,
  contact: OFFICE[office],
  note: PREF_NOTE + extra,
});

/** 都市計画区域の無い町村（県の開発許可権者一覧で都市計画区域が「－」） */
const outsideTown = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: OFFICE[office],
  note: "全域が都市計画区域外（県の開発許可権者一覧（2026年3月1日現在）で都市計画区域が「－」）。建築確認が要る規模と建築の扱いは地域振興局の建築課で確認。",
});

/** PDF の分割図で公開している入口ページ */
const sheets = (label: string, url: string, tip: string): MapLink => ({ kind: "public_road", label, build: null, url, verified: true, tip });

/** geogeo の公開型GIS の市道の地図 */
const geo = (label: string, base: string, lid: number, mid: number, tip?: string): MapLink => ({ kind: "public_road", label, build: geogeo(base, lid, mid), verified: true, tip });

// --- 特定行政庁の6市 ---------------------------------------------------------

const NIIGATA_CITY: Municipality = {
  pref,
  name: "新潟市",
  codes: ["15101", "15102", "15103", "15104", "15105", "15106", "15107", "15108"],
  coverage: "partial",
  maps: [
    {
      kind: "designated_only",
      label: "指定道路情報（にいがたeマップ・位置指定道路＝42条1項5号のみ）",
      build: geogeo("https://niigata.e-map.geogeo.jp", 0, 15),
      verified: true,
      tip: "位置指定道路だけ。ほかの種別は建築行政課に照会する",
    },
    geo("道路（にいがたeマップ・国道/県道/市道の区分と道路台帳）", "https://niigata.e-map.geogeo.jp", 0, 9, "最初に利用規約に同意する。市道の名称や幅員は各区役所の建設課へ"),
  ],
  contact: {
    dept: "建築部 建築行政課 監察指導係（古町ルフル6階）",
    phone: "025-226-2845",
    noPhoneInquiry: true,
    note: "道路種別の照会は窓口・FAX（025-229-5190）・メール（kenchiku@city.niigata.lg.jp）で。住宅地図など道路の位置が分かる資料を添える。未判定の道は道路調査依頼書で",
  },
  note: "特定行政庁。電話では場所を取り違えるおそれがあるため、道路種別の照会は電話では受けない。",
};

const NAGAOKA: Municipality = {
  pref,
  name: "長岡市",
  codes: ["15202"],
  coverage: "partial",
  maps: [
    {
      kind: "road_type",
      label: "建築基準法上の道路（ながおか便利地図・道路情報。2号/3号/5号/2項と市道網図）",
      build: wagmap("nagaoka", 181, { scale: 2500 }),
      verified: true,
      tip: "最初に利用条件に同意する。1号（国道・県道・市道）と4号は載っていない。地図に無い道や該当しない道は建築・開発審査課へ",
    },
  ],
  contact: { dept: "都市整備部 建築・開発審査課（大手通庁舎）", phone: "0258-39-2226" },
  note: "特定行政庁。最新の情報は建築・開発審査課に直接確認する。市道は道路管理課、国道・県道は長岡国道事務所と県の長岡地域振興局。",
};

const JOETSU: Municipality = {
  pref,
  name: "上越市",
  codes: ["15222"],
  coverage: "partial",
  maps: [
    {
      kind: "designated_only",
      label: "道路・建設（eマップじょうえつ・位置指定道路と市道網図）",
      build: geogeo("https://joetsu.geogeo.jp", 2, 20),
      verified: true,
      tip: "最初に利用規約に同意し、レイヤで「位置指定道路」をオンにする（最初は市道網図だけ）。旧上越市は道路台帳横断面図も",
    },
  ],
  contact: { dept: "建築住宅課 指導係", phone: "025-520-5783" },
  note: "特定行政庁。前面道路が4m未満や公図上の赤道など道路種別に疑問があるときは指導係へ。市道網図は道路課（025-520-5769）。",
};

const KASHIWAZAKI: Municipality = {
  pref,
  name: "柏崎市",
  codes: ["15205"],
  coverage: "partial",
  maps: [
    {
      kind: "road_type",
      label: "指定道路図（まちナビ柏崎・位置指定道路/2項道路）",
      build: arcgisExperience("0e686a1a7bae470c820d1327324c0b76", "widget_6"),
      verified: true,
      tip: "道路を押すと指定道路調書（PDF）が開く。証明には使えないので建築住宅課の窓口で確かめる",
      // 市が CC BY 2.1 JP で公開しているデータ（位置指定道路は 2020年3月30日時点、2項道路は 2020年5月7日時点）。
      // 載っているのはこの2種別だけ（1号〜4号は市の地図にも無い）。色は市の地図の線の色
      read: {
        layers: [
          { url: "https://services1.arcgis.com/XlTFoh9FvQbdpw6d/arcgis/rest/services/位置指定道路_NEW/FeatureServer/0", label: "位置指定道路（法第42条第1項第5号。2020年3月30日時点）", color: "#ffaa00" },
          { url: "https://services1.arcgis.com/XlTFoh9FvQbdpw6d/arcgis/rest/services/法第42項道路_NEW20200507/FeatureServer/0", label: "法第42条第2項道路（2020年5月7日時点）", color: "#00c5ff" },
        ],
      },
    },
    { kind: "public_road", label: "柏崎市道（まちナビ柏崎・市道路線図）", build: arcgisWebApp("kashiwazaki.maps.arcgis.com", "4349877834834b94a74debf2267e4857"), verified: true },
  ],
  contact: { dept: "都市整備部 建築住宅課 審査係", phone: "0257-21-2291" },
  note: "特定行政庁。地図があるのは位置指定道路と2項道路だけで、1号〜4号は載っていない。",
};

const SANJO: Municipality = {
  pref,
  name: "三条市",
  codes: ["15204"],
  coverage: "none",
  maps: [
    {
      kind: "public_road",
      label: "三条市都市計画情報公開システム（道路台帳平面図・三条地域と栄・下田地域の一部）",
      build: null,
      url: "https://portalsite-kensetusanjo.hub.arcgis.com/",
      verified: false,
      tip: "ArcGIS Hub の入口。市道名と幅員が分かる（2023年12月から）",
    },
  ],
  contact: { dept: "建設部 建築課 審査指導係", phone: "0256-34-5727", noPhoneInquiry: true, note: "道路位置指定は位置図と公図を持って窓口へ（原則、電話では答えない）" },
  note: "特定行政庁。市道かどうかは建設課 建設管理係（0256-34-5717）、4m未満の道や位置指定道路は建築課、都市計画道路（2号）は建設課 計画整備係（0256-34-5714）。",
};

const SHIBATA: Municipality = {
  pref,
  name: "新発田市",
  codes: ["15206"],
  coverage: "partial",
  maps: [
    {
      kind: "designated_only",
      label: "位置指定道路情報（新発田市市民公開地理情報システム）",
      build: geogeo("https://gisshibatamap.geogeo.jp", 1, 11),
      verified: true,
      tip: "最初に利用規約に同意する。指定道路の線と幅員",
    },
    geo("市道情報（新発田市市民公開地理情報システム・道路網図は豊浦・加治川地区、道路台帳要素）", "https://gisshibatamap.geogeo.jp", 1, 8, "最初に利用規約に同意する"),
  ],
  contact: { dept: "建築課 建築審査係（地域整備庁舎2階）", phone: "0254-26-3557" },
  note: "特定行政庁。市道の認定は地域整備課（0254-26-3556）。",
};

// --- 県が扱う24市町村 ----------------------------------------------------------

const MYOKO: Municipality = {
  pref,
  name: "妙高市",
  codes: ["15217"],
  coverage: "partial",
  maps: [
    {
      kind: "road_type",
      label: "道路（e-みょうこうマップ・道路位置指定図と建基法第42条2項道路図のレイヤ）",
      build: geogeo("https://myokomap.geogeo.jp", 1, 6),
      verified: true,
      tip: "レイヤで「道路位置指定図」「建基法第42条2項道路図」をオンにする（最初は国県道と市道網図だけ）。1号〜4号は載っていない",
    },
  ],
  contact: OFFICE.joetsu,
  note: `${PREF_NOTE}市の地図に位置指定道路と2項道路の図がある。`,
};

const PREF_TOWNS: Municipality[] = [
  // 新発田地域振興局
  prefTown("村上市", "15212", "shibata"),
  prefTown("阿賀野市", "15223", "shibata", [sheets("阿賀野市市道網図（PDF・地区別5枚、2025年度版）", "https://www.city.agano.niigata.jp/soshiki/kensetsuka/doro_kotsu/2391.html", "市道かどうかと路線番号。幅員は道路台帳附図のページで")]),
  prefTown("胎内市", "15227", "shibata"),
  prefTown("聖籠町", "15307", "shibata"),
  outsideTown("関川村", "15581", "shibata"),
  outsideTown("粟島浦村", "15586", "shibata"),
  // 新潟地域振興局
  prefTown("五泉市", "15218", "niigata", [sheets("五泉市道路網図（PDF 6枚と路線名一覧表、2026年3月31日現在）", "https://www.city.gosen.lg.jp/organization/14/7/2/859.html", "網図で路線番号を見て一覧表で路線名を引く。市道の区域は正確ではない")]),
  prefTown("阿賀町", "15385", "niigata"),
  // 三条地域振興局
  prefTown("加茂市", "15209", "sanjo"),
  prefTown("燕市", "15213", "sanjo", [], "市の地図（つばめNavi）に道路の地図は無い。"),
  prefTown("弥彦村", "15342", "sanjo"),
  prefTown("田上町", "15361", "sanjo"),
  // 長岡地域振興局
  prefTown("小千谷市", "15208", "nagaoka", [sheets("小千谷市道路網図（PDF・31枚、2024年3月31日現在）", "https://www.city.ojiya.niigata.jp/soshiki/kensetsu/douromouzu.html", "全体図で図面番号を見て開く。路線番号表は Word")]),
  prefTown("見附市", "15211", "nagaoka", [
    { kind: "public_road", label: "市道路線網マップ（みつけマップ・認定路線網図）", build: arcgisWebApp("mitsukecity.maps.arcgis.com", "51158390d69243bbacba49b89e9c3de1"), verified: true, tip: "最初に利用条件に同意する。参考図で境界や権利は表さない（2026年3月31日現在）" },
  ]),
  outsideTown("出雲崎町", "15405", "nagaoka"),
  outsideTown("刈羽村", "15504", "nagaoka"),
  // 南魚沼地域振興局
  prefTown("十日町市", "15210", "minamiuonuma", [geo("道路（十日町市公開地理情報システム・国道/県道と市道網図）", "http://map.city.tokamachi.lg.jp", 1, 24)]),
  prefTown("魚沼市", "15225", "minamiuonuma", [geo("道路（魚沼市地理情報システム・市道の認定路線）", "https://uonumagis.geogeo.jp", 0, 8, "路線名と経路。幅員は載っていない（建設課 監理係 025-793-7990）")]),
  prefTown("南魚沼市", "15226", "minamiuonuma", [geo("道路（南魚沼市公開地理情報システム・市道認定路線）", "https://map.city.minamiuonuma.niigata.jp", 3, 9)]),
  prefTown("湯沢町", "15461", "minamiuonuma"),
  outsideTown("津南町", "15482", "minamiuonuma"),
  // 上越地域振興局
  prefTown("糸魚川市", "15216", "joetsu", [geo("道路・建設（eまっぷいといがわ・国県道網図と市道網図）", "https://itoigawa.geogeo.jp", 5, 15, "レイヤで「市道網図」をオンにする")]),
  MYOKO,
  // 佐渡地域振興局
  prefTown("佐渡市", "15224", "sado"),
];

export const NIIGATA: Municipality[] = [NIIGATA_CITY, NAGAOKA, JOETSU, KASHIWAZAKI, SANJO, SHIBATA, ...PREF_TOWNS];
