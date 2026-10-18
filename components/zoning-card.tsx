"use client";

// 物件の地点の都市計画（用途地域・建ぺい率・容積率・防火・高度地区など）。国土交通省の都市計画決定GISデータを
// アプリと同じサイトに置いたタイルから読む（lib/roadmap/zoning.ts）。道路種別の結果を先に出し、こちらは後から読み込む。
// 盛土規制法の規制区域（国土数値情報。lib/roadmap/morido.ts）と、埋蔵文化財の確認先（遺跡地図。lib/roadmap/iseki.ts）も
// 同じ一覧に添える
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import type { Municipality } from "@/lib/roadmap";
import { isekiFor, isekiNote, type Iseki } from "@/lib/roadmap/iseki";
import { MORIDO_DATA, MORIDO_SOURCE, moridoAt, moridoDetail, moridoNote, moridoNotice, moridoValue, type Morido } from "@/lib/roadmap/morido";
import { pmtilesMoridoSource } from "@/lib/roadmap/morido-tiles";
import { statusFor, zoningAt, zoningChips, zoningRows, type Zoning, type ZoningStatus } from "@/lib/roadmap/zoning";
import { ZONING_DATA } from "@/lib/roadmap/zoning-data";
import { pmtilesZoningSource } from "@/lib/roadmap/zoning-tiles";
import { AlertIcon, ChevronRightIcon, InfoIcon, ZoningIcon } from "./icons";
import { Sheet } from "./sheet";

/** morido：盛土規制法の区域（読めなければ無し）、iseki：埋蔵文化財の確認先 */
export type ZoningState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; zoning: Zoning; st?: ZoningStatus; morido?: Morido; iseki?: Iseki };

