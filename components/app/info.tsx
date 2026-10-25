"use client";

// スマホの「その他」から開く案内のシート：使い方・対応している市区町村・データの出典と時点・データの保存について。
// PC は components/info-sheets.tsx の金色のまま（ここはスマホの紺の見た目）。シートの動きは components/sheet.tsx
import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { bundleFileName, bundleSummary, importBundle, makeBundle, type BundleSummary } from "@/lib/backup";
import { MUNICIPALITIES, type Municipality } from "@/lib/roadmap";
import { BUILDING_DATA } from "@/lib/roadmap/building-data";
import { DEALS_DATA, DEALS_NOTE } from "@/lib/roadmap/deals";
import { HOSPITAL_SOURCE } from "@/lib/roadmap/facilities";
import { LAND_PRICE_DATA } from "@/lib/roadmap/land-price-data";
import { PARCEL_DATA } from "@/lib/roadmap/parcel-data";
import { POI_DATA } from "@/lib/roadmap/poi";
import { SCHOOL_DATA } from "@/lib/roadmap/school-data";
import { STATION_DATA } from "@/lib/roadmap/walk";
import { ZONING_DATA } from "@/lib/roadmap/zoning-data";
import { CoverageBadge } from "../coverage";
import { Sheet } from "../sheet";
import { HEAD, LIGHT, TEXT } from "./r-ui";
import { NAVY } from "./ui";

