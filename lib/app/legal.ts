// 法令・規制の画面の「一般的なルールの目安」。用途地域などから、斜線制限・日影規制の扱いと、建てるときの注意点を文にする。
// どれも建築基準法・都市計画法の一般的な決まりを書いたもので、この土地に建てられるかの判断ではない（画面に「目安」と
// 「役所・建築士で確認」を添える）。数値（日影の時間・高度地区の高さなど）は条例・都市計画で決まるので、確認先を書く
import { houreiGroups, type Hourei } from "../roadmap/hourei";
import type { Morido } from "../roadmap/morido";
import type { NearbyRoad } from "../roadmap/road-read";
import type { Tochi } from "../roadmap/tochi";
import type { Zoning } from "../roadmap/zoning";

export type ZoneGroup = "low" | "midHigh" | "res" | "nearCom" | "com" | "semiInd" | "ind" | "indOnly" | "none";

/** 用途地域の名前 → 規制の考え方のまとまり */
export function zoneGroup(name?: string): ZoneGroup {
  if (!name) return "none";
  const n = name.normalize("NFKC").replace(/第1種/, "第一種").replace(/第2種/, "第二種");
  if (/低層住居専用|田園住居/.test(n)) return "low";
  if (/中高層住居専用/.test(n)) return "midHigh";
  if (/^(第一種|第二種)住居地域$|準住居/.test(n)) return "res";
  if (/近隣商業/.test(n)) return "nearCom";
  if (/商業地域/.test(n)) return "com";
  if (/準工業/.test(n)) return "semiInd";
  if (/工業専用/.test(n)) return "indOnly";
  if (/工業地域/.test(n)) return "ind";
  return "none";
}

/** 住居系（前面道路による容積率の係数が 0.4） */
const RESIDENTIAL: ZoneGroup[] = ["low", "midHigh", "res"];

export type Rule = { value: string; sub: string };

/** 斜線制限（建築基準法56条）の一般的な扱い */
export function slopeRule(g: ZoneGroup, koudoti: boolean): Rule {
  const extra = koudoti ? "。高度地区の高さの制限も加わります" : "";
  if (g === "low") return { value: "道路斜線・北側斜線", sub: `隣地斜線はかからず、高さは10mか12mまで（都市計画で決定）${extra}` };
  if (g === "midHigh") return { value: "道路・隣地・北側斜線", sub: `北側斜線は、日影規制の区域ではかかりません${extra}` };
  if (g === "none") return { value: "道路斜線・隣地斜線", sub: `用途地域の無い区域。勾配などは特定行政庁が決めます${extra}` };
  return { value: "道路斜線・隣地斜線", sub: `北側斜線はかかりません${extra}` };
}

/** 日影規制（建築基準法56条の2・別表第4）の一般的な扱い */
export function shadeRule(g: ZoneGroup): Rule {
  if (g === "com" || g === "ind" || g === "indOnly")
    return { value: "対象外", sub: "対象区域の外。ただし、まわりの規制区域に影を落とす高さ10m超の建物は対象" };
  if (g === "low") return { value: "条例で指定", sub: "軒の高さ7m超か3階以上の建物が対象。時間は市の条例で確認" };
  if (g === "none") return { value: "条例で指定", sub: "用途地域の無い区域は、条例で決めた区域だけが対象" };
  return { value: "条例で指定", sub: "高さ10m超の建物が対象。測定面（4mか6.5m）・時間は市の条例で確認" };
}

/** 道路の幅（「4.0〜4.5m」「6m」）→ 小さい方の数値（m） */
export function roadWidthOf(width?: string): number | undefined {
  const m = width?.normalize("NFKC").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}

export type NoteIcon = "fire" | "volume" | "sun" | "warn" | "plan" | "road" | "old";
export type Note = { icon: NoteIcon; title: string; body: string; /** 注意が要る（区域の指定・計画道路など） */ warn?: boolean };

export type NoteInput = {
  zoning: Zoning;
  morido?: Morido;
  hourei?: Hourei;
  tochi?: Tochi;
  roads?: NearbyRoad[];
  /** 建物の建築年（PLATEAU に入っている市区町村だけ） */
  buildingYear?: number;
};

const meters = (d: number) => `約${Math.max(1, Math.round(d))}m`;

