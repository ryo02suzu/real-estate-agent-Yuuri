"use client";

// 謄本・公図を取るときの地番。物件の筆と、境界が接する隣の筆の地番を並べ、コピーと登記情報提供サービスへの入口を出す。
// 筆は登記所備付地図データ（lib/roadmap/parcel.ts）。公図（任意座標）の地域は、市町村の地番参考図（sanko-data.ts）か
// 推定の位置（kozu-data.ts）の筆。住所で調べたときは、住所の地点にある筆を参考として出す。
// 市町村が地番図を公開していれば、物件の場所で開く入口も出す（lib/roadmap/chibanzu.ts。筆が無い地点ではそれだけを出す）
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import type { LookupResult } from "@/lib/roadmap";
import type { ChibanzuLink } from "@/lib/roadmap/chibanzu";
import { KOZU_DATA } from "@/lib/roadmap/kozu-data";
import { adjacentParcels, chibanLabel, kuikiLabel, parcelAt, parcelMark, type Neighbor, type Parcel } from "@/lib/roadmap/parcel";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { pmtilesParcelSource } from "@/lib/roadmap/parcel-tiles";
import { SANKO_CITIES, sankoSource } from "@/lib/roadmap/sanko-data";
import { ChevronRightIcon, CopyIcon, ExternalIcon, ParcelIcon } from "./icons";
import { Notes } from "./notes";
import { Sheet } from "./sheet";
import { Tabs } from "./tabs";
import { useCopy } from "./use-copy";

type Ok = Extract<LookupResult, { status: "ok" }>;

/** どうやって決めた筆か：地番で探した・地図で選んだ地点・住所の地点（参考） */
export type ParcelKind = "chiban" | "picked" | "address";

export type ParcelInfo =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ok"; parcel: Parcel; kind: ParcelKind; neighbors: Neighbor[] };

