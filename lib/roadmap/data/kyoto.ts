// 京都府（2026-11 調査）。出典は docs/kyoto-research.md。
// 特定行政庁は京都府・京都市・宇治市（府「京都府内特定行政庁建築行政マネジメント計画」）。京都市・宇治市を除く24市町村は、府の7つの
// 土木事務所の建築住宅課が受け持つ（府「建築基準法についてのお問い合わせ先」の所管土木事務所一覧）。
// 府の道路の地図は「京都府指定道路図（GIS）」（府・市町村共同の統合型 GIS の「京都府指定道路マップ」）。府が指定した4号・5号・2項（一部）と
// 京都府特定通路・43条許可通路（一部）だけで、1号〜3号は載らない（府の注意事項「法上の全ての種類の道路を表示したものではありません」）。
// GIS の利用規約は、リンクしたら運営の協議会へメールで知らせるよう求めているので、アプリは GIS ではなく府のページ（規約と注意事項の入口）を開く。
// 道路地図についての質問は土木事務所の窓口だけで、電話・FAX・メールでは答えない（府の注意事項）。窓口で指定道路図と指定道路調書を見られる。
// 都市計画区域は13区域・22市町。笠置町・和束町・南山城村・伊根町には無く（国の令和7年都市計画現況調査の都市別一覧）、準都市計画区域も府内に無い。
// 京都市は区のコード（26101〜26111）をまとめて1つ。宇治市は調べている途中で、data/kinki.ts の調査中の一覧に残す。
// 府が扱う市町村が出している地図（市町村道の地図など）と市町村の窓口も調べている途中。
import type { Contact, MapLink, Municipality } from "../municipalities";
import { wagmap } from "../vendors";

const pref = "京都府" as const;

/** 府の決まり（府「京都府指定道路図（GIS）閲覧に係る注意事項について」・「建築計画概要書等閲覧規程」） */
const PREF_NOTE =
  "道路地図についての質問は窓口だけで、電話・FAX・メールでは答えない（府の注意事項）。窓口では指定道路図と指定道路調書を見られる（閲覧は 9:30〜16:30・無料。府の閲覧規程）。府に建築確認を申請する前に、物件のある市町村との事前協議が要る（府「確認申請の手続き・申請手数料について」）。";

/** 土木事務所の建築住宅課（電話は府「建築基準法についてのお問い合わせ先」。FAX・メールは各事務所のページ） */
const OFFICE = {
  otokuni: { dept: "京都府 乙訓土木事務所 建築住宅課", phone: "075-931-2478", fax: "075-931-2150", email: "yamashin-do-oto@pref.kyoto.lg.jp" },
  yamashirokita: { dept: "京都府 山城北土木事務所 建築住宅課", phone: "0774-62-2246", fax: "0774-62-0876", email: "yamashin-do-kita@pref.kyoto.lg.jp" },
  yamashirominami: { dept: "京都府 山城南土木事務所 建築住宅課", phone: "0774-72-9521", fax: "0774-72-0830", email: "yamashin-do-minami@pref.kyoto.lg.jp" },
  nantan: { dept: "京都府 南丹土木事務所 建築住宅課", phone: "0771-62-0364", fax: "0771-62-3494", email: "nanshin-do-nantan@pref.kyoto.lg.jp" },
  chutanhigashi: { dept: "京都府 中丹東土木事務所 建築住宅課", phone: "0773-42-8785", fax: "0773-42-7546", email: "chushin-do-higashi@pref.kyoto.lg.jp" },
  chutannishi: { dept: "京都府 中丹西土木事務所 建築住宅課", phone: "0773-22-5144", fax: "0773-22-5167", email: "chushin-do-nishi@pref.kyoto.lg.jp" },
  tango: { dept: "京都府 丹後土木事務所 建築住宅課", phone: "0772-22-2703", fax: "0772-22-1794", email: "tanshin-do-tango@pref.kyoto.lg.jp" },
} as const;
type Office = keyof typeof OFFICE;

const SHORT = (o: Office) => OFFICE[o].dept.replace("京都府 ", "");