/** 建築時の注意点。区域の指定・計画道路などの注意を先に、防火・容積率・高さのルールをあとに並べる */
export function buildingNotes({ zoning: z, morido, hourei, tochi, roads, buildingYear }: NoteInput): Note[] {
  const y = z.youto[0];
  const g = zoneGroup(y?.name);
  const warn: Note[] = [];
  const base: Note[] = [];

  if (z.senbiki === "市街化調整区域")
    warn.push({ icon: "warn", title: "市街化調整区域", body: "市街化を抑える区域です。原則として、開発や建築に都道府県・市の許可が必要です（都市計画法）。", warn: true });
  if (!z.tokei && !z.jyuntoshi && y === undefined)
    warn.push({ icon: "plan", title: "都市計画区域の外", body: "都市計画区域の外では、接道義務（建築基準法43条）や用途地域の制限は原則かかりません。区域は市で確認してください。" });
  if (z.road !== undefined)
    warn.push({ icon: "road", title: "都市計画道路が近い", body: `都市計画道路の中心線まで${meters(z.road)}。計画線にかかる部分には建築の制限があります（都市計画法53条）。`, warn: true });
  const near = z.youtoNear[0];
  if (near) warn.push({ icon: "warn", title: "用途地域の境目", body: `${meters(near.distance)}先で${near.name}に変わります。敷地がまたがると、面積の割合で制限が決まります。`, warn: true });
  for (const p of z.others.filter((o) => o.layer === "chikukei"))
    warn.push({ icon: "plan", title: "地区計画の区域", body: `${p.name ? `「${p.name}」の` : ""}区域内です。用途・高さ・壁面の位置などに独自のルールがあることがあります（市の地区計画の図書で確認）。`, warn: true });
  if (morido?.area)
    warn.push({ icon: "warn", title: morido.area.kind, body: `盛土・切土などの工事に許可や届出が必要です（盛土規制法）。区域の指定は${morido.authority}が行います。`, warn: true });
  for (const h of hourei ? houreiGroups(hourei.hits) : []) warn.push({ icon: "warn", title: h.kind, body: `${h.text}。工事や建築に許可・制限があります。`, warn: true });
  if (tochi?.park && tochi.park !== "普通地域") warn.push({ icon: "warn", title: `自然公園の${tochi.park}`, body: "建物の新築・増築などに許可が必要です（自然公園法）。", warn: true });
  if (tochi?.agri === "農用地区域") warn.push({ icon: "warn", title: "農用地区域", body: "農地以外にすること（転用）は原則できません（農振法）。", warn: true });
  if (tochi?.forest === "保安林") warn.push({ icon: "warn", title: "保安林", body: "木を切ったり、土地の形を変えるのに許可が必要です（森林法）。", warn: true });

  // 防火（建築基準法61条・施行令136条の2）
  if (z.bouka === "防火地域")
    base.push({ icon: "fire", title: "防火地域での建築制限", body: "階数3以上か延べ面積100㎡超は耐火建築物等、それ以外は準耐火建築物等にする必要があります（建築基準法61条）。" });
  else if (z.bouka === "準防火地域")
    base.push({ icon: "fire", title: "準防火地域での建築制限", body: "地上4階以上か延べ1,500㎡超は耐火建築物等、地上3階か延べ500㎡超は準耐火建築物等にする必要があります（建築基準法61条）。" });
  else if (z.tokei || z.jyuntoshi) base.push({ icon: "fire", title: "防火の指定", body: "防火地域・準防火地域の指定はありません。屋根の不燃化が要る法22条区域かは市で確認してください。" });

  // 容積率（前面道路の幅による上限。建築基準法52条2項）と建ぺい率の緩和（53条）
  if (y?.far) {
    const k = RESIDENTIAL.includes(g) ? 0.4 : 0.6;
    const w = roads?.map((r) => roadWidthOf(r.width)).filter((v): v is number => v !== undefined).sort((a, b) => b - a)[0];
    const example = w !== undefined && w < 12 ? `近くの道路の幅${w}mなら${Math.round(w * k * 100)}%と${y.far}%の小さい方が上限の目安です。` : "";
    base.push({
      icon: "volume",
      title: "容積率の上限",
      body: `指定容積率は${y.far}%。前面道路の幅が12m未満なら、幅×${k}（${RESIDENTIAL.includes(g) ? "住居系" : "住居系以外"}）との小さい方が上限です（建築基準法52条）。${example}`,
    });
  }
  if (y?.bcr) {
    const fire = z.bouka === "防火地域" ? (y.bcr === 80 ? "防火地域内の耐火建築物等は建ぺい率の制限がかかりません" : "防火地域内の耐火建築物等は10%加わります") : z.bouka === "準防火地域" ? "準防火地域内の耐火・準耐火建築物等は10%加わります" : "";
    base.push({ icon: "volume", title: "建ぺい率の緩和", body: `指定建ぺい率は${y.bcr}%。${fire ? `${fire}。` : ""}角地は特定行政庁の指定で10%加わることがあります（建築基準法53条）。` });
  }

  // 高さ（斜線・日影・高度地区）
  const slope = slopeRule(g, z.koudoti);
  const shade = shadeRule(g);
  base.push({ icon: "sun", title: "高さの制限", body: `斜線制限：${slope.value}（${slope.sub}）。日影規制：${shade.value}（${shade.sub}）。` });
  if (z.koudoti) base.push({ icon: "sun", title: "高度地区", body: "高度地区の指定があります。建物の高さの上限や北側の斜線が加わります（種類は市の都市計画図で確認）。" });

  if (buildingYear !== undefined && buildingYear <= 1981)
    warn.push({ icon: "old", title: "建物の建築年", body: `データ上の建築年は${buildingYear}年です。1981年5月以前に確認を受けた建物は旧耐震基準の可能性があります。`, warn: true });

  return [...warn, ...base];
}
