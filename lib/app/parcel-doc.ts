// 謄本・公図を取るときの地番の一覧（スマホ）：物件の筆と隣の筆を1筆ずつ □ 付きで並べ（取ったら印を付けられる）、
// 請求するもの（登記事項証明書・公図・地積測量図・建物の登記）と、登記情報提供サービスでの入れ方を添える。
// 中身は lib/parcel-list.ts（PC と同じ地番の一覧）と同じデータ。法務局の証明ではない旨を添える。法的な判断はしない
import type { LookupResult } from "../roadmap";
import { parcelCreditLine } from "../roadmap/kozu-data";
import { estimatedNote } from "../roadmap/parcel";
import { SANKO_NOTE } from "../roadmap/sanko-data";
import type { ParcelListInput } from "../parcel-list";
import { half, jaDate, type Doc, type DocItem } from "./doc";
import { formalChiban } from "./inquiry-letter";

type Ok = Extract<LookupResult, { status: "ok" }>;

export function parcelDoc(result: Ok, parcels: ParcelListInput | undefined, date: Date): Doc {
  const head = [`物件：${half(result.matchedAddress)}`, `作成日：${jaDate(date)}（MICHILU の地図データから）`];
  if (!parcels || (!parcels.target && !parcels.neighbors.length))
    return {
      title: "謄本・公図用の地番",
      head,
      sections: [{ title: "地番", items: [{ text: "この場所の筆は、地図データの中に見つかりませんでした。市町村の地番図（参考図）か法務局の窓口で、地番を確かめてください。", tone: "check" }] }],
    };
  const own: DocItem[] = [];
  const note = parcels.offLot
    ? "住所の地点にある筆（参考）。隣地がとても多く、道路など物件の外の土地の可能性があるので、公図で物件の筆を確かめてください"
    : parcels.reference
      ? "住所の地点にある筆（参考）。住居表示と地番は別のものなので、公図で物件の筆を確かめてください"
      : parcels.estimated
        ? `公図から推定した位置（${estimatedNote(parcels.estimated)}）`
        : parcels.sanko
          ? SANKO_NOTE
          : undefined;
  own.push(parcels.target ? { box: "todo", text: half(parcels.target), note, tone: parcels.reference || parcels.offLot ? "check" : undefined } : { text: "地番なし（道路・水路など）", note });
  const sections: Doc["sections"] = [{ title: "物件の筆", items: own }];
  if (parcels.neighbors.length) {
    if (parcels.offLot) sections.push({ title: "隣の筆", items: [{ text: `省略（この筆に接する筆は${parcels.neighbors.length}筆）。公図で物件の筆を確かめてから、隣地を調べてください。` }] });
    else sections.push({ title: `隣の筆（境界が接している筆・${parcels.neighbors.length}筆）`, items: parcels.neighbors.map((n) => ({ box: "todo" as const, text: half(n) })) });
  }
  sections.push({
    title: "請求するもの（目安）",
    items: [
      { box: "todo", text: "登記事項証明書（土地・全部事項）", note: "所有者・地目・地積・抵当権などの権利" },
      { box: "todo", text: "公図（地図・地図に準ずる図面）", note: "筆の形・接道・隣地との位置" },
      { box: "todo", text: "地積測量図（備え付けがあれば）", note: "境界・面積の根拠" },
      { box: "todo", text: "建物の登記事項証明書・建物図面", note: "建物の家屋番号は地番と違うことがあります（所在図・窓口で確認）" },
      { box: "todo", text: "隣地の登記事項（必要なとき）", note: "境界の確認・承諾の相手を調べるとき" },
    ],
  });
  // 地番の書き方は、この物件の筆の地番で見せる（地番の形でなければ例で）
  const no = parcels.target ? (half(parcels.target).trim().split(/\s+/).pop() ?? "") : "";
  const ex = /^\d+(-\d+)*$/.test(no) ? no : "123-4";
  sections.push({
    title: "請求のしかた",
    items: [
      { text: `登記情報提供サービス：所在（都道府県・市区町村・町名）を選び、地番を「${ex}」の形（枝番まで）で入れる` },
      { text: `法務局の窓口・郵送の申請書：地番は「${formalChiban(ex)}」の形で書く` },
    ],
  });
  return {
    title: "謄本・公図用の地番",
    head,
    sections,
    foot: [`※${parcelCreditLine(!!parcels.estimated, parcels.sanko)}。`],
  };
}
