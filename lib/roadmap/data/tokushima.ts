// 徳島県（2026-11 調査）。出典は docs/tokushima-research.md。
// 市が建築確認と道路を扱うのは徳島市だけ（県のよくある質問「建築確認の申請の手続きが知りたい。」：徳島市内は徳島市の建築指導課の建築主事へ）。
// ほかの23市町村は、敷地のある区域を受け持つ県土整備事務所の建築担当（県「オンラインによる道路相談について」の問い合わせ先）：
//   徳島県土整備事務所：鳴門市・小松島市・松茂町・北島町・藍住町・板野町・勝浦町・上勝町・佐那河内村・神山町
//   吉野川県土整備事務所：吉野川市・阿波市・石井町・上板町
//   阿南県土整備事務所：阿南市・那賀町・牟岐町・美波町・海陽町
//   美馬県土整備事務所：美馬市・つるぎ町
//   三好県土整備事務所：三好市・東みよし町
// 県の道路種別の地図は、ネットに見つからなかった。県は、道路種別の問い合わせを電子メールなどで受けている（「道路相談依頼書」に現地案内図・配置図を添えて、
// 受け持ちの建築担当へ送る。判定の済んでいない道は、現地調査のため回答に2〜3週間程度。急ぐときは電話で受信を確かめる。メールは25MB以下）。
// 県のチラシ「建築基準法上の道路種別の問合せについて」：1項1号（道路法の道路）は道路管理者へ。それ以外は県土整備事務所の建築担当へ。窓口は平日 8:30〜12:00・13:00〜16:00。
// 都市計画区域の無い市町村は10（阿波市・勝浦町・上勝町・佐那河内村・神山町・那賀町・海陽町・板野町・上板町・東みよし町）。国の令和7年都市計画現況調査の
// 都市別一覧と、県のチラシの「都市計画区域外である次の地域」が同じ。一部が区域外の市町の、区域外の地区名も県のチラシから。
// まだ：徳島市は調べている途中（data/shikoku.ts の調査中の一覧）。県が扱う市町村も、市町村が出している地図（市町村道の地図など）と市町村の窓口は調べている途中。
import type { Contact, Municipality } from "../municipalities";

const pref = "徳島県" as const;

/** 県の決まり（県「オンラインによる道路相談について」・チラシ「建築基準法上の道路種別の問合せについて」） */
const PREF_NOTE =
  "道路種別の問い合わせは、電子メールなどで受けている。県の「道路相談依頼書」に書き、現地案内図・配置図を添えて送る（様式は県のページ「オンラインによる道路相談について」）。判定の済んでいない道は、現地調査のため回答に2〜3週間程度かかり、道の写真・公図・土地の全部事項証明書を求められることがある。急ぐときは電話で受信を確かめる。メールは25MB以下。国道・県道・市町村道（1項1号）かどうかは道路管理者に確かめる（県のチラシ）。";

/** 県土整備事務所の建築担当（場所・電話・FAX・メールは県「オンラインによる道路相談について」の問い合わせ先） */
const OFFICE = {
  tokushima: { dept: "徳島県 徳島県土整備事務所 建築担当（徳島市南末広町6-36）", phone: "088-653-8819", fax: "088-653-9029", email: "kenchiku_toubutokushima@mail.pref.tokushima.lg.jp" },
  yoshinogawa: { dept: "徳島県 吉野川県土整備事務所 建築担当（吉野川市川島町宮島736-1）", phone: "0883-26-3714", fax: "0883-26-3992", email: "kenchiku_toubuyoshinogawa@mail.pref.tokushima.lg.jp" },
  anan: { dept: "徳島県 阿南県土整備事務所 建築担当（阿南市富岡町あ王谷46）", phone: "0884-24-4214", fax: "0884-24-4654", email: "kenchiku_nanbuanan@mail.pref.tokushima.lg.jp" },
  mima: { dept: "徳島県 美馬県土整備事務所 建築担当（美馬市脇町大字猪尻字建神社下南73）", phone: "0883-53-2214", fax: "0883-53-2083", email: "kenchiku_seibumima@mail.pref.tokushima.lg.jp" },
  miyoshi: { dept: "徳島県 三好県土整備事務所 建築担当（三好市池田町マチ2415）", phone: "0883-76-0609", fax: "0883-76-0452", email: "kenchiku_seibumiyoshi@mail.pref.tokushima.lg.jp" },
} as const;
type Office = keyof typeof OFFICE;

