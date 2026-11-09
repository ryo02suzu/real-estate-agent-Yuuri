// 福島県 全59市町村（2026-11 調査）。出典は docs/fukushima-research.md。
// 特定行政庁は福島県と福島市・郡山市・いわき市。会津若松市・須賀川市は小規模な建築物だけを市が扱う（限定特定行政庁）。ほかは県の7つの
// 建設事務所の建築住宅課が扱う。
// 県は「指定道路図」（5号＝位置指定道路と2項道路のうち調査済みの道。県「建築基準法に規定する「指定道路図」の公開について」）を38市町村で
// 公開していて、市町村ごとのページに国土基本図 1/2500 の図郭（平面直角座標 第IX系）の PDF を並べている。物件の位置から図を選ぶ
// （sheets/fukushima.json、scripts/sheets/fukushima.py）。図は参考図で、43条の判断・境界・不動産取引の資料には使えず、図についての問い合わせは
// 建設事務所の窓口だけ（電話等では答えない）。西会津町は「公開準備中」。
// 県中・県南・会津若松・喜多方・南会津・相双の建設事務所は、道路の相談を市町村の窓口へ案内している（下の ROUTE）。そこでこの6事務所の
// 管内は市町村の窓口を問い合わせ先にし、同じ案内の見つからない県北建設事務所の管内は建設事務所を問い合わせ先にする。
// 都市計画区域の無い15町村は coverage: outside（県「都市計画に関する市町村問合せ先について」。準都市計画区域は県内に無い＝国の都市計画現況調査）。
import FK_SHEETS from "./sheets/fukushima.json";
import type { Contact, MapLink, Municipality } from "../municipalities";
import type { SheetIndex } from "../sheets";
import { arcgisExperience, sonicweb, wagmap } from "../vendors";

const pref = "福島県" as const;

/** 県の建設事務所の建築住宅課（番号は事務所のページ。県中の FAX とメールは事務所の「相談票」の欄） */
const OFFICE = {
  kenpoku: {
    dept: "福島県 県北建設事務所 建築住宅課（指導審査担当）",
    phone: "024-521-2575",
    fax: "024-521-2849",
    email: "kenpoku.ken@pref.fukushima.lg.jp",
    note: "FAX は建築住宅部、メールは事務所の代表（事務所の「アクセス・連絡先」）。",
  },
  kenchu: {
    dept: "福島県 県中建設事務所 建築住宅課（指導審査担当）",
    phone: "024-935-1462",
    fax: "024-935-1404",
    email: "kentyuu.kenchiku@pref.fukushima.lg.jp",
    note: "相談は相談票に書き、資料を添えてメールで送る（事務所の「建築物関係法令・支援制度」）。",
  },
  kennan: {
    dept: "福島県 県南建設事務所 建築住宅課",
    phone: "0248-23-1636",
    fax: "0248-23-1642",
    email: "kennan.ken@pref.fukushima.lg.jp",
    note: "FAX とメールは事務所の代表（事務所の「よくある質問」）。",
  },
  wakamatsu: {
    dept: "福島県 会津若松建設事務所 建築住宅課（指導審査担当）",
    phone: "0242-29-5461",
    fax: "0242-29-5413",
  },
  kitakata: {
    dept: "福島県 喜多方建設事務所 建築住宅課",
    phone: "0241-24-5727",
    fax: "0241-24-5729",
    email: "kitakata.ken.kenntikuzyutaku@pref.fukushima.lg.jp",
    note: "建築基準法の相談は相談表に書いてメールで送る（事務所の Q&A）。FAX は事務所の代表。",
  },
  minamiaizu: {
    dept: "福島県 南会津建設事務所 建築住宅課",
    phone: "0241-62-5337",
    fax: "0241-62-5274",
  },
  souso: {
    dept: "福島県 相双建設事務所 建築住宅課（指導審査担当）",
    phone: "0244-26-1223",
    fax: "0244-26-1334",
    email: "souken_kenchiku@pref.fukushima.lg.jp",
    note: "相談は相談票に書き、資料を添えてメールで送る（事務所の「建築住宅課」）。",
  },
} satisfies Record<string, Contact>;
type Office = keyof typeof OFFICE;

/** 事務所の短い名前（注記の中で使う） */
const SHORT: Record<Office, string> = {
  kenpoku: "県北建設事務所 建築住宅課",
  kenchu: "県中建設事務所 建築住宅課",
  kennan: "県南建設事務所 建築住宅課",
  wakamatsu: "会津若松建設事務所 建築住宅課",
  kitakata: "喜多方建設事務所 建築住宅課",
  minamiaizu: "南会津建設事務所 建築住宅課",
  souso: "相双建設事務所 建築住宅課",
};

