"use client";

// 物件の地点の小学校区・中学校区（国土数値情報の学校区。lib/roadmap/school.ts）。学校名・設置者・所在地と、学校までの距離
// （道路をたどった徒歩の目安。たどれなければ直線）。
// 令和5年度のデータで、学区は見直されることがあり、学校選択制の市区町村もあるので、指定校は教育委員会で確かめるよう添える
import { useEffect, useState } from "react";
import { withRetry } from "@/lib/retry";
import { schoolShort, schoolsAt, schoolWayText, withSchoolWalks, type SchoolHit, type Schools } from "@/lib/roadmap/school";
import { ROAD_CREDIT } from "@/lib/roadmap/walk";
import { SCHOOL_DATA } from "@/lib/roadmap/school-data";
import { pmtilesSchoolSource } from "@/lib/roadmap/school-tiles";
import { ChevronRightIcon, SchoolIcon } from "./icons";
import { Notes } from "./notes";
import { RetryRow } from "./panel-row";
import { Sheet } from "./sheet";

/**
 * none：学区が分からない。reason の no-data はデータの無い市区町村（国のデータに入っていないか、利用条件で入れていない）、
 * outside はデータはあるが、地点がどの区域にも入らない（区域の境目・川の上など）。error の retry：読み込み直す
 */
export type SchoolState =
  | { status: "loading" }
  | { status: "none"; reason?: "no-data" | "outside" }
  | { status: "error"; retry?: () => void }
  | { status: "ok"; schools: Schools };

export function useSchools(lat: number, lng: number): SchoolState {
  // 読み込み直すたびに増やす（同じ地点でも読み直す）
  const [attempt, setAttempt] = useState(0);
  const key = `${lat},${lng}#${attempt}`;
  const [state, setState] = useState<{ key: string; value: SchoolState }>();
  useEffect(() => {
    let alive = true;
    withRetry(() => schoolsAt(lat, lng, pmtilesSchoolSource))
      .then((s) => {
        if (!alive) return;
        if (!s || !(s.elementary || s.junior)) return setState({ key, value: { status: "none", reason: s ? "outside" : "no-data" } });
        setState({ key, value: { status: "ok", schools: s } });
        // 学校までの道のり（駅と同じ道路のタイル。読めたら直線の距離から差し替える）
        withSchoolWalks(lat, lng, s)
          .then((w) => alive && w !== s && setState({ key, value: { status: "ok", schools: w } }))
          .catch(() => {});
      })
      .catch(() => alive && setState({ key, value: { status: "error", retry: () => setAttempt((n) => n + 1) } }));
    return () => {
      alive = false;
    };
    // key に地点が入っている
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.value : { status: "loading" };
}

function Row({ label, s }: { label: string; s?: SchoolHit }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-[5em] shrink-0 text-[12.5px] leading-[1.7] text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14.5px] leading-[1.55] text-ink">
        {s ? (
          <>
            <b className="font-semibold">{s.name}</b>
            {schoolWayText(s) && <span className="ml-1.5 text-[12.5px] text-muted">{schoolWayText(s)}</span>}
            <span className="block text-[12px] leading-[1.55] text-muted">{[s.owner, s.address].filter(Boolean).join("・")}</span>
          </>
        ) : (
          <span className="text-[13px] text-muted">この地点を含む区域がデータにありません</span>
        )}
      </dd>
    </div>
  );
}

/** 小学校区・中学校区（スマホのシート・PC のカード） */
export function SchoolDetail({ schools }: { schools: Schools }) {
  const note = schools.elementary?.note ?? schools.junior?.note;
  return (
    <div>
      <dl className="divide-y divide-line/70">
        <Row label="小学校区" s={schools.elementary} />
        <Row label="中学校区" s={schools.junior} />
      </dl>
      {note && <p className="mt-1 text-[12.5px] leading-[1.6] text-[#8a4f3a]">{note}</p>}
      <Notes
        lead="学区は見直されることがあります。指定校は教育委員会で確かめてください。"
        source={
          <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noreferrer" className="underline">
            国土数値情報（国土交通省）
          </a>
        }
      >
        <p>
          {SCHOOL_DATA.edition}の市区町村の資料をもとにした通学区域です。学区は見直されることがあり、学校選択制の市区町村もあります。指定校は市区町村の教育委員会で確かめてください。徒歩は国土地理院の地図の道路をたどった、学校の位置（敷地の中の点）までの目安です（道路距離 80m を1分）。道をたどれないときは直線距離です。
        </p>
        <p>
          出典：「国土数値情報（小学校区データ・中学校区データ・学校データ）」（国土交通省）を加工して作成{(schools.elementary?.walk || schools.junior?.walk) && `。${ROAD_CREDIT}`}
        </p>
      </Notes>
    </div>
  );
}

