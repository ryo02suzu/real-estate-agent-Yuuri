"use client";

// 国のデータの確認用ページ（/check）。画面のデザインを決める前に、物件の地点で国のデータ（液状化・大規模盛土造成地・災害履歴・
// 将来推計人口・駅別乗降客数・医療機関と幼稚園・鑑定評価書）が正しく読めるかを、飾りのない一覧で確かめる。
// 本番の画面からはつないでいない（URL を直接開く）。データの読み方は components/app/use-national.ts と lib/roadmap/*
import { useEffect, useState, type ReactNode } from "react";
import { useLandPrices } from "@/components/land-price-card";
import { useStations } from "@/components/station-card";
import { lookup, lookupPoint, type LookupResult } from "@/lib/roadmap";
import { APPRAISAL_CAUTION, APPRAISAL_CREDIT, methodRows, yenPerM2, type AppraisalPoint } from "@/lib/roadmap/appraisal";
import { FACILITY_CAUTION, FACILITY_CREDIT, FACILITY_KINDS, facilityCounts } from "@/lib/roadmap/facilities";
import { LIQ_CAUTIONS, LIQ_CREDIT, liquefactionText } from "@/lib/roadmap/liquefaction";
import { agingText, POP_AREA, POP_CAUTIONS, POP_CREDIT, populationText } from "@/lib/roadmap/population";
import { asOfText, REINFOLIB_NOTE, type NationalKey } from "@/lib/roadmap/reinfolib";
import { peopleText, RIDERSHIP_CAUTION, RIDERSHIP_CREDIT, ridershipText } from "@/lib/roadmap/ridership";
import { RIREKI_CAUTIONS, RIREKI_CREDIT, rirekiLine } from "@/lib/roadmap/rireki";
import { lineLabel } from "@/lib/roadmap/walk";
import { ZOUSEI_CAUTIONS, ZOUSEI_CREDIT, zouseiText } from "@/lib/roadmap/zousei";
import { useAppraisal, useFacilities, useLiquefaction, usePopulation, useRidership, useRireki, useZousei, type Loaded } from "@/components/app/use-national";

type Ok = Extract<LookupResult, { status: "ok" }>;

export function NationalCheck() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);

  /** 住所か「緯度,経度」で調べる */
  const run = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    try {
      const ll = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      setResult(ll ? await lookupPoint(Number(ll[1]), Number(ll[2])) : await lookup(text));
      window.history.replaceState(null, "", `?q=${encodeURIComponent(text)}`);
    } finally {
      setBusy(false);
    }
  };

  // ?q= の住所（か緯度,経度）で開いたら、そのまま調べる（最初の1回だけ）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;
    queueMicrotask(() => {
      setInput(q);
      void run(q);
    });
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white text-[14px] leading-relaxed text-slate-800">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <h1 className="text-[18px] font-bold">国のデータの確認（中身の確認用）</h1>
        <p className="mt-1 text-[12px] text-slate-500">画面のデザインを決める前に、物件の地点で国のデータが読めるかを確かめるページです。見た目は仮です。</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(input);
          }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="住所か緯度,経度（例：東京都渋谷区神南1-19-11）" className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-[16px]" />
          <button className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50" disabled={busy}>
            {busy ? "調べています" : "調べる"}
          </button>
        </form>
        {result && result.status !== "ok" && <p className="mt-4 text-red-700">この住所では調べられませんでした（{result.status}）</p>}
        {result?.status === "ok" && <Report key={`${result.lat},${result.lng}`} result={result} />}
        <p className="mt-10 border-t pt-3 text-[11px] text-slate-500">{REINFOLIB_NOTE}。</p>
      </div>
    </div>
  );
}

