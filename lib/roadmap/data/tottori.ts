// 鳥取県（2026-11 調査）。出典は docs/tottori-research.md。
// 市が建築確認と道路を扱うのは、鳥取市・米子市・倉吉市と、限定特定行政庁の境港市（県「県内特定行政庁」）。ほかの15町村は県の3つの窓口が受け持つ（同じページ）：
//   東部建築住宅事務所：岩美郡（岩美町）・八頭郡（若桜町・智頭町・八頭町）
//   中部総合事務所 環境建築局 住宅課：東伯郡（三朝町・湯梨浜町・琴浦町・北栄町）
//   西部総合事務所 環境建築局 建築住宅課：西伯郡（日吉津村・大山町・南部町・伯耆町）・日野郡（日南町・日野町・江府町）と、境港市のうち市が扱わない建築物
// 県の道路種別の地図は、ネットに見つからなかった。県は「具体的な計画地における建築基準法等のお問い合わせは、計画地を所管する特定行政庁に」と案内している
// （県「建築基準法関係」）。
// 都市計画区域の無い町は、大山町・南部町・伯耆町・日南町・日野町・江府町の6つ（国の令和7年都市計画現況調査の都市別一覧）。
// 県のサイトの決まり：トップページへのリンクは了解不要（載せたら連絡）。トップページ以外へのリンクは、そのページの担当へ問い合わせる
// （いまの登録では、県のページへのリンクは置いていない）。
// まだ：市が扱う4市（鳥取市・米子市・倉吉市・境港市）は調べている途中（data/chugoku.ts の調査中の一覧）。県が扱う町村も、町村が出している地図
// （町村道の地図・とっとりジオマップなど）と町村の窓口は調べている途中。
import type { Contact, Municipality } from "../municipalities";

const pref = "鳥取県" as const;

/** 県の案内（県「建築基準法関係」「県内特定行政庁」） */
const PREF_NOTE = "県は、計画地の建築基準法のことは、その場所を受け持つ窓口に問い合わせるよう案内している（県「建築基準法関係」）。道路種別の地図はネットに見つからなかったので、窓口で確かめる。";

/** 県の窓口（名前・場所・電話は県「県内特定行政庁」） */
const OFFICE = {
  tobu: { dept: "鳥取県 東部建築住宅事務所（鳥取市立川町6丁目176 東部庁舎内）", phone: "0857-20-3648" },
  chubu: { dept: "鳥取県 中部総合事務所 環境建築局 住宅課（倉吉市東巌城町2）", phone: "0858-23-3235" },
  seibu: { dept: "鳥取県 西部総合事務所 環境建築局 建築住宅課（米子市糀町1丁目160）", phone: "0859-31-9753" },
} as const;
type Office = keyof typeof OFFICE;

const SHORT = (o: Office) => OFFICE[o].dept.replace("鳥取県 ", "").replace(/（.*$/, "");

const desk = (office: Office): Contact => ({ ...OFFICE[office], note: PREF_NOTE });

/** 県が扱う町村（都市計画区域あり）。道路種別の地図はネットに無いので、県の窓口で確かめる。whole は都市計画区域が全域の村 */
const prefTown = (name: string, code: string, office: Office, whole = false): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps: [],
  contact: desk(office),
  note: `県が扱う町村（建築確認と道路の判定は${SHORT(office)}。県「県内特定行政庁」）。県の道路種別の地図はネットに見つからなかった。道路種別は県の窓口で確かめる。${whole ? "" : `${name}の一部は都市計画区域の外（国の令和7年都市計画現況調査の都市別一覧）。`}${name}が出している地図（町村道の地図など）は調べている途中。`,
});

/** 都市計画区域の無い町（国の令和7年都市計画現況調査の都市別一覧に無い） */
const outsideTown = (name: string, code: string, office: Office): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: desk(office),
  note: `全域が都市計画区域外（国の令和7年都市計画現況調査の都市別一覧に${name}の都市計画区域は無い）。建築基準法の接道の決まり（43条）は、都市計画区域・準都市計画区域の中でかかる。建築のことは${SHORT(office)}が受け持つ（県「県内特定行政庁」）。`,
});

export const TOTTORI: Municipality[] = [
  // 東部建築住宅事務所（岩美郡・八頭郡）
  prefTown("岩美町", "31302", "tobu"),
  prefTown("若桜町", "31325", "tobu"),
  prefTown("智頭町", "31328", "tobu"),
  prefTown("八頭町", "31329", "tobu"),
  // 中部総合事務所（東伯郡）
  prefTown("三朝町", "31364", "chubu"),
  prefTown("湯梨浜町", "31370", "chubu"),
  prefTown("琴浦町", "31371", "chubu"),
  prefTown("北栄町", "31372", "chubu"),
  // 西部総合事務所（西伯郡・日野郡）
  prefTown("日吉津村", "31384", "seibu", true),
  outsideTown("大山町", "31386", "seibu"),
  outsideTown("南部町", "31389", "seibu"),
  outsideTown("伯耆町", "31390", "seibu"),
  outsideTown("日南町", "31401", "seibu"),
  outsideTown("日野町", "31402", "seibu"),
  outsideTown("江府町", "31403", "seibu"),
];