/** 道路の相談を市町村の窓口へ案内している事務所の案内（県北は見つからなかった） */
const ROUTE: Partial<Record<Office, string>> = {
  kenchu: "道路と都市計画の相談は計画地の市町村の窓口へ、と県中建設事務所が案内している（事務所の「建築物関係法令・支援制度」）。",
  kennan: "建築確認申請と、それに係る道路・接道の相談は市町村の窓口へ、と県南建設事務所が案内している（事務所の「よくある質問」の表）。",
  wakamatsu: "都市計画区域の内外・用途地域・道路などは各市町村の窓口へ、と会津若松建設事務所が案内している（事務所の「管内の建築などに関する問い合わせ先」）。",
  kitakata: "都市計画区域・用途地域・道路種別は市町村の建築担当部署へ、と喜多方建設事務所が案内している（事務所の「建築物に関する FAQ」）。",
  minamiaizu: "都市計画区域の内外・用途地域・道路などは各町村の窓口へ、と南会津建設事務所が案内している（事務所の「建築住宅課」のページ）。",
  souso: "道路と都市計画の相談は計画地の市町村へ、道路種別は市町村の建築担当部署へ、と相双建設事務所が案内している（事務所の「建築住宅課」「よくある問合せ Q&A」）。",
};

type SheetPage = SheetIndex & { name: string; page: string; date: string };
const SHEETS = FK_SHEETS as unknown as Record<string, SheetPage>;

/** 県の指定道路図（市町村のページの図郭の PDF。物件の位置の図を開く） */
const shitei = (slug: string, office: Office): MapLink => {
  const p = SHEETS[slug];
  return {
    kind: "designated_only",
    label: `指定道路図（福島県・位置指定道路と2項道路、${p.date}更新）`,
    build: null,
    url: p.page,
    verified: true,
    tip: `県の参考図。調査済みの位置指定道路（5号、橙）と2項道路（水色）だけが載り、ほかの種別や調べていない道は載らない。幅員・境界は分からない。43条の接道の判断・土地の境界・不動産取引の資料には使えない（県の「ご利用上の注意」）。図の内容は${SHORT[office]}の窓口で確かめる（電話等では答えない）。`,
    sheets: p,
  };
};

/** 図についての問い合わせ（県のページ）。県北の窓口の注記に添える */
const mapDesk = (office: Office) => `県の指定道路図の内容は${SHORT[office]}（${OFFICE[office].phone}）の窓口で確かめる（電話等では答えない。県のページ）。`;

/** 市町村の窓口を問い合わせ先にする（県北以外の6事務所の管内）。図の確認と建築確認の審査をする建設事務所を注記に書く */
const muniDesk = (office: Office, c: Contact, map: boolean): Contact => ({
  ...c,
  note: `${c.note ?? ""}${ROUTE[office] ?? ""}${
    map
      ? `県の指定道路図の内容の確認と建築確認の審査は${SHORT[office]}（${OFFICE[office].phone}。図については窓口だけで、電話等では答えない）。`
      : `建築確認の審査は${SHORT[office]}（${OFFICE[office].phone}）。`
  }`,
});

const MAP_NOTE = "県が扱う市町村。県の指定道路図（PDF）で、調査済みの位置指定道路と2項道路が分かる（物件の位置の図を開く）。ほかの種別や図に無い道は市町村の窓口で聞く（県の建設事務所の案内）。";
const NOMAP_NOTE = "県が扱う市町村。道路種別の地図のネット公開は見つからなかった。道路の相談は市町村の窓口で（県の建設事務所の案内）。";

/** 県が扱う市町村で、市町村の窓口を問い合わせ先にする所 */
const deskTown = (name: string, code: string, office: Office, c: Contact, slug: string | null, extra = "", maps: MapLink[] = []): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: slug ? "partial" : "none",
  maps: [...(slug ? [shitei(slug, office)] : []), ...maps],
  contact: muniDesk(office, c, slug !== null),
  note: (slug ? MAP_NOTE : NOMAP_NOTE) + extra,
});

/** 県北建設事務所の管内（建設事務所を問い合わせ先にする。図についての問い合わせは窓口だけ） */
const kenpokuTown = (name: string, code: string, slug: string, extra = "", maps: MapLink[] = []): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "partial",
  maps: [shitei(slug, "kenpoku"), ...maps],
  contact: { ...OFFICE.kenpoku, noPhoneInquiry: true, note: `${OFFICE.kenpoku.note}${mapDesk("kenpoku")}` },
  note: `県が扱う市町村。県の指定道路図（PDF）で、調査済みの位置指定道路と2項道路が分かる（物件の位置の図を開く）。ほかの種別や図に無い道は県北建設事務所の建築住宅課へ。${extra}`,
});

/** 都市計画区域の無い町村（県の表に無い15町村） */
const outsideTown = (name: string, code: string, office: Office, c: Contact, extra = ""): Municipality => ({
  pref,
  name,
  codes: [code],
  coverage: "outside",
  maps: [],
  contact: muniDesk(office, c, false),
  note: `全域が都市計画区域外（県「都市計画に関する市町村問合せ先について」の表に無い15市町村の一つ。準都市計画区域も県内に無い）。${extra}`,
});

