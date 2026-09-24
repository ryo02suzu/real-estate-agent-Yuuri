// 市区町村ごとの「建築基準法上の道路」の調べ方。データ本体は data/ 以下、出典は docs/ 以下。
import { CHIBA } from "./data/chiba";
import { GUNMA } from "./data/gunma";
import { IBARAKI } from "./data/ibaraki";
import { KANAGAWA } from "./data/kanagawa";
import { SAITAMA } from "./data/saitama";
import { TOCHIGI } from "./data/tochigi";
import { TOKYO } from "./data/tokyo";

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
};

export type Contact = {
  dept: string;
  phone?: string;
  email?: string;
  hours?: string;
  /** 電話で答えてくれるか等、問い合わせ時の注意 */
  note?: string;
  /** 道路種別を電話では答えてくれない（窓口・メールのみ）。UIで発信ボタンを出さない */
  noPhoneInquiry?: boolean;
};

export type Prefecture = "埼玉県" | "千葉県" | "神奈川県" | "東京都" | "群馬県" | "栃木県" | "茨城県";

export type Municipality = {
  pref: Prefecture;
  name: string;
  /** 国土地理院の逆ジオコーダが返す muniCd。政令市は区ごとのコード */
  codes: string[];
  /**
   * ネットで道路種別がどこまで分かるか。
   * outside = 市町村内に都市計画区域が無い（建築基準法の接道義務＝43条は原則かからない）
   */
  coverage: "full" | "partial" | "none" | "outside";
  maps: MapLink[];
  contact?: Contact;
  /** 区によって窓口が違う政令市用。muniCd → 窓口 */
  contactByCode?: Record<string, Contact>;
  note?: string;
};

export const MUNICIPALITIES: Municipality[] = [...SAITAMA, ...CHIBA, ...KANAGAWA, ...TOKYO, ...GUNMA, ...TOCHIGI, ...IBARAKI];

export function findMunicipality(muniCd: string): Municipality | undefined {
  return MUNICIPALITIES.find((m) => m.codes.includes(muniCd));
}

/** その地点（muniCd）の問い合わせ先。区ごとの窓口があればそちらを優先 */
export function resolveContact(m: Municipality, muniCd: string): Contact | undefined {
  return m.contactByCode?.[muniCd] ?? m.contact;
}

export type ResolvedLink = { kind: MapKind; label: string; url: string; pinpoint: boolean; verified: boolean };

/** 座標から、その市で開くべき地図のURL一覧を作る */
export function buildLinks(m: Municipality, lat: number, lng: number): ResolvedLink[] {
  return m.maps.map((link) => ({
    kind: link.kind,
    label: link.label,
    url: link.build ? link.build(lat, lng) : link.url!,
    pinpoint: link.build !== null,
    verified: link.verified,
  }));
}