const desk = (office: Office, extra = ""): Contact => ({
  ...OFFICE[office],
  hours: "指定道路図・指定道路調書の閲覧は 9:30〜16:30",
  note: `${PREF_NOTE}${extra}`,
  noPhoneInquiry: true,
});

/** 府の指定道路図（GIS）。物件の位置では開かず、規約・注意事項と地図の入口のある府のページを開く */
const PREF_MAP: MapLink = {
  kind: "designated_only",
  label: "京都府指定道路図（GIS）（府が指定した4号・5号・2項の一部・京都府特定通路など。2026年8月14日更新）",
  build: null,
  url: "https://www.pref.kyoto.jp/kenchiku/1291697604560.html",
  verified: true,
  tip: "府のページで利用規約と注意事項を読み、「京都府指定道路マップ」へ進む（地図の利用許諾の画面で自分で同意する）。府が指定した道路だけの図で、国道・府道・市町村道（1号）や2号・3号の道路は載らない。4号・5号・京都府特定通路は2026年6月末までに指定したもの、2項道路と43条許可通路は準備の整った一部の路線だけ（5号は形の明確でないものなどが未登載）。京都府特定通路は建築基準法の道路ではなく、接して建てるには43条2項2号の許可が要る。表示は指定のときの大まかな位置で、細かい指定区域は土木事務所の窓口で確かめる（府の注意事項）。GIS の利用規約は営利目的の利用を禁じている。",
};

/** 府が扱う市町村（都市計画区域あり） */
const prefTown = (name: string, code: string, office: Office, extra = ""): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [PREF_MAP],
  contact: desk(office),
  note: `府が扱う市町村（建築確認と道路の判定は${SHORT(office)}。府の所管土木事務所一覧）。府の指定道路図（GIS）で、府が指定した4号・5号・2項の一部などの大まかな位置が分かる（1号〜3号は載らない）。ほかの道路は土木事務所の窓口で確かめる。${name}が出している地図（市町村道の地図など）は調べている途中。${extra}`,
});

/** 都市計画区域の無い町村（国の令和7年都市計画現況調査の都市別一覧に無い。府「準都市計画区域の指定はありません」） */
const outsideTown = (name: string, code: string, office: Office): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: desk(office),
  note: `全域が都市計画区域外（国の令和7年都市計画現況調査の都市別一覧・令和7年3月31日現在に無い。準都市計画区域も府内に無い）。建築確認などは${SHORT(office)}へ。`,
});

