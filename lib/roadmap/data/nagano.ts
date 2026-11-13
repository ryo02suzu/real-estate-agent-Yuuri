// 長野県 全77市町村（2026-11 調査）。出典は docs/nagano-research.md。
// 特定行政庁は長野市・松本市・上田市（道路種別は市）。限定特定行政庁は岡谷市・塩尻市・飯田市（一部を市が扱う。諏訪市は2026年9月30日で廃止）。
// 残りは県の10建設事務所（佐久・上田・諏訪・伊那・飯田・木曽・松本・大町・長野・北信）の建築課で、県は指定道路図をネットに出していない
// （窓口で閲覧・写しの交付）。都市計画区域があるのは44市町村（県「長野県の都市計画 資料編」2025年3月31日現在）で、残り33町村は全域が都市計画区域外。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { arcgisExperience, arcgisWebApp, geocloudMp, wagmap } from "../vendors";

const pref = "長野県" as const;

const OFFICE: Record<string, Contact> = {
  saku: { dept: "長野県 佐久建設事務所 建築課", phone: "0267-63-3160" },
  ueda: { dept: "長野県 上田建設事務所 建築課", phone: "0268-25-7142" },
  suwa: { dept: "長野県 諏訪建設事務所 建築課", phone: "0266-57-2923" },
  ina: { dept: "長野県 伊那建設事務所 建築課", phone: "0265-76-6830" },
  iida: { dept: "長野県 飯田建設事務所 建築課", phone: "0265-53-0433" },
  kiso: { dept: "長野県 木曽建設事務所 整備・建築課", phone: "0264-25-2229" },
  matsumoto: { dept: "長野県 松本建設事務所 建築課", phone: "0263-40-1935" },
  omachi: { dept: "長野県 大町建設事務所 整備・建築課", phone: "0261-23-6524" },
  nagano: { dept: "長野県 長野建設事務所 建築課", phone: "026-234-9530" },
  hokushin: { dept: "長野県 北信建設事務所 建築課", phone: "0269-23-0220" },
};

const PREF_NOTE = "県は指定道路図をネットに出していない。道路種別と指定道路図・指定道路調書の閲覧・写し（様式第3号）は物件の場所を管内に持つ建設事務所の窓口で。";

/** 県が扱う市町村（建設事務所の管内）。道路種別の地図は無く、市町村の道路台帳などがあれば添える */
const prefTown = (name: string, code: string, office: keyof typeof OFFICE, maps: MapLink[] = []): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps,
  contact: OFFICE[office],
  note: PREF_NOTE,
});

/** 全域が都市計画区域外の町村（県「長野県の都市計画 資料編」の都市計画決定事項一覧表に無い） */
const outsideTown = (name: string, code: string, office: keyof typeof OFFICE): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: OFFICE[office],
  note: "全域が都市計画区域外（県の資料）。建築基準法6条1項4号の知事指定区域の有無と建築の扱いは建設事務所で確認。",
});

/** PDF や画像の分割図で公開している入口ページ */
const sheets = (kind: MapLink["kind"], label: string, url: string, tip: string): MapLink => ({ kind, label, build: null, url, verified: true, tip });

/** 建設事務所が公開している位置指定道路の調書・図面（PDF）。地名地番では探せず、指定番号・指定日で見る */
const prefDesignatedPdf = (office: string, url: string, tip: string): MapLink =>
  sheets("designated_only", `位置指定道路の調書・図面（${office}・PDF）`, url, tip);
const SAKU_PDF_TIP = "2009年度以前の指定分。地名地番では探せないので、指定番号と指定日を市町の窓口で確かめてから開く";
const NAGANO_PDF_LIST = "https://www.pref.nagano.lg.jp/choken/kannai/renrakusaki/kenchikuka/index.html";
const NAGANO_PDF_TIP = "位置指定道路の一覧表と調書（適宜公開）。地図ではないので、指定番号で探す";

// --- 特定行政庁の3市 ---------------------------------------------------------

