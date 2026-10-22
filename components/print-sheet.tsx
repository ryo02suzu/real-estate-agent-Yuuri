"use client";

// 印刷・PDF 保存用の「調査メモ」。画面（地図・パネル・シート）は印刷せず、これだけを A4 に出す（app/globals.css の @media print）。
// 役所調査に持っていけるよう、地図の URL・色の見方・都市計画・地番・問い合わせ先・窓口で聞くことと、回答を書き込む欄をまとめる
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ASK, BRING } from "@/lib/inquiry";
import type { LookupResult, MapKind } from "@/lib/roadmap";
import { buildingSummary } from "@/lib/roadmap/building";
import { BUILDING_CREDIT } from "@/lib/roadmap/building-data";
import { groupHazardMaps, HAZARD_CREDIT, HAZARD_MAP_LABELS, HAZARD_TABLE_NOTE, hazardRows, wagamachiUrl } from "@/lib/roadmap/hazard";
import { changeText, distanceText, kindText, priceText } from "@/lib/roadmap/land-price";
import { LAND_PRICE_CREDIT } from "@/lib/roadmap/land-price-data";
import { schoolCredit, schoolLine } from "@/lib/roadmap/school";
import { POI_SOURCES, poiWalkText } from "@/lib/roadmap/poi";
import { STATION_CREDIT, stationLine } from "@/lib/roadmap/walk";
import { KOZU_CREDIT } from "@/lib/roadmap/kozu-data";
import { chibanLabel, estimatedNote, kuikiLabel, neighborList, parcelMark } from "@/lib/roadmap/parcel";
import { PARCEL_CREDIT } from "@/lib/roadmap/parcel-data";
import { SANKO_NOTE, sankoCredit } from "@/lib/roadmap/sanko-data";
import { HOUREI_CREDIT, houreiLine, houreiNote } from "@/lib/roadmap/hourei";
import { TOCHI_CREDIT, tochiLine } from "@/lib/roadmap/tochi";
import { isekiFor, isekiLine } from "@/lib/roadmap/iseki";
import { MORIDO_CREDIT, moridoLine } from "@/lib/roadmap/morido";
import { zoningRows } from "@/lib/roadmap/zoning";
import { ZONING_CREDIT } from "@/lib/roadmap/zoning-data";
import { COVERAGE } from "./coverage";
import type { BuildingState } from "./building-card";
import type { HazardState } from "./hazard-card";
import type { LandPriceState } from "./land-price-card";
import type { SchoolState } from "./school-card";
import type { PoiState } from "./poi-card";
import type { StationState } from "./station-card";
import { MapPreview } from "./map-preview";
import type { RoadsState } from "./nearby-roads";
import type { Triage } from "@/lib/app/triage";
import { checklistKey, loadDone } from "@/lib/checklist";
import { addressOffLot, parcelLines, type ParcelInfo } from "./parcel-card";
import type { ZoningState } from "./zoning-card";

type Ok = Extract<LookupResult, { status: "ok" }>;

const KIND: Record<MapKind, string> = {
  road_type: "道路種別",
  designated_only: "位置指定道路など一部",
  public_road: "公道（市道）かどうか",
};

const noop = () => () => {};

/** 結果の画面に置く。印刷のときだけ出る（画面には出ない） */
export function PrintSheet(props: {
  result: Ok;
  zoning: ZoningState;
  parcels: ParcelInfo;
  roads: RoadsState;
  hazard: HazardState;
  building: BuildingState;
  landPrice: LandPriceState;
  schools: SchoolState;
  stations: StationState;
  pois: PoiState;
  /** 要注意点と次にやること（見出しのすぐ下に出す） */
  triage?: Triage;
}) {
  // document.body に出す（画面の作りの外に置き、印刷では画面の作りを丸ごと隠す）。サーバーでは何も出さない
  const client = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!client) return null;
  return createPortal(<Memo {...props} />, document.body);
}

