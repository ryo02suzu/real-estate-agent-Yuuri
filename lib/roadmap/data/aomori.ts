// 青森県 全40市町村（2026-11 調査）。出典は docs/aomori-research.md。
// 特定行政庁は青森県と青森市・弘前市・八戸市（県「建築基準法」のページ）。ほかの37市町村は県の6つの県土整備事務所の建築指導課が扱う。
// 県は「建築基準法上の道路種別図」（1/10,000 の PDF。事務所ごとの ZIP）を出していて、都市計画区域のある25市町村で全種別が分かる。
// 図面番号は国土基本図の図郭（平面直角座標 第X系・南北3km×東西4km）で、物件の位置から図面を選ぶ（sheets/aomori-*.json、
// scripts/sheets/aomori.py）。都市計画区域の無い12町村（県のページの一覧）は coverage: outside。
import AO_KAMIKITA from "./sheets/aomori-kamikita.json";
import AO_SANPATI from "./sheets/aomori-sanpati.json";
import AO_SEIHOKU from "./sheets/aomori-seihoku.json";
import AO_SHIMOKITA from "./sheets/aomori-shimokita.json";
import AO_TOUSEI from "./sheets/aomori-tousei.json";
import AO_TYUNAN from "./sheets/aomori-tyunan.json";
import type { Contact, MapLink, Municipality } from "../municipalities";
import type { SheetIndex } from "../sheets";
import { wagmap } from "../vendors";

const pref = "青森県" as const;

/** 県の道路種別図の入口（「建築基準法上の道路種別について」の節） */
const PAGE = "https://www.pref.aomori.lg.jp/soshiki/kendo/kenju/kijyunho.html#建築基準法上の道路種別について";

/** 未判定の道の相談（三八・西北・上北・下北のページ。東青・中南は手順のページが見つからなかった） */
const ASK = "道路種別図で分からない道（色の無い道、破線の「○号候補」）は、必要書類を持って建築指導課の窓口へ（電話のうえ郵送も可）。回答は原則1〜2週間。";

/** 県の県土整備事務所の建築指導課（電話は県のページの「建築基準法上の道路種別について」の節の番号） */
const OFFICE = {
  tousei: { dept: "青森県 東青県土整備事務所 建築指導課", phone: "017-728-0226", fax: "017-728-0355", note: ASK },
  tyunan: { dept: "青森県 中南県土整備事務所 建築指導課", phone: "0172-32-3801", fax: "0172-36-5360", email: "HI-KENDO@pref.aomori.lg.jp", note: `${ASK}メールは事務所の共通のアドレス。` },
  sanpati: { dept: "青森県 三八県土整備事務所 建築指導課", phone: "0178-27-5157", fax: "0178-27-4715", note: `${ASK}メールでの相談は不可、必要書類のメール・FAX での送信も不可（公図の縮尺が変わるおそれがあるため）。` },
  seihoku: { dept: "青森県 西北県土整備事務所 建築指導課", phone: "0173-35-2117", fax: "0173-35-9114", note: `${ASK}メールでの相談は不可、必要書類のメール・FAX での送信も不可（公図の縮尺が変わるおそれがあるため）。` },
  kamikita: { dept: "青森県 上北県土整備事務所 建築指導課", phone: "0176-23-4398", fax: "0176-23-4391", email: "TO-KENDO@pref.aomori.lg.jp", note: `${ASK}県の「道路相談事前調査シート」で相談者が先に調べてから相談する。幅員・基準法の認定幅は答えない（道路の管理者へ）。事務所のページの問い合わせ欄の電話は 0176-22-8111。` },
  shimokita: { dept: "青森県 下北県土整備事務所 建築指導課", phone: "0175-22-8581（内線402）", fax: "0175-22-9540", email: "mu_kenchiku@pref.aomori.lg.jp", note: `${ASK}メールでの相談は、できるか先に電話で聞く。必要書類の FAX での送信は控える。事務所のページの問い合わせ欄の電話は 0175-22-1231。` },
} satisfies Record<string, Contact>;

type Office = keyof typeof OFFICE;

const SHEETS: Record<Office, SheetIndex> = {
  tousei: AO_TOUSEI as SheetIndex,
  tyunan: AO_TYUNAN as SheetIndex,
  sanpati: AO_SANPATI as SheetIndex,
  seihoku: AO_SEIHOKU as SheetIndex,
  kamikita: AO_KAMIKITA as SheetIndex,
  shimokita: AO_SHIMOKITA as SheetIndex,
};