/**
 * スマホ：都市計画の行の右の小さなボタン（「学区」）。押すと小学校区・中学校区が下から出る。
 * PC は onOpen（パネルの中の学区のカードまで動かす）を渡し、学校の名前も出す。データの無い所では出さない。
 * スマホの結果パネル（panel）は行を消さない：読めなければ「再読み込み」、データが無ければ理由と確認先（教育委員会）を出す
 */
export function SchoolButton({ state, onOpen, panel }: { state: SchoolState; onOpen?: () => void; /** スマホの結果パネルの1行：学校の短い名前も出す（押すと同じパネルの中で詳細） */ panel?: boolean }) {
  const [open, setOpen] = useState(false);
  const rich = !!onOpen || !!panel;
  if (panel && state.status === "error" && state.retry) return <RetryRow label="学区" icon={<SchoolIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />} onRetry={state.retry} />;
  if (panel && state.status === "none") return <SchoolNoneRow reason={state.reason} />;
  if (state.status === "none" || state.status === "error") return null;
  const s = state.status === "ok" ? state.schools : undefined;
  return (
    <>
      <button
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        disabled={state.status !== "ok"}
        className={`flex items-center gap-1 rounded-lg border border-line bg-[#fcfaf6] px-2 py-1 text-left text-[12px] leading-[1.5] lg:py-1.5 lg:text-[13px] text-ink disabled:text-muted lg:hover:border-brand-light/60 ${rich ? "min-w-0 flex-1" : "shrink-0"}`}
      >
        <SchoolIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        {rich ? (
          <>
            <span className="shrink-0 text-muted">学区</span>
            <span className="truncate">
              {s ? [s.elementary && schoolShort(s.elementary.name), s.junior && schoolShort(s.junior.name)].filter(Boolean).join("・") : "確認中…"}
            </span>
          </>
        ) : (
          "学区"
        )}
        {state.status === "ok" && <ChevronRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />}
      </button>
      {s && !onOpen && (
        <Sheet detail title="学区（参考）" open={open} onClose={() => setOpen(false)}>
          <SchoolDetail schools={s} />
        </Sheet>
      )}
    </>
  );
}

/** スマホの結果パネル：学区のデータが無い地点の行。押すと理由と確認先（同じパネルの中の詳細） */
function SchoolNoneRow({ reason }: { reason?: "no-data" | "outside" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mui-row-btn">
        <SchoolIcon className="h-3.5 w-3.5 shrink-0 text-brand-light" />
        <span className="mui-row-label">学区</span>
        <span className="min-w-0 flex-1 truncate text-[var(--mui-muted)]">{reason === "outside" ? "区域外（教育委員会で確認）" : "データなし（教育委員会で確認）"}</span>
        <ChevronRightIcon className="ml-auto h-4 w-4 shrink-0 text-[var(--mui-muted)]" />
      </button>
      <Sheet detail title="学区（参考）" open={open} onClose={() => setOpen(false)}>
        {reason === "outside" ? (
          <p className="text-[14px] leading-[1.6] text-ink">この地点は、国のデータ（国土数値情報の学校区）の小学校区・中学校区のどれにも入っていません（区域の境目・川や道路の上などで起きます）。</p>
        ) : (
          <p className="text-[14px] leading-[1.6] text-ink">この市区町村の学区は、国のデータ（国土数値情報の学校区）にありません。</p>
        )}
        <p className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">
          {reason === "outside" ? "" : "データの無い市区町村か、利用条件のためにデータに入れていない市区町村です（「学区が無い」という意味ではありません）。"}
          指定校は、市区町村の教育委員会で確かめてください。
        </p>
        <Notes
          lead="学区は見直されることがあり、学校選択制の市区町村もあります。"
          source={
            <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noreferrer" className="underline">
              国土数値情報（国土交通省）
            </a>
          }
        >
          <p>{SCHOOL_DATA.edition}の市区町村の資料をもとにした通学区域のデータで探しています。</p>
        </Notes>
      </Sheet>
    </>
  );
}

/** PC：地図の左のパネルのカード（データの無い所では出さない） */
export function SchoolCard({ state }: { state: SchoolState }) {
  if (state.status === "none") return null;
  return (
    <section className="shadow-soft rounded-2xl border border-white bg-white p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-[14.5px] font-semibold text-ink">
        <SchoolIcon className="h-4 w-4 text-brand-light" />
        学区（参考）
      </h3>
      {state.status === "loading" && <p className="text-[12px] text-muted">学区を確認しています…</p>}
      {state.status === "error" && <p className="text-[12px] text-muted">学区のデータを読み込めませんでした。時間をおいて調べ直してください。</p>}
      {state.status === "ok" && <SchoolDetail schools={state.schools} />}
    </section>
  );
}
