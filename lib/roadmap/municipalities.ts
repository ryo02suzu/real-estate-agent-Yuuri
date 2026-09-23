import { wgs84ToTokyo } from "./datum";

// 埼玉県・人口上位22市の「建築基準法上の道路」の調べ方（2026-09 調査）。
// 詳細と出典は docs/saitama-research.md。

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

export type Municipality = {
  name: string;
  /** 国土地理院の逆ジオコーダが返す muniCd。さいたま市は区ごとのコード */
  codes: string[];
  /** ネットで道路種別がどこまで分かるか */
  coverage: "full" | "partial" | "none";
  maps: MapLink[];
  contact?: Contact;
  note?: string;
};

// --- GISベンダーごとのURLテンプレート -------------------------------------

/**
 * wagmap。受け取る座標の測地系が自治体ごとに違う（間違えると約450mずれる）。
 * 実測: 越谷・上尾・熊谷・川越 = 旧日本測地系、朝霞 = 世界測地系
 */
const wagmap =
  (slug: string, mid: number, datum: "tokyo" | "wgs84") =>
  (lat: number, lng: number) => {
    const p = datum === "tokyo" ? wgs84ToTokyo(lat, lng) : { lat, lng };
    return `https://www2.wagmap.jp/${slug}/Map?mid=${mid}&mpx=${p.lng.toFixed(6)}&mpy=${p.lat.toFixed(6)}&mps=1000`;
  };

/** Sonicweb（さいたま市）。座標は世界測地系のまま */
const sonicweb =
  (slug: string, theme: string, scale = 1000) =>
  (lat: number, lng: number) =>
    `https://www.sonicweb-asp.jp/${slug}/map?theme=${theme}&pos=${lng.toFixed(6)}%2C${lat.toFixed(6)}&scale=${scale}`;

// --- 市ごとのデータ（人口順） ----------------------------------------------

