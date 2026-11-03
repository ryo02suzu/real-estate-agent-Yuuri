// 実際の取引事例（不動産情報ライブラリ）の1件を、何の売買か・広さ・築年数が一目で分かる言葉にする（スマホの相場のタブ）。
// 「宅地(土地と建物)」は戸建てだけでなく、アパート・店舗つきの建物の売買も入るので、建物の用途（Use）で言い分ける
import { TSUBO_M2 } from "./area";
import { dealKind, type DealKind, type DealRecord } from "../roadmap/deals";

/** 絞り込みの札の名前 */
export const DEAL_CHIP: Record<DealKind, string> = { land: "土地だけ", house: "戸建てなど", mansion: "マンション", other: "そのほか" };

/** 種類の説明（一言） */
export const DEAL_KIND_NOTE: Record<DealKind, string> = {
  land: "土地だけの売買（建物なし）",
  house: "土地と建物をいっしょに売買（戸建てなど。延床が建物の広さ）",
  mansion: "中古マンションの1部屋の売買（広さは専有面積）",
  other: "農地・林地など",
};

/** 1件の見出し：「戸建て（土地と建物）」「土地だけ」「中古マンション」 */
export function dealTitle(r: DealRecord): string {
  const k = dealKind(r.t);
  if (k === "land") return "土地だけ";
  if (k === "mansion") return "中古マンション";
  if (k === "other") return r.t.replace(/\(.*\)$/, "");
  const use = (r.us ?? "").normalize("NFKC");
  if (/共同住宅/.test(use)) return "アパートなど（土地＋建物）";
  if (/店舗|事務所|工場|倉庫|作業場/.test(use) && !/^住宅$/.test(use)) return /住宅/.test(use) ? "店舗つき住宅など（土地＋建物）" : "店舗・事務所など（土地＋建物）";
  if (/住宅/.test(use)) return "戸建て（土地＋建物）";
  return "戸建てなど（土地＋建物）";
}

/** 取引の時期の年（「2026年第1四半期」→ 2026） */
const periodYear = (pe?: string) => {
  const m = pe?.normalize("NFKC").match(/^(\d{4})年/);
  return m ? Number(m[1]) : undefined;
};

/** 時期を月で（「2026年第1四半期」→「2026年1〜3月」） */
export function dealWhen(pe?: string): string {
  const m = pe?.normalize("NFKC").match(/^(\d{4})年第(\d)四半期$/);
  if (!m) return pe ?? "時期不明";
  const q = Number(m[2]);
  return `${m[1]}年${(q - 1) * 3 + 1}〜${q * 3}月`;
}

/** 築年数（取引の年から見て）：「1974年築（築52年）」「2025年築（新築）」。戦前などはそのまま */
export function builtText(r: DealRecord): string | undefined {
  if (!r.by) return undefined;
  const by = r.by.normalize("NFKC");
  const y = by.match(/^(\d{4})年$/);
  if (!y) return `${by}の建物`;
  const at = periodYear(r.pe);
  if (at === undefined) return `${y[1]}年築`;
  const age = at - Number(y[1]);
  return age <= 1 ? `${y[1]}年築（新築）` : `${y[1]}年築（築${age}年）`;
}

const sqm = (v: number) => v.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
const tsubo = (v: number) => (v / TSUBO_M2).toFixed(1);

/** 広さと建物の中身：土地の面積・延床・専有面積・間取り・築年数・構造（分かるものだけ） */
export function dealFacts(r: DealRecord): string[] {
  const k = dealKind(r.t);
  const out: string[] = [];
  const area = r.a ? `${sqm(r.a)}㎡（約${tsubo(r.a)}坪）` : r.as;
  if (k === "mansion") {
    if (area) out.push(`専有 ${area}`);
    if (r.fp) out.push(r.fp.normalize("NFKC"));
  } else if (area) out.push(`土地 ${area}`);
  if (k === "house" && r.fa) out.push(`建物 延床${sqm(r.fa)}㎡（約${tsubo(r.fa)}坪）`);
  const built = k === "land" ? undefined : builtText(r);
  if (built) out.push(built);
  if (k !== "land" && r.s) out.push(r.s.normalize("NFKC"));
  if (r.rn && k !== "land") out.push(r.rn.normalize("NFKC"));
  return out;
}

/** 前面道路（「東 市道 5m」）。分からなければ空 */
export function dealRoad(r: DealRecord): string {
  return r.rc || r.br ? `前面道路 ${[r.dir, r.rc, r.br ? `${r.br}m` : ""].filter(Boolean).join(" ")}` : "";
}
