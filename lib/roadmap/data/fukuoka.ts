// 福岡県（2026-11 調査）。出典は docs/fukuoka-research.md。
// 市が建築確認と道路を扱うのは、北九州市・福岡市・久留米市・大牟田市の4市（県「教えて広場」：この4市の区域は各市が所管行政庁）。
// ほかの56市町村は、11の県土整備事務所の建築指導課が受け持つ（県「教えて広場」Q1「各県土整備事務所の所管区域・問い合わせ先」令和6年5月現在）：
//   福岡：古賀市・糟屋郡・糸島市／那珂：筑紫野市・春日市・大野城市・太宰府市・那珂川市／朝倉：朝倉市・朝倉郡／久留米：小郡市・うきは市・三井郡／
//   南筑後 柳川支所：柳川市・大川市・みやま市・三潴郡／八女：八女市・筑後市・八女郡／飯塚：飯塚市・嘉麻市・嘉穂郡／直方：直方市・宮若市・鞍手郡／
//   田川：田川市・田川郡／北九州：中間市・遠賀郡・宗像市・福津市／京築：豊前市・築上郡・行橋市・京都郡
// 県の道路種別の地図は、ネットに無い。県「建築基準法上の道路について」：県土整備事務所の建築指導課に備え付けの地図などで種別を確かめる
// （判定した日の時点・おおよその区域）。幅員4m未満で地図に色の無い道は未判定で、「建築基準法第42条道路の確認依頼書」を出すと建築指導課が確かめて回答する。
// 「道路の種別等に関するお問い合わせは、トラブルの原因となる為、原則窓口にてお願いします。」窓口受付は平日 9:00〜11:30・13:00〜16:00（令和6年9月2日から）。
// 福岡県は、都市計画区域の外に「準都市計画区域」を22市町で指定している（県「準都市計画区域指定市町について」）。接道の決まり（43条）は準都市計画区域の中でも
// かかる（県「建築基準法上の道路について」「教えて広場」Q15）。都市計画区域が無くても準都市計画区域のある市町（うきは市・大木町・香春町・糸田町・大任町・
// 福智町・上毛町）は「区域外」にしない。都市計画区域も準都市計画区域も無いのは、東峰村・赤村の2村（国の令和7年都市計画現況調査の2つの一覧）。
// みやこ町は、令和8年9月1日に準都市計画区域だった所が都市計画区域になった（県の同じページ）。
// 県のサイトの決まり：リンクは自由。リンクしたら hpkanri@pref.fukuoka.lg.jp へメールで知らせる（いまの登録では、県のページへのリンクは置いていない）。
// まだ：市が扱う4市は調べている途中（data/kyushu.ts の調査中の一覧）。県が扱う市町村も、市町村が出している地図（市町村道の地図など）と市町村の窓口は調べている途中。
import type { Contact, Municipality } from "../municipalities";

const pref = "福岡県" as const;

/** 県の決まり（県「建築基準法上の道路について」・「教えて広場」Q2） */
const PREF_NOTE =
  "道路の種別などの問い合わせは、トラブルのもとになるため、原則として窓口でするよう県が求めている。県土整備事務所の建築指導課に備え付けの地図などで種別を確かめる（判定した日の時点のもので、おおよその区域）。幅員4m未満で地図に色の無い道は未判定で、「建築基準法第42条道路の確認依頼書」を出すと、建築指導課が確かめて回答する。国道・県道・市町村道の認定と幅員は、道路管理者に確かめる。時間のかかりそうな相談は、先に電話で予約する（県「建築基準法上の道路について」・「教えて広場」）。";

