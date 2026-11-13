"use client";

// PC の「調査デスク」で、調べた物件の画面：データを読み（スマホと同じ components/app/use-property.ts）、右のカルテ（地番・面積・坪・
// 辺の数・隣地・調査の進み具合・要注意／要確認／次にやること・項目ごとの中身・書類／比較／結果をコピー）を出し、真ん中に重ねて開く
// 画面（要注意点と次にやること・書類・取引事例）と、3D（Google の実写か代わりの街の模型）を出す。物件ごとに作り直す（key）
import { ChevronRight, Copy, Share2, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { parcelAreaM2, TSUBO_M2 } from "@/lib/app/area";
import type { CompareItem } from "@/lib/app/compare";
import { compareKey } from "@/lib/app/compare";
import { docText } from "@/lib/app/doc";
import type { DeskTod } from "@/lib/app/desk";
import { hazardTotal } from "@/lib/app/hazard-level";
import { lotCorners, lotShape } from "@/lib/app/lot-shape";
import { refLandPoint } from "@/lib/app/ratio-hint";
import { buildReport } from "@/lib/app/report";
import { labelPoint } from "@/lib/app/scene-lots";
import { directionOf, frontRoads, nearestOnLine, rankText } from "@/lib/app/town-model";
import type { HistoryItem } from "@/lib/history";
import type { MapPlace } from "../live-map";
import { propertyIdOf } from "@/lib/property-id";
import { loadRecords, RECORDS_EVENT, type PropertyRecords, type RecordTopic } from "@/lib/records";
import { partialMatch } from "@/lib/roadmap/geocode";
import type { AddressFix } from "@/lib/roadmap";
import { distanceText } from "@/lib/roadmap/land-price";
import { chibanLabel, chibanQueryOf, isLotChiban, kuikiLabel, registryChiban, type Neighbor } from "@/lib/roadmap/parcel";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { altsNote, awayLabel, awayNote, elsewhereNote } from "@/lib/roadmap/parcel-sub";
import { roadShort } from "@/lib/roadmap/road-read";
import { youtoShort } from "@/lib/roadmap/zoning";
import { addressOffLot, pickKey, registryNeighbors, type ParcelPick } from "../parcel-card";
import { PrintSheet } from "../print-sheet";
import { loaded } from "../result-view";
import { useChecklist } from "../triage-sheet";
import { NeighborPlanSkeleton, NeighborPlanView, useNeighborPlan } from "../app/neighbor-plan";
import type { SceneTab } from "../app/property-3d";
import { loadTown } from "../app/property-scene";
import { RecordSheet } from "../app/record-sheet";
import { useSender } from "@/lib/sender";
import { displayAddress } from "../app/r-ui";
import { topicStatuses } from "../app/status";
import type { FrontRoad, HazardPick } from "../app/types";
import type { HazardKind } from "@/lib/roadmap/hazard";
import { useProperty, type Ok } from "../app/use-property";
import { DocsOverlay, type DocKind } from "./docs";
import type { Frame } from "./google-3d";
import { DealsBlock, SectionBody, sectionSummary, SECTIONS, type MapLayer, type SectionCtx, type SectionKey } from "./sections";
import { Stage3D, type Engine, type StageControls } from "./stage-3d";
import { TriageOverlay } from "./triage";
import { BodyPortal, copyText, Overlay, Ring, type Toast } from "./ui";

export type PropOverlay = "triage" | "docs" | "deals";
/** 3D の層のボタン（Google の 3D：筆・地番と駅・学校。代わりの 3D：見せ方） */
export type Layers3D = { parcels: boolean; zoning: boolean; hazard: boolean; places: boolean };

/** お気に入り・比較に残す形（検索履歴と同じ。地図で選んだ地点は座標で調べ直す） */
export function itemOf(query: string, r: Ok): HistoryItem {
  return { address: r.picked ? r.matchedAddress : query, city: r.municipality.name, coverage: r.municipality.coverage, at: Date.now(), ...(r.picked ? { ll: [r.lat, r.lng] as [number, number] } : {}) };
}

type Props = {
  query: string;
  result: Ok;
  mode: "map" | "3d";
  section: SectionKey | null;
  setSection: (k: SectionKey | null) => void;
  overlay: string | null;
  setOverlay: (o: PropOverlay | null) => void;
  docKind: DocKind;
  setDocKind: (k: DocKind) => void;
  layers3d: Layers3D;
  stageSlot: HTMLElement | null;
  centerEl: HTMLElement | null;
  creditSlot: HTMLElement | null;
  frame: Frame;
  tod: DeskTod;
  sun?: { az: number; alt: number };
  dist: number;
  motion: boolean;
  reduced: boolean;
  /** 地理院の地図のある画面を開いている（Google の 3D を隠す） */
  hide3d: boolean;
  favorite: boolean;
  onFavorite: (item: HistoryItem) => void;
  onCompare: (c: CompareItem) => void;
  onPick: (address: string) => void;
  /** 地図の地点（同じ地番の別の筆など）へ移る */
  onPickPoint?: (lat: number, lng: number) => void;
  onLiteral?: (fix: AddressFix) => void;
  onMap: (layer?: MapLayer, arg?: HazardKind | [number, number]) => void;
  onFix: () => void;
  onPlaces: (p: MapPlace[]) => void;
  onEngine: (e: Engine, note?: string) => void;
  onInfo: (info: { lot?: string; town: string }) => void;
  /** 地理院の地図のある画面（案内図）を開いた・閉じた */
  onGsiPane: (on: boolean) => void;
  controlsRef: React.MutableRefObject<StageControls | null>;
  /** 比較の画面の「今の物件を加える」から呼ぶ */
  addCurrentRef: React.MutableRefObject<(() => void) | null>;
  toast: (t: Toast | string) => void;
};

/** 土地に接する道（地理院の最適化ベクトルタイルの道路から。街の模型と同じ計算。建築基準法の道路かは分からない） */
function useFrontRoads(result: Ok, parcel: ReturnType<typeof lotParcelOf>): FrontRoad[] | null {
  const key = parcel ? `${result.lat},${result.lng}|${parcel.kuiki}|${parcel.chibanRaw}` : "";
  const [state, setState] = useState<{ key: string; roads: FrontRoad[] } | null>(null);
  useEffect(() => {
    if (!parcel) return;
    let alive = true;
    const origin = { lat: result.lat, lng: result.lng };
    loadTown(origin)
      .then((town) => {
        if (!alive || !town) return;
        const shape = lotShape(parcel, origin);
        const center = labelPoint(shape) ?? [0, 0];
        const seen = new Set<string>();
        const roads: FrontRoad[] = [];
        for (const i of new Set(shape.fills.flatMap((f) => frontRoads(town.roads, f.outer)))) {
          const r = town.roads[i];
          const p = nearestOnLine(center, r.line);
          const direction = directionOf(p[0] - center[0], p[1] - center[1]);
          if (seen.has(direction)) continue;
          seen.add(direction);
          roads.push({ direction, width: rankText(r.rank), major: r.major });
        }
        setState({ key, roads });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // parcel は key で見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.roads : null;
}

/** 物件の土地として見てよい筆（地番の付いた筆で、住所の地点が道路などの大きな筆に乗っていない） */
function lotParcelOf(data: ReturnType<typeof useProperty>) {
  const p = data.parcels;
  return p.status === "ok" && isLotChiban(p.parcel.chibanRaw) && addressOffLot(p) === undefined ? p.parcel : undefined;
}

export function DeskProperty(props: Props) {
  const { query, result, mode, section, setSection, overlay, setOverlay, docKind, setDocKind, layers3d, stageSlot, centerEl, creditSlot, toast } = props;
  const data = useProperty(result);
  const sender = useSender();
  const m = result.municipality;
  const pid = propertyIdOf(query, result);
  const checklist = useChecklist(result);

  // あなたの確認の記録（端末の中だけ。スマホと同じ）
  const [records, setRecords] = useState<PropertyRecords>(() => loadRecords(pid));
  useEffect(() => {
    const reload = () => setRecords(loadRecords(pid));
    addEventListener(RECORDS_EVENT, reload);
    return () => removeEventListener(RECORDS_EVENT, reload);
  }, [pid]);
  const [recordTopic, setRecordTopic] = useState<RecordTopic | null>(null);
  const statuses = topicStatuses(result, data, records);

  // 見出しの数字（スマホの物件の画面と同じ決まり）。住所で調べたときの筆は「住所の地点の筆（参考）」で、面積は出さない
  const shownParcel = data.parcels.status === "ok" ? data.parcels.parcel : undefined;
  const lotParcel = lotParcelOf(data);
  const lotIsProperty = data.parcels.status === "ok" && data.parcels.kind !== "address";
  const lotNumber = lotParcel && lotIsProperty ? registryChiban(lotParcel.chibanRaw) : undefined;
  const refLot = lotParcel && !lotIsProperty ? registryChiban(lotParcel.chibanRaw) : undefined;
  const lotArea = lotParcel && lotIsProperty ? parcelAreaM2(lotParcel) : undefined;
  const rough = !!(lotParcel?.estimated || lotParcel?.sanko);
  const corners = lotParcel && lotIsProperty ? lotCorners(lotParcel) : undefined;
  const neighbors = data.parcels.status === "ok" && addressOffLot(data.parcels) === undefined ? registryNeighbors(data.parcels).length : undefined;
  const where = displayAddress(result.matchedAddress);
  const town = result.town || where;
  const areaText = lotArea ? (rough ? `約${Math.round(lotArea / 10) * 10}` : `約${lotArea.toFixed(0)}`) : undefined;
  const tsuboText = lotArea ? (rough ? `約${Math.round(lotArea / TSUBO_M2)}` : (lotArea / TSUBO_M2).toFixed(1)) : undefined;
  const lotAreaLine = lotArea ? `約${rough ? Math.round(lotArea / 10) * 10 : lotArea.toFixed(2)}㎡（約${rough ? Math.round(lotArea / TSUBO_M2) : (lotArea / TSUBO_M2).toFixed(1)}坪）` : undefined;

  // 左の列の「いまの物件」
  const { onInfo } = props;
  useEffect(() => onInfo({ lot: lotNumber, town }), [onInfo, lotNumber, town]);

  // 隣の土地：選んだ筆（謄本・公図の請求に貼る）と配置図（方角・接する長さ）
  const plan = useNeighborPlan(result.lat, result.lng, data.parcels);
  const [picked, setPicked] = useState<Neighbor[]>([]);
  const [flashed, setFlashed] = useState<{ key: string; n: number } | null>(null);
  const togglePick = useCallback((n: Neighbor) => {
    const k = pickKey(n);
    setPicked((cur) => (cur.some((x) => pickKey(x) === k) ? cur.filter((x) => pickKey(x) !== k) : [...cur, { kuiki: n.kuiki, chiban: registryChiban(n.chiban) }]));
  }, []);
  const pick: ParcelPick = {
    list: picked,
    toggle: togglePick,
    set: setPicked,
    onMap: () => props.onMap("parcels"),
    plan,
    flashed,
    flash: (n) => setFlashed((f) => ({ key: pickKey(n), n: (f?.n ?? 0) + 1 })),
    renderPlan: () =>
      plan.status === "ok" ? (
        <NeighborPlanView
          plan={plan}
          tone="light"
          picked={new Set(picked.map(pickKey))}
          flash={flashed}
          motion={props.motion}
          onTap={(l) => {
            togglePick({ kuiki: l.kuiki, chiban: l.chiban });
            setFlashed((f) => ({ key: l.key, n: (f?.n ?? 0) + 1 }));
          }}
        />
      ) : plan.status === "loading" ? (
        <NeighborPlanSkeleton tone="light" />
      ) : null,
  };

  // 土地に接する道（地理院の地図の道路）。代わりの 3D を出していれば模型の計算をそのまま使う
  const computedFront = useFrontRoads(result, lotParcel);
  const [modelFront, setModelFront] = useState<FrontRoad[] | null>(null);
  const front = modelFront ?? computedFront;

  // 地図の「駅・学校」の札（物件の画面が読んだ駅・学校・近くの施設）
  const { onPlaces } = props;
  const places = useMemo<MapPlace[]>(() => {
    const out: MapPlace[] = [];
    if (data.stations.status === "ok")
      for (const s of data.stations.stations.slice(0, 3)) if (s.at) out.push({ key: `st:${s.name}`, name: `${s.name}駅`, sub: s.routed ? `徒歩${s.minutes}分` : `直線${distanceText(s.straight)}`, kind: "station", lng: s.at[0], lat: s.at[1] });
    if (data.schools.status === "ok")
      for (const sc of [data.schools.schools.elementary, data.schools.schools.junior]) if (sc?.point) out.push({ key: `sc:${sc.name}`, name: sc.name, sub: sc.walk ? `徒歩${sc.walk.minutes}分` : undefined, kind: "school", lng: sc.point[0], lat: sc.point[1] });
    if (data.around.status === "ok")
      for (const p of data.around.nearest.filter((x) => x.straight <= 800).slice(0, 6)) out.push({ key: `poi:${p.kind}:${p.name}`, name: p.name, sub: p.routed && p.minutes !== undefined ? `徒歩${p.minutes}分` : undefined, kind: "poi", lng: p.at[0], lat: p.at[1] });
    return out;
  }, [data.stations, data.schools, data.around]);
  useEffect(() => onPlaces(places), [onPlaces, places]);

  // 3D の見せ方（代わりの 3D）：層のボタンが優先、無ければカルテで開いている項目
  const view: SceneTab = layers3d.zoning ? "law" : layers3d.hazard ? "hazard" : layers3d.places ? "around" : section === "road" ? "road" : section === "law" ? "law" : section === "hazard" ? "hazard" : section === "around" ? "around" : section === "price" ? "price" : "basic";
  const hazPick: HazardPick = "flood";

  // 書類・文面
  const loadedData = loaded({ ...data, landPrice: data.landPrice5 });
  const summaryText = () => docText(buildReport(result, { ...loadedData, triage: data.triage, done: checklist.done }, { detail: "full", date: new Date(), area: lotAreaLine, records }));
  const copyResult = async () => {
    if (await copyText(summaryText())) toast("結果をコピーしました（メール・チャットに貼れます）");
  };
  const copyAddress = async () => {
    const t = lotNumber && !result.picked ? `${result.matchedAddress}${lotNumber}` : result.matchedAddress;
    if (await copyText(t)) toast(`「${t}」をコピーしました`);
  };

  // 比較に加える（その時点の写し）
  const addCompare = () => {
    const y = data.zoning.status === "ok" ? data.zoning.zoning.youto[0] : undefined;
    const st = data.stations.status === "ok" ? data.stations.stations[0] : undefined;
    const top = data.landPrice.status === "ok" ? refLandPoint(data.landPrice.hits, y?.name).top : undefined;
    const total = data.hazard.status === "ok" ? hazardTotal(data.hazard.report) : null;
    const road =
      plan.status === "ok" && plan.roads[0]?.side
        ? plan.roads
            .filter((r) => r.side)
            .slice(0, 2)
            .map((r) => `${r.side!.dir} 約${r.side!.length.toFixed(1)}m`)
            .join("・")
        : data.roads.status === "ok" && data.roads.roads[0]
          ? `${data.roads.roads[0].direction}側 ${roadShort(data.roads.roads[0].label)}`
          : undefined;
    const item = itemOf(query, result);
    props.onCompare({
      key: compareKey(item),
      item,
      title: lotNumber ?? (town || where),
      place: `${m.name} ${town}`.trim(),
      area: lotArea,
      rough,
      neighbors,
      corners,
      road,
      zoning: y ? `${youtoShort(y.name)}${y.bcr && y.far ? ` ${y.bcr}/${y.far}` : ""}` : undefined,
      station: st ? `${st.name}駅 ${st.routed ? `徒歩${st.minutes}分` : `直線${distanceText(st.straight)}`}` : undefined,
      price: top ? `${top.kind} ${(top.price / 10000).toFixed(1)}万円/㎡（${distanceText(top.distance)}）` : undefined,
      hazard: total ? `${total.level}（目安）` : undefined,
      done: data.triage.actions.filter((a) => checklist.done.has(a.id)).length,
      total: data.triage.actions.length,
      at: Date.now(),
    });
  };

  const { addCurrentRef } = props;
  useEffect(() => {
    addCurrentRef.current = addCompare;
    return () => {
      addCurrentRef.current = null;
    };
  });

  const ctx: SectionCtx = {
    result,
    data,
    statuses,
    records,
    pick,
    plan,
    front,
    onMap: props.onMap,
    go: (k) => {
      setSection(k);
      requestAnimationFrame(() => document.getElementById(`desk-sec-${k}`)?.scrollIntoView({ block: "start", behavior: props.reduced || !props.motion ? "auto" : "smooth" }));
    },
    openDocs: (k) => {
      setDocKind(k as DocKind);
      setOverlay("docs");
    },
    openTriage: () => setOverlay("triage"),
    openDeals: () => setOverlay("deals"),
    openRecord: setRecordTopic,
    onFix: props.onFix,
  };

  const warns = data.triage.issues.filter((i) => i.level === "warn").length;
  const checks = data.triage.issues.filter((i) => i.level === "check").length;
  const left = data.triage.actions.filter((a) => !checklist.done.has(a.id)).length;
  const doneN = data.triage.actions.length - left;

  // 書類で案内図（地理院の地図）を開いている間は、Google の 3D を隠す
  const { onGsiPane } = props;
  const gsiPane = overlay === "docs" && docKind === "guide";
  useEffect(() => {
    onGsiPane(gsiPane);
    return () => onGsiPane(false);
  }, [gsiPane, onGsiPane]);

  const karte = (
    <aside className="desk-karte glass is-new" aria-label="物件のカルテ">
      <div className="head">
        <div className="town">
          <span title={result.matchedAddress}>
            {m.name} {town}
          </span>
          {shownParcel && <span className="chip">{shownParcel.sanko ? "市の地番参考図" : shownParcel.estimated ? "公図から推定した位置" : "登記所備付地図データを加工"}</span>}
        </div>
        <div className="big-num">
          {lotNumber ? (
            <>
              <span className="label">地番</span>
              <h2 className="num" title={`${kuikiLabel(lotParcel!.kuiki)} ${chibanLabel(lotParcel!.chibanRaw)}`}>
                {lotNumber}
              </h2>
            </>
          ) : (
            <h2 className="addr">{result.picked ? `${where} 付近（地図で選んだ地点）` : `${where}${result.approximate ? "（町の中心）" : " 付近"}`}</h2>
          )}
          <span className="acts">
            <button type="button" className="btn ghost icon" onClick={copyAddress} aria-label="住所と地番をコピー" title="住所と地番をコピー（地図の住所検索に貼る）">
              <Copy size={17} />
            </button>
            <button type="button" className="btn ghost icon" aria-pressed={props.favorite} onClick={() => props.onFavorite(itemOf(query, result))} aria-label={props.favorite ? "お気に入りから外す" : "お気に入りに保存"} title={props.favorite ? "お気に入りから外す" : "お気に入りに保存"}>
              <Star size={17} fill={props.favorite ? "currentColor" : "none"} />
            </button>
            <button type="button" className="btn ghost icon" onClick={copyResult} aria-label="結果をコピー" title="結果をコピー（メール・チャットに貼る）">
              <Share2 size={17} />
            </button>
          </span>
        </div>
        <div className="facts">
          {areaText && (
            <span>
              <b>{areaText}</b>㎡
            </span>
          )}
          {tsuboText && (
            <span>
              <b>{tsuboText}</b>坪
            </span>
          )}
          {corners && (
            <span title="地図データの筆の形から数えた目安（はっきり曲がる角の数）">
              辺の数 <b>{corners}</b>
            </span>
          )}
          {neighbors !== undefined && (
            <span>
              隣地 <b>{neighbors}</b>筆
            </span>
          )}
          {refLot && <span className="chip gold">住所の地点の筆 {refLot}（参考）</span>}
          {data.parcels.status === "loading" && <span>筆を確認しています…</span>}
        </div>
        <PlaceNotes query={query} result={result} data={data} onPick={props.onPick} onPickPoint={props.onPickPoint} onFix={props.onFix} onLiteral={props.onLiteral} />
      </div>
      <button type="button" className="desk-status" onClick={() => setOverlay("triage")} aria-label={`調査の進み具合 ${doneN}/${data.triage.actions.length}。要注意${warns}件・要確認${checks}件・次にやること${left}件。押すと要注意点と次にやることを開く`}>
        <Ring done={doneN} total={data.triage.actions.length} />
        <span className="block min-w-0">
          <span className="block text-[13px]">
            調査の進み具合{" "}
            <b className="num">
              {doneN} / {data.triage.actions.length}
            </b>
            {data.triage.pending.length > 0 && <span className="hint ml-2">確認中：{data.triage.pending.slice(0, 2).join("・")}</span>}
          </span>
          <span className="chips">
            <span className={`chip ${warns ? "warn" : "ok"}`}>要注意 {warns}</span>
            <span className={`chip ${checks ? "gold" : "ok"}`}>要確認 {checks}</span>
            <span className="chip info">次にやること {left}</span>
          </span>
        </span>
      </button>
      <div className="desk-sections" role="list">
        {SECTIONS.map((s) => {
          const open = section === s.key;
          return (
            <div key={s.key} id={`desk-sec-${s.key}`} className="desk-sec" data-open={open} role="listitem">
              <h3>
                <button type="button" aria-expanded={open} aria-controls={`desk-secbody-${s.key}`} onClick={() => setSection(open ? null : s.key)}>
                  <span className="ico" aria-hidden>
                    {s.ico}
                  </span>
                  <span className="name">{s.name}</span>
                  <span className="sum">{sectionSummary(s.key, { result, data, statuses })}</span>
                  <ChevronRight size={16} className="arrow" aria-hidden />
                </button>
              </h3>
              {open && (
                <div id={`desk-secbody-${s.key}`} className="inner">
                  <SectionBody k={s.key} ctx={ctx} />
                </div>
              )}
            </div>
          );
        })}
        <p className="desk-small px-1">表示される情報は参考です。建てられるか・接道を満たすかなどの判断はしません。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。</p>
      </div>
      <div className="foot">
        <button type="button" className="btn primary" onClick={() => ctx.openDocs(docKind)}>
          書類を作る
        </button>
        <button type="button" className="btn" onClick={addCompare}>
          比較に加える
        </button>
        <button type="button" className="btn" onClick={copyResult}>
          結果をコピー
        </button>
      </div>
    </aside>
  );

  const title = `${where}${lotNumber ? ` ${lotNumber}` : ""}`;
  const overlays = (
    <>
      {overlay === "triage" && <TriageOverlay result={result} triage={data.triage} checklist={checklist} title={title} onClose={() => setOverlay(null)} onRecord={setRecordTopic} />}
      {overlay === "docs" && (
        <DocsOverlay
          kind={docKind}
          setKind={setDocKind}
          result={result}
          data={data}
          records={records}
          checklist={checklist}
          title={title}
          areaLine={lotAreaLine}
          onClose={() => setOverlay(null)}
          toast={toast}
        />
      )}
      {overlay === "deals" && (
        <Overlay title="取引事例" hint={`${m.name}・実際に売買された価格（町まで）`} onClose={() => setOverlay(null)}>
          <DealsBlock data={data} />
        </Overlay>
      )}
    </>
  );

  return (
    <>
      {karte}
      {centerEl && createPortal(overlays, centerEl)}
      {stageSlot &&
        mode === "3d" &&
        createPortal(
          <Stage3D
            result={result}
            data={data}
            view={view}
            neighbors={layers3d.parcels || section === "parcel"}
            picked={picked}
            hazard={hazPick}
            layers={{ parcels: layers3d.parcels, places: layers3d.places }}
            tod={props.tod}
            sun={props.sun}
            dist={props.dist}
            frame={props.frame}
            hidden={props.hide3d}
            motion={props.motion}
            reduced={props.reduced}
            plan={plan}
            lot={lotNumber}
            town={town}
            onEngine={props.onEngine}
            onFront={setModelFront}
            onLot={() => ctx.go("parcel")}
            onNeighbor={(key) => {
              const [kuiki, chiban] = key.split("|");
              togglePick({ kuiki, chiban });
              ctx.go("parcel");
            }}
            controlsRef={props.controlsRef}
            creditSlot={creditSlot}
          />,
          stageSlot,
        )}
      {/* 調査メモ（画面には出ない。印刷・PDF 保存の対象。画面の地図・3D は印刷しない） */}
      <PrintSheet
        result={result}
        zoning={data.zoning}
        parcels={data.parcels}
        roads={data.roads}
        hazard={data.hazard}
        building={data.building}
        landPrice={data.landPrice5}
        schools={data.schools}
        stations={data.stations}
        pois={data.pois}
        triage={data.triage}
        records={records}
        sender={sender}
        area={lotAreaLine}
        form
      />
      <BodyPortal>
        <RecordSheet
          open={!!recordTopic}
          topic={recordTopic}
          pid={pid}
          label={title}
          records={records}
          status={statuses.find((s) => s.topic === recordTopic)}
          onClose={() => setRecordTopic(null)}
          onChange={setRecords}
        />
      </BodyPortal>
    </>
  );
}

/** 物件の場所の確かさで注意がいるとき（スマホの物件の画面の PlaceNote と同じ場合分け） */
function PlaceNotes({ query, result, data, onPick, onPickPoint, onFix, onLiteral }: { query: string; result: Ok; data: ReturnType<typeof useProperty>; onPick: (a: string) => void; onPickPoint?: (lat: number, lng: number) => void; onFix: () => void; onLiteral?: (fix: AddressFix) => void }) {
  const { approximate, picked, parcel, parcelMiss } = result;
  const notes: { warn?: boolean; body: ReactNode }[] = [];
  const mini = (label: string, run: () => void) => (
    <button key={label} type="button" className="mini" onClick={run}>
      {label}
    </button>
  );
  if (result.fix)
    notes.push({
      body: (
        <>
          「{result.fix.from}」を「{result.fix.to}」として表示しています。
          {onLiteral && mini("入れたとおりに探す", () => onLiteral(result.fix!))}
        </>
      ),
    });
  const off = !picked && !parcel && !approximate ? addressOffLot(data.parcels) : undefined;
  const chibanArea = !/号$/.test(result.matchedAddress);
  const asChiban = chibanArea ? chibanQueryOf(query, /丁目/.test(result.town)) : undefined;
  if (parcel && result.jukyoAlt) {
    const alt = displayAddress(result.jukyoAlt);
    notes.push({ body: <>入力の番地を登記の地番として探しました。住居表示の「{alt}」とは別の場所のことがあります。{mini(`住居表示「${alt}」で探す`, () => onPick(result.jukyoAlt!))}</> });
  } else if (parcelMiss) {
    notes.push({
      warn: true,
      body: (
        <>
          {parcelMiss.away ? "" : parcelMiss.reason === "not_found" ? `地番 ${parcelMiss.chiban} は見つかりません（${PARCEL_DATA.edition}の地図）。` : parcelMiss.reason === "no_map" ? "この地域は地番の地図データがありません。" : "地番の地図データを読み込めませんでした。"}
          {approximate && "町の中心を表示しています。"}
          {parcelMiss.away && (
            <span className="block">
              {awayNote(parcelMiss.chiban, parcelMiss.away)}
              {onPickPoint && mini(`その筆を見る（${parcelMiss.away.town}）`, () => onPickPoint(parcelMiss.away!.lat, parcelMiss.away!.lng))}
            </span>
          )}
          {!!parcelMiss.elsewhere?.length && (
            <span className="block">
              {elsewhereNote(parcelMiss.elsewhere)}
              {parcelMiss.elsewhere.slice(0, 3).map((e) => mini(`${e.label}の ${parcelMiss.chiban} を見る`, () => onPick(`地番 ${e.query}`)))}
            </span>
          )}
          {parcelMiss.similar.length > 0 && <span className="block">近い地番：{parcelMiss.similar.slice(0, 4).map((c) => mini(c, () => onPick(`地番 ${result.matchedAddress}${c}`)))}</span>}
        </>
      ),
    });
  } else if (result.miss) {
    const mm = result.miss;
    notes.push({ warn: true, body: <>入れた町名「{mm.typed}」は国土地理院の住所にありませんでした。{mm.kind === "city" ? `${mm.found}の中心` : `名前の近い別の町「${mm.found}」`}を出しています。{mini("場所を直す", onFix)}</> });
  } else if (approximate) {
    notes.push({ warn: true, body: <>番地が見つからず、町の中心を表示しています。地図で物件の場所を選ぶと、地番・建物が出ます。{mini("場所を直す", onFix)}</> });
  } else if (off && (off === "large" || chibanArea)) {
    notes.push({
      warn: true,
      body: (
        <>
          {off === "large" && data.parcels.status === "ok" ? `住所の地点の筆（地番 ${registryChiban(data.parcels.parcel.chibanRaw)}）は隣地が${registryNeighbors(data.parcels).length}筆あり、道路など物件の外の土地の可能性があります。` : `住所の地点が${off}の上です。`}
          {chibanArea ? "番地が地番の地域なら、地番で探すと土地（筆）が出ます。" : "地図のピンを建物の位置へ動かすと、物件の土地の地番が出ます。"}
          {asChiban && mini(`「${asChiban}」で探す`, () => onPick(asChiban))}
        </>
      ),
    });
  } else if (!picked && !parcel && partialMatch(query, result.matchedAddress)) {
    notes.push({ body: <>入力の最後の番号（号など）は国土地理院の住所のデータに無いため、「{displayAddress(result.matchedAddress)}」の代表の地点を出しています。{mini("場所を直す", onFix)}</> });
  } else if (picked && !parcel) {
    notes.push({ body: "地図で選んだ地点です（番地は分からないので町名まで）。" });
  }
  const sp = data.parcels.status === "ok" ? data.parcels.parcel : undefined;
  if (sp?.estimated) notes.push({ warn: true, body: `この筆の位置は、公図（任意座標）を道路の縁に合わせて推定したものです（確かさ：${sp.estimated === "high" ? "高め" : "低め"}）。数mずれることがあります。` });
  if (sp?.sanko) notes.push({ warn: true, body: "この筆の形は、市町村の地番参考図から作ったものです。登記所の地図とは違うことがあります。" });
  if (result.parcelOthers)
    notes.push({
      warn: true,
      body: (
        <>
          {sp ? altsNote(registryChiban(sp.chibanRaw), result.parcelOthers, !!result.parcelUnsure) : `同じ地番の筆がほかに${result.parcelOthers}件あります（小字違いなど）。`}
          {onPickPoint && result.parcelAlts?.slice(0, 4).map((a) => mini(`${a.label ? `${a.label}の筆を見る` : "もう一方を見る"}（${awayLabel(result, a)}）`, () => onPickPoint(a.lat, a.lng)))}
        </>
      ),
    });
  if (sp?.overlaps?.length) notes.push({ warn: true, body: "要確認：地図データで筆が重なる所です。「筆・隣地」で候補の地番と確かめ方を見てください。" });
  if (!notes.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {notes.map((n, i) => (
        <p key={i} className={`placenote${n.warn ? " warn" : ""}`}>
          {n.body}
        </p>
      ))}
    </div>
  );
}