/** 県の道路種別図（物件の位置の図面番号を出し、県のページを開く） */
const prefMap = (office: Office): MapLink => ({
  kind: "road_type",
  label: "建築基準法上の道路種別図（青森県・PDF、2025年10月29日更新）",
  build: null,
  url: PAGE,
  verified: true,
  tip: "県のページの「青森県全域図」でも図面番号を探せる。色の付いた道が建築基準法の道路で、色の無い道と破線の「○号候補」は未判定（建築指導課に相談）。都市計画区域の外は図に載らない。",
  sheets: SHEETS[office],
});

const PREF_NOTE = "県が扱う市町村（特定行政庁は青森県）。県の道路種別図（PDF）で全種別が分かり、物件の位置から図面番号を出す。";

/** 県が扱う市町村（都市計画区域あり） */
const prefTown = (name: string, code: string, office: Office, extra: string, maps: MapLink[] = []): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "full",
  maps: [prefMap(office), ...maps],
  contact: OFFICE[office],
  note: PREF_NOTE + extra,
});

/** 都市計画区域の無い町村（県のページ「以下の各町村は、行政区域全域において、都市計画区域の定めはありません」） */
const outsideTown = (name: string, code: string, office: Office, extra = ""): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: OFFICE[office],
  note: `全域が都市計画区域外（県のページの都市計画区域の無い町村の一覧）。建築確認などは県土整備事務所の建築指導課へ。${extra}`,
});