function Memo({
  result,
  zoning,
  parcels,
  roads,
  hazard,
  building,
  landPrice,
  schools,
  stations,
  pois,
  triage,
}: {
  result: Ok;
  zoning: ZoningState;
  parcels: ParcelInfo;
  roads: RoadsState;
  hazard: HazardState;
  building: BuildingState;
  landPrice: LandPriceState;
  schools: SchoolState;
  stations: StationState;
  pois: PoiState;
  triage?: Triage;
}) {
  const walks = stations.status === "ok" ? stations.stations : [];
  const facilities = pois.status === "ok" ? pois.pois : [];
  const bHit = building.status === "ok" ? building.result.hit : undefined;
  // 近くの地価：一番近い地価公示と地価調査を1つずつ（1枚に収めるため）
  const hits = landPrice.status === "ok" ? landPrice.hits : [];
  const prices = [hits.find((h) => h.kind === "公示"), hits.find((h) => h.kind === "調査")].filter((h) => h !== undefined);
  // 調べた日時（印刷した日ではなく、この結果を出した日時）
  const [at] = useState(() => new Date());
  const m = result.municipality;
  const p = result.parcel;
  const found = p && !result.picked ? p : undefined;
  // 市町村の地番参考図の筆（出典は市町村ごと）
  const sanko = p?.sanko ?? (parcels.status === "ok" ? parcels.parcel.sanko : undefined);
  const c = result.contact;
  const dept = c ? (/^(東京都|\S{2,3}県)\s/.test(c.dept) ? c.dept : `${m.name} ${c.dept}`) : undefined;
  const lines = parcels.status === "ok" ? parcelLines(parcels) : undefined;
  const date = `${at.getFullYear()}年${at.getMonth() + 1}月${at.getDate()}日 ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="print-sheet bg-white text-[11.5px] leading-[1.6] text-[#1d1b18]">
      <header className="flex items-end justify-between gap-4 border-b-2 border-[#9a7442] pb-1.5">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.1em] text-[#7a6a55]">道路種別・都市計画・災害リスクの調査メモ</p>
          <h1 className="text-[17px] font-bold leading-snug">
            {result.matchedAddress}
            {found ? ` ${chibanLabel(found.chibanRaw)}${parcelMark(found)}` : <span className="text-[13px] font-normal">{result.picked ? "（地図で選んだ地点）" : " 付近"}</span>}
          </h1>
        </div>
        <p className="shrink-0 text-right text-[10px] leading-[1.5] text-[#7a6a55]">
          調べた日時 {date}
          <br />
          MICHILU（michilu.vercel.app）
        </p>
      </header>

      {triage && <TriageBlock triage={triage} done={loadDone(checklistKey(result.lat, result.lng))} />}

      {/* 物件：場所の表と地図 */}
      <section className="mt-2.5 flex gap-4">
        <dl className="grid min-w-0 flex-1 grid-cols-[7.5em_1fr] content-start gap-x-2 gap-y-1">
          <dt className="text-[#7a6a55]">市区町村</dt>
          <dd>
            {m.pref}
            {m.name}（{COVERAGE[m.coverage].pill}）
          </dd>
          {found ? (
            <>
              <dt className="text-[#7a6a55]">地番で探した筆</dt>
              <dd>
                {kuikiLabel(found.kuiki)} {chibanLabel(found.chibanRaw)}
                {parcelMark(found)}
              </dd>
            </>
          ) : (
            p && (
              <>
                <dt className="text-[#7a6a55]">この地点の筆</dt>
                <dd>
                  {kuikiLabel(p.kuiki)} {chibanLabel(p.chibanRaw)}
                  {parcelMark(p)}
                </dd>
              </>
            )
          )}
          {bHit && (
            <>
              <dt className="text-[#7a6a55]">建物（参考）</dt>
              <dd>
                {buildingSummary(bHit.building)}
                {bHit.building.height ? `・高さ約${bHit.building.height.toFixed(1)}m` : ""}
                <span className="text-[10px] text-[#7a6a55]">（PLATEAU・推定）</span>
              </dd>
            </>
          )}
          {prices.length > 0 && (
            <>
              <dt className="text-[#7a6a55]">近くの地価（参考）</dt>
              <dd>
                {prices.map((h) => (
                  <span key={h.no} className="block">
                    {kindText(h.kind)} {h.no}（{h.usage}・{h.bearing}へ{distanceText(h.distance)}）：<b>{priceText(h.price)}</b>（前年比 {changeText(h.change)}・{h.year}年）
                  </span>
                ))}
              </dd>
            </>
          )}
          {schools.status === "ok" && (
            <>
              <dt className="text-[#7a6a55]">学区（参考）</dt>
              <dd>
                {[schools.schools.elementary && `小学校：${schoolLine(schools.schools.elementary)}`, schools.schools.junior && `中学校：${schoolLine(schools.schools.junior)}`]
                  .filter(Boolean)
                  .join("　")}
              </dd>
            </>
          )}
          {walks.length > 0 && (
            <>
              <dt className="text-[#7a6a55]">最寄り駅（目安）</dt>
              <dd>{walks.map(stationLine).join("　")}</dd>
            </>
          )}
          {facilities.length > 0 && (
            <>
              <dt className="text-[#7a6a55]">周辺施設（目安）</dt>
              <dd className="text-[10.5px] leading-[1.55]">{facilities.map((w) => `${w.label} ${w.name} ${poiWalkText(w)}`).join("　")}</dd>
            </>
          )}
          <dt className="text-[#7a6a55]">緯度・経度</dt>
          <dd className="tabular">
            {result.lat.toFixed(6)}, {result.lng.toFixed(6)}
          </dd>
          <dt className="text-[#7a6a55]">地理院地図</dt>
          <dd className="break-all text-[10px]">{`https://maps.gsi.go.jp/#18/${result.lat.toFixed(6)}/${result.lng.toFixed(6)}/`}</dd>
          {(m.note || m.coverage !== "full") && (
            <>
              <dt className="text-[#7a6a55]">市の案内</dt>
              <dd className="text-[10.5px]">{m.note ?? COVERAGE[m.coverage].long}</dd>
            </>
          )}
          {result.approximate && (
            <>
              <dt className="text-[#7a6a55]">注意</dt>
              <dd className="text-[10.5px] text-[#8a4f3a]">番地が見つからず、町の中心の位置です。物件の場所を確かめてください。</dd>
            </>
          )}
        </dl>
        <MapPreview lat={result.lat} lng={result.lng} parcel={p} bare className="h-[150px] w-[230px] shrink-0" />
      </section>

      {/* 道路種別の地図 */}
      {result.links.length > 0 && (
        <Block title="道路種別を確かめる地図">
          <ol className="space-y-2">
            {result.links.map((l) => (
              <li key={l.url} className="break-inside-avoid">
                <p className="font-semibold">
                  {l.label}
                  <span className="ml-1.5 rounded border border-[#d8ccb8] px-1 text-[9.5px] font-normal text-[#7a6a55]">{KIND[l.kind]}</span>
                </p>
                <p className="break-all text-[9.5px] leading-[1.45] text-[#5d5143]">{l.url}</p>
                {l.sheet && (
                  <p className="text-[10.5px]">
                    物件が載っている図：{l.sheet.whole ? "市全体の図" : l.sheet.label}（図の{l.sheet.where}あたり）
                    {l.sheet.neighbor && `。端に近いので隣の図 ${l.sheet.neighbor.label} も確認`}
                  </p>
                )}
                {(l.sheet?.howto || l.tip) && <p className="text-[10.5px] text-[#5d5143]">開き方：{l.sheet?.howto ?? l.tip}</p>}
                {!l.pinpoint && !l.sheet && <p className="text-[10.5px] text-[#5d5143]">地図の住所検索に住所を入れて探してください。</p>}
                {l.legend && (
                  <div className="mt-1 rounded border border-[#e6ddcf] px-2 py-1">
                    <p className="text-[9.5px] text-[#7a6a55]">地図の色の見方（地図の凡例を文字にしたもの）</p>
                    <ul className="grid grid-cols-3 gap-x-3">
                      {l.legend.map((e) => (
                        <li key={e.label} className="flex gap-1.5 text-[9.5px] leading-[1.5]">
                          <span className="mt-[5px] inline-block h-[4px] w-4 shrink-0 rounded-full border border-black/15" style={{ background: e.color }} />
                          <span className="min-w-0">{e.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {roads.status === "ok" && (
            <div className="mt-2 break-inside-avoid">
              <p className="font-semibold">物件のまわりの道路（市の地図データ・{roads.roads.length ? "近い順" : "50m以内に無し"}）</p>
              {roads.roads.length > 0 ? (
                <ul className="grid grid-cols-2 gap-x-4 text-[10.5px]">
                  {roads.roads.map((r) => (
                    <li key={`${r.label}|${r.direction}|${r.distance}`}>
                      {r.direction === "地点上" ? "地点の上" : `${r.direction} 約${Math.max(1, Math.round(r.distance))}m`}：{r.label}
                      {r.width && `（幅員 ${r.width}）`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[10.5px]">物件から50m以内に、地図で色の付いた道路はありません。</p>
              )}
            </div>
          )}
        </Block>
      )}

      <div className="mt-3 grid grid-cols-2 gap-4">
        {/* 都市計画 */}
        <Block title="都市計画（参考）" flush>
          {zoning.status === "ok" ? (
            <>
              <dl className="divide-y divide-[#eee6da]">
                {zoningRows(zoning.zoning, zoning.st).map((r) => (
                  <div key={r.label + r.value} className="flex gap-2 py-0.5">
                    <dt className="w-[7.5em] shrink-0 text-[10.5px] text-[#7a6a55]">{r.label}</dt>
                    <dd className={`min-w-0 flex-1 font-semibold ${r.warn ? "text-[#8a4f3a]" : ""}`}>{r.value}</dd>
                  </div>
                ))}
                {zoning.morido && (
                  <div className="flex gap-2 py-0.5">
                    <dt className="w-[7.5em] shrink-0 text-[10.5px] text-[#7a6a55]">盛土規制法</dt>
                    <dd className="min-w-0 flex-1 font-semibold">{moridoLine(zoning.morido)}</dd>
                  </div>
                )}
                {/* 砂防指定地・急傾斜地などは、区域に入っているときだけ（1枚に収めるため） */}
                {!!zoning.hourei?.hits.length && (
                  <div className="flex gap-2 py-0.5">
                    <dt className="w-[7.5em] shrink-0 text-[10.5px] text-[#7a6a55]">法令の区域</dt>
                    <dd className="min-w-0 flex-1 font-semibold text-[#8a4f3a]">{houreiLine(zoning.hourei)}</dd>
                  </div>
                )}
                {/* 自然公園・農業振興地域・森林も、区域に入っているときだけ */}
                {!!(zoning.tochi?.park || zoning.tochi?.agri || zoning.tochi?.forest) && (
                  <div className="flex gap-2 py-0.5">
                    <dt className="w-[7.5em] shrink-0 text-[10.5px] text-[#7a6a55]">自然公園・農振・森林</dt>
                    <dd className="min-w-0 flex-1 font-semibold text-[#8a4f3a]">
                      {tochiLine(zoning.tochi)}（{zoning.tochi.year}年度の国のデータ・参考）
                    </dd>
                  </div>
                )}
                <div className="flex gap-2 py-0.5">
                  <dt className="w-[7.5em] shrink-0 text-[10.5px] text-[#7a6a55]">埋蔵文化財</dt>
                  <dd className="min-w-0 flex-1 font-semibold">{isekiLine(isekiFor(m, result.lat, result.lng))}</dd>
                </div>
              </dl>
              <p className="mt-1 text-[9px] leading-[1.5] text-[#7a6a55]">
                {zoning.st?.asOf && `${zoning.st.city}のデータは${zoning.st.asOf}時点。`}
                建ぺい率・容積率は都市計画で定めた数値（角地緩和や前面道路の幅による制限は含まない）。
              </p>
            </>
          ) : (
            <p className="text-[10.5px] text-[#7a6a55]">{zoning.status === "loading" ? "読み込み中でした。画面の表示が終わってから印刷し直してください。" : "データを読み込めませんでした。"}</p>
          )}
        </Block>

        {/* 地番 */}
        <Block title="謄本・公図を取るときの地番" flush>
          {parcels.status === "ok" && lines ? (
            <>
              <p className="text-[10px] text-[#7a6a55]">
                {addressOffLot(parcels) === "large" ? "住所の地点にある筆（参考。隣地がとても多く、道路など物件の外の土地の可能性）" : parcels.kind === "address" ? "住所の地点にある筆（参考。住居表示と地番は別）" : "物件の筆"}
                {parcels.parcel.estimated && `・公図から推定した位置（${estimatedNote(parcels.parcel.estimated)}）`}
                {parcels.parcel.sanko && `・地番参考図（${SANKO_NOTE}）`}
              </p>
              <p className="font-semibold">{lines.target ?? `${kuikiLabel(parcels.parcel.kuiki)} ${chibanLabel(parcels.parcel.chibanRaw)}`}</p>
              <p className="mt-1 text-[10px] text-[#7a6a55]">境界が接している筆（{lines.neighbors.length}）</p>
              <p className="text-[10.5px]">{lines.neighbors.length ? neighborList(lines.neighbors) : "地図データの中には見つかりませんでした"}</p>
            </>
          ) : (
            <p className="text-[10.5px] text-[#7a6a55]">
              {parcels.status === "loading" ? "読み込み中でした。画面の表示が終わってから印刷し直してください。" : "この場所の地番の地図データはありません。"}
            </p>
          )}
        </Block>
      </div>

      {/* 災害リスク（国のデータ）と、重要事項説明に使う市区町村のハザードマップ */}
      <Block title="災害リスク（国のデータ・参考）">
        {hazard.status === "ok" ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4">
              {hazardRows(hazard.report, hazard.elevation).map((r) => (
                <div key={r.kind} className="flex gap-2 border-b border-[#eee6da] py-0.5">
                  <dt className="w-[7em] shrink-0 text-[10px] text-[#7a6a55]">{r.name}</dt>
                  <dd className={`min-w-0 flex-1 text-[10.5px] font-semibold ${r.warn ? "text-[#8a4f3a]" : ""}`}>{r.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-1 text-[10px] text-[#5d5143]">
              {HAZARD_TABLE_NOTE}。重要事項説明は{m.name}のハザードマップで確認：
            </p>
            <ul className="text-[9.5px] leading-[1.45] text-[#5d5143]">
              {groupHazardMaps(hazard.maps).map((g) => (
                <li key={g.url} className="break-all">
                  {g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}：{g.url}
                </li>
              ))}
              <li className="break-all">わがまちハザードマップ（国の一覧）：{wagamachiUrl(hazard.muniCd)}</li>
            </ul>
          </>
        ) : (
          <p className="text-[10.5px] text-[#7a6a55]">{hazard.status === "loading" ? "読み込み中でした。画面の表示が終わってから印刷し直してください。" : "データを読み込めませんでした。"}</p>
        )}
      </Block>

      {/* 問い合わせ先と窓口での確認 */}
      {c && dept && (
        <Block title="問い合わせ先">
          <div className="grid grid-cols-[1fr_1fr] gap-4">
            <dl className="grid grid-cols-[4.5em_1fr] content-start gap-x-2 gap-y-0.5">
              <dt className="text-[#7a6a55]">部署名</dt>
              <dd className="font-semibold">{dept}</dd>
              {c.phone && (
                <>
                  <dt className="text-[#7a6a55]">電話</dt>
                  <dd className="tabular">
                    {c.phone}
                    {c.noPhoneInquiry && <span className="text-[10px]">（道路種別は電話では答えてもらえない）</span>}
                  </dd>
                </>
              )}
              {c.email && (
                <>
                  <dt className="text-[#7a6a55]">メール</dt>
                  <dd className="break-all">{c.email}</dd>
                </>
              )}
              {c.hours && (
                <>
                  <dt className="text-[#7a6a55]">受付時間</dt>
                  <dd>{c.hours}</dd>
                </>
              )}
              {c.note && (
                <>
                  <dt className="text-[#7a6a55]">備考</dt>
                  <dd className="text-[10.5px] text-[#8a4f3a]">{c.note}</dd>
                </>
              )}
            </dl>
            <div className="text-[10.5px]">
              <p className="text-[10px] text-[#7a6a55]">持っていくもの</p>
              <ul>
                {BRING.map((b) => (
                  <li key={b}>□ {b}</li>
                ))}
              </ul>
            </div>
          </div>
        </Block>
      )}

      <Block title="窓口で聞くこと・回答メモ">
        <ol className="space-y-1">
          {ASK.map((a, i) => (
            <li key={a} className="break-inside-avoid">
              <p className="text-[10.5px]">
                {i + 1}. {a}
              </p>
              <p className="mt-2 border-b border-dotted border-[#b9ad9b]" />
            </li>
          ))}
        </ol>
        <p className="mt-3 flex gap-6 text-[10.5px] text-[#5d5143]">
          <span className="flex-1 border-b border-[#b9ad9b] pb-0.5">対応した窓口・担当者：</span>
          <span className="w-[40%] border-b border-[#b9ad9b] pb-0.5">確認した日：</span>
        </p>
      </Block>

      <footer className="mt-3 border-t border-[#d8ccb8] pt-1.5 text-[8.5px] leading-[1.55] text-[#7a6a55]">
        <p>
          ※ 地図や都市計画・地番・災害リスクは参考情報です。重要事項説明などの最終確認は、必ず役所の窓口・法務局で行ってください。道路種別・接道の判断はこのメモでは行っていません。
        </p>
        <p>
          地図：地理院タイル（国土地理院）。{zoning.status === "ok" && `都市計画の${ZONING_CREDIT}。`}
          {zoning.status === "ok" && zoning.morido && `盛土規制法の区域の${MORIDO_CREDIT}（概略の区域で、重要事項説明の根拠には使えません）。`}
          {zoning.status === "ok" &&
            !!zoning.hourei?.hits.length &&
            `砂防指定地などの区域の${HOUREI_CREDIT}（概略の区域で、重要事項説明の根拠には使えません）。${[...new Set(zoning.hourei.hits.map((h) => houreiNote(h.kind, h.pref)).filter(Boolean))].join("")}`}
          {zoning.status === "ok" && !!(zoning.tochi?.park || zoning.tochi?.agri || zoning.tochi?.forest) && `自然公園・農業振興地域・森林の${TOCHI_CREDIT}（縮尺約1/5万の概略の区域）。`}
          {hazard.status === "ok" && `災害リスクの${HAZARD_CREDIT}。`}
          {bHit && `建物の${BUILDING_CREDIT}。`}
          {prices.length > 0 && `地価の${LAND_PRICE_CREDIT}（標準地・基準地の価格で、物件の価格ではありません）。`}
          {schools.status === "ok" && `学区の${schoolCredit(schools.schools)}（指定校は教育委員会で確認）。`}
          {walks.length > 0 && `駅の${STATION_CREDIT}（徒歩は道路距離 80m を1分。駅の出入口までではない）。`}
          {facilities.length > 0 && `周辺施設は${POI_SOURCES}を加工して作成（施設の位置までの目安）。`}
          {(p || parcels.status === "ok") && `筆の${PARCEL_CREDIT}。`}
          {(p?.estimated || (parcels.status === "ok" && parcels.parcel.estimated)) && `${KOZU_CREDIT}。`}
          {sanko && `参考図の筆の${sankoCredit(sanko)}。`}
        </p>
      </footer>
    </div>
  );
}

/** 要注意点（▲ 要注意・・要確認）と、次にやること（窓口ごと。済んだものは ☑） */
function TriageBlock({ triage, done }: { triage: Triage; done: Set<string> }) {
  return (
    <section className="mt-2.5 flex gap-4 break-inside-avoid">
      <div className="min-w-0 flex-1">
        <h2 className="mb-1 border-l-[3px] border-[#9a7442] pl-1.5 text-[12.5px] font-bold">
          問題になりそうな所 <span className="text-[10px] font-normal text-[#7a6a55]">{triage.headline}</span>
        </h2>
        {triage.issues.length ? (
          <ul className="space-y-0.5 text-[10.5px] leading-[1.5]">
            {triage.issues.map((i) => (
              <li key={i.id}>
                <span className={i.level === "warn" ? "font-bold text-[#a3321a]" : "font-bold"}>{i.level === "warn" ? "▲" : "・"}{i.title}</span>
                {i.confirm && <span className="text-[#7a6a55]">（{i.confirm}）</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[10.5px] text-[#7a6a55]">{triage.pending.length ? `${triage.pending.join("・")}を確認中に印刷しました` : "データで見つかった注意はありません"}</p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="mb-1 border-l-[3px] border-[#9a7442] pl-1.5 text-[12.5px] font-bold">次にやること</h2>
        <ul className="space-y-0.5 text-[10.5px] leading-[1.5]">
          {triage.actions.map((a) => (
            <li key={a.id}>
              {done.has(a.id) ? "☑" : "□"} <b>{a.title}</b>
              <span className="text-[#7a6a55]">
                ：{a.where}
                {a.phone ? ` ${a.phone}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Block({ title, children, flush }: { title: string; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className={`${flush ? "" : "mt-3"} break-inside-avoid`}>
      <h2 className="mb-1 border-l-[3px] border-[#9a7442] pl-1.5 text-[12.5px] font-bold">{title}</h2>
      {children}
    </section>
  );
}