/** 市町村の道路網図・認定路線網図（PDF の入口ページ） */
const roadPdf = (label: string, url: string, tip: string): MapLink => ({ kind: "public_road", label, build: null, url, verified: true, tip });

const NO_TYPE = "建築基準法の道路種別は載っていない（町道・市道かどうかの目安）。";

export const FUKUSHIMA: Municipality[] = [
  // --- 特定行政庁・限定特定行政庁の5市 ------------------------------------------------
  {
    pref,
    name: "福島市",
    codes: ["07201"],
    coverage: "partial",
    maps: [
      {
        kind: "designated_only",
        label: "位置指定道路の一部（ふくしまeマップ・2024年12月掲載）",
        build: null,
        url: "https://www.city.fukushima.fukushima.jp/soshiki/12/1061/1/5/5351.html",
        verified: true,
        tip: "市のページの「ふくしまeマップ」から、利用条件に同意して開く。位置指定道路（5号）の一部（指定・変更・廃止）の概略だけで、2項道路などほかの種別は載らない。取引の資料には使えず、正確な情報は本庁舎6階の開発建築指導課の窓口で（この情報についての電話・ファックスの問い合わせには答えない）。",
      },
      {
        kind: "public_road",
        label: "市道網図（ふくしまeマップ）",
        build: null,
        url: "https://www.city.fukushima.fukushima.jp/soshiki/11/1055/2/2124.html",
        verified: true,
        tip: `市のページの手順で、ふくしまeマップの「市道網図」を選ぶ。線が引かれていれば市道で、押すと市道番号・名称。幅員は電話では答えず、路政課の窓口へ。${NO_TYPE}`,
      },
    ],
    contact: {
      dept: "都市政策部 開発建築指導課 指導係（本庁舎6階）",
      phone: "024-525-3764",
      fax: "024-533-0026",
      note: "道路種別は電話では答えない（間違いの影響が大きく、トラブル防止のため）。窓口へ公図・地積測量図・道路台帳・現況写真などを持って相談する。遠方で来庁が難しいときや急ぐときは、必ず先に連絡してから案内図・公図・配置図を FAX すれば、道路種別に限って答える（市「建築基準法の道路調査（道路種別）、相談窓口」）。市道の確認は建設部 路政課（024-529-7687）。",
      noPhoneInquiry: true,
    },
    note: "特定行政庁（すべての建築物を市が扱う）。道路種別の地図のネット公開は無く、ふくしまeマップに位置指定道路の一部と市道網図。道路種別は開発建築指導課の窓口で。",
  },
  {
    pref,
    name: "会津若松市",
    codes: ["07202"],
    coverage: "partial",
    maps: [
      {
        kind: "designated_only",
        label: "位置指定道路（会津若松市 公開用GIS・指定番号と指定年月日）",
        build: arcgisExperience("57a82df733f947b3bc28226a7c69de3d", "widget_6"),
        verified: true,
        tip: "最初の「注意事項及び利用条件」を読んで OK を押す。42条の道路の概要で、内容を証明するものではない。昭和47年度以前の指定は申請当時の地名地番から位置を推定したもの。2項道路（みなし道路）は載らない。",
      },
      roadPdf(
        "市道路線網図（PDF・索引図と01〜40、1/10,000）",
        "https://www.city.aizuwakamatsu.fukushima.jp/docs/2009030900029/",
        `索引図で図の番号を確かめて開く。路線名の確認用で、幅員は載らない。境界・幅員は開発管理課（0242-39-1266）へ。${NO_TYPE}`,
      ),
    ],
    contact: {
      dept: "建設部 建築住宅課 建築指導グループ（栄町第一庁舎）",
      phone: "0242-39-1307",
      fax: "0242-39-1454",
      hours: "平日 8:30〜17:15",
      note: "位置指定道路の申請はこの課で受け付ける（市「道路位置指定の申請手続き」）。県の会津若松建設事務所の「管内の建築などに関する問い合わせ先」（2020年）は、都市計画区域・用途地域・道路を市の都市計画課（0242-39-1261）としている。市が扱わない大きな建築物の審査は会津若松建設事務所 建築住宅課（0242-29-5461）。",
    },
    note: "限定特定行政庁（小規模な建築物だけ市。ほかは県）。位置指定道路は市の公開用GIS で指定番号・指定年月日まで見られる（物件の位置で開く）。2項道路の地図は無い。県の指定道路図の対象には入っていない。",
  },
  {
    pref,
    name: "郡山市",
    codes: ["07203"],
    coverage: "partial",
    maps: [
      {
        kind: "designated_only",
        label: "指定済みの道路（郡山市地理情報システム・一部だけ公表）",
        build: null,
        url: "https://www.city.koriyama.lg.jp/soshiki/133/2305.html",
        verified: true,
        tip: "市のページの「郡山市地理情報システム」から開く。指定済みの道路は全部を公表しておらず、詳しくは開発建築法務課の窓口で（市のページ）。",
      },
      {
        kind: "public_road",
        label: "道路台帳図（郡山市地理情報システム・2025年4月1日時点）",
        build: sonicweb("koriyama2", "th_2005"),
        verified: false,
        tip: `利用条件に同意して見る。2026年4月から Web で閲覧・印刷できる（市役所の窓口での交付は廃止）。${NO_TYPE}`,
      },
      {
        kind: "public_road",
        label: "認定路線図（郡山市地理情報システム・2025年4月1日時点）",
        build: null,
        url: "https://www.city.koriyama.lg.jp/soshiki/22/1161.html",
        verified: true,
        tip: `市のページで利用条件を読み「同意して利用する」から開いて、認定路線図を選ぶ。${NO_TYPE}`,
      },
    ],
    contact: {
      dept: "都市構想部 開発建築法務課（本庁舎3階）",
      phone: "024-924-2371",
      fax: "024-938-2720",
      email: "kentikuhoumu@city.koriyama.lg.jp",
      note: "指定済みの道路は、この課の窓口と郡山市地理情報システムで確かめられる（全部は公表していない）。市道は建設構想部 道路保全課（024-924-2301）。",
    },
    note: "特定行政庁（すべての建築物を市が扱う）。道路種別の地図のネット公開は無く、地理情報システムに指定済みの道路の一部と道路台帳図・認定路線図。道路種別は開発建築法務課の窓口で。",
  },
  {
    pref,
    name: "いわき市",
    codes: ["07204"],
    coverage: "none",
    maps: [
      {
        kind: "public_road",
        label: "市道の認定状況（いわきiマップ）",
        build: null,
        url: "https://www.sonicweb-asp.jp/iwaki/",
        verified: false,
        tip: `市のページが「市道の認定状況はいわきiマップで確認ができます」と案内する地図。${NO_TYPE}`,
      },
    ],
    contact: {
      dept: "都市建設部 建築指導課 指導係（本庁舎7階）",
      phone: "0246-22-7516",
      fax: "0246-22-7566",
      note: "道路種別の電話での問い合わせには答えない（位置の特定が難しく、トラブル防止のため）。指定道路図は建築指導課（本庁舎7階）の窓口で閲覧する。先に市道の認定と幅員を確かめてから来庁する（市「建築基準法の道路種別について」）。市道の幅員は土木部 維持保全課（0246-22-7494）や各支所の経済土木課。",
      noPhoneInquiry: true,
    },
    note: "特定行政庁（すべての建築物を市が扱う）。指定道路図は窓口だけで、ネットは市道の認定状況（いわきiマップ）だけ。電話では答えない。",
  },
  {
    pref,
    name: "須賀川市",
    codes: ["07207"],
    coverage: "none",
    maps: [],
    contact: {
      dept: "建設部 まち共創課 都市政策係",
      phone: "0248-88-9154",
      fax: "0248-94-4563",
      note: "市が受け付ける確認申請・道路位置指定申請などは、関係する課の確認のあと、まち共創課で最後に受け付ける（市「建築確認申請等」）。市が扱わない建築物は県中建設事務所 建築住宅課（024-935-1462）か指定確認検査機関へ。市道は道路河川課 管理係（0248-88-9147）。",
    },
    note: "限定特定行政庁（小規模な建築物だけ市。ほかは県）。道路種別・位置指定道路・市道の地図のネット公開は見つからなかった。県の指定道路図の対象にも入っていない。",
  },

  // --- 県北建設事務所の管内（7市町村） ---------------------------------------------------
  kenpokuTown("二本松市", "07210", "nihonmatsu", "建築確認は市の建築住宅課 住宅係（0243-55-5133）が受ける（市の各課の案内）。市道の認定・道路台帳は土木課 維持係（0243-55-5125）。"),
  kenpokuTown(
    "伊達市",
    "07213",
    "date",
    "市も2項道路（みなし道路）の図を出していて、後退用地の事前協議は都市政策課 都市計画係（024-573-5620）。",
    [
      {
        kind: "designated_only",
        label: "みなし道路図（伊達市・2項道路だけ、2022年3月）",
        build: null,
        url: "https://www.city.fukushima-date.lg.jp/soshiki/23/5725.html",
        verified: true,
        tip: "索引図（連番か図郭番号）で番号を探し、網図一覧の PDF（約44MB）で見る。2項道路だけ。後退用地の事前協議は都市政策課 都市計画係。",
      },
      roadPdf(
        "市道路線網図（地区ごとの PDF 8枚）と市道路線確認調書",
        "https://www.city.fukushima-date.lg.jp/soshiki/26/40297.html",
        `市道かどうかと路線番号は路線網図、路線名・幅員・延長は調書で。場所ごとの幅員は電話・FAX・メールでは答えず、維持管理課の窓口へ。${NO_TYPE}`,
      ),
    ],
  ),
  kenpokuTown("本宮市", "07214", "motomiya", "", [
    roadPdf(
      "道路網図（本宮地区・白沢地区の PDF）と市道番号-市道名",
      "https://www.city.motomiya.lg.jp/soshiki/14/sidourosenzu-dourobangou.html",
      `利用条件に同意して使う参考図。道路網図で市道番号を調べ、市道番号-市道名で確かめる。図についての電話等の問い合わせは受け付けず、建設課の窓口で。${NO_TYPE}`,
    ),
  ]),
  kenpokuTown("桑折町", "07301", "koori", "町道は建設水道課 建設係（024-582-2127）。"),
  kenpokuTown("国見町", "07303", "kunimi", "町内には都市計画区域の外の地域もある（町のページ）。町道は建設課 管理係（024-585-2972）。"),
  kenpokuTown("川俣町", "07308", "kawamata", "", [
    roadPdf(
      "町道認定路線網図（町全体の PDF、2026年4月1日時点）と町道認定路線調書",
      "https://www.town.kawamata.lg.jp/site/kurashi-tetsuzuki/choudourosen.html",
      `町道かどうかと路線番号は網図、路線名・幅員・延長は地区ごとの調書で。${NO_TYPE}`,
    ),
  ]),
  kenpokuTown("大玉村", "07322", "otama", "道路関係の申請は村の建設課（建設課 管理係 0243-24-8112）。"),

  // --- 県中建設事務所の管内（9市町村。須賀川市は上） --------------------------------------
  deskTown(
    "田村市",
    "07211",
    "kenchu",
    { dept: "建設部 都市計画課 建築住宅係", phone: "0247-82-1114", fax: "0247-81-1210", note: "建築確認申請の受付（市の組織と業務）。市道は建設課 管理係（0247-81-2513）。" },
    "tamura",
  ),
  deskTown(
    "鏡石町",
    "07342",
    "kenchu",
    { dept: "都市建設課 都市グループ", phone: "0248-62-2116", fax: "0248-62-2144", email: "toshikensetsu@town.kagamiishi.lg.jp", note: "都市計画・道路の計画・建築確認申請などの係（町の課・係の連絡先）。" },
    "kagamiishi",
  ),
  outsideTown("天栄村", "07344", "kenchu", { dept: "建設課 事業係", phone: "0248-82-2113", fax: "0248-82-2477", note: "村道の占用などの係（村のページ）。" }),
  deskTown(
    "石川町",
    "07501",
    "kenchu",
    {
      dept: "都市建設課 都市整備係",
      phone: "0247-26-9131",
      fax: "0247-26-0360",
      email: "toshiseibi@town.ishikawa.fukushima.jp",
      note: "都市計画・建築確認の係。敷地の制限で分からない点はこの係に、と町の「建築確認申請」のページ。FAX は役場の番号。町道は土木維持係（0247-26-9132）。",
    },
    "ishikawa",
  ),
  deskTown(
    "玉川村",
    "07502",
    "kenchu",
    { dept: "地域整備課", phone: "0247-57-4626", fax: "0247-57-3952", note: "道路・建築基準法などの課（村の各課連絡先）。FAX は役場の番号。" },
    "tamakawa",
  ),
  deskTown(
    "平田村",
    "07503",
    "kenchu",
    { dept: "産業建設課 建設管理係", phone: "0247-55-3116", fax: "0247-55-3246", note: "都市計画・建築確認の係（村の産業建設課のページ）。" },
    "hirata",
  ),
  deskTown(
    "浅川町",
    "07504",
    "kenchu",
    { dept: "建設水道課 建設係", phone: "0247-36-1184", fax: "0247-36-2895", note: "建築確認・町道の係（町の担当課の案内）。FAX は役場の番号。" },
    "asakawa",
  ),
  outsideTown("古殿町", "07505", "kenchu", { dept: "地域整備課 管理係", phone: "0247-53-4612", fax: "0247-53-3154", note: "町道の認定・建築確認申請の係（町の行政組織）。FAX は役場の番号。" }),
  deskTown(
    "三春町",
    "07521",
    "kenchu",
    {
      dept: "建設課 都市グループ・建築グループ",
      phone: "0247-62-2113",
      fax: "0247-62-3300",
      email: "toshi@town.miharu.lg.jp",
      note: "建築確認申請は建築グループ、都市計画は都市グループ（町の組織）。町道は道路グループ（0247-62-2115）。",
    },
    "miharu",
  ),
  deskTown(
    "小野町",
    "07522",
    "kenchu",
    {
      dept: "地域整備課",
      phone: "0247-72-6936",
      fax: "0247-72-3121",
      email: "tiikiseibika@town.fukushima-ono.lg.jp",
      note: "住宅・建設・都市整備・道路の課（町の組織）。",
    },
    "ono",
  ),

  // --- 県南建設事務所の管内（9市町村。窓口は事務所の「よくある質問」の表） ------------------
  deskTown(
    "白河市",
    "07205",
    "kennan",
    { dept: "建設部 建築住宅課 建築係", phone: "0248-28-5532", fax: "0248-24-1854", note: "2項道路（みなし道路）に接する敷地は、この係と事前協議をする（市「2項道路（みなし道路事前協議）」）。" },
    "shirakawa",
  ),
  deskTown(
    "西郷村",
    "07461",
    "kennan",
    { dept: "建設課 管理・都市計画グループ", phone: "0248-25-1117", fax: "0248-25-2689", note: "村道の維持管理・認定と建築確認申請の窓口。" },
    "nishigo",
  ),
  deskTown(
    "泉崎村",
    "07464",
    "kennan",
    { dept: "建設水道課", phone: "0248-53-2114", fax: "0248-53-2958", note: "4m 未満の道に接する土地は、この課でみなし道路の事前協議をする（村「建築行政について」）。" },
    "izumizaki",
  ),
  deskTown("中島村", "07465", "kennan", { dept: "建設課 建設係（役場1階）", phone: "0248-52-3484", fax: "0248-52-2170" }, "nakajima"),
  deskTown(
    "矢吹町",
    "07466",
    "kennan",
    { dept: "都市整備課 都市計画係", phone: "0248-42-2116", note: "建築確認に伴う接道協議は、必ず町と行う（町「みなし道路及び位置指定について」）。" },
    "yabuki",
    "",
    [
      {
        kind: "public_road",
        label: "道路網図（矢吹タウンマップ・都市計画）",
        build: (lat, lng) =>
          `https://www.mtc-service.jp/MapPocketBookPublicYabuki/maps.html?latitude=${lat.toFixed(6)}&longitude=${lng.toFixed(6)}&zoom=2500&groupid=4`,
        verified: true,
        tip: `「都市計画」の地図（用途地域・都市計画道路・道路網図）が開く。道路網図の線を押すと種別・路線番号・路線名・最小車道幅員など。利用規約で営利目的での利用や地図の複製・再配布を禁じている。${NO_TYPE}`,
      },
    ],
  ),
  deskTown(
    "棚倉町",
    "07481",
    "kennan",
    { dept: "整備課 都市計画係", phone: "0247-33-2114", note: "都市計画・建築基準の係（町の各課紹介）。" },
    "tanagura",
    "",
    [
      {
        kind: "public_road",
        label: "道路情報（たなまっぷ・町道の認定路線と道路台帳図）",
        build: wagmap("tanagura", 4),
        verified: false,
        tip: `最初に利用規約の画面が出るので、読んで同意する。規約は営利目的での利用を禁じている。${NO_TYPE}`,
      },
    ],
  ),
  outsideTown("矢祭町", "07482", "kennan", { dept: "事業課 事業グループ", phone: "0247-46-4577", fax: "0247-46-3025" }),
  deskTown(
    "塙町",
    "07483",
    "kennan",
    { dept: "まち整備課 まち管理係", phone: "0247-43-2117", fax: "0247-43-2122", note: "都市計画・建築確認申請の審査と進達・みなし道路の係（町の課の紹介）。" },
    "hanawa",
  ),
  outsideTown("鮫川村", "07484", "kennan", { dept: "地域整備課 建設係", phone: "0247-49-3114", fax: "0247-49-3363" }),

  // --- 会津若松建設事務所の管内（7町村。会津若松市は上。窓口は事務所の問い合わせ先の表） --------
  deskTown("会津坂下町", "07421", "wakamatsu", { dept: "建設課 都市土木班", phone: "0242-84-1506", fax: "0242-83-1365" }, "aizubange"),
  deskTown("湯川村", "07422", "wakamatsu", { dept: "産業建設課 建設係", phone: "0241-27-8850", fax: "0241-27-3761" }, "yugawa"),
  outsideTown("柳津町", "07423", "wakamatsu", { dept: "建設課 建設係", phone: "0241-42-2117", email: "kensetsu@town.yanaizu.fukushima.jp" }),
  outsideTown("三島町", "07444", "wakamatsu", { dept: "産業建設課 産業建設係", phone: "0241-48-5566", fax: "0241-48-5544", note: "FAX は役場の番号。" }),
  outsideTown("金山町", "07445", "wakamatsu", { dept: "建設課 建設係", phone: "0241-54-5311", fax: "0241-54-2600", email: "kensetsu@town.kaneyama.fukushima.jp" }),
  outsideTown("昭和村", "07446", "wakamatsu", { dept: "産業建設課 建設係", phone: "0241-57-2123", fax: "0241-57-3044", note: "FAX は役場の番号。" }),
  deskTown(
    "会津美里町",
    "07447",
    "wakamatsu",
    { dept: "建設水道課 管理係（本庁舎2階）", phone: "0242-55-1181", fax: "0242-55-1139", note: "みなし道路（2項）に当たるかどうかは、この係に問い合わせる（町「みなし道路事前協議について」）。" },
    "aizumisato",
    "",
    [
      {
        kind: "public_road",
        label: "道路網図（ミサトマチマップ）",
        build: null,
        url: "https://www.town.aizumisato.fukushima.jp/soshiki/1008/7/6675.html",
        verified: true,
        tip: `町のページの利用規約を読んで地図を開き、「道路網図」を選ぶ。規約は商業・営利目的での利用と、土地建物の取引など権利や義務が発生する用途への利用はできないとしている。${NO_TYPE}`,
      },
    ],
  ),

  // --- 喜多方建設事務所の管内（5市町村） ---------------------------------------------------
  deskTown("喜多方市", "07208", "kitakata", { dept: "建設部 都市整備課 建築景観係", phone: "0241-24-5267", fax: "0241-25-7073", note: "市道は建設課 管理係（0241-24-5245）。" }, "kitakata"),
  outsideTown("北塩原村", "07402", "kitakata", { dept: "建設課 建設係", phone: "0241-23-3261", fax: "0241-25-7358" }),
  deskTown(
    "西会津町",
    "07405",
    "kitakata",
    { dept: "建設水道課 管理係", phone: "0241-45-4530", fax: "0241-45-2343", note: "都市計画・建築確認事務・町道の係（町の建設水道課のページ）。" },
    null,
    "県の指定道路図は「公開準備中」（県のページ）。",
  ),
  deskTown("磐梯町", "07407", "kitakata", { dept: "建設課 建設係", phone: "0242-74-1218", fax: "0242-73-2115", note: "FAX は役場の番号。" }, "bandai"),
  deskTown(
    "猪苗代町",
    "07408",
    "kitakata",
    { dept: "建設課 都市整備係", phone: "0242-62-2118", fax: "0242-62-5175", note: "都市計画・建築確認の係（町の建設課のページ）。" },
    "inawashiro",
    "",
    [
      {
        kind: "public_road",
        label: "認定路線マップ（猪苗代べんりマップ）",
        build: arcgisExperience("5ba3f2e38e49471ba9397e87dca73bbc", "widget_6"),
        verified: true,
        tip: `最初の「利用規約」を読み、同意のチェックを入れて OK を押す。町道の1級・2級・その他の線と、路線番号・路線名。${NO_TYPE}`,
      },
    ],
  ),

  // --- 南会津建設事務所の管内（4町村。窓口は事務所の「建築住宅課」のページの表） --------------
  outsideTown("下郷町", "07362", "minamiaizu", { dept: "建設課 管理係", phone: "0241-69-1177", fax: "0241-69-1167", note: "事務所の表（2021年）では「事業課」。" }),
  outsideTown("檜枝岐村", "07364", "minamiaizu", { dept: "産業建設課", phone: "0241-75-2501", note: "事務所の表（2021年）では「産業振興課」。" }),
  outsideTown("只見町", "07367", "minamiaizu", {
    dept: "農林建設課 建設係（町下庁舎1階）",
    phone: "0241-82-5270",
    fax: "0241-82-2845",
    email: "kensetsu@town.tadami.lg.jp",
    note: "道路・河川の係。事務所の表（2021年）では「環境整備課」。",
  }),
  deskTown(
    "南会津町",
    "07368",
    "minamiaizu",
    {
      dept: "建設課 都市計画係",
      phone: "0241-62-6230",
      fax: "0241-62-1288",
      note: "舘岩・伊南・南郷の地域は、事務所の表で各総合支所の振興課（舘岩 0241-78-3335・伊南 0241-76-7717・南郷 0241-72-2114）。",
    },
    "minamiaizu",
    "都市計画区域は町の一部。",
  ),

  // --- 相双建設事務所の管内（12市町村。窓口は事務所の「建築確認申請の手続きについて」の表） -----
  deskTown(
    "相馬市",
    "07209",
    "souso",
    { dept: "建設部 建築課 建築係（市役所庁舎2階）", phone: "0244-37-2178", note: "建築確認の係（市の各課の電話番号）。市道は都市整備課 監理係（0244-37-2196）。" },
    "soma",
    "",
    [
      roadPdf(
        "市道路線網図（PDF 4枚・区割図、1/10,000）",
        "https://www.city.soma.fukushima.jp/shinososhiki/toshiseibika/18641.html",
        `区割図で範囲を選ぶ。認定道路以外で市が管理する土地は載らない。境界・幅員・最新の認定は都市整備課の窓口で。${NO_TYPE}`,
      ),
    ],
  ),
  deskTown(
    "南相馬市",
    "07212",
    "souso",
    {
      dept: "建設部 都市計画課 建築営繕係（本庁舎2階）",
      phone: "0244-24-5255",
      fax: "0244-24-6151",
      note: "建築基準法の係（市の業務の案内）。事務所の表では「建築住宅課」。市道は土木課 土木企画係（0244-24-5252）。",
    },
    "minamisoma",
    "",
    [
      roadPdf(
        "市道路網図（小高区・鹿島区・原町区の PDF）",
        "https://www.city.minamisoma.lg.jp/portal/sections/17/1710/17101/1/2394.html",
        `区ごとに1枚の大きな PDF。認定路線以外で市が管理する道は載らない。最新の認定・境界・幅員は土木課の窓口で。${NO_TYPE}`,
      ),
    ],
  ),
  deskTown("広野町", "07541", "souso", { dept: "建設課", phone: "0240-27-4161", fax: "0240-27-4539" }, "hirono", "", [
    roadPdf(
      "広野町道路網図（町全体で1枚の PDF、2023年9月時点の認定町道）",
      "https://www.town.hirono.fukushima.jp/kurashi/sumai/1004286/1004287.html",
      `町全体で1枚の大きな図（約11MB）。町道かどうかを確かめられる（町のページ）。${NO_TYPE}`,
    ),
  ]),
  deskTown("楢葉町", "07542", "souso", { dept: "建設課", phone: "0240-23-6106", fax: "0240-25-1100" }, "naraha", "都市計画区域の外は、県が指定した建築確認の要る区域（建築基準法6条1項3号）。"),
  deskTown("富岡町", "07543", "souso", { dept: "都市整備課 都市計画係", phone: "0240-22-9008", fax: "0240-22-0899" }, "tomioka"),
  outsideTown("川内村", "07544", "souso", { dept: "建設課 土木係", phone: "0240-38-2115", fax: "0240-38-2116", note: "村道・建築指導などの係（村の課の案内）。" }),
  deskTown(
    "大熊町",
    "07545",
    "souso",
    {
      dept: "復興事業課 都市計画係",
      phone: "0240-23-7068",
      fax: "0240-23-7894",
      note: "建築工事に係る事業・都市計画の係（町の課のページ）。事務所の表の番号（0240-23-7091）は、いまは同じ課の下水道係。",
    },
    "ookuma",
    "県の指定道路図は、いまの役場（大川原）のあたりの図が公開されていない。",
  ),
  deskTown(
    "双葉町",
    "07546",
    "souso",
    { dept: "建設課 建設係", phone: "0240-33-0129", fax: "0240-33-0070", email: "kensetsu@town.futaba.fukushima.jp", note: "道路河川管理・土木建築・都市計画の係（町の課のページ）。" },
    "futaba",
    "",
    [
      {
        kind: "public_road",
        label: "町道（せんだんマップ・2025年2月28日時点）",
        build: arcgisExperience("41827d6b75b349d9adceeb807027f08c", "widget_6"),
        verified: true,
        tip: `線の色が町道の区分（1級・2級・その他）で、押すと路線番号・町道名・起点・終点。公に証明する資料（建築確認のための現地調査など）には使えない（町の利用規約）。${NO_TYPE}`,
      },
    ],
  ),
  deskTown(
    "浪江町",
    "07547",
    "souso",
    {
      dept: "建設課 土木管理係",
      phone: "0240-34-0243",
      fax: "0240-34-4198",
      note: "事務所の表の番号で、町道・橋梁・河川の維持管理の係（町の課のページ）。都市計画は同じ課の都市計画係（0240-34-0244）。",
    },
    "namie",
  ),
  outsideTown("葛尾村", "07548", "souso", { dept: "地域振興課 地域整備係", phone: "0240-29-2113", fax: "0240-29-2123", note: "建築工事届・建築確認申請を受けて県へ送る係（村のページ）。" }),
  deskTown(
    "新地町",
    "07561",
    "souso",
    { dept: "都市建設課 住宅都市整備係", phone: "0244-62-2113", fax: "0244-62-3194", note: "建築・開発の規制と指導、都市計画の係（町の課のページ）。事務所の表では「都市計画課」。町道は建設係（0244-62-2114）。" },
    "shinchi",
    "町の全域が都市計画区域。",
    [
      roadPdf(
        "新地町認定路線網図（町全体で1枚の PDF、2025年3月現在）",
        "https://www.shinchi-town.jp/soshiki/10/douro.html",
        `町全域で1枚（拡大して見る）。路線番号は図の右の一覧で路線名と照らす。詳しくは都市建設課 建設係へ（町のページ）。${NO_TYPE}`,
      ),
    ],
  ),
  outsideTown("飯舘村", "07564", "souso", { dept: "建設課", phone: "0244-42-1624", fax: "0244-42-1601" }),
];