export const KYOTO: Municipality[] = [
  // --- 特定行政庁（政令市） ---------------------------------------------------------
  {
    pref,
    name: "京都市",
    codes: ["26101", "26102", "26103", "26104", "26105", "26106", "26107", "26108", "26109", "26110", "26111"],
    coverage: "full",
    maps: [
      {
        kind: "road_type",
        label: "指定道路図（京都市地図情報提供サービス。2026年3月18日から）",
        build: wagmap("kyotocity", 3, { host: "https://kyoto-gis.city.kyoto.lg.jp" }),
        verified: false,
        tip: "最初に「指定道路図 御利用条件」の画面が出るので、読んで自分で「同意する」を押すと、物件の位置の地図に進む。線の色で1項1号〜5号・2項・3項と、道路でない道（非道路・避難通路・許可済通路・特定通路）・廃止した道が分かれ、色の無い道は未判定（市の凡例。3号と2項は同じ水色で、基準時の幅員が4m以上なら3号・4m未満なら2項）。位置指定道路は線から指定図を見られる。参考図で、幅員・境界・始端の位置や敷地の接道の状況は示さず、最新でもない。都市計画区域の外（左京区の花背峠より北、右京区の嵯峨樒原・嵯峨越畑・京北）は載らない。利用規約は営利目的での利用と、地図を印刷して再配布・再販することを禁じている。",
      },
      {
        kind: "designated_only",
        label: "位置指定道路の指定年月日・指定幅員（位置指定道路台帳の PDF、2026年4月末現在）",
        build: null,
        url: "https://www.city.kyoto.lg.jp/tokei/page/0000237598.html",
        verified: true,
        tip: "指定道路図の黄色の線（位置指定道路）の番号で引く、番号順の一覧（路線番号・住所地・指定年月日・指定延長・指定幅員）。地図ではないので位置では開けない。",
      },
      {
        kind: "public_road",
        label: "京都市道路情報等提供システム（認定路線・道路区域明示箇所・道路台帳平面図）",
        build: null,
        url: "https://www.city.kyoto.lg.jp/kensetu/page/0000113440.html",
        verified: true,
        tip: "市のページから「京都市地図情報提供サービス」の「認定路線等」へ進み、ご利用条件を読んで自分で同意する。市が管理する道路（認定路線）の名前・延長、道路区域明示箇所、道路台帳平面図（通行部の幅や側溝の寸法）を見られる。建築基準法の道路種別は載っていない（市の道路かどうかの目安。認定道路でも幅員4m未満などで建築基準法の道路でないことがある）。最新ではなく、道路台帳平面図の証明図は道路明示課の窓口で（1枚350円。郵送の発行もある）。ご利用条件は営利目的での利用を禁じている。",
      },
    ],
    contact: {
      dept: "都市計画局 建築指導部 建築指導課（道路担当）",
      phone: "075-222-3620",
      fax: "075-212-3657",
      hours: "8:45〜11:30・13:00〜15:00（課の受付時間）",
      note: "道路種別は電話では答えない（市「建築基準法上の道路種別と手続」。指定道路図の御利用条件は、窓口に来る以外の電話・FAX・メールの問い合わせには応じないと書く）。指定道路図は窓口でも見られるが、原則インターネットで確かめる（窓口のシステムでの写しの交付は2026年5月18日に廃止）。色の無い未判定の道は「道路種別判定依頼書」に付近見取図・敷地と前面の道の現況写真などを付けて建築指導課 道路担当へ出す（窓口・郵送・区ごとの電子申請。結果は申請からおおむね10開庁日ほどで連絡）。市の道路の認定路線・道路区域明示・道路台帳平面図は、建設局 土木管理部 道路明示課（075-222-3566、FAX 075-213-0174。窓口受付 9:00〜11:30・13:00〜16:30）。",
      noPhoneInquiry: true,
    },
    note: "特定行政庁（政令市。11の区とも窓口は市役所の建築指導課）。京都市地図情報提供サービスの「指定道路図」で、1項1号〜5号・2項・3項と道路でない道・未判定の道が分かる（御利用条件への同意が要る）。道路種別は電話では答えない。",
  },

  // --- 府が扱う市町村（都市計画区域あり・20） --------------------------------------
  prefTown("向日市", "26208", "otokuni"),
  prefTown("長岡京市", "26209", "otokuni"),
  prefTown("大山崎町", "26303", "otokuni"),
  prefTown("城陽市", "26207", "yamashirokita"),
  prefTown("八幡市", "26210", "yamashirokita"),
  prefTown("京田辺市", "26211", "yamashirokita"),
  prefTown("久御山町", "26322", "yamashirokita"),
  prefTown("井手町", "26343", "yamashirokita"),
  prefTown("宇治田原町", "26344", "yamashirokita"),
  prefTown("木津川市", "26214", "yamashirominami"),
  prefTown("精華町", "26366", "yamashirominami"),
  prefTown("亀岡市", "26206", "nantan"),
  prefTown("南丹市", "26213", "nantan"),
  prefTown("京丹波町", "26407", "nantan"),
  prefTown("舞鶴市", "26202", "chutanhigashi"),
  prefTown("綾部市", "26203", "chutanhigashi"),
  prefTown("福知山市", "26201", "chutannishi"),
  prefTown("宮津市", "26205", "tango"),
  prefTown("京丹後市", "26212", "tango"),
  prefTown("与謝野町", "26465", "tango"),

  // --- 都市計画区域の無い4町村 ------------------------------------------------------
  outsideTown("笠置町", "26364", "yamashirominami"),
  outsideTown("和束町", "26365", "yamashirominami"),
  outsideTown("南山城村", "26367", "yamashirominami"),
  outsideTown("伊根町", "26463", "tango"),
];
