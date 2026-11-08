// 市区町村ごとの「建築基準法上の道路」の調べ方。データ本体は data/ 以下、出典は docs/ 以下。
import { CHIBA } from "./data/chiba";
import { GUNMA } from "./data/gunma";
import { IBARAKI } from "./data/ibaraki";
import { KANAGAWA } from "./data/kanagawa";
import { SAITAMA } from "./data/saitama";
import { TOCHIGI } from "./data/tochigi";
import { TOKYO } from "./data/tokyo";
import { CHUBU_PENDING } from "./data/chubu";
import { TOHOKU_PENDING } from "./data/tohoku";
import { MIYAGI } from "./data/miyagi";
import { SHIZUOKA } from "./data/shizuoka";
import { YAMANASHI } from "./data/yamanashi";
import { NAGANO } from "./data/nagano";
import { AICHI } from "./data/aichi";
import { FUKUI } from "./data/fukui";
import { GIFU } from "./data/gifu";
import { ISHIKAWA } from "./data/ishikawa";
import { NIIGATA } from "./data/niigata";
import { TOYAMA } from "./data/toyama";
import { legendFor, type LegendEntry } from "./legends";
import type { RoadRead } from "./road-read";
import { findSheet, type SheetHit, type SheetIndex } from "./sheets";

/** 地図に何が載っているか */
export type MapKind =
  | "road_type" // 建築基準法上の道路種別（42条1項1号〜2項まで全種別）
  | "designated_only" // 位置指定道路（42条1項5号）だけ
  | "public_road"; // 道路台帳・認定路線（市道かどうか＝公道かの目安）

export type MapLink = {
  kind: MapKind;
  label: string;
  /** 座標付きURLを作る。null なら入口ページしか開けない（url を使う） */
  build: ((lat: number, lng: number) => string) | null;
  /** build が null のときに開く入口ページ */
  url?: string;
  /** 実機で「その地点が中心に開く」ことを確認済みか */
  verified: boolean;
  /** 開いたあとに必要な操作（レイヤの切り替えなど）。ボタンの下に出す */
  tip?: string;
  /** PDFの分割図で公開している市：どの図かを座標から求める索引（無ければ url の一覧ページを開く） */
  sheets?: SheetIndex;
  /** 地図のデータ（公開の ArcGIS レイヤ）を読んで、物件のまわりの道路の種別を文字で出せる地図（lib/roadmap/road-read.ts） */
  read?: RoadRead;
};

export type Contact = {
  dept: string;
  phone?: string;
  /** FAX 番号（公式のページに載っているものだけ。照会を送る画面の FAX の宛先に入る） */
  fax?: string;
  email?: string;
  hours?: string;
  /** 電話で答えてくれるか等、問い合わせ時の注意 */
  note?: string;
  /** 道路種別を電話では答えてくれない（窓口・メールのみ）。UIでは発信ボタンを控えめにし「窓口の確認用」と添える */
  noPhoneInquiry?: boolean;
};

export type Prefecture =
  | "埼玉県"
  | "千葉県"
  | "神奈川県"
  | "東京都"
  | "群馬県"
  | "栃木県"
  | "茨城県"
  | "新潟県"
  | "富山県"
  | "石川県"
  | "福井県"
  | "山梨県"
  | "長野県"
  | "岐阜県"
  | "静岡県"
  | "愛知県"
  | "青森県"
  | "岩手県"
  | "宮城県"
  | "秋田県"
  | "山形県"
  | "福島県";

export type Municipality = {
  pref: Prefecture;
  name: string;
  /** 国土地理院の逆ジオコーダが返す muniCd。政令市は区ごとのコード */
  codes: string[];
  /**
   * ネットで道路種別がどこまで分かるか。
   * outside = 市町村内に都市計画区域が無い（建築基準法の接道義務＝43条は原則かからない）
   * unknown = 公開の有無をまだ調べていない（登録したばかりの地方。国のデータは出すが、道路図は県か市の建築指導課へ）
   */
  coverage: "full" | "partial" | "none" | "outside" | "unknown";
  maps: MapLink[];
  contact?: Contact;
  /** 区によって窓口が違う政令市用。muniCd → 窓口 */
  contactByCode?: Record<string, Contact>;
  note?: string;
};

export const MUNICIPALITIES: Municipality[] = [...SAITAMA, ...CHIBA, ...KANAGAWA, ...TOKYO, ...GUNMA, ...TOCHIGI, ...IBARAKI, ...SHIZUOKA, ...YAMANASHI, ...NAGANO, ...AICHI, ...GIFU, ...NIIGATA, ...TOYAMA, ...ISHIKAWA, ...FUKUI, ...CHUBU_PENDING, ...MIYAGI, ...TOHOKU_PENDING];

/**
 * 市区町村に都市計画区域が無い（全域が都市計画区域外）と分かっているか。coverage が outside か、注記にそう書いてある町村
 * （長瀞町・清川村・嬬恋村のように、県や村の条例で接道の決まりがあるので coverage は outside ではない所）。
 * 都市計画のデータ（国の GIS）に無い町村で「都市計画区域外」と言ってよいかに使う
 */
export function noCityPlanning(m: Municipality): boolean {
  return m.coverage === "outside" || /全域が都市計画区域外/.test(m.note ?? "");
}

export function findMunicipality(muniCd: string): Municipality | undefined {
  return MUNICIPALITIES.find((m) => m.codes.includes(muniCd));
}

/** その地点（muniCd）の問い合わせ先。区ごとの窓口があればそちらを優先 */
export function resolveContact(m: Municipality, muniCd: string): Contact | undefined {
  return m.contactByCode?.[muniCd] ?? m.contact;
}

export type ResolvedLink = {
  kind: MapKind;
  label: string;
  url: string;
  pinpoint: boolean;
  verified: boolean;
  tip?: string;
  /** 分割図の市で、物件が載っている図 */
  sheet?: SheetHit;
  /** 物件のまわりの道路の種別を読めるとき、その読み方 */
  read?: RoadRead;
  /** 地図の線の色と種別（凡例を文字にしたもの。data/legends.json） */
  legend?: LegendEntry[];
};

/** 座標から、その市で開くべき地図のURL一覧を作る。town（逆ジオコーダの町名）は地区ごとの図を選ぶのに使う */
export function buildLinks(m: Municipality, lat: number, lng: number, town?: string): ResolvedLink[] {
  return m.maps.map((link) => {
    const sheet = link.sheets && findSheet(link.sheets, lat, lng, town);
    const url = sheet ? sheet.url : link.build ? link.build(lat, lng) : link.url!;
    // PDF を図ごとに開く市は、図の URL ではなく案内ページの URL で凡例を引く（凡例はどの図も同じ）。凡例は道路種別の色なので、
    // 道路台帳・認定路線の地図には付けない（同じテーマの別のレイヤで開く市がある。狭山市の指定道路図と認定路線）
    const legend =
      link.kind === "public_road" ? undefined : (legendFor(url, m.name) ?? (sheet && link.url ? legendFor(link.url, m.name) : undefined));
    return {
      kind: link.kind,
      label: link.label,
      url,
      pinpoint: link.build !== null,
      verified: link.verified,
      // 分割図の市で、どの図にも入らない場所（図の無い地域）は、一覧から探しても見つからないことを伝える
      tip: link.sheets && !sheet ? "この場所を含む図は見つかりませんでした。一覧に無ければ、下の問い合わせ先で確認してください。" : link.tip,
      sheet,
      ...(link.read ? { read: link.read } : {}),
      ...(legend ? { legend } : {}),
    };
  });
}
