// 近畿2府5県の市町村（227）のうち、道路種別の公式図・問い合わせ先をまだ調べ終えていない市町村（26。大阪府の15市と兵庫県の11市）。coverage: "unknown"（調査中）でここに置き、
// 調べた府県・市から data/<府県>.ts に移す（7府県の、府県が扱う市町村と政令市、三重県の8市、奈良県の3市、滋賀県の7市、宇治市、和歌山市は移した。2026-11）。
// 市区町村コードと名前は国土地理院の市区町村表（maps.gsi.go.jp/js/muni.js）から。
// 政令市（京都市・大阪市・堺市・神戸市）は区のコードをまとめて1つ（逆ジオコーダは区のコードを返すので、市そのもののコード 26100・27100・27140・28100 は使わない）
import type { Municipality } from "../municipalities";

export const KINKI_PENDING: Municipality[] = [
  // 大阪府（43のうち、大阪市・堺市のほかの特定行政庁の15市）
  { pref: "大阪府", name: "岸和田市", codes: ["27202"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "豊中市", codes: ["27203"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "池田市", codes: ["27204"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "吹田市", codes: ["27205"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "高槻市", codes: ["27207"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "守口市", codes: ["27209"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "枚方市", codes: ["27210"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "茨木市", codes: ["27211"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "八尾市", codes: ["27212"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "寝屋川市", codes: ["27215"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "和泉市", codes: ["27219"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "箕面市", codes: ["27220"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "羽曳野市", codes: ["27222"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "門真市", codes: ["27223"], coverage: "unknown", maps: [] },
  { pref: "大阪府", name: "東大阪市", codes: ["27227"], coverage: "unknown", maps: [] },
  // 兵庫県（41のうち、神戸市のほかの特定行政庁の11市）
  { pref: "兵庫県", name: "姫路市", codes: ["28201"], coverage: "unknown", maps: [] },
  { pref: "兵庫県", name: "尼崎市", codes: ["28202"], coverage: "unknown", maps: [] },
  { pref: "兵庫県", name: "明石市", codes: ["28203"], coverage: "unknown", maps: [] },
  { pref: "兵庫県", name: "西宮市", codes: ["28204"], coverage: "unknown", maps: [] },
  { pref: "兵庫県", name: "芦屋市", codes: ["28206"], coverage: "unknown", maps: [] },
  { pref: "兵庫県", name: "伊丹市", codes: ["28207"], coverage: "unknown", maps: [] },
  { pref: "兵庫県", name: "加古川市", codes: ["28210"], coverage: "unknown", maps: [] },
  { pref: "兵庫県", name: "宝塚市", codes: ["28214"], coverage: "unknown", maps: [] },
  { pref: "兵庫県", name: "高砂市", codes: ["28216"], coverage: "unknown", maps: [] },
  { pref: "兵庫県", name: "川西市", codes: ["28217"], coverage: "unknown", maps: [] },
  { pref: "兵庫県", name: "三田市", codes: ["28219"], coverage: "unknown", maps: [] },
];