/** 物件の筆と隣の筆を読む（筆が分かっていればそれを、無ければ地点の筆を探す） */
export function useParcelInfo(result: Ok): ParcelInfo {
  const { lat, lng, parcel, picked } = result;
  const key = `${lat},${lng},${parcel ? `${parcel.kuiki}|${parcel.chibanRaw}` : ""}`;
  const [state, setState] = useState<{ key: string; value: ParcelInfo }>();
  useEffect(() => {
    let alive = true;
    withRetry(async () => {
      const p = parcel ?? (await parcelAt(lat, lng, pmtilesParcelSource));
      if (!p) return { status: "none" } as const;
      const kind: ParcelKind = picked ? "picked" : parcel ? "chiban" : "address";
      const neighbors = await adjacentParcels(p, pmtilesParcelSource);
      return { status: "ok", parcel: p, kind, neighbors } as const;
    })
      .catch(() => ({ status: "none" }) as const)
      .then((value) => alive && setState({ key, value }));
    return () => {
      alive = false;
    };
    // key に地点と筆が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.value : { status: "loading" };
}

/** 謄本・公図の請求に貼れる「所在 地番」（物件の筆と隣の筆。地番の無い道路・水路は除く） */
export function parcelLines(info: Extract<ParcelInfo, { status: "ok" }>): { target?: string; neighbors: string[] } {
  const line = (r: { kuiki: string; chiban: string }) => `${kuikiLabel(r.kuiki)} ${r.chiban}`;
  const numbered = (r: { chiban: string }) => /^\d/.test(r.chiban);
  const target = { kuiki: info.parcel.kuiki, chiban: info.parcel.chibanRaw };
  return { target: numbered(target) ? line(target) : undefined, neighbors: info.neighbors.filter(numbered).map(line) };
}

/**
 * 都市計画の行の右に置く小さなボタン。スマホは押すと一覧が下から出る。
 * PC は onOpen（パネルの中の地番のカードまで動かす）を渡し、物件の筆の地番も出す（住所の地点の筆は参考なので出さない）
 */
export function ParcelButton({
  info,
  onOpen,
  extra,
  withBuilding,
  chibanzu,
  panel,
}: {
  info: ParcelInfo;
  onOpen?: () => void;
  /** スマホのシートの「建物」のタブに出すもの（地点の建物） */
  extra?: React.ReactNode;
  /** 一覧に建物も入っている（ボタンを「地番・建物」にする） */
  withBuilding?: boolean;
  /** 市町村の地番図（物件の場所で開く） */
  chibanzu?: ChibanzuLink;
  /** スマホの結果パネルの1行：見出しと、物件の筆の地番も出す（押すと同じパネルの中で詳細） */
  panel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (info.status === "none") {
    // 登記所の地図データに筆が無い地点：市町村の地番図があれば、それを直接開く
    if (!chibanzu) return null;
    return (
      <a
        href={chibanzu.url}
        target="_blank"
        rel="noreferrer"
        title={chibanzu.name}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-[12px] leading-[1.5] text-ink lg:py-1.5 lg:text-[13px] lg:hover:border-brand-light/60"
      >
        <ParcelIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        地番図
        <ExternalIcon className="h-3 w-3 shrink-0 text-muted" />
      </a>
    );
  }
  const chiban =
    (onOpen || panel) && info.status === "ok" && info.kind !== "address" && /^\d/.test(info.parcel.chibanRaw) ? `${chibanLabel(info.parcel.chibanRaw)}${parcelMark(info.parcel)}` : undefined;
  return (
    <>
      <button
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        disabled={info.status !== "ok"}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-[11px] leading-[1.5] text-ink disabled:text-muted lg:hover:border-brand-light/60"
      >
        <ParcelIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        {info.status !== "ok" ? (
          "地番…"
        ) : panel ? (
          // 結果パネルの1行：見出しと、物件の筆の地番（地番で探した・地図で選んだ地点の筆）
          <>
            <span className="mui-row-label">{withBuilding ? "地番・建物" : "地番・隣地"}</span>
            {chiban && <b className="min-w-0 flex-1 truncate font-semibold">{chiban}</b>}
          </>
        ) : chiban ? (
          <>
            <b className="font-semibold">{chiban}</b>
          </>
        ) : (
          <>
            地番<span className="short:hidden">{withBuilding ? "・建物" : "・隣地"}</span>
          </>
        )}
        {info.status === "ok" && <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
      {info.status === "ok" && !onOpen && (
        <Sheet detail title={withBuilding ? "地番・建物" : "謄本・公図を取るときの地番"} open={open} onClose={() => setOpen(false)}>
          {withBuilding ? (
            <Tabs names={["謄本・公図用の地番", "建物"]} panels={[<ParcelDetail key="p" info={info} chibanzu={chibanzu} />, extra]} />
          ) : (
            <ParcelDetail info={info} chibanzu={chibanzu} />
          )}
        </Sheet>
      )}
    </>
  );
}

/** シートのタブ（それぞれ1画面に収める） */
/** PC：地図の左のパネルのカード */
export function ParcelCard({ info, chibanzu }: { info: ParcelInfo; chibanzu?: ChibanzuLink }) {
  if (info.status === "none" && !chibanzu) return null;
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-[14.5px] font-semibold text-ink">
        <ParcelIcon className="h-4 w-4 text-brand-light" />
        謄本・公図を取るときの地番
      </h3>
      {info.status === "loading" ? (
        <p className="text-[12px] text-muted">筆を確認しています…</p>
      ) : info.status === "none" ? (
        <>
          <p className="mb-2 text-[12px] leading-[1.6] text-muted">この地点の筆は、登記所の地図データにありません。</p>
          <ChibanzuButton link={chibanzu!} />
        </>
      ) : (
        <ParcelDetail info={info} chibanzu={chibanzu} />
      )}
    </section>
  );
}

/** 外のサイトを開くボタン（登記情報提供サービス・市町村の地番図） */
function LinkButton({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-ink active:scale-[0.99] denser:py-1.5">
      <ExternalIcon className="h-4 w-4 shrink-0 text-brand-light" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold leading-[1.4]">{title}</span>
        {/* 一番詰めても入りきらない画面（隣の筆が20を超える道路など）では、説明を省いて名前だけにする */}
        <span className="mt-0.5 block text-[11px] leading-[1.45] text-muted densest:hidden">{sub}</span>
      </span>
      <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />
    </a>
  );
}

const TOUKI = { href: "https://www1.touki.or.jp/", title: "登記情報提供サービス", sub: "謄本と同じ内容と公図（有料・要登録）" };

/** 市町村の地番図を物件の場所で開くボタン */
function ChibanzuButton({ link }: { link: ChibanzuLink }) {
  return <LinkButton href={link.url} title={link.name} sub="物件の場所で開く（登記と違うことがある）" />;
}

const KIND_LABEL: Record<ParcelKind, string> = {
  chiban: "物件の筆",
  picked: "選んだ地点の筆",
  address: "住所の地点にある筆（参考）",
};

function ParcelDetail({ info, chibanzu }: { info: Extract<ParcelInfo, { status: "ok" }>; chibanzu?: ChibanzuLink }) {
  const { parcel, kind, neighbors } = info;
  const numbered = neighbors.filter((n) => /^\d/.test(n.chiban));
  const roads = [...new Set(neighbors.filter((n) => !/^\d/.test(n.chiban)).map((n) => chibanLabel(n.chiban)))];
  const { target, neighbors: near } = parcelLines(info);
  const lines = [...(target ? [target] : []), ...near];
  const town = kuikiLabel(parcel.kuiki);
  return (
    <div>
      <p className="text-[12px] text-muted">
        {KIND_LABEL[kind]}
        {parcel.estimated && `・公図から推定した位置${parcel.estimated === "low" ? "（確度低）" : ""}`}
        {parcel.sanko && `・${SANKO_CITIES[parcel.sanko]?.name ?? "市町村"}の地番参考図`}
      </p>
      <Row kuiki={parcel.kuiki} chiban={parcel.chibanRaw} strong />
      {parcel.estimated && (
        <p className="mt-0.5 text-[12px] leading-[1.55] text-[#8a4f3a] dense:leading-[1.45] denser:text-[11.5px]">
          {parcel.estimated === "low"
            ? "この辺りの登記所の地図は公図（任意座標）です。公図の形を道路の縁に合わせて置いた推定の位置で、合わせ方の確かさが低いため、5m前後ずれて隣の筆の地番になっていることがあります。隣の筆も候補にして、謄本・公図で確かめてください。"
            : "この辺りの登記所の地図は公図（任意座標）です。公図の形を道路の縁に合わせて置いた推定の位置なので、数mずれて隣の筆の地番になることがあります。謄本・公図で確かめてください。"}
        </p>
      )}
      {parcel.sanko && (
        <p className="mt-0.5 text-[12px] leading-[1.55] text-[#8a4f3a] dense:leading-[1.45] denser:text-[11.5px]">
          {parcel.undetermined ? "登記所の地図では、この辺りは筆界未定地です。" : "この辺りの登記所の地図は公図（任意座標）です。"}
          市町村が公開している課税用の地番参考図の筆で、登記の地番・筆の形と違うことがあります。謄本・公図で確かめてください。
        </p>
      )}
      {kind === "address" && (
        <p className="mt-0.5 text-[12px] leading-[1.55] text-[#8a4f3a] dense:leading-[1.45] denser:text-[11.5px]">
          住居表示の住所と地番は別のものです。物件の土地かどうかは、公図や登記で確かめてください。
        </p>
      )}

      <p className="mt-3 text-[12px] text-muted dense:mt-2">
        境界が接している筆（{numbered.length}）{numbered.length > 0 && "。押すとその筆をコピー"}
      </p>
      {/* 隣の筆は多いと20を超えるので、1行に並べる（1画面に収める） */}
      {numbered.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {numbered.map((n) => (
            <NeighborChip key={`${n.kuiki}|${n.chiban}`} kuiki={n.kuiki} chiban={n.chiban} hideTown={kuikiLabel(n.kuiki) === town} />
          ))}
        </div>
      ) : (
        <p className="py-1 text-[13px] text-muted">地図データの中には見つかりませんでした</p>
      )}
      {roads.length > 0 && <p className="mt-1 text-[12px] text-muted">ほかに{roads.join("・")}に接しています。</p>}

      <div className="mt-3 flex flex-col gap-2 dense:mt-2 denser:gap-1.5">
        <CopyAll text={lines.join("\n")} count={lines.length} />
        {/* 地番図があれば、登記情報提供サービスと横に並べる */}
        <div className="flex gap-2 denser:gap-1.5">
          <LinkButton {...TOUKI} />
          {chibanzu && <ChibanzuButton link={chibanzu} />}
        </div>
      </div>
      <Notes
        lead="地番と筆の形は、謄本・公図で確かめてください。"
        source={parcel.sanko ? `登記所備付地図データ（法務省）・${SANKO_CITIES[parcel.sanko]?.credit ?? "市町村の地番参考図"}` : "登記所備付地図データ（法務省）"}
      >
        <p>
          筆は「登記所備付地図データ」（法務省）を加工して作成（{parcel.estimated ? KOZU_DATA.edition || PARCEL_DATA.edition : PARCEL_DATA.edition}）。
          {parcel.estimated && "公図の筆は、国土地理院の基盤地図情報（道路縁）に合わせて位置を推定しています。"}
          {parcel.sanko && `参考図の筆の${sankoSource(parcel.sanko)}。`}
        </p>
        <p>分筆・合筆などで変わっていることがあります。証明書として使う謄本（登記事項証明書）は、法務局で請求してください。</p>
      </Notes>
    </div>
  );
}

/** 「熊谷市下奈良 391-3」とコピーボタン */
function Row({ kuiki, chiban, strong, hideTown }: { kuiki: string; chiban: string; strong?: boolean; hideTown?: boolean }) {
  const { done, copy } = useCopy();
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`min-w-0 flex-1 ${strong ? "text-[16px] font-semibold text-ink" : "text-[13.5px] text-ink"}`}>
        {!hideTown && <span className={strong ? "" : "text-muted"}>{kuikiLabel(kuiki)} </span>}
        {chibanLabel(chiban)}
      </span>
      {/* 地番の無い道路・水路は請求できないのでコピーを出さない */}
      {/^\d/.test(chiban) && (
        <button onClick={() => copy(`${kuikiLabel(kuiki)} ${chiban}`)} className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[12px] text-brand">
          <CopyIcon className="h-3 w-3" />
          {done ? "コピー済" : "コピー"}
        </button>
      )}
    </div>
  );
}

/** 隣の筆（「226-2」。町が違えば町の名前も）。押すと「所在 地番」をコピー */
function NeighborChip({ kuiki, chiban, hideTown }: { kuiki: string; chiban: string; hideTown?: boolean }) {
  const { done, copy } = useCopy();
  return (
    <button
      onClick={() => copy(`${kuikiLabel(kuiki)} ${chiban}`)}
      className={`rounded-full border px-2.5 py-1 text-[13px] leading-[1.5] dense:py-0.5 denser:px-2 denser:text-[12.5px] ${done ? "border-brand bg-mint text-brand" : "border-line text-ink"}`}
    >
      {!hideTown && <span className="text-muted">{kuikiLabel(kuiki)} </span>}
      {done ? "コピー済" : chiban}
    </button>
  );
}

function CopyAll({ text, count }: { text: string; count: number }) {
  const { done, copy } = useCopy();
  return (
    <button onClick={() => copy(text)} className="bg-gold flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white dense:py-2">
      <CopyIcon className="h-4 w-4" />
      {done ? "コピーしました" : `所在と地番をまとめてコピー（${count}筆）`}
    </button>
  );
}
