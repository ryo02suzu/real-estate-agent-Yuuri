"use client";

// 謄本・公図を取るときの地番。物件の筆と、境界が接する隣の筆の地番を並べ、コピーと登記情報提供サービスへの入口を出す。
// 筆は登記所備付地図データ（lib/roadmap/parcel.ts）。住所で調べたときは、住所の地点にある筆を参考として出す
import { useEffect, useState } from "react";
import type { LookupResult } from "@/lib/roadmap";
import { adjacentParcels, chibanLabel, kuikiLabel, parcelAt, type Neighbor, type Parcel } from "@/lib/roadmap/parcel";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { pmtilesParcelSource } from "@/lib/roadmap/parcel-tiles";
import { ChevronRightIcon, CopyIcon, ExternalIcon, InfoIcon, ParcelIcon } from "./icons";
import { Sheet } from "./sheet";
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
    (async () => {
      const p = parcel ?? (await parcelAt(lat, lng, pmtilesParcelSource));
      if (!p) return { status: "none" } as const;
      const kind: ParcelKind = picked ? "picked" : parcel ? "chiban" : "address";
      const neighbors = await adjacentParcels(p, pmtilesParcelSource);
      return { status: "ok", parcel: p, kind, neighbors } as const;
    })()
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

/** スマホ：都市計画の行の右に置く小さなボタン。押すと一覧が下から出る */
export function ParcelButton({ info }: { info: ParcelInfo }) {
  const [open, setOpen] = useState(false);
  if (info.status === "none") return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={info.status !== "ok"}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-[11px] leading-[1.5] text-ink disabled:text-muted"
      >
        <ParcelIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        {info.status === "ok" ? (
          <>
            地番<span className="[@media(max-height:720px)]:hidden">・隣地</span>
          </>
        ) : (
          "地番…"
        )}
        {info.status === "ok" && <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
      {info.status === "ok" && (
        <Sheet title="謄本・公図を取るときの地番" open={open} onClose={() => setOpen(false)}>
          <ParcelDetail info={info} />
        </Sheet>
      )}
    </>
  );
}

/** PC：地図の左のパネルのカード */
export function ParcelCard({ info }: { info: ParcelInfo }) {
  if (info.status === "none") return null;
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <ParcelIcon className="h-4 w-4 text-brand-light" />
        謄本・公図を取るときの地番
      </h3>
      {info.status === "loading" ? <p className="text-[12px] text-muted">筆を確認しています…</p> : <ParcelDetail info={info} />}
    </section>
  );
}

const KIND_LABEL: Record<ParcelKind, string> = {
  chiban: "物件の筆",
  picked: "選んだ地点の筆",
  address: "住所の地点にある筆（参考）",
};

function ParcelDetail({ info }: { info: Extract<ParcelInfo, { status: "ok" }> }) {
  const { parcel, kind, neighbors } = info;
  const numbered = neighbors.filter((n) => /^\d/.test(n.chiban));
  const roads = [...new Set(neighbors.filter((n) => !/^\d/.test(n.chiban)).map((n) => chibanLabel(n.chiban)))];
  const { target, neighbors: near } = parcelLines(info);
  const lines = [...(target ? [target] : []), ...near];
  const town = kuikiLabel(parcel.kuiki);
  return (
    <div>
      <p className="text-[11px] text-muted">{KIND_LABEL[kind]}</p>
      <Row kuiki={parcel.kuiki} chiban={parcel.chibanRaw} strong />
      {kind === "address" && (
        <p className="mt-0.5 text-[10.5px] leading-[1.55] text-[#8a4f3a]">
          住居表示の住所と地番は別のものです。物件の土地かどうかは、公図や登記で確かめてください。
        </p>
      )}

      <p className="mt-3 text-[11px] text-muted">境界が接している筆（{numbered.length}）</p>
      {numbered.length > 0 ? (
        <ul className="divide-y divide-line/70">
          {numbered.map((n) => (
            <li key={`${n.kuiki}|${n.chiban}`}>
              <Row kuiki={n.kuiki} chiban={n.chiban} hideTown={kuikiLabel(n.kuiki) === town} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-1 text-[12px] text-muted">地図データの中には見つかりませんでした</p>
      )}
      {roads.length > 0 && <p className="mt-1 text-[11px] text-muted">ほかに{roads.join("・")}に接しています。</p>}

      <div className="mt-3 flex flex-col gap-2">
        <CopyAll text={lines.join("\n")} count={lines.length} />
        <a
          href="https://www1.touki.or.jp/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5 text-ink active:scale-[0.99]"
        >
          <ExternalIcon className="h-5 w-5 shrink-0 text-brand-light" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">登記情報提供サービス</span>
            <span className="mt-0.5 block text-[10.5px] text-muted">登記の内容（謄本と同じ内容）と公図をネットで見られます（有料・利用登録が要ります）</span>
          </span>
          <ChevronRightIcon className="h-4 w-4 shrink-0 opacity-80" />
        </a>
      </div>
      <p className="mt-2 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted">
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          筆は「登記所備付地図データ」（法務省）を加工して作成（{PARCEL_DATA.edition}）。分筆・合筆などで変わっていることがあります。証明書として使う謄本（登記事項証明書）は、法務局で請求してください。
        </span>
      </p>
    </div>
  );
}

/** 「熊谷市下奈良 391-3」とコピーボタン */
function Row({ kuiki, chiban, strong, hideTown }: { kuiki: string; chiban: string; strong?: boolean; hideTown?: boolean }) {
  const { done, copy } = useCopy();
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`min-w-0 flex-1 ${strong ? "text-[14px] font-semibold text-ink" : "text-[12.5px] text-ink"}`}>
        {!hideTown && <span className={strong ? "" : "text-muted"}>{kuikiLabel(kuiki)} </span>}
        {chibanLabel(chiban)}
      </span>
      {/* 地番の無い道路・水路は請求できないのでコピーを出さない */}
      {/^\d/.test(chiban) && (
        <button onClick={() => copy(`${kuikiLabel(kuiki)} ${chiban}`)} className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-brand">
          <CopyIcon className="h-3 w-3" />
          {done ? "コピー済" : "コピー"}
        </button>
      )}
    </div>
  );
}

function CopyAll({ text, count }: { text: string; count: number }) {
  const { done, copy } = useCopy();
  return (
    <button onClick={() => copy(text)} className="bg-gold flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white">
      <CopyIcon className="h-4 w-4" />
      {done ? "コピーしました" : `所在と地番をまとめてコピー（${count}筆）`}
    </button>
  );
}