function Report({ result }: { result: Ok }) {
  const { lat, lng } = result;
  const liq = useLiquefaction(lat, lng);
  const zousei = useZousei(lat, lng);
  const rireki = useRireki(lat, lng);
  const pop = usePopulation(lat, lng);
  const fac = useFacilities(lat, lng);
  const stations = useStations(lat, lng);
  const ridership = useRidership(stations.status === "ok" ? stations.stations : undefined);
  const land = useLandPrices(lat, lng, 12);
  const koji = land.status === "ok" ? land.hits.filter((h) => h.kind === "公示").slice(0, 5) : [];
  const [chosen, setChosen] = useState(0);
  const appraisal = useAppraisal(koji[chosen]);

  return (
    <div className="mt-5 space-y-4">
      <p className="text-[13px]">
        <b>{result.matchedAddress}</b>（{lat.toFixed(6)}, {lng.toFixed(6)}）
      </p>

      <Section title="液状化の発生傾向" data="liq" state={liq} cautions={LIQ_CAUTIONS} credit={LIQ_CREDIT}>
        {(l) => (l ? <p className="text-[16px] font-bold">{liquefactionText(l)}</p> : <p>この地点のデータはありません（海・河川・関東の外など）</p>)}
      </Section>

      <Section title="大規模盛土造成地" data="zousei" state={zousei} cautions={ZOUSEI_CAUTIONS} credit={ZOUSEI_CREDIT}>
        {(z) => (
          <>
            <p className="text-[16px] font-bold">{zouseiText(z)}</p>
            {z.areas.length > 1 && (
              <ul className="mt-1 list-disc pl-5 text-[13px]">
                {z.areas.slice(1).map((a, i) => (
                  <li key={i}>
                    {a.kind}・{a.cityName} {a.number}（{a.inside ? "中" : `約${Math.round(a.distance)}m`}）
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      <Section title="災害履歴（国土調査）" data="rireki" state={rireki} cautions={RIREKI_CAUTIONS} credit={RIREKI_CREDIT}>
        {(rs) =>
          rs.length ? (
            <ul className="list-disc pl-5">
              {rs.map((r, i) => (
                <li key={i}>{rirekiLine(r)}</li>
              ))}
            </ul>
          ) : (
            <p>この地点と近くの記録はありません（調べていない地域もあります）</p>
          )
        }
      </Section>

      <Section title={`将来推計人口（${POP_AREA}）`} data="pop" state={pop} cautions={POP_CAUTIONS} credit={POP_CREDIT}>
        {(p) =>
          p ? (
            <>
              <p className="font-bold">{populationText(p)}</p>
              {agingText(p) && <p>{agingText(p)}</p>}
              {p.children && (
                <p>
                  0〜14歳の割合 {p.children.now}% → {p.children.future}%（2025年→2050年）
                </p>
              )}
              <table className="mt-2 text-[13px]">
                <tbody>
                  <tr>
                    {p.series.map((s) => (
                      <th key={s.year} className="border px-2 font-normal text-slate-500">
                        {s.year}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {p.series.map((s) => (
                      <td key={s.year} className="border px-2 text-right">
                        {s.people.toLocaleString("ja-JP")}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <p>まわりに人の住むメッシュがありません</p>
          )
        }
      </Section>

      <Section
        title="最寄り駅の乗降客数"
        data="ridership"
        state={stations.status === "ok" ? ridership : { status: stations.status === "error" ? "error" : "loading" }}
        cautions={[RIDERSHIP_CAUTION]}
        credit={RIDERSHIP_CREDIT}
      >
        {(byName) =>
          stations.status !== "ok" ? null : (
            <ul className="space-y-2">
              {stations.stations.map((s) => {
                const r = byName[s.name];
                return (
                  <li key={s.name}>
                    <b>{s.name}駅</b>（{s.lines.map(lineLabel).join("・")}）：{r ? ridershipText(r) : "乗降客数のデータなし"}
                    {r && (
                      <ul className="list-disc pl-5 text-[13px]">
                        {r.operators.map((o) => (
                          <li key={o.operator}>
                            {o.operator}（{o.lines.join("・")}）{peopleText(o.count)}
                            {o.note ? `　※${o.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        }
      </Section>

      <Section title="医療機関・幼稚園（国のデータ）" data="fac" state={fac} cautions={[FACILITY_CAUTION]} credit={FACILITY_CREDIT}>
        {(f) => (
          <>
            <ul className="list-disc pl-5">
              {f.nearest.map((w) => (
                <li key={w.query}>
                  <b>{w.label}</b>：{w.name}
                  {w.beds ? `（${w.beds}床${w.emergency ? "・救急" : ""}${w.disasterBase ? `・災害拠点（${w.disasterBase}）` : ""}）` : ""} {w.routed ? `徒歩約${w.minutes}分` : "直線"}（約{Math.round(w.meters)}m）
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[13px] text-slate-600">
              まわり1.2kmの数：
              {Object.entries(facilityCounts(f.near))
                .map(([k, n]) => `${FACILITY_KINDS[Number(k)]} ${n}`)
                .join("・") || "なし"}
            </p>
          </>
        )}
      </Section>

      <Section
        title="地価公示の鑑定評価書（近くの標準地）"
        data="appraisal"
        state={land.status === "ok" && !koji.length ? { status: "ok", value: null } : land.status === "ok" ? appraisal : { status: land.status === "error" ? "error" : "loading" }}
        cautions={[APPRAISAL_CAUTION]}
        credit={APPRAISAL_CREDIT}
      >
        {(a) => (
          <>
            {koji.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {koji.map((h, i) => (
                  <button key={h.no} onClick={() => setChosen(i)} className={`rounded border px-2 py-0.5 text-[12px] ${i === chosen ? "bg-slate-800 text-white" : ""}`}>
                    {h.no}（約{Math.round(h.distance)}m）
                  </button>
                ))}
              </div>
            )}
            {a ? <Appraisal a={a} /> : <p>{koji.length ? "この地点の鑑定評価書はありません" : "近くに地価公示の地点がありません"}</p>}
          </>
        )}
      </Section>
    </div>
  );
}

function Appraisal({ a }: { a: AppraisalPoint }) {
  const rows: [string, ReactNode][] = [
    ["標準地", `${a.no}（${a.use ?? ""}・${a.y}年1月1日）`],
    ["公示価格", `${yenPerM2(a.p)}${a.ch !== undefined ? `（前年比 ${a.ch > 0 ? "+" : ""}${a.ch}%）` : ""}`],
    ["所在", [a.addr, a.jukyo && `（${a.jukyo}）`].filter(Boolean).join("")],
    ["路線価", a.rosen?.p ? `${yenPerM2(a.rosen.p)}（${a.rosen.y}年）` : a.rosen?.rate ? `倍率 ${a.rosen.rate}` : "—"],
    ["地積・形状", [a.area && `${a.area}m²`, a.shape, a.frontage && a.depth && `間口:奥行 ${a.frontage}:${a.depth}`].filter(Boolean).join("・")],
    ["前面道路", [a.road?.dir, a.road?.width && `${a.road.width}m`, a.road?.kind, a.road?.sides].filter(Boolean).join("・")],
    ["交通", [a.access?.name, a.access?.m !== undefined && `${a.access.m}m`].filter(Boolean).join(" ")],
    ["法令", [a.law?.zone, a.law?.bcr && `建ぺい率${a.law.bcr}%`, a.law?.far && `容積率${a.law.far}%`, a.law?.fire, ...(a.law?.other ?? [])].filter(Boolean).join("・")],
    ["周辺", a.env ?? ""],
  ];
  return (
    <>
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th className="w-24 border px-2 py-1 text-left align-top font-normal text-slate-500">{k}</th>
              <td className="border px-2 py-1">{v || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 font-bold">鑑定評価の手法ごとの価格（鑑定評価員 {a.reports.length}人）</p>
      <table className="w-full text-[13px]">
        <tbody>
          {methodRows(a).map((r) => (
            <tr key={r.label}>
              <th className="border px-2 py-1 text-left font-normal text-slate-500">{r.label}</th>
              {r.values.map((v, i) => (
                <td key={i} className="border px-2 py-1 text-right">
                  {v ? yenPerM2(v) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {a.reports.map((r, i) => (
        <div key={i} className="mt-2 text-[12px] text-slate-600">
          {r.cases?.length ? <p>評価員{i + 1}の取引事例（査定価格）：{r.cases.map((c) => (c.val ? yenPerM2(c.val) : "—")).join("、")}</p> : null}
          {r.incomeDetail?.rate ? (
            <p>
              評価員{i + 1}の収益還元法：還元利回り {r.incomeDetail.rate}%{r.incomeDetail.gross ? `・総収益 ${Math.round(r.incomeDetail.gross / 10000).toLocaleString("ja-JP")}万円` : ""}
            </p>
          ) : null}
        </div>
      ))}
    </>
  );
}

function Section<T>({ title, data, state, cautions, credit, children }: { title: string; data: NationalKey; state: Loaded<T>; cautions: string[]; credit: string; children: (v: T) => ReactNode }) {
  return (
    <section className="rounded border border-slate-200 p-3">
      <h2 className="flex items-baseline justify-between gap-2 font-bold">
        {title}
        <span className="text-[11px] font-normal text-slate-400">{asOfText(data) ? `${asOfText(data)}に取得` : ""}</span>
      </h2>
      <div className="mt-1">
        {state.status === "ok" ? children(state.value) : state.status === "none" ? <p className="text-slate-500">まだデータがありません（取り込み待ち）</p> : state.status === "error" ? <p className="text-red-700">読み込めませんでした</p> : <p className="text-slate-500">読んでいます…</p>}
      </div>
      <ul className="mt-2 list-disc pl-5 text-[11px] text-slate-500">
        {cautions.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-slate-400">{credit}</p>
    </section>
  );
}