export const AOMORI: Municipality[] = [
  // --- 特定行政庁の3市 ---------------------------------------------------------
  {
    pref,
    name: "青森市",
    codes: ["02201"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "指定道路図マップ（青森市地理情報公開サービス「あおまっぷ」、2026年4月1日公開）",
        build: wagmap("aomoricity", 3, { scale: 2500 }),
        verified: false,
        tip: "最初に利用条件に同意する。市の注記：参考図で、接道の判断・証明・不動産取引のための資料には使えない。",
      },
      {
        kind: "road_type",
        label: "青森市指定道路図（PDF 11枚・図郭番号の全体図から選ぶ。1項2号〜5号・2項）",
        build: null,
        url: "https://www.city.aomori.aomori.jp/kurashi_kankyo/sumai/1002171/1002188.html",
        verified: true,
        tip: "1号（道路法の道路）は載らない。新しいのは「あおまっぷ」の指定道路図マップ。",
      },
    ],
    contact: {
      dept: "都市整備部 建築指導課 建築指導チーム（本庁舎3階）",
      phone: "017-752-8274",
      fax: "017-752-9015",
      note: "道路種別は来庁して建築指導チームの窓口で聞く。電話での問い合わせには応じない（来庁できないときは相談）。",
      noPhoneInquiry: true,
    },
    note: "特定行政庁。2026年4月1日から「あおまっぷ」（wagmap）の指定道路図マップで建築基準法の道路が見られる（市の「建築基準法上の道路」のページ）。",
  },
  {
    pref,
    name: "弘前市",
    codes: ["02202"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "指定道路情報（ひろさき便利まっぷ・42条1項1号〜5号・2項・3項）",
        build: (lat, lng) => `https://hirosakimap.geogeo.jp/maps?mode=theme&lid=2&mid=9&lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}&z=17`,
        verified: true,
        tip: "利用規約のある参考図。市の注記：道路種別の内容を証明するものではなく、判定していない道もある。",
      },
    ],
    contact: {
      dept: "建設部 建築指導課 指導・審査係",
      phone: "0172-40-7053（または 0172-40-3736）",
      note: "判定されていない道は、付近見取図・公図の写し・土地と建物の登記事項証明書の写しを持って相談（メール・FAX も可）。おおむね2週間で結果を知らせる（冬は積雪で長くかかることがある）。",
    },
    note: "特定行政庁。ひろさき便利まっぷ（geogeo）の「指定道路情報」で1号〜5号・2項・3項が見られる。",
  },
  {
    pref,
    name: "八戸市",
    codes: ["02203"],
    coverage: "partial",
    maps: [
      {
        kind: "road_type",
        label: "指定道路情報（八戸市公開地理情報システム・42条1項1号・2号・4号・5号）",
        build: (lat, lng) => `http://map.city.hachinohe.aomori.jp/maps?mode=theme&lid=1&mid=5&lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}&z=17`,
        verified: true,
        tip: "3号と2項は載らない（市道でも幅員4m未満の区間は2項道路の扱いで、この地図には無い）。載っていない道は建築指導課のカウンターの備え付けの地図で。",
      },
    ],
    contact: { dept: "都市整備部 建築指導課 建築指導グループ（市庁別館6階）", phone: "0178-43-9137", fax: "0178-41-2302" },
    note: "特定行政庁。八戸市公開地理情報システムの「指定道路情報」は1号・2号・4号・5号だけで、3号・2項は窓口で確かめる。市道の幅員は道路維持課 管理グループ（0178-43-9117）。",
  },

  // --- 東青県土整備事務所（平内・外ヶ浜／区域なし：今別・蓬田） ---
  prefTown("平内町", "02301", "tousei", "都市計画区域は町の一部。町道の窓口は地域整備課（017-755-2116）。"),
  prefTown("外ヶ浜町", "02307", "tousei", "都市計画区域は蟹田のまわり（448ha）だけ。町道の窓口は建設課（0174-31-1226）。"),
  outsideTown("今別町", "02303", "tousei", "町道の窓口は産業建設課（0174-35-3006）。"),
  outsideTown("蓬田村", "02304", "tousei", "村道の窓口は建設課（0174-31-0075）。"),

  // --- 中南県土整備事務所（黒石・平川・藤崎・大鰐・田舎館／区域なし：西目屋） ---
  prefTown("黒石市", "02204", "tyunan", "都市計画区域は市の一部。"),
  prefTown("平川市", "02210", "tyunan", "都市計画区域は市の一部。市道の窓口は建設課 維持係（0172-55-7435）。"),
  prefTown("藤崎町", "02361", "tyunan", "都市計画区域は町の一部。町道の窓口は建設課 建設係（0172-88-8285）。"),
  prefTown("大鰐町", "02362", "tyunan", "都市計画区域は町の一部。町道の窓口は建設課 土木係（0172-55-6594）。"),
  prefTown("田舎館村", "02367", "tyunan", "都市計画区域は村の一部。"),
  outsideTown("西目屋村", "02343", "tyunan", "村道の窓口は建設課 建設係（0172-85-2802）。"),

  // --- 三八県土整備事務所（三戸・五戸・南部・階上／区域なし：田子・新郷） ---
  prefTown("三戸町", "02441", "sanpati", "都市計画区域は町の一部。"),
  prefTown("五戸町", "02442", "sanpati", "都市計画区域は町の一部。"),
  prefTown("南部町", "02445", "sanpati", "都市計画区域は三戸都市計画区域の 189ha だけ。"),
  prefTown("階上町", "02446", "sanpati", "都市計画区域は町の一部。"),
  outsideTown("田子町", "02443", "sanpati"),
  outsideTown("新郷村", "02450", "sanpati"),

  // --- 西北県土整備事務所（五所川原・つがる・板柳・鶴田・鰺ヶ沢／区域なし：深浦・中泊） ---
  prefTown("五所川原市", "02205", "seihoku", "都市計画区域は市の一部。"),
  prefTown("つがる市", "02209", "seihoku", "都市計画区域は市の一部。"),
  prefTown("板柳町", "02381", "seihoku", "全域が都市計画区域。"),
  prefTown("鶴田町", "02384", "seihoku", "全域が都市計画区域。"),
  prefTown("鰺ヶ沢町", "02321", "seihoku", "都市計画区域は町の一部。町道の窓口は建設水道課 地域整備班（0173-82-0962）。"),
  outsideTown("深浦町", "02323", "seihoku", "町道の窓口は建設水道課（0173-74-4413）。"),
  outsideTown("中泊町", "02387", "seihoku"),

  // --- 上北県土整備事務所（十和田・三沢・おいらせ・東北・七戸・野辺地・六戸・六ヶ所／区域なし：横浜） ---
  prefTown("十和田市", "02206", "kamikita", "都市計画区域は市の一部。"),
  prefTown("三沢市", "02207", "kamikita", "全域が都市計画区域。市道の窓口は建設部 土木課 土木維持グループ（0176-53-5111）。", [
    {
      kind: "public_road",
      label: "三沢市道認定路線網図（PDF）",
      build: null,
      url: "https://www.city.misawa.lg.jp/index.cfm/22,30631,17,131,html",
      verified: true,
      tip: "市道かどうかの目安で、道路種別の地図ではない。",
    },
  ]),
  prefTown("おいらせ町", "02412", "kamikita", "全域が都市計画区域（2021年9月1日から）。"),
  prefTown("東北町", "02408", "kamikita", "都市計画区域は町の一部。"),
  prefTown("七戸町", "02402", "kamikita", "都市計画区域は町の一部。"),
  prefTown("野辺地町", "02401", "kamikita", "都市計画区域は町の一部。"),
  prefTown("六戸町", "02405", "kamikita", "全域が都市計画区域。"),
  prefTown("六ヶ所村", "02411", "kamikita", "都市計画区域は村の一部。"),
  outsideTown("横浜町", "02406", "kamikita"),

  // --- 下北県土整備事務所（むつ／区域なし：大間・東通・風間浦・佐井） ---
  prefTown("むつ市", "02208", "shimokita", "都市計画区域は市の一部。"),
  outsideTown("大間町", "02423", "shimokita"),
  outsideTown("東通村", "02424", "shimokita"),
  outsideTown("風間浦村", "02425", "shimokita"),
  outsideTown("佐井村", "02426", "shimokita"),
];