/** 番号つきの手順（紺の丸） */
function Steps({ steps }: { steps: [string, string][] }) {
  return (
    <ol className="space-y-[12px]">
      {steps.map(([title, body], i) => (
        <li key={title} className="flex gap-[12px]">
          <span className="flex size-[28px] shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ fontSize: 14, background: NAVY }}>
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold leading-[1.35]" style={{ fontSize: 15, color: TEXT }}>
              {title}
            </span>
            {body && (
              <span className="mt-[2px] block leading-[1.6]" style={{ fontSize: 13, color: LIGHT }}>
                {body}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** 紺の薄い地の注意書き */
function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-[16px] rounded-[16px] px-[14px] py-[12px]" style={{ background: "#e8eef7" }}>
      <p className="font-bold leading-[1.3]" style={{ fontSize: 14, color: HEAD }}>
        {title}
      </p>
      <p className="mt-[4px] leading-[1.65]" style={{ fontSize: 13, color: "#3a4a66" }}>
        {children}
      </p>
    </div>
  );
}

export function AppHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps: [string, string][] = [
    ["住所・地番・地図で調べる", "ホームの欄に住所か地番を入れて「調査を開始する」。住所の無い土地は「地図」で場所を選びます。"],
    ["場所を確かめる", "上の見出しの住所と地図の印が物件と合っているか見ます。ずれていたら「場所を直す」。"],
    ["6つのタブを見る", "基本情報・周辺環境・相場・法令・規制・ハザード・取引事例。取れた情報と、まだ確かめていない所が分かります。"],
    ["公式の資料で確かめて記録する", "市の公式道路図や窓口で確かめたら「確認を記録」。記録はこの端末の中だけに残ります。"],
    ["書類にする", "下の「書類・出力」から、要注意点と次にやること・調査メモ・重説の下書き・案内図・結果の文面を作れます。"],
  ];
  return (
    <Sheet title="使い方" open={open} onClose={onClose}>
      <Steps steps={steps} />
      <Callout title="MICHILUは判定をしません">国・自治体の公開データと公式地図への入口をまとめたツールです。データは参考情報で、重要事項説明などの最終確認は、必ず役所の窓口・公的な資料で行ってください。</Callout>
    </Sheet>
  );
}

const ORDER: Municipality["coverage"][] = ["full", "partial", "none", "outside"];
/** 1都6県の並び（東京・神奈川・埼玉・千葉・茨城・栃木・群馬） */
const PREF_ORDER: string[] = ["東京都", "神奈川県", "埼玉県", "千葉県", "茨城県", "栃木県", "群馬県"];
const prefRank = (p: string) => (PREF_ORDER.includes(p) ? PREF_ORDER.indexOf(p) : 99);

export function AppCitiesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = [...new Set(MUNICIPALITIES.map((m) => m.pref))].sort((a, b) => prefRank(a) - prefRank(b));
  // スクロールさせないよう、都県ごとのタブで1つずつ見せる
  const [pref, setPref] = useState(prefs[0]);
  return (
    <Sheet title={`対応している市区町村（全${MUNICIPALITIES.length}）`} open={open} onClose={onClose}>
      <div className="-mx-1 mb-3 flex flex-wrap gap-1.5">
        {prefs.map((p) => (
          <button
            key={p}
            onClick={() => setPref(p)}
            aria-pressed={p === pref}
            // 押した県も同じ太さの枠を持たせ、押す県を変えてもボタンの大きさ（行の高さ）が変わらないようにする
            className="press rounded-full border px-3 py-1 font-semibold leading-[1.5] transition-colors"
            style={{ fontSize: 12.5, background: p === pref ? NAVY : "#fff", borderColor: p === pref ? NAVY : "#dde5ee", color: p === pref ? "#fff" : TEXT }}
          >
            {p.replace(/[都県]$/, "")}
          </button>
        ))}
      </div>
      {/* 都県を切り替えてもシートの高さが変わらないよう、全県の一覧を同じ枠に重ねて置き、いちばん高い県の高さにそろえる */}
      <div className="grid">
        {prefs.map((p) => (
          <div key={p} className={`col-start-1 row-start-1 space-y-2.5 ${p === pref ? "" : "invisible"}`} aria-hidden={p !== pref}>
            {ORDER.map((cov) => {
              const list = MUNICIPALITIES.filter((m) => m.pref === p && m.coverage === cov);
              if (list.length === 0) return null;
              return (
                <div key={cov}>
                  <div className="mb-0.5 flex items-center gap-2">
                    <CoverageBadge coverage={cov} />
                    <span className="text-[11px] text-muted">{list.length}</span>
                  </div>
                  <p className="text-[11.5px] leading-[1.65] text-ink">{list.map((m) => m.name).join("、")}</p>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted">一覧にない市区町村は「未対応」と表示されます。</p>
    </Sheet>
  );
}

/** データの出典と時点 */
export function AppSourcesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: [string, string][] = [
    ["住所検索・市区町村の判定", "国土地理院の住所検索 API（入れた住所と座標は、この API にだけ送られます。MICHILU のサーバーには送りません）"],
    ["道路種別の地図・問い合わせ先", "関東1都6県の市区町村の公開ページ（毎週リンクを自動で確認）"],
    ["用途地域など（都市計画）", `都市計画決定GISデータ（国土交通省）${ZONING_DATA.edition}`],
    ["地番・筆の形", `登記所備付地図データ（法務省）${PARCEL_DATA.edition}・市町村の地番参考図`],
    ["建物", `3D都市モデル PLATEAU（国土交通省）${BUILDING_DATA.edition ?? ""}`],
    ["地価", `地価公示・都道府県地価調査（国土数値情報）${LAND_PRICE_DATA.edition}`],
    ...(DEALS_DATA.url ? ([["取引事例", `不動産情報ライブラリ（国土交通省）の取引価格・成約価格 ${DEALS_DATA.periods}。${DEALS_NOTE}`]] as [string, string][]) : []),
    ["学区", `小学校区・中学校区（国土数値情報）${SCHOOL_DATA.edition}`],
    ["駅", `鉄道データ（国土数値情報）${STATION_DATA.year}年`],
    ["周辺施設", `© OpenStreetMap contributors（ODbL）${POI_DATA.date}時点${HOSPITAL_SOURCE ? `。病院は${HOSPITAL_SOURCE}` : ""}`],
    ["ハザード", "重ねるハザードマップ（国土交通省・国土地理院）を開くたびに読む"],
    ["避難場所", "指定緊急避難場所データ（国土地理院）を開くたびに読む"],
    ["地図・航空写真・道のり", "地理院タイル・地理院地図Vector（国土地理院）"],
    ["天気（ホームの空）", "気象庁のアメダス（東京・大手町）の10分ごとの観測と天気予報（東京地方）を、開いている間 10 分ごとに直接読む。雲・雨・雪・霧の見た目に使うだけで、天気の案内ではない。住所や端末の情報は送らない"],
  ];
  return (
    <Sheet title="データの出典と時点" open={open} onClose={onClose}>
      <dl className="divide-y divide-line/70">
        {rows.map(([k, v]) => (
          <div key={k} className="py-2">
            <dt className="text-[12px] text-muted">{k}</dt>
            <dd className="text-[13.5px] leading-[1.55] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11.5px] leading-[1.6] text-muted">国・自治体の公開データを加工して表示しています。データは参考情報で、最新の状況や法的な判断は、役所の窓口・公的な資料で確認してください。</p>
    </Sheet>
  );
}

/** データの保存について（Safari とホーム画面のアプリで条件が違う） */
export function StorageSheet({ open, onClose, standalone, onImported }: { open: boolean; onClose: () => void; standalone: boolean; /** 読み込んだあと（履歴・お気に入りを読み直す） */ onImported?: () => void }) {
  const [msg, setMsg] = useState<{ text: string; warn?: boolean } | null>(null);
  // 読み込む前の確認（書き出した日時・件数・最初の3件）
  const [pending, setPending] = useState<{ text: string; summary: Extract<BundleSummary, { ok: true }> } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const rows: [string, string][] = [
    ["どこに残るか", "履歴・お気に入り・確認の記録・済んだ印は、すべてこの端末のブラウザの中にあります。MICHILU のサーバーには送りません。"],
    ["Safari とホーム画面のアプリ", "保存場所が別です。片方で調べた物件は、もう片方には出ません。"],
    ["Safari で使っているとき", "Safari を使った日が7日分たまる間に MICHILU を一度も開かないと、Safari が保存データを消すことがあります。カレンダーの7日ではなく、Safari を使わない日は数えません。MICHILU を開けば数え直しです。"],
    ["ホーム画面のアプリで使っているとき", "アプリを開くたびに数え直されるため、この条件では消えない想定です。ただしアプリを削除すると消えます。"],
    ["ほかに消える場合", "設定で Web サイトデータを削除したとき、端末の容量が足りないとき、プライベートブラウズ（保存されません）。"],
    ["機種変更・別の端末", "引き継がれません。「書き出す」でファイルにして、新しい端末で「読み込む」。読み込みは足すだけで、いまの記録は消しません。"],
  ];
  /** 1つのファイル（JSON）にまとめ、共有シート（iPhone）かダウンロードで保存する。端末の中で作る */
  const exportNow = async () => {
    const text = JSON.stringify(makeBundle(), null, 1);
    const name = bundleFileName();
    const f = new File([text], name, { type: "application/json" });
    try {
      if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: "MICHILU の調査記録" });
        setMsg({ text: `書き出しました（${name}）。共有先に保存されています。` });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setMsg({ text: `${name} をダウンロードしました。` });
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const summary = bundleSummary(text);
    if (!summary.ok) {
      setPending(null);
      setMsg({ text: summary.reason, warn: true });
    } else {
      setMsg(null);
      setPending({ text, summary });
    }
  };
  const apply = () => {
    if (!pending) return;
    const r = importBundle(pending.text);
    const a = r.added;
    setMsg(r.ok ? { text: `読み込みました。履歴 ${a.history}件・お気に入り ${a.favorites}件・確認の記録 ${a.records}件・済んだ印 ${a.checklist}件を足しました（元の記録はそのまま）。` } : { text: "読み込めませんでした。", warn: true });
    setPending(null);
    onImported?.();
  };
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "不明" : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  return (
    <Sheet title="調査記録の書き出し・読み込み" open={open} onClose={onClose}>
      <p className="text-[13px] leading-[1.6] text-ink">履歴・お気に入り・確認の記録・済んだ印を1つのファイルにまとめます。機種変更や、Safari のデータ削除への備えに。</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => void exportNow()} className="press flex h-[46px] flex-1 items-center justify-center gap-1.5 rounded-[14px] font-semibold leading-none text-white" style={{ fontSize: 15, background: NAVY }}>
          <Download size={17} strokeWidth={2} absoluteStrokeWidth />
          書き出す
        </button>
        <button onClick={() => file.current?.click()} className="press flex h-[46px] flex-1 items-center justify-center gap-1.5 rounded-[14px] border bg-white font-semibold leading-none" style={{ fontSize: 15, color: NAVY, borderColor: "#c9d5e6" }}>
          <Upload size={17} strokeWidth={2} absoluteStrokeWidth />
          読み込む
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="書き出したファイルを選ぶ"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {pending && (
        <div className="mt-3 rounded-2xl border border-line bg-white px-4 py-3">
          <p className="text-[14px] font-bold text-ink">このファイルを読み込みますか？</p>
          <p className="mt-1 text-[13px] leading-[1.7] text-ink">
            書き出した日時：{fmt(pending.summary.exportedAt)}
            <br />
            履歴 {pending.summary.history}件・お気に入り {pending.summary.favorites}件・確認の記録 {pending.summary.records}件
            {pending.summary.first.length > 0 && (
              <>
                <br />
                例：{pending.summary.first.join("、")}
              </>
            )}
          </p>
          <p className="mt-1 text-[12px] leading-[1.6] text-muted">足すだけで、いまの記録は消しません。同じ物件・同じ確認事項は新しい方を残します。</p>
          <div className="mt-2 flex gap-2">
            <button onClick={apply} className="press h-[40px] flex-1 rounded-full font-semibold leading-none text-white" style={{ fontSize: 14, background: NAVY }}>
              読み込む
            </button>
            <button onClick={() => setPending(null)} className="press h-[40px] flex-1 rounded-full border bg-white font-semibold leading-none" style={{ fontSize: 14, color: NAVY, borderColor: "#c9d5e6" }}>
              やめる
            </button>
          </div>
        </div>
      )}
      {msg && <p className={`mt-3 text-[13px] leading-[1.6] ${msg.warn ? "text-[#c2561f]" : "text-ink"}`}>{msg.text}</p>}
      <dl className="mt-3 divide-y divide-line/70">
        {rows.map(([k, v]) => (
          <div key={k} className="py-2">
            <dt className="text-[12px] text-muted">{k}</dt>
            <dd className="text-[13.5px] leading-[1.6] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <Callout title={standalone ? "ホーム画面のアプリで開いています" : "ホーム画面に追加すると消えにくくなります"}>
        {standalone ? "この開き方なら、Safari の7日の条件は当てはまりません。念のため、ときどき書き出しておくと安心です。" : "「その他」の「ホーム画面に追加」から追加できます。追加したアプリは Safari とは別の保存場所になるので、履歴は引き継がれません（書き出して読み込めば移せます）。"}
      </Callout>
    </Sheet>
  );
}