/** 県土整備事務所の建築指導課（電話・FAX・場所は県「教えて広場」Q1 の表。令和6年5月現在） */
const OFFICE = {
  fukuoka: { dept: "福岡県 福岡県土整備事務所 建築指導課 建築審査係（福岡市東区箱崎1-18-1 粕屋総合庁舎3階）", phone: "092-641-0169", fax: "092-233-1817" },
  naka: { dept: "福岡県 那珂県土整備事務所 建築指導課 建築審査係（大野城市白木原3-5-25 筑紫総合庁舎2階）", phone: "092-513-5572", fax: "092-513-5607" },
  asakura: { dept: "福岡県 朝倉県土整備事務所 建築指導課（朝倉市甘木2014-1 朝倉総合庁舎2階）", phone: "0946-22-1859", fax: "0946-22-4169" },
  kurume: { dept: "福岡県 久留米県土整備事務所 建築指導課 建築審査係（久留米市合川町1642-1 1階）", phone: "0942-36-6315", fax: "0942-41-4163" },
  yanagawa: { dept: "福岡県 南筑後県土整備事務所 柳川支所 建築指導課（柳川市三橋町今古賀8-1 柳川総合庁舎3階）", phone: "0944-72-2564", fax: "0944-74-3890" },
  yame: { dept: "福岡県 八女県土整備事務所 建築指導課（八女市本村25 八女総合庁舎3階）", phone: "0943-22-6993", fax: "0943-23-7722" },
  iizuka: { dept: "福岡県 飯塚県土整備事務所 建築指導課 建築審査係（飯塚市新立岩8-1 飯塚総合庁舎1階）", phone: "0948-21-4945", fax: "0948-26-5251" },
  nogata: { dept: "福岡県 直方県土整備事務所 建築指導課（直方市日吉町9-10 直方総合庁舎2階）", phone: "0949-22-5639", fax: "0949-22-5644" },
  tagawa: { dept: "福岡県 田川県土整備事務所 建築指導課（田川市大字伊田4543-1 1階）", phone: "0947-42-9117", fax: "0947-42-8760" },
  kitakyushu: { dept: "福岡県 北九州県土整備事務所 建築指導課 建築審査係（北九州市八幡西区則松3-7-1 八幡総合庁舎2階）", phone: "093-691-4585", fax: "093-601-8845" },
  keichiku: { dept: "福岡県 京築県土整備事務所 建築指導課（豊前市大字八屋2007-1 豊前総合庁舎1階）", phone: "0979-82-3364", fax: "0979-83-3215" },
} as const;
type Office = keyof typeof OFFICE;

const SHORT = (o: Office) => OFFICE[o].dept.replace("福岡県 ", "").replace(/（.*$/, "");

const desk = (office: Office): Contact => ({
  ...OFFICE[office],
  hours: "平日 9:00〜11:30・13:00〜16:00（建築指導課の窓口受付時間）",
  note: PREF_NOTE,
  noPhoneInquiry: true,
});

const SRC = "県「教えて広場」の「各県土整備事務所の所管区域・問い合わせ先」";
const JUN = "都市計画区域の外に、準都市計画区域がある（県「準都市計画区域指定市町について」）。接道の決まりは、準都市計画区域の中でもかかる（県「建築基準法上の道路について」）。";

/**
 * 県が扱う市町村。道路種別の地図はネットに無いので、県土整備事務所の建築指導課の窓口で確かめる。
 * area は都市計画区域の範囲（国の令和7年都市計画現況調査の都市別一覧）：whole＝全域、part＝一部、blank＝範囲の欄が空、none＝都市計画区域は無い（準都市計画区域だけ）
 * jun は準都市計画区域のある市町（県「準都市計画区域指定市町について」の22市町）
 */
const prefTown = (name: string, code: string, office: Office, area: "whole" | "part" | "blank" | "none", opt: { jun?: boolean; extra?: string } = {}): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps: [],
  contact: desk(office),
  note: `県が扱う市町村（建築確認と道路の判定は${SHORT(office)}。${SRC}）。県の道路種別の地図はネットに無い。建築指導課の窓口に備え付けの地図などで確かめ、未判定の道は「建築基準法第42条道路の確認依頼書」を出す。${
    area === "none" ? `${name}に都市計画区域は無いが、準都市計画区域がある（国の令和7年都市計画現況調査・県「準都市計画区域指定市町について」）。接道の決まりは、準都市計画区域の中でもかかる（県「建築基準法上の道路について」）。` : ""
  }${area === "part" ? `${name}の一部は都市計画区域の外（国の令和7年都市計画現況調査の都市別一覧）。` : ""}${area !== "none" && opt.jun ? JUN : ""}${opt.extra ?? ""}${name}が出している地図（市町村道の地図など）は調べている途中。`,
});

/** 都市計画区域も準都市計画区域も無い村（国の令和7年都市計画現況調査の2つの一覧に無い。県の準都市計画区域の22市町にも無い） */
const outsideTown = (name: string, code: string, office: Office): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: desk(office),
  note: `全域が都市計画区域外（国の令和7年都市計画現況調査の都市別一覧に${name}の都市計画区域は無く、準都市計画区域の一覧にも無い）。建築基準法の接道の決まり（43条）は、都市計画区域・準都市計画区域の中でかかる（県「建築基準法上の道路について」）。建築のことは${SHORT(office)}が受け持つ（${SRC}）。`,
});

