"use client";

// 物件の地点の都市計画（用途地域・建ぺい率・容積率・防火・高度地区など）。国土交通省の都市計画決定GISデータを
// アプリと同じサイトに置いたタイルから読む（lib/roadmap/zoning.ts）。道路種別の結果を先に出し、こちらは後から読み込む
import { useEffect, useState } from "react";
import type { Municipality } from "@/lib/roadmap";
import { statusFor, zoningAt, zoningChips, zoningRows, type Zoning, type ZoningStatus } from "@/lib/roadmap/zoning";
import { ZONING_DATA } from "@/lib/roadmap/zoning-data";
import { pmtilesZoningSource } from "@/lib/roadmap/zoning-tiles";
import { AlertIcon, ChevronRightIcon, InfoIcon, ZoningIcon } from "./icons";
import { Sheet } from "./sheet";

export type ZoningState = { status: "loading" } | { status: "error" } | { status: "ok"; zoning: Zoning; st?: ZoningStatus };

/** 地点の都市計画を読む（市区町村のデータの有無と時点も） */
export function useZoning(lat: number, lng: number, municipality: Municipality): ZoningState {
  const codes = municipality.codes.join(",");
  const key = `${lat},${lng},${codes}`;
  const [state, setState] = useState<{ key: string; value: ZoningState }>();
  useEffect(() => {
    let alive = true;
    Promise.all([zoningAt(lat, lng, pmtilesZoningSource), import("@/lib/roadmap/data/zoning-status.json")])
      .then(([zoning, mod]) => {
        if (!alive) return;
        const st = statusFor(codes.split(","), mod.default as Record<string, ZoningStatus>);
        setState({ key, value: zoning ? { status: "ok", zoning, st } : { status: "error" } });
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

/** スマホ：用途地域などを1行に並べ、押すと詳しい一覧を下から出す */
export function ZoningLine({ state, city }: { state: ZoningState; city: string }) {
  const [open, setOpen] = useState(false);
  const chips = state.status === "ok" ? zoningChips(state.zoning) : [];
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={state.status !== "ok"}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-left text-[11px] leading-[1.5] text-ink"
      >
        <ZoningIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        <span className={`shrink-0 text-muted ${state.status === "ok" ? "[@media(max-height:720px)]:hidden" : ""}`}>都市計画</span>
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
      {state.status === "ok" && (
        <Sheet title="都市計画（参考）" open={open} onClose={() => setOpen(false)}>
          <ZoningDetail zoning={state.zoning} st={state.st} city={city} />
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
      {state.status === "ok" && <ZoningDetail zoning={state.zoning} st={state.st} city={city} />}
    </section>
  );
}

function ZoningDetail({ zoning, st, city }: { zoning: Zoning; st?: ZoningStatus; city: string }) {
  const rows = zoningRows(zoning, st);
  return (
    <div>
      <dl className="divide-y divide-line/70">
        {rows.map((r) => (
          <div key={r.label + r.value} className="flex gap-3 py-1.5">
            <dt className="w-[8.2em] shrink-0 text-[11.5px] leading-[1.6] text-muted">{r.label}</dt>
            <dd className="min-w-0 flex-1">
              <span className={`flex items-start gap-1.5 text-[13px] font-semibold leading-[1.5] ${r.warn ? "text-[#8a4f3a]" : "text-ink"}`}>
                {r.color && <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10" style={{ background: r.color }} />}
                {r.warn && !r.color && <AlertIcon className="mt-[3px] h-3.5 w-3.5 shrink-0" />}
                <span>{r.value}</span>
              </span>
              {r.sub && <span className="mt-0.5 block text-[10.5px] leading-[1.55] text-muted">{r.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted">
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          {st ? `${st.city}のデータは${st.asOf ? `${st.asOf}時点` : "時点の記載なし"}。` : `${city}は国のデータに載っていません。`}
          {st?.note && `${st.note.replace(/。?$/, "。")}`}
          地図上の区域は概ねの位置で、実際の範囲や最新の決定と異なることがあります。重要事項説明などの最終確認は、{city}の都市計画の窓口・都市計画図で行ってください。
          <span className="mt-1 block">
            出典：
            <a href="https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html" target="_blank" rel="noreferrer" className="underline">
              都市計画決定GISデータ（国土交通省）
            </a>
            を加工して作成（{ZONING_DATA.edition}）
          </span>
        </span>
      </p>
    </div>
  );
}