const SHORT = (o: Office) => OFFICE[o].dept.replace("徳島県 ", "").replace(/（.*$/, "");

const desk = (office: Office): Contact => ({
  ...OFFICE[office],
  hours: "平日 8:30〜12:00・13:00〜16:00（県のチラシの問合せ窓口の時間）",
  note: PREF_NOTE,
});

/**
 * 県が扱う市町（都市計画区域あり）。道路種別の地図はネットに無いので、県土整備事務所の建築担当に問い合わせる。
 * outsideParts は、県のチラシが「都市計画区域外」と書く地区（無ければ全域が都市計画区域）
 */
const prefTown = (name: string, code: string, office: Office, outsideParts?: string): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "none",
  maps: [],
  contact: desk(office),
  note: `県が扱う市町（建築確認と道路の判定は${SHORT(office)}。県「オンラインによる道路相談について」）。県の道路種別の地図はネットに見つからなかった。道路種別は、県の「道路相談依頼書」を電子メールなどで送って問い合わせる。${outsideParts ? `${name}のうち${outsideParts}は都市計画区域の外で、道路種別の確認は要らない（県のチラシ「建築基準法上の道路種別の問合せについて」。区域は県の「都市計画マップ」で確かめる）。` : ""}${name}が出している地図（市町道の地図など）は調べている途中。`,
});

/** 都市計画区域の無い市町村（国の令和7年都市計画現況調査の都市別一覧に無い。県のチラシの「都市計画区域外である次の地域」にも入っている） */
const outsideTown = (name: string, code: string, office: Office): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: desk(office),
  note: `全域が都市計画区域外（国の令和7年都市計画現況調査の都市別一覧に${name}の都市計画区域は無い）。県は「都市計画区域外においては、道に接していなくても建築することができますので、道路種別の確認は不要です」と書く（県「オンラインによる道路相談について」。チラシの都市計画区域外の地域に${name}がある）。建築のことは${SHORT(office)}が受け持つ。`,
});

export const TOKUSHIMA: Municipality[] = [
  // 徳島県土整備事務所
  prefTown("鳴門市", "36202", "tokushima", "北灘町"),
  prefTown("小松島市", "36203", "tokushima"),
  prefTown("松茂町", "36401", "tokushima"),
  prefTown("北島町", "36402", "tokushima"),
  prefTown("藍住町", "36403", "tokushima"),
  outsideTown("板野町", "36404", "tokushima"),
  outsideTown("勝浦町", "36301", "tokushima"),
  outsideTown("上勝町", "36302", "tokushima"),
  outsideTown("佐那河内村", "36321", "tokushima"),
  outsideTown("神山町", "36342", "tokushima"),
  // 吉野川県土整備事務所
  prefTown("吉野川市", "36205", "yoshinogawa", "川島町・山川町・美郷"),
  outsideTown("阿波市", "36206", "yoshinogawa"),
  prefTown("石井町", "36341", "yoshinogawa"),
  outsideTown("上板町", "36405", "yoshinogawa"),
  // 阿南県土整備事務所
  prefTown("阿南市", "36204", "anan", "一部の地域"),
  outsideTown("那賀町", "36368", "anan"),
  prefTown("牟岐町", "36383", "anan", "一部の地域"),
  prefTown("美波町", "36387", "anan", "一部の地域"),
  outsideTown("海陽町", "36388", "anan"),
  // 美馬県土整備事務所
  prefTown("美馬市", "36207", "mima", "脇町の一部の地域と、美馬町・穴吹町・木屋平"),
  prefTown("つるぎ町", "36468", "mima", "半田・一宇と、貞光の一部の地域"),
  // 三好県土整備事務所
  prefTown("三好市", "36208", "miyoshi", "池田町の一部の地域と、三野町・井川町・山城町・東祖谷・西祖谷山村"),
  outsideTown("東みよし町", "36489", "miyoshi"),
];
