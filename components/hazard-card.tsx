"use client";

// 物件の地点の災害リスク（洪水・内水・高潮・津波・土砂災害）と地面の高さ。国の重ねるハザードマップのタイルの色から読む
// （lib/roadmap/hazard.ts）。市区町村のハザードマップではなく重要事項説明には使えないので、参考として出し、
// 市区町村のハザードマップ（わがまちハザードマップの登録先）へ案内する
import { useEffect, useState } from "react";
import type { Municipality } from "@/lib/roadmap";
import {
  elevationAt,
  GROUND_NOTE,
  groundMaps,
  groupHazardMaps,
  HAZARD_KINDS,
  HAZARD_MAP_LABELS,
  hazardAt,
  hazardChips,
  hazardMapsFor,
  hazardRows,
  HAZARD_TABLE_NOTE,
  wagamachiUrl,
  type Elevation,
  type GroundMap,
  type HazardKind,
  type HazardMapIndex,
  type HazardMaps,
  type HazardReport,
} from "@/lib/roadmap/hazard";
import { browserTileFetcher } from "@/lib/roadmap/hazard-tiles";
import { AlertIcon, ChevronRightIcon, ExternalIcon, HazardIcon, InfoIcon, MapIcon } from "./icons";
import { Sheet } from "./sheet";

export type HazardState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ok";
      report: HazardReport;
      elevation: Elevation | null;
      /** 市区町村のハザードマップのページ */
      maps: HazardMaps;
      /** わがまちハザードマップ（国の一覧）を開く市区町村コード */
      muniCd: string;
      /** 重ねるハザードマップで物件の場所に開く、大規模盛土造成地・液状化の発生傾向の地図 */
      ground: GroundMap[];
    };

const failed = (r: HazardReport) => HAZARD_KINDS.filter((k) => r[k]?.status === "error");

/** 読めなかった種類だけ、少し待ってもう一度読む（洪水を読み直すときは、洪水の区域で読む種類も） */
async function readHazard(lat: number, lng: number): Promise<HazardReport> {
  const report = await hazardAt(lat, lng, browserTileFetcher);
  const again = failed(report);
  if (!again.length) return report;
  await new Promise((r) => setTimeout(r, 1200));
  const kinds = again.includes("flood") ? [...new Set<HazardKind>([...again, "kaoku", "keizoku"])] : again;
  return { ...report, ...(await hazardAt(lat, lng, browserTileFetcher, kinds)) };
}