const NAGANO_CITY: Municipality = {
  pref,
  name: "長野市",
  codes: ["20201"],
  coverage: "full",
  maps: [
    {
      // 長野市行政地図情報（wagmap）の「建築基準法に基づく指定道路図」（mid=40）。1号〜5号・2項・3項。一部は判定作業中（灰色）
      kind: "road_type",
      label: "建築基準法に基づく指定道路図（長野市行政地図情報・1号〜5号/2項/3項）",
      build: wagmap("nagano", 40),
      verified: true,
      tip: "灰色の道路は判定作業中。最新の種別は建築指導課の窓口で",
    },
    { kind: "public_road", label: "道路台帳図（長野市行政地図情報・市道の幅員）", build: wagmap("nagano", 80), verified: true },
    { kind: "public_road", label: "路線網図（長野市行政地図情報・市道の路線名）", build: wagmap("nagano", 10), verified: true },
  ],
  contact: {
    dept: "建設部 建築指導課（第二庁舎7階）",
    phone: "026-224-5048",
    note: "道路種別は間違いの影響が大きいとして電話では答えない。窓口へ",
    noPhoneInquiry: true,
  },
  note: "地図の灰色の道路は判定作業中。市道の名称・幅員は監理課（第二庁舎6階 026-224-8704）。",
};

const MATSUMOTO: Municipality = {
  pref,
  name: "松本市",
  codes: ["20202"],
  coverage: "full",
  maps: [
    // 松本デジタルまっぷ（wagmap）の「建築基準法指定道路図」（mid=2、2023年8月公開）と「路線網図」（mid=7、市道の路線名・番号・幅員）
    { kind: "road_type", label: "建築基準法指定道路図（松本デジタルまっぷ・1号〜5号/2項）", build: wagmap("matsumoto", 2), verified: true },
    { kind: "public_road", label: "路線網図（松本デジタルまっぷ・市道の路線名と幅員）", build: wagmap("matsumoto", 7), verified: true },
  ],
  contact: { dept: "建設部 建築指導課 指導審査担当（本庁舎4階）", phone: "0263-34-3255", note: "窓口の相談は事前予約" },
  note: "路線網図・道路台帳のデータは年1回の更新。",
};

const UEDA: Municipality = {
  pref,
  name: "上田市",
  codes: ["20203"],
  coverage: "none",
  maps: [],
  contact: {
    dept: "都市建設部 建築指導課",
    phone: "0268-23-5430",
    note: "道路種別は「相談書」（様式2）に敷地と道を色で示して提出。現地調査と道路管理者との協議で1〜2週間かかることがある",
  },
  note: "道路種別の地図はネット非公開（指定道路図は建築指導課で閲覧）。未判定の道は判定後の回答。幅員は道路管理者へ。",
};

// --- 限定特定行政庁の3市 ----------------------------------------------------------

const OKAYA: Municipality = {
  pref,
  name: "岡谷市",
  codes: ["20204"],
  coverage: "none",
  maps: [],
  contact: { dept: "都市計画課 建築・住宅担当", phone: "0266-23-4811", note: "市役所の代表番号。道路証明願（住宅案内図・公図を添付、300円）で確認" },
  note: "限定特定行政庁（小さな建築物の確認は市、残りは諏訪建設事務所 0266-57-2923）。くらしマップおかや（都市計画情報）に道路種別は無い。",
};

const IIDA: Municipality = {
  pref,
  name: "飯田市",
  codes: ["20205"],
  coverage: "partial",
  maps: [
    // いいだWebまっぷ（geocloud 新版）の「建築基準法による道路指定図」（地図 15）は位置指定道路だけ。「道路網図」（地図 3）は国道・県道・市道の路線
    {
      kind: "designated_only",
      label: "建築基準法による道路指定図（いいだWebまっぷ・位置指定道路のみ）",
      build: geocloudMp("iida.geocloud.jp", 15),
      verified: true,
      tip: "最初に利用規約に同意する。位置指定道路（5号）だけで、1号〜4号・2項は載っていない",
    },
    { kind: "public_road", label: "道路網図（いいだWebまっぷ・国道/県道/市道の路線）", build: geocloudMp("iida.geocloud.jp", 3), verified: true },
  ],
  contact: { dept: "建設部 地域計画課 建築指導係", phone: "0265-22-4511", note: "市役所の代表番号" },
  note: "限定特定行政庁。地図は位置指定道路だけなので、1号〜4号・2項は建築指導係か飯田建設事務所（0265-53-0433）で確認。",
};

const SHIOJIRI: Municipality = {
  pref,
  name: "塩尻市",
  codes: ["20215"],
  coverage: "none",
  // 塩尻市の wagmap に市道認定路線網図（mid=19）
  maps: [{ kind: "public_road", label: "市道認定路線網図（塩尻市わが街ガイド・市道）", build: wagmap("shiojiri", 19), verified: true }],
  contact: { dept: "建設事業部 建築住宅課 建築住宅係（市役所2階）", phone: "0263-52-0280", note: "市役所の代表番号" },
  note: "限定特定行政庁（小さな建築物の確認は市、残りは松本建設事務所 0263-40-1935）。道路種別の地図はネット非公開。幅員4m未満の道に接する敷地は道路後退協議書。",
};