export const MUNICIPALITIES: Municipality[] = [
  {
    name: "さいたま市",
    codes: ["11101", "11102", "11103", "11104", "11105", "11106", "11107", "11108", "11109", "11110"],
    coverage: "partial",
    maps: [
      { kind: "designated_only", label: "指定道路図（位置指定道路のみ）", build: sonicweb("saitama", "th_45"), verified: true },
      { kind: "public_road", label: "認定路線（市道）", build: sonicweb("saitama", "th_31"), verified: false },
    ],
    contact: { dept: "北部／南部建設事務所 建築指導課", note: "区によって担当の建設事務所が異なる" },
    note: "ネットで分かるのは位置指定道路と市道認定まで。2項道路などは建設事務所で確認。",
  },
  {
    name: "川口市",
    codes: ["11203"],
    coverage: "partial",
    maps: [
      {
        kind: "road_type",
        label: "指定道路マップ",
        build: (lat, lng) =>
          `https://kawaguchi.geocloud.jp/webgis/?z=18&ll=${lat.toFixed(6)}%2C${lng.toFixed(6)}&t=roadmap&mp=22&op=70&vlf=-1`,
        verified: false,
      },
    ],
    contact: { dept: "建築安全課", phone: "048-242-6344（第1係）/ 048-258-1199（第2係）", hours: "9:00〜16:30" },
    note: "URL形式は市の公式ページ記載のもの。自動テストはブロックされたため、スマホ実機で位置を要確認。",
  },
  {
    name: "川越市",
    codes: ["11201"],
    coverage: "none",
    maps: [{ kind: "public_road", label: "道路台帳・網図（市道）", build: wagmap("kawagoe", 25, "tokyo"), verified: true }],
    contact: { dept: "建設管理課（道路台帳）", phone: "049-224-5987" },
    note: "建築基準法上の道路種別はネット非公開。窓口の問い合わせ方法は要確認。",
  },
  {
    name: "所沢市",
    codes: ["11208"],
    coverage: "none",
    maps: [
      { kind: "public_road", label: "所沢市地理情報システム（市道）", build: null, url: "http://webgis.alandis.jp/tokorozawa11/alandis/portal/", verified: false },
    ],
    contact: {
      dept: "建築指導課（市役所低層棟2階）",
      email: "a9180@city.tokorozawa.lg.jp",
      note: "電話は原則不可。メールは地番・地図・公図を添付、回答まで数日。",
      noPhoneInquiry: true,
    },
  },
  {
    name: "越谷市",
    codes: ["11222"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "建築基準法上の道路種別", build: wagmap("koshigayacity", 31, "tokyo"), verified: true },
      { kind: "public_road", label: "道路台帳・認定路線", build: wagmap("koshigayacity", 5, "tokyo"), verified: true },
    ],
  },
  {
    name: "草加市",
    codes: ["11221"],
    coverage: "none",
    maps: [
      { kind: "public_road", label: "道路台帳図（市道）", build: null, url: "https://www.city.soka.saitama.jp/cont/s1901/daicho/PAGE000000000000081854.html", verified: false },
    ],
    contact: { dept: "建築安全課 建築指導係", phone: "048-922-1958", note: "建築基準法上の扱いは電話で確認" },
  },
  {
    name: "春日部市",
    codes: ["11214"],
    coverage: "none",
    maps: [{ kind: "public_road", label: "かすかべオラナビ（道路台帳参考図）", build: null, url: "https://kasukabe.geocloud.jp/mp/11", verified: false }],
    contact: {
      dept: "建築課 建築安全担当",
      phone: "048-796-8046",
      hours: "平日 8:30〜17:15",
      note: "道路種別の確認は窓口のみ（電話不可）",
      noPhoneInquiry: true,
    },
  },
  {
    name: "上尾市",
    codes: ["11219"],
    coverage: "full",
    maps: [{ kind: "road_type", label: "指定道路図（建築基準法道路種別）", build: wagmap("ageocity", 9, "tokyo"), verified: true }],
  },
  {
    name: "熊谷市",
    codes: ["11202"],
    coverage: "partial",
    maps: [
      { kind: "designated_only", label: "位置指定道路情報", build: wagmap("kumagaya", 170, "tokyo"), verified: true },
      { kind: "public_road", label: "道路台帳図・認定路線網図", build: wagmap("kumagaya", 90, "tokyo"), verified: true },
    ],
  },
  {
    name: "新座市",
    codes: ["11230"],
    coverage: "partial",
    maps: [
      { kind: "designated_only", label: "指定道路図（道路位置指定図）", build: null, url: "https://www.city.niiza.lg.jp/img/shiteidourozu/toshikeizu.html", verified: false },
      { kind: "public_road", label: "にいざマップ（道路台帳）", build: null, url: "https://www.city.niiza.lg.jp/soshiki/33/niizamap-douro.html", verified: false },
    ],
    contact: { dept: "建築審査課" },
  },
  {
    name: "久喜市",
    codes: ["11232"],
    coverage: "none",
    maps: [],
    contact: { dept: "建築指導課", phone: "0480-22-1111（代表）", note: "道路種別判定依頼書（付近見取図・公図・現況写真）の提出が必要" },
  },
  {
    name: "狭山市",
    codes: ["11215"],
    coverage: "partial",
    maps: [
      { kind: "road_type", label: "指定道路図（案内ページ）", build: null, url: "https://www.city.sayama.saitama.jp/jigyo/kaihatsu/douro_shoukai_tel.html", verified: false },
    ],
    contact: { dept: "都市建設部 建築住宅課", phone: "04-2946-8234", hours: "平日 9:00〜16:30" },
    note: "指定道路図はWeb地図にあるが、座標指定URLは未調査。",
  },
  {
    name: "入間市",
    codes: ["11225"],
    coverage: "none",
    maps: [],
    contact: { dept: "都市整備部 開発建築課", phone: "04-2964-1111（代表）" },
  },
  {
    name: "朝霞市",
    codes: ["11227"],
    coverage: "full",
    maps: [
      { kind: "road_type", label: "建築基準法道路（公道・私道とも）", build: wagmap("asaka", 120, "wgs84"), verified: true },
      { kind: "public_road", label: "道路情報（市道）", build: wagmap("asaka", 81, "wgs84"), verified: false },
    ],
    contact: { dept: "都市建設部 開発建築課", phone: "048-463-2585" },
  },
  {
    name: "三郷市",
    codes: ["11237"],
    coverage: "none",
    maps: [],
    contact: { dept: "開発指導課 建築指導係", phone: "048-930-7743", note: "地名地番を調べてから問い合わせる" },
  },
  {
    name: "戸田市",
    codes: ["11224"],
    coverage: "partial",
    maps: [
      { kind: "public_road", label: "いいとだマップ（道路路線図）", build: null, url: "https://www.city.toda.saitama.jp/soshiki/273/doro-kanri-rosenzu.html", verified: false },
    ],
    contact: { dept: "建築住宅課", phone: "048-441-1800", hours: "平日 8:30〜17:15" },
    note: "市道で認定・現況幅員4m以上なら42条1項1号（市の案内より）。それ以外と新曽の区画整理地内は問い合わせ。",
  },
  {
    name: "深谷市",
    codes: ["11218"],
    coverage: "none",
    maps: [],
    contact: { dept: "建築住宅課", phone: "048-574-6655", note: "道路の扱いは電話・メール不可、窓口のみ", noPhoneInquiry: true },
  },
  {
    name: "鴻巣市",
    codes: ["11217"],
    coverage: "none",
    maps: [],
    contact: {
      dept: "建築住宅課（本庁舎2階30番窓口）",
      note: "電話・FAX・メール不可、窓口のみ。先に道路課（28番窓口）で査定状況を確認してから行く",
      noPhoneInquiry: true,
    },
  },
  {
    name: "ふじみ野市",
    codes: ["11245"],
    coverage: "none",
    maps: [],
    contact: { dept: "建築課 建築指導係", phone: "049-220-2069", hours: "平日 8:30〜17:15" },
  },
  {
    name: "富士見市",
    codes: ["11235"],
    coverage: "partial",
    maps: [
      {
        kind: "designated_only",
        label: "道路位置指定の閲覧（図面番号から選ぶPDF）",
        build: null,
        url: "https://www.city.fujimi.saitama.jp/kurashi_tetsuzuki/sumai/jyuutaku/shiteidouro-etsuran/shitei-douro-etsuran.html",
        verified: false,
      },
      { kind: "public_road", label: "路線網図（市道）", build: null, url: "https://www.city.fujimi.saitama.jp/kurashi_tetsuzuki/05douro/doro_kotsu/douromouzu.html", verified: false },
    ],
    contact: { dept: "建築指導課" },
  },
  {
    name: "加須市",
    codes: ["11210"],
    coverage: "none",
    maps: [],
    contact: { dept: "都市整備部 建築開発課（建築指導担当）", phone: "0480-62-1111（代表）", hours: "平日 8:30〜17:15" },
  },
  {
    name: "坂戸市",
    codes: ["11239"],
    coverage: "none",
    maps: [],
    contact: { dept: "建築指導担当" },
    note: "e-マップさかど（https://sakado.geogeo.jp/）に建築確認情報あり。道路種別の問い合わせ方法は未調査。",
  },
];

export function findMunicipality(muniCd: string): Municipality | undefined {
  return MUNICIPALITIES.find((m) => m.codes.includes(muniCd));
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