export const FUKUOKA: Municipality[] = [
  // 福岡県土整備事務所（古賀市・糟屋郡・糸島市）
  prefTown("古賀市", "40223", "fukuoka", "part", { jun: true }),
  prefTown("糸島市", "40230", "fukuoka", "part"),
  prefTown("宇美町", "40341", "fukuoka", "part"),
  prefTown("篠栗町", "40342", "fukuoka", "part", { jun: true }),
  prefTown("志免町", "40343", "fukuoka", "blank"),
  prefTown("須恵町", "40344", "fukuoka", "whole"),
  prefTown("新宮町", "40345", "fukuoka", "part"),
  prefTown("久山町", "40348", "fukuoka", "whole"),
  prefTown("粕屋町", "40349", "fukuoka", "blank"),
  // 那珂県土整備事務所
  prefTown("筑紫野市", "40217", "naka", "part", { jun: true }),
  prefTown("春日市", "40218", "naka", "whole"),
  prefTown("大野城市", "40219", "naka", "whole"),
  prefTown("太宰府市", "40221", "naka", "part", { jun: true }),
  prefTown("那珂川市", "40231", "naka", "part", { jun: true }),
  // 朝倉県土整備事務所（朝倉市・朝倉郡）
  prefTown("朝倉市", "40228", "asakura", "part", { jun: true }),
  prefTown("筑前町", "40447", "asakura", "whole"),
  outsideTown("東峰村", "40448", "asakura"),
  // 久留米県土整備事務所（小郡市・うきは市・三井郡）
  prefTown("小郡市", "40216", "kurume", "whole"),
  prefTown("うきは市", "40225", "kurume", "none", { jun: true }),
  prefTown("大刀洗町", "40503", "kurume", "whole"),
  // 南筑後県土整備事務所 柳川支所（柳川市・大川市・みやま市・三潴郡）
  prefTown("柳川市", "40207", "yanagawa", "whole"),
  prefTown("大川市", "40212", "yanagawa", "whole"),
  prefTown("みやま市", "40229", "yanagawa", "part", { jun: true }),
  prefTown("大木町", "40522", "yanagawa", "none", { jun: true }),
  // 八女県土整備事務所（八女市・筑後市・八女郡）
  prefTown("八女市", "40210", "yame", "part", { jun: true }),
  prefTown("筑後市", "40211", "yame", "whole"),
  prefTown("広川町", "40544", "yame", "whole"),
  // 飯塚県土整備事務所（飯塚市・嘉麻市・嘉穂郡）
  prefTown("飯塚市", "40205", "iizuka", "part", { jun: true }),
  prefTown("嘉麻市", "40227", "iizuka", "part", { jun: true }),
  prefTown("桂川町", "40421", "iizuka", "part"),
  // 直方県土整備事務所（直方市・宮若市・鞍手郡）
  prefTown("直方市", "40204", "nogata", "whole"),
  prefTown("宮若市", "40226", "nogata", "part", { jun: true }),
  prefTown("小竹町", "40401", "nogata", "whole"),
  prefTown("鞍手町", "40402", "nogata", "whole"),
  // 田川県土整備事務所（田川市・田川郡）
  prefTown("田川市", "40206", "tagawa", "whole"),
  prefTown("香春町", "40601", "tagawa", "none", { jun: true }),
  prefTown("添田町", "40602", "tagawa", "part"),
  prefTown("糸田町", "40604", "tagawa", "none", { jun: true }),
  prefTown("川崎町", "40605", "tagawa", "whole"),
  prefTown("大任町", "40608", "tagawa", "none", { jun: true }),
  outsideTown("赤村", "40609", "tagawa"),
  prefTown("福智町", "40610", "tagawa", "none", { jun: true }),
  // 北九州県土整備事務所（中間市・遠賀郡・宗像市・福津市）
  prefTown("中間市", "40215", "kitakyushu", "whole"),
  prefTown("宗像市", "40220", "kitakyushu", "part"),
  prefTown("福津市", "40224", "kitakyushu", "part", { jun: true }),
  prefTown("芦屋町", "40381", "kitakyushu", "whole"),
  prefTown("水巻町", "40382", "kitakyushu", "whole"),
  prefTown("岡垣町", "40383", "kitakyushu", "whole"),
  prefTown("遠賀町", "40384", "kitakyushu", "whole"),
  // 京築県土整備事務所（豊前市・築上郡・行橋市・京都郡）
  prefTown("行橋市", "40213", "keichiku", "whole"),
  prefTown("豊前市", "40214", "keichiku", "part", { jun: true }),
  prefTown("苅田町", "40621", "keichiku", "part", { jun: true }),
  prefTown("みやこ町", "40625", "keichiku", "blank", {
    extra: "みやこ町は、令和8年9月1日に、準都市計画区域だった所が都市計画区域になった（県「準都市計画区域指定市町について」）。",
  }),
  prefTown("吉富町", "40642", "keichiku", "whole"),
  prefTown("上毛町", "40646", "keichiku", "none", { jun: true }),
  prefTown("築上町", "40647", "keichiku", "part", { jun: true }),
];