/** 地点の都市計画を読む（市区町村のデータの有無と時点も） */
export function useZoning(lat: number, lng: number, municipality: Municipality): ZoningState {
  const codes = municipality.codes.join(",");
  const key = `${lat},${lng},${codes}`;
  const [state, setState] = useState<{ key: string; value: ZoningState }>();
  useEffect(() => {
    let alive = true;
    Promise.all([
      withRetry(() => zoningAt(lat, lng, pmtilesZoningSource)),
      import("@/lib/roadmap/data/zoning-status.json"),
      // 盛土規制法の区域は読めなくても都市計画は出す
      withRetry(() => moridoAt(lat, lng, codes.split(",")[0], pmtilesMoridoSource)).catch(() => null),
    ])
      .then(([zoning, mod, morido]) => {
        if (!alive) return;
        const st = statusFor(codes.split(","), mod.default as Record<string, ZoningStatus>);
        const iseki = isekiFor(municipality, lat, lng);
        setState({ key, value: zoning ? { status: "ok", zoning, st, morido: morido ?? undefined, iseki } : { status: "error" } });
      })
      .catch(() => alive && setState({ key, value: { status: "error" } }));
    return () => {
      alive = false;
    };
    // key に lat・lng・codes が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.value : { status: "loading" };
}

/**
 * 用途地域などを1行に並べる。スマホは押すと詳しい一覧を下から出す。
 * PC は onOpen（パネルの中の都市計画のカードまで動かす）を渡す
 */
export function ZoningLine({ state, city, onOpen }: { state: ZoningState; city: string; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const chips = state.status === "ok" ? zoningChips(state.zoning) : [];
  return (
    <>
      <button
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        disabled={state.status !== "ok"}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-left text-[11px] leading-[1.5] text-ink lg:hover:border-brand-light/60"
      >
        <ZoningIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        <span className={`shrink-0 text-muted ${state.status === "ok" && !onOpen ? "short:hidden" : ""}`}>都市計画</span>
        {state.status === "loading" && <span className="truncate text-muted">確認中…</span>}
        {state.status === "error" && <span className="truncate text-muted">データを読み込めませんでした</span>}
        {state.status === "ok" && (
          // 1行に収まる分だけ出す（入らない印は折り返して隠れる。全部は押して開く一覧で見る）
          <span className="flex h-[18px] min-w-0 flex-1 flex-wrap items-center gap-x-1 overflow-hidden">
            {chips.map((c, i) => (
              <span
                key={c}
                className={`shrink-0 whitespace-nowrap rounded px-1 ${i === 0 ? "bg-mint font-semibold text-brand" : /計画道路|境目|調整/.test(c) ? "bg-[#f8ece6] text-[#8a4f3a]" : "bg-[#f3f1ed] text-ink"}`}
              >
                {c}
              </span>
            ))}
          </span>
        )}
        {state.status === "ok" && <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
      {state.status === "ok" && !onOpen && (
        <Sheet title="都市計画（参考）" open={open} onClose={() => setOpen(false)}>
          <ZoningDetail zoning={state.zoning} st={state.st} city={city} morido={state.morido} iseki={state.iseki} />
        </Sheet>
      )}
    </>
  );
}

/** PC：地図の左のパネルのカード */
export function ZoningCard({ state, city }: { state: ZoningState; city: string }) {
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <ZoningIcon className="h-4 w-4 text-brand-light" />
        都市計画（参考）
      </h3>
      {state.status === "loading" && <p className="text-[12px] text-muted">都市計画を確認しています…</p>}
      {state.status === "error" && <p className="text-[12px] text-muted">都市計画のデータを読み込めませんでした。時間をおいて調べ直してください。</p>}
      {state.status === "ok" && <ZoningDetail zoning={state.zoning} st={state.st} city={city} morido={state.morido} iseki={state.iseki} />}
    </section>
  );
}

// 一覧の行の形。シートで画面に入りきらなければ詰める（dense・denser は components/sheet.tsx の useDense）
const ROW = "flex gap-3 py-1.5 dense:py-1 denser:py-[3px] densest:py-[2px]";
const LABEL = "w-[8.6em] shrink-0 text-[11.5px] leading-[1.6] text-muted denser:text-[11px]";
const VALUE = "text-[13px] font-semibold leading-[1.5] denser:text-[12.5px] denser:leading-[1.4] densest:leading-[1.3]";
const SUB = "mt-0.5 block text-[10.5px] leading-[1.55] text-muted dense:mt-0 dense:leading-[1.45] denser:text-[10px] densest:leading-[1.35]";

function ZoningDetail({ zoning, st, city, morido, iseki }: { zoning: Zoning; st?: ZoningStatus; city: string; morido?: Morido; iseki?: Iseki }) {
  const rows = zoningRows(zoning, st);
  return (
    <div>
      <dl className="divide-y divide-line/70">
        {rows.map((r) => (
          <div key={r.label + r.value} className={ROW}>
            <dt className={LABEL}>{r.label}</dt>
            <dd className="min-w-0 flex-1">
              <span className={`flex items-start gap-1.5 ${VALUE} ${r.warn ? "text-[#8a4f3a]" : "text-ink"}`}>
                {r.color && <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10 denser:mt-[4px]" style={{ background: r.color }} />}
                {r.warn && !r.color && <AlertIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 denser:mt-[2px]" />}
                <span>{r.value}</span>
              </span>
              {r.sub && <span className={SUB}>{r.sub}</span>}
            </dd>
          </div>
        ))}
        {morido && <MoridoRow morido={morido} />}
        {iseki && <IsekiRow iseki={iseki} />}
      </dl>
      <p className="mt-2 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted dense:mt-1.5 dense:leading-[1.5] denser:text-[10px] densest:mt-1 densest:leading-[1.4]">
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          {st ? `${st.city}のデータは${st.asOf ? `${st.asOf}時点` : "時点の記載なし"}。` : `${city}は国のデータに載っていません。`}
          {st?.note && `${st.note.replace(/。?$/, "。")}`}
          地図上の区域は概ねの位置で、実際の範囲や最新の決定と異なることがあります。重要事項説明などの最終確認は、{city}の都市計画の窓口・都市計画図で行ってください。
          <span className="mt-1 block dense:mt-0.5">
            出典：
            <a href="https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html" target="_blank" rel="noreferrer" className="underline">
              都市計画決定GISデータ
            </a>
            （{ZONING_DATA.edition}）
            {morido && (
              <>
                、
                <a href={MORIDO_SOURCE.url} target="_blank" rel="noreferrer" className="underline">
                  {MORIDO_SOURCE.name}
                </a>
                （{MORIDO_DATA.asOf}時点）
              </>
            )}
            （{morido ? "いずれも" : ""}国土交通省）を加工して作成
          </span>
        </span>
      </p>
    </div>
  );
}

/** 盛土規制法の区域の行（国のデータ・参考）。区域を指定した都県・市と、その地図・資料へのリンク */
function MoridoRow({ morido }: { morido: Morido }) {
  const a = morido.area;
  return (
    <div className={ROW}>
      <dt className={LABEL}>盛土規制法</dt>
      <dd className="min-w-0 flex-1">
        <span className={`block ${VALUE} text-ink`}>
          {moridoValue(morido)}
          {morido.link && (
            <a href={morido.link.url} target="_blank" rel="noreferrer" className="ml-2 whitespace-nowrap text-[11px] text-brand underline">
              {/^https:\/\/www2\.wagmap/.test(morido.link.url) ? "地図で見る" : "区域の資料"}
            </a>
          )}
        </span>
        <span className={SUB}>
          {a ? (a.notice ? moridoNotice(morido) : moridoDetail(morido)) : `区域の指定は${morido.authority}`}
          <br />
          {moridoNote(morido.authority)}
        </span>
      </dd>
    </div>
  );
}

/** 埋蔵文化財の行。包蔵地（遺跡）に入るかは教育委員会で確かめるもので、ここでは都県・市の遺跡地図と窓口を出す */
function IsekiRow({ iseki }: { iseki: Iseki }) {
  const m = iseki.map;
  return (
    <div className={ROW}>
      <dt className={LABEL}>埋蔵文化財</dt>
      <dd className="min-w-0 flex-1">
        <span className={`block ${VALUE} text-ink`}>
          {m ? "遺跡地図で確認" : `${iseki.city}の教育委員会で確認`}
          {m && (
            <a href={m.url} target="_blank" rel="noreferrer" title={m.name} className="ml-2 whitespace-nowrap text-[11px] text-brand underline">
              {m.at ? "地図で見る" : "遺跡地図"}
            </a>
          )}
        </span>
        {(m || iseki.note) && <span className={SUB}>{isekiNote(iseki)}</span>}
      </dd>
    </div>
  );
}