/** 地点の災害リスクと地面の高さ、市区町村のハザードマップのページを読む */
export function useHazard(lat: number, lng: number, municipality: Municipality): HazardState {
  const codes = municipality.codes.join(",");
  const key = `${lat},${lng},${codes}`;
  const [state, setState] = useState<{ key: string; value: HazardState }>();
  useEffect(() => {
    let alive = true;
    const list = codes.split(",");
    Promise.all([
      readHazard(lat, lng),
      elevationAt(lat, lng, browserTileFetcher).catch(() => null),
      import("@/lib/roadmap/data/hazard-maps.json").then((m) => m.default as HazardMapIndex).catch(() => undefined),
    ])
      .then(([report, elevation, index]) => {
        if (!alive) return;
        const read = HAZARD_KINDS.filter((k) => report[k]);
        // どの種類も読めなかったときは「読み込めませんでした」
        if (read.length > 0 && read.every((k) => report[k]?.status === "error")) return setState({ key, value: { status: "error" } });
        setState({ key, value: { status: "ok", report, elevation, maps: index ? hazardMapsFor(list, index) : {}, muniCd: list[0], ground: groundMaps(lat, lng) } });
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
 * 区域にかかるものを1行に並べる（「洪水3〜5m」「土砂 警戒」）。スマホは押すと詳しい一覧を下から出す。
 * PC は onOpen（パネルの中の災害リスクのカードまで動かす）を渡す。onShowMap があれば、一覧から地図に重ねて見られる
 */
export function HazardLine({
  state,
  city,
  onOpen,
  onShowMap,
  compact,
}: {
  state: HazardState;
  city: string;
  onOpen?: () => void;
  onShowMap?: (kind: HazardKind) => void;
  /** 狭い所（背の低いスマホで、市の行の右）：見出しは出さず（読み上げだけ）、印に幅を回す */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const chips = state.status === "ok" ? hazardChips(state.report) : [];
  return (
    <>
      <button
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        disabled={state.status !== "ok"}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-left text-[11px] leading-[1.5] text-ink lg:hover:border-brand-light/60"
      >
        <HazardIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        <span className={compact ? "sr-only" : "shrink-0 text-muted"}>災害リスク</span>
        {state.status === "loading" && <span className="truncate text-muted">確認中…</span>}
        {state.status === "error" && <span className="truncate text-muted">データを読み込めませんでした</span>}
        {state.status === "ok" && (
          // 1行に収まる分だけ出す（入らない印は折り返して隠れる。全部は押して開く一覧で見る）
          <span className="flex h-[18px] min-w-0 flex-1 flex-wrap items-center gap-x-1 overflow-hidden">
            {chips.map((c) => (
              <span
                key={c.text}
                className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1 ${c.warn ? "bg-[#f8ece6] text-[#8a4f3a]" : "bg-[#f3f1ed] text-ink"}`}
              >
                {c.color && <span className="h-2 w-2 shrink-0 rounded-[2px] border border-black/10" style={{ background: c.color }} />}
                {compact ? (c.short ?? c.text) : c.text}
              </span>
            ))}
          </span>
        )}
        {state.status === "ok" && <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
      {state.status === "ok" && !onOpen && (
        <Sheet title="災害リスク（参考）" open={open} onClose={() => setOpen(false)}>
          <HazardDetail
            state={state}
            city={city}
            onShowMap={
              onShowMap &&
              ((k) => {
                setOpen(false);
                onShowMap(k);
              })
            }
          />
        </Sheet>
      )}
    </>
  );
}

/** PC：地図の左のパネルのカード */
export function HazardCard({ state, city, onShowMap }: { state: HazardState; city: string; onShowMap?: (kind: HazardKind) => void }) {
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <HazardIcon className="h-4 w-4 text-brand-light" />
        災害リスク（参考）
      </h3>
      {state.status === "loading" && <p className="text-[12px] text-muted">国のハザードマップのデータを確認しています…</p>}
      {state.status === "error" && <p className="text-[12px] text-muted">ハザードマップのデータを読み込めませんでした。時間をおいて調べ直してください。</p>}
      {state.status === "ok" && <HazardDetail state={state} city={city} onShowMap={onShowMap} />}
    </section>
  );
}

/** 「江戸川区の洪水・内水・高潮のハザードマップ」 */
const mapTitle = (city: string, kinds: (keyof typeof HAZARD_MAP_LABELS)[]) => `${city}の${kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}のハザードマップ`;

function HazardDetail({ state, city, onShowMap }: { state: Extract<HazardState, { status: "ok" }>; city: string; onShowMap?: (kind: HazardKind) => void }) {
  const rows = hazardRows(state.report, state.elevation);
  const groups = groupHazardMaps(state.maps);
  return (
    <div>
      <dl className="divide-y divide-line/70">
        {rows.map((r) => (
          // シートで画面に入りきらなければ、行の間 → 文字 → 行の高さの順に詰める（components/sheet.tsx の useDense）
          <div key={r.kind} className="flex items-start gap-3 py-1.5 dense:py-1 denser:py-[3px] densest:py-[2px]">
            <dt className="w-[6.5em] shrink-0 text-[11.5px] leading-[1.6] text-muted denser:text-[11px] densest:leading-[1.4]">{r.name}</dt>
            <dd className="min-w-0 flex-1">
              <span
                className={`flex items-start gap-1.5 text-[13px] font-semibold leading-[1.5] denser:text-[12.5px] densest:leading-[1.35] ${r.warn ? "text-[#8a4f3a]" : "text-ink"}`}
              >
                {r.color && <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10 densest:mt-[4px]" style={{ background: r.color }} />}
                {r.warn && !r.color && <AlertIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 densest:mt-[2px]" />}
                <span>{r.value}</span>
              </span>
              {r.sub && <span className="mt-0.5 block text-[10.5px] leading-[1.55] text-muted dense:mt-0 denser:text-[10px] densest:leading-[1.35]">{r.sub}</span>}
            </dd>
            {onShowMap && r.kind !== "elevation" && (
              <button
                onClick={() => onShowMap(r.kind as HazardKind)}
                aria-label={`${r.name}を地図に重ねる`}
                title="地図に重ねる"
                className="mt-0.5 flex shrink-0 items-center gap-0.5 rounded-full border border-line px-1.5 py-0.5 text-[10.5px] text-brand lg:hover:bg-mint densest:mt-0 densest:py-0"
              >
                <MapIcon className="h-3 w-3" />
                地図
              </button>
            )}
          </div>
        ))}
      </dl>

      {/* 重要事項説明（水害）は市区町村のハザードマップで。国の一覧の登録先へ */}
      <div className="mt-2.5 rounded-xl bg-[#f7f3ec] px-3 py-2 dense:mt-2 dense:py-1.5 densest:mt-1.5 densest:py-1">
        <p className="text-[11.5px] font-semibold text-ink">重要事項説明は{city}のハザードマップで</p>
        {/* 種類ごとのページは「洪水・内水」のように並べる（見出しに市の名前があるので、リンクは種類だけ） */}
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 dense:mt-0.5">
          {groups.map((g) => (
            <li key={g.url}>
              <a
                href={g.url}
                target="_blank"
                rel="noreferrer"
                aria-label={mapTitle(city, g.kinds)}
                className="flex items-center gap-1 text-[12px] leading-[1.5] text-brand underline-offset-2 hover:underline"
              >
                <ExternalIcon className="h-3 w-3 shrink-0" />
                {g.kinds.map((k) => HAZARD_MAP_LABELS[k]).join("・")}
              </a>
            </li>
          ))}
          <li>
            <a
              href={wagamachiUrl(state.muniCd)}
              target="_blank"
              rel="noreferrer"
              aria-label={`わがまちハザードマップ（国の一覧で${city}を開く）`}
              className="flex items-center gap-1 text-[12px] leading-[1.5] text-brand underline-offset-2 hover:underline"
            >
              <ExternalIcon className="h-3 w-3 shrink-0" />
              わがまちハザードマップ（国の一覧）
            </a>
          </li>
        </ul>
        {groups.length === 0 && <p className="mt-1 text-[10.5px] text-muted">国の一覧に{city}のページの登録がありません。{city}の防災の窓口で確認してください。</p>}
        {/* 地盤（大規模盛土造成地・液状化）は読み取らず、国の重ねるハザードマップを物件の場所で開く */}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line/70 pt-1.5 text-[12px] leading-[1.5] dense:mt-1 dense:pt-1">
          <span className="text-[11px] text-muted" title={GROUND_NOTE}>
            地盤（国の地図）
          </span>
          {state.ground.map((g) => (
            <a key={g.kind} href={g.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand underline-offset-2 hover:underline">
              <ExternalIcon className="h-3 w-3 shrink-0" />
              {g.label}
            </a>
          ))}
        </p>
      </div>

      <p className="mt-2 flex gap-1.5 text-[10.5px] leading-[1.6] text-muted dense:mt-1.5 dense:leading-[1.5] denser:text-[10px] densest:mt-1 densest:leading-[1.4]">
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          {HAZARD_TABLE_NOTE}。国の「重ねるハザードマップ」のデータを、物件の地点の色から読み取ったものです。市区町村が作るハザードマップではないため、重要事項説明には使えません。国のデータに無い川・区域や、市区町村独自の想定は含みません。土砂災害警戒区域等のデータは、重要事項説明や土砂災害防止法の手続きの根拠に使えません（都道府県の公表図で確認）。{GROUND_NOTE}。
          <span className="mt-1 block dense:mt-0.5">
            出典：
            <a href="https://disaportal.gsi.go.jp/" target="_blank" rel="noreferrer" className="underline">
              ハザードマップポータルサイト
            </a>
            （国土交通省・国土地理院）を加工して作成。洪水・浸水継続時間・家屋倒壊等：国土交通省 各地方整備局等・都道府県／内水：市町村／高潮・津波：都道府県／土砂災害：「国土数値情報（土砂災害警戒区域）」をもとに国土地理院が加工。標高：地理院タイル。
          </span>
        </span>
      </p>
    </div>
  );
}
