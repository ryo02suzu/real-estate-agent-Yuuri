// 上下水道・ガスの照会先（重説の「飲用水・電気・ガスの供給施設及び排水施設」の欄の確認先）。市区町村ごとの水道事業者（末端給水）・
// 公共下水道の管理者・都市ガスの一般ガス導管事業者と、配管図・下水道台帳・ガス管の埋設状況を確かめる方法を書いた公式のページ
// （data/utilities.json。事業者・市区町村・都県の公式の資料で調べた。2026年10月、上水道・下水道は1都3県の212市区町村）。
// 前面道路の管・口径・引込みの有無は、ここで確かめる
import DATA from "./data/utilities.json";
import type { Municipality } from "./municipalities";

export type UtilityKind = "上水道" | "下水道" | "ガス";

/** 照会先の1件 */
export type UtilityContact = {
  kind: UtilityKind;
  /** 「東京都水道局」 */
  name: string;
  /** 配管図・台帳・埋設状況の確かめ方のページ（無ければ担当の公式ページ。top） */
  url: string;
  /** url が確かめ方のページでなく、担当の公式ページ */
  top?: boolean;
  /** 確かめ方の一言（「給水装置の図面は営業所で閲覧」） */
  how?: string;
  /** 市区町村の一部だけを受け持つとき「一部」と、その地域の一言 */
  area?: string;
};

export type Utilities = {
  water: UtilityContact[];
  sewer: UtilityContact[];
  /** 空なら都市ガスの導管事業者の供給区域に無い市町村。調べていなければ undefined */
  gas?: UtilityContact[];
};

type Provider = { url: string; top?: boolean; how?: string };
/** [事業者, 受け持つ地域（全域なら省く）] */
type Served = [name: string, area?: string];
type Stored = { checked: string; providers: Record<string, Provider>; cities: Record<string, { water?: Served[]; sewer?: Served[]; gas?: Served[] }> };

// JSON の配列は string[][] と推論されるので、unknown を通して形を付ける
const D = DATA as unknown as Stored;

/** データを調べた時点（「2026年10月」） */
export const UTILITIES_CHECKED = D.checked;

const contacts = (kind: UtilityKind, list: Served[] | undefined): UtilityContact[] =>
  (list ?? []).flatMap(([name, area]) => {
    const p = D.providers[name];
    return p ? [{ kind, name, url: p.url, ...(p.top ? { top: true } : {}), ...(p.how ? { how: p.how } : {}), ...(area ? { area } : {}) }] : [];
  });

/** 物件の市区町村の照会先（調べていない市区町村は undefined） */
export function utilitiesFor(m: Pick<Municipality, "pref" | "name">): Utilities | undefined {
  const c = D.cities[`${m.pref}${m.name}`];
  if (!c) return undefined;
  return { water: contacts("上水道", c.water), sewer: contacts("下水道", c.sewer), ...(c.gas ? { gas: contacts("ガス", c.gas) } : {}) };
}

/** リンクの文字（「図面の閲覧」など。確かめ方のページが無い事業者は「公式ページ」） */
export const contactLinkText = (c: UtilityContact) => (c.top ? "公式ページ" : c.kind === "ガス" ? "埋設状況の照会" : c.kind === "下水道" ? "台帳の閲覧" : "図面の閲覧");

/** 「東京都水道局」「千葉県企業局（一部：○○地区）」 */
export const contactName = (c: UtilityContact) => `${c.name}${c.area ? `（${c.area}）` : ""}`;

/** 都市ガスの導管が無い市町村の一言 */
export const NO_CITY_GAS = "都市ガスの導管事業者の供給区域に無い（プロパンガスか、団地などのガス）";

/** 公共下水道（汚水）の無い市町村の一言（都県の下水道の一覧で「未実施」。2026年10月に1都3県で30市町村） */
export const NO_SEWER = "公共下水道（汚水）の無い市町村（排水は浄化槽・農業集落排水など。市町村の担当で確認）";

/** 照会先が無いとき（空の一覧）の一言：下水道は公共下水道が無い、ガスは都市ガスの区域に無い */
export const noContactText = (kind: UtilityKind) => (kind === "下水道" ? NO_SEWER : NO_CITY_GAS);