// --- 県が扱う市町村（建設事務所の管内）-------------------------------------------------

const SUWA: Municipality = {
  ...prefTown("諏訪市", "20206", "suwa"),
  note: `${PREF_NOTE} 市の限定特定行政庁は2026年9月30日で廃止され、審査は諏訪建設事務所（受付窓口は市の都市計画課 建築住宅係 0266-52-4141 内線267〜269）。すわなび（都市計画情報）に道路種別は無い。`,
};

const PREF_TOWNS: Municipality[] = [
  // 佐久建設事務所
  prefTown("小諸市", "20208", "saku", [
    sheets("public_road", "小諸市道路線網図（PDF・索引図と16枚、令和7年版）", "https://www.city.komoro.lg.jp/soshikikarasagasu/kensetsusuidoubu/kensetsuka/1/1/5/18118.html", "索引図で区域を選び、その番号の路線図を開く"),
    prefDesignatedPdf("佐久建設事務所", "https://www.pref.nagano.lg.jp/sakuken/kannai/kakuka/kenchikuka/ichishitei_komoro.html", SAKU_PDF_TIP),
  ]),
  prefTown("佐久市", "20217", "saku", [
    sheets("public_road", "市道認定網図（PDF・位置図と55枚、2015年）", "https://www.city.saku.nagano.jp/machizukuri/doro_koen_kenchiku/mozu.html", "位置図で区画の記号（A-5〜I-3）を調べ、その図を開く。2015年の図なので最新の認定は土木課（0267-62-3298）で"),
    prefDesignatedPdf("佐久建設事務所", "https://www.pref.nagano.lg.jp/sakuken/kannai/kakuka/kenchikuka/ichisitei_saku.html", SAKU_PDF_TIP),
  ]),
  prefTown("小海町", "20303", "saku"),
  outsideTown("川上村", "20304", "saku"),
  outsideTown("南牧村", "20305", "saku"),
  outsideTown("南相木村", "20306", "saku"),
  outsideTown("北相木村", "20307", "saku"),
  prefTown("佐久穂町", "20309", "saku"),
  prefTown("軽井沢町", "20321", "saku", [prefDesignatedPdf("佐久建設事務所", "https://www.pref.nagano.lg.jp/sakuken/kannai/kakuka/kenchikuka/ichishitei_karuizawa.html", SAKU_PDF_TIP)]),
  prefTown("御代田町", "20323", "saku", [prefDesignatedPdf("佐久建設事務所", "https://www.pref.nagano.lg.jp/sakuken/kannai/kakuka/kenchikuka/ichisitei_miyota.html", SAKU_PDF_TIP)]),
  outsideTown("立科町", "20324", "saku"),
  // 上田建設事務所
  prefTown("東御市", "20219", "ueda"),
  outsideTown("青木村", "20349", "ueda"),
  outsideTown("長和町", "20350", "ueda"),
  // 諏訪建設事務所
  SUWA,
  prefTown("茅野市", "20214", "suwa"),
  prefTown("下諏訪町", "20361", "suwa"),
  prefTown("富士見町", "20362", "suwa"),
  outsideTown("原村", "20363", "suwa"),
  // 伊那建設事務所
  {
    ...prefTown("伊那市", "20209", "ina"),
    note: `${PREF_NOTE} 市道の道路台帳は市役所2階の建設部管理課で閲覧（写し1枚50円）。`,
  },
  prefTown("駒ヶ根市", "20210", "ina"),
  prefTown("辰野町", "20382", "ina"),
  prefTown("箕輪町", "20383", "ina"),
  prefTown("飯島町", "20384", "ina"),
  prefTown("南箕輪村", "20385", "ina"),
  prefTown("中川村", "20386", "ina"),
  prefTown("宮田村", "20388", "ina"),
  // 飯田建設事務所
  prefTown("松川町", "20402", "iida"),
  prefTown("高森町", "20403", "iida"),
  outsideTown("阿南町", "20404", "iida"),
  outsideTown("阿智村", "20407", "iida"),
  outsideTown("平谷村", "20409", "iida"),
  outsideTown("根羽村", "20410", "iida"),
  outsideTown("下條村", "20411", "iida"),
  outsideTown("売木村", "20412", "iida"),
  outsideTown("天龍村", "20413", "iida"),
  outsideTown("泰阜村", "20414", "iida"),
  outsideTown("喬木村", "20415", "iida"),
  outsideTown("豊丘村", "20416", "iida"),
  outsideTown("大鹿村", "20417", "iida"),
  // 木曽建設事務所
  prefTown("上松町", "20422", "kiso"),
  outsideTown("南木曽町", "20423", "kiso"),
  outsideTown("木祖村", "20425", "kiso"),
  outsideTown("王滝村", "20429", "kiso"),
  outsideTown("大桑村", "20430", "kiso"),
  prefTown("木曽町", "20432", "kiso"),
  // 松本建設事務所
  {
    // 安曇野市の道路台帳マップ（ArcGIS Web AppBuilder）。認定路線名・位置・幅員（令和7年3月現在）
    ...prefTown("安曇野市", "20220", "matsumoto", [
      {
        kind: "public_road",
        label: "安曇野市道路台帳マップ（市道の路線名と幅員）",
        build: arcgisWebApp("azuminocity.maps.arcgis.com", "ff06b231e28949d889bd1182cddc9eb1"),
        verified: false,
        tip: "幅員は道路法の管理データで、現地と違うことがある",
      },
    ]),
    note: `${PREF_NOTE} 市の建築住宅課 開発調整係（0263-71-2243）も建築基準法の道路種別を案内。道路台帳は維持管理課 管理登記担当（0263-71-2331）。`,
  },
  outsideTown("麻績村", "20446", "matsumoto"),
  outsideTown("生坂村", "20448", "matsumoto"),
  outsideTown("山形村", "20450", "matsumoto"),
  outsideTown("朝日村", "20451", "matsumoto"),
  outsideTown("筑北村", "20452", "matsumoto"),
  // 大町建設事務所
  prefTown("大町市", "20212", "omachi", [{ kind: "public_road", label: "道路情報マップ（大町まちマップ・市道）", build: wagmap("omachi", 5), verified: true }]),
  prefTown("池田町", "20481", "omachi"),
  prefTown("松川村", "20482", "omachi"),
  prefTown("白馬村", "20485", "omachi"),
  outsideTown("小谷村", "20486", "omachi"),
  // 長野建設事務所
  prefTown("須坂市", "20207", "nagano", [
    {
      // 須坂マップポータル（ArcGIS Experience Builder）の「市道路線網図マップ」。地図のウィジェットは widget_6
      kind: "public_road",
      label: "市道路線網図マップ（須坂マップポータル・市道）",
      build: arcgisExperience("596c785b14594ba4bcf4f079acaab484", "widget_6"),
      verified: true,
      tip: "最初に「マップを開く」で利用規約に同意する",
    },
    prefDesignatedPdf("長野建設事務所", NAGANO_PDF_LIST, NAGANO_PDF_TIP),
  ]),
  prefTown("千曲市", "20218", "nagano", [
    sheets("public_road", "千曲市道路網図（画像の分割図・市道、2018年3月時点）", "https://www.city.chikuma.lg.jp/soshiki/kensetsu/doro_kotsu/2/2064.html", "「承諾して利用します」のあと、区域の場所を押して開く。最新の認定は道路河川課（026-273-1111）で"),
    prefDesignatedPdf("長野建設事務所", NAGANO_PDF_LIST, NAGANO_PDF_TIP),
  ]),
  prefTown("坂城町", "20521", "nagano", [prefDesignatedPdf("長野建設事務所", NAGANO_PDF_LIST, NAGANO_PDF_TIP)]),
  prefTown("小布施町", "20541", "nagano"),
  outsideTown("高山村", "20543", "nagano"),
  prefTown("信濃町", "20583", "nagano", [prefDesignatedPdf("長野建設事務所", NAGANO_PDF_LIST, NAGANO_PDF_TIP)]),
  outsideTown("小川村", "20588", "nagano"),
  prefTown("飯綱町", "20590", "nagano", [prefDesignatedPdf("長野建設事務所", NAGANO_PDF_LIST, NAGANO_PDF_TIP)]),
  // 北信建設事務所
  prefTown("中野市", "20211", "hokushin"),
  prefTown("飯山市", "20213", "hokushin", [
    sheets("public_road", "飯山市道路認定路線網図（PDF・11枚、2026年3月時点）", "https://www.city.iiyama.nagano.jp/soshiki/dourokasen/kanri/news/33004", "地区ごとのA1判。幅員は載っていないので道路河川課（0269-67-0737）の道路台帳で"),
  ]),
  prefTown("山ノ内町", "20561", "hokushin"),
  outsideTown("木島平村", "20562", "hokushin"),
  prefTown("野沢温泉村", "20563", "hokushin"),
  outsideTown("栄村", "20602", "hokushin"),
];

export const NAGANO: Municipality[] = [NAGANO_CITY, MATSUMOTO, UEDA, OKAYA, IIDA, SHIOJIRI, ...PREF_TOWNS];
