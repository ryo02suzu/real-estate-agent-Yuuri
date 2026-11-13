"use client";

// スマホの右上のメニュー（≡）。ホーム・お気に入り・履歴・書類・出力の右上から開く、画面いっぱいの暗いすりガラス（後ろのページの写真を
// 強くぼかして紺に沈める。app/globals.css の .menu-veil）。このアプリの仕事の流れ（探す → 確かめる → 調べる → 記録する → 書類にする）に
// 合わせて、上から：
//  1. 調べ始める3つの入口（住所・地番／地図で選ぶ／現在地）
//  2. まだ見ていないお知らせ（あるときだけ。≡ の赤い印の中身）
//  3. 調査の流れ（5つの段階。押すと使い方）
//  4. 書類の準備（書類の差出人・照会の文面。入っているか・未設定かを出す）
//  5. この端末の記録（履歴・お気に入り・確認の記録の数）と、書き出し・読み込み（最後に書き出した日。まだなら勧める）
//  6. データ（対応している市区町村・データの出典と時点・お知らせ）
//  7. アプリ（使い方・ホーム画面に追加・動きの演出・アカウント）
//  8. 安心の一言（住所はサーバーに送らない・判定はしない）と最終更新日
// 設定・案内のシート（差出人・ひな形・書き出し・出典など）はメニューの上に重ねて開き、閉じるとメニューに戻る（入れた値がすぐ見える）。
// ページを移る・地図を開く・調べ始めるものは、メニューを閉じてから動く（現在地は、位置が取れるまでメニューの上で待つ）。
// 左上のロゴと右上の × は、ページの帯のロゴと ≡ と同じ位置（≡ が × に変わったように見える）。寸法は幅393ptの値で、画面の幅に合わせて
// 拡大・縮小する（components/app/zoom.ts）。PC はこの画面を使わない（PC の設定・使い方は components/desk/overlays.tsx）
import { Bell, Building2, Check, ChevronRight, CircleHelp, ClipboardCheck, Crosshair, Database, Download, FilePenLine, FileText, LayoutGrid, LoaderCircle, LocateFixed, Map as MapIcon, MapPin, Monitor, Search, ShieldCheck, Smartphone, Sparkles, UserRound, X, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { EXPORTED_EVENT, lastExported } from "@/lib/backup";
import { useInquirySettings } from "@/lib/inquiry-store";
import { backupNote, recordedCount, senderNote, templateNote } from "@/lib/app/menu";
import { allRecords } from "@/lib/records";
import { MUNICIPALITIES } from "@/lib/roadmap";
import { AREA_LABEL } from "@/lib/roadmap/regions";
import { useSender } from "@/lib/sender";
import { ART_W, PhoneImg, ZOOM } from "./frame";
import { HIT } from "./home";
import { NEWS } from "./news";

/** メニューのページ（下のメニューのページと、その他） */
export type MenuPage = "history" | "favorites" | "docs" | "account";
/** メニューを開いている間の、時刻・電池の帯の色（すりガラスのいちばん上の紺。components/app/mobile-app.tsx） */
export const MENU_TOP = "#0b1428";

/** 閉じる動きの長さ（app/globals.css の .menu-veil[data-menu="closing"] と同じ） */
const OUT_MS = 180;
/** 字の色（白の3段） */
const INK = "rgba(255,255,255,0.95)";
const SUBTLE = "rgba(255,255,255,0.62)";
const FAINT = "rgba(255,255,255,0.45)";
/** 明るい青（押せる字・アイコン） */
const SKY_BLUE = "#8cc8ff";
/** 「未設定」「おすすめ」の札（琥珀色。字・地・枠） */
const AMBER = "#ffc069";
const AMBER_TINT = { bg: "rgba(255,192,105,0.16)", line: "rgba(255,192,105,0.45)" };
/** 板（すりガラスの上の、少し明るい面。中の板にはぼかしを重ねない：外のすりガラスの中では効かないため） */
const PANEL: CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.055) 100%)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
};

/** 調査の流れ（使い方の6つの手順を、5つの段階に縮めたもの。components/app/info.tsx の AppHelpSheet） */
const FLOW: { Icon: LucideIcon; label: string; sub: string }[] = [
  { Icon: Search, label: "探す", sub: "住所・地番" },
  { Icon: Crosshair, label: "確かめる", sub: "場所・模型" },
  { Icon: LayoutGrid, label: "調べる", sub: "6つのタブ" },
  { Icon: ClipboardCheck, label: "記録する", sub: "公式で確認" },
  { Icon: FileText, label: "書類にする", sub: "照会文など" },
];

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** 上から順に浮き上がる遅れ（.menu-rise） */
const rise = (ms: number): CSSProperties => ({ "--d": `${ms}ms` }) as CSSProperties;

/** 最後に書き出した日時（書き出すと読み直す） */
function useLastExported(): number | null {
  return useSyncExternalStore(
    (cb) => {
      addEventListener(EXPORTED_EVENT, cb);
      addEventListener("storage", cb);
      return () => {
        removeEventListener(EXPORTED_EVENT, cb);
        removeEventListener("storage", cb);
      };
    },
    lastExported,
    () => null,
  );
}

export function AppMenu({
  open,
  onClose,
  covered,
  onSearch,
  onMap,
  onHere,
  locating,
  onNews,
  unread,
  onHelp,
  onCities,
  onSources,
  onStorage,
  onSender,
  onTemplates,
  onInstall,
  standalone,
  onPage,
  historyCount,
  favoriteCount,
  motion,
  onMotion,
}: {
  open: boolean;
  onClose: () => void;
  /** 上に設定・案内のシートが重なっている（Esc はシートだけを閉じる） */
  covered: boolean;
  /** 住所・地番で調べる（ホームの検索欄へ） */
  onSearch: () => void;
  /** 地図で場所を選ぶ（住所の無い土地も選べる） */
  onMap: () => void;
  /** 現在地で調べる（位置が取れるまで locating） */
  onHere: () => void;
  locating: boolean;
  onNews: () => void;
  unread: boolean;
  onHelp: () => void;
  /** 対応している市区町村 */
  onCities: () => void;
  /** データの出典と時点 */
  onSources: () => void;
  /** 調査記録の書き出し・読み込み */
  onStorage: () => void;
  /** 書類の差出人（会社名・担当者。照会文・調査メモ・案内図に入れる） */
  onSender: () => void;
  /** 照会の文面（ひな形）：照会文の件名・本文のひな形と、FAX をメールで送るサービスの宛先の形（components/app/template-editor.tsx） */
  onTemplates: () => void;
  /** ホーム画面に追加 */
  onInstall: () => void;
  standalone: boolean;
  /** ページへ移る（履歴・お気に入り・書類・出力・その他） */
  onPage: (p: MenuPage) => void;
  /** 履歴の物件の数（同じ物件はまとめて1件） */
  historyCount: number;
  favoriteCount: number;
  /** 動きの演出（検索したときの地球からのズーム・写真の動き）がオンか */
  motion: boolean;
  onMotion: (on: boolean) => void;
}) {
  // 閉じるときは、消える動きが終わるまで残す（動きを減らす設定ではすぐ消す）
  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setClosing(false);
    else if (!reducedMotion()) setClosing(true);
  }
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => setClosing(false), OUT_MS);
    return () => clearTimeout(t);
  }, [closing]);
  const shown = open || closing;
  // 中身をスクロールしたか（上の帯に地を敷く）。開き直したら一番上から
  const [scrolled, setScrolled] = useState(false);
  if (!shown && scrolled) setScrolled(false);

  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const coveredRef = useRef(covered);
  useEffect(() => {
    coveredRef.current = covered;
  }, [covered]);
  // 開いたら × に、閉じたら開く前の所（≡）に戻す。戻すのは描き終えたあと（描く間に動かすと、React が描く前の所（×）へ戻すため）。
  // 閉じてすぐ別の所（検索欄）へ移したときは、そのままにする（メニューの中か、どこにも無いときだけ戻す）
  useLayoutEffect(() => {
    if (!open) return;
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = root.current;
    closeBtn.current?.focus({ preventScroll: true });
    return () =>
      queueMicrotask(() => {
        const now = document.activeElement;
        if (!now || now === document.body || box?.contains(now)) back?.focus({ preventScroll: true });
      });
  }, [open]);
  // 開いている間は、後ろのページの動きを止めて光の重ねを隠す（app/globals.css の html[data-menu="open"]）
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    html.dataset.menu = "open";
    return () => {
      delete html.dataset.menu;
    };
  }, [open]);
  // Esc で閉じる（上にシートが重なっているときは、シートだけが閉じる）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !coveredRef.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sender = useSender();
  const templates = useInquirySettings();
  const exported = useLastExported();
  if (!shown) return null;

  const sn = senderNote(sender);

  // Tab で外へ出ない（最後から最初へ・最初から最後へ回る）
  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href]")];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // 上から順に浮き上がる遅れ（新着のお知らせがあるときは、その分だけ下の章が遅れる）
  const at = (i: number) => rise((i + (unread ? 1 : 0)) * 45);
  return (
    <div ref={root} className="menu-veil fixed inset-0 z-[45] text-white" role="dialog" aria-modal="true" aria-labelledby="app-menu-title" data-menu={open ? "open" : "closing"} onKeyDown={trap}>
      <div className="app-touch absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-y-contain" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
        <div className="relative mx-auto" style={{ width: ART_W, zoom: ZOOM, padding: "78px 16px 30px" }}>
          <h2 id="app-menu-title" className="sr-only">
            メニュー
          </h2>

          {/* 1. 調べ始める3つの入口 */}
          <section aria-label="調べる" className="menu-rise grid grid-cols-3 gap-[8px]" style={rise(0)}>
            <Tile Icon={Search} title="住所・地番" sub="入れて調べる" label="住所・地番で調べる（ホームの検索欄へ）" onClick={onSearch} />
            <Tile Icon={MapIcon} title="地図で選ぶ" sub="住所の無い土地も" label="地図で選ぶ（住所の無い土地も、地図で場所を選んで調べられます）" onClick={onMap} />
            <Tile Icon={LocateFixed} title="現在地" sub={locating ? "位置を確かめています" : "今いる場所から"} label="現在地で調べる（今いる場所のまわりの地図を開きます）" onClick={onHere} busy={locating} />
          </section>

          {/* 2. まだ見ていないお知らせ（≡ の赤い印の中身） */}
          {unread && (
            <button onClick={onNews} className="menu-rise press-soft mt-[10px] flex w-full items-center gap-[12px] rounded-[18px] px-[14px] py-[12px] text-left" style={{ ...rise(45), background: "linear-gradient(135deg, rgba(240,38,58,0.2) 0%, rgba(255,255,255,0.06) 70%)", border: "1px solid rgba(255,120,130,0.32)" }}>
              <span className="relative flex size-[36px] shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.12)" }}>
                <Bell size={18} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
                <span className="absolute -right-[2px] -top-[2px] size-[11px] rounded-full border-2 bg-[#f0263a]" style={{ borderColor: "#2a1c2c" }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-[6px] leading-none">
                  <span className="rounded-full bg-[#f0263a] px-[7px] py-[3px] font-bold text-white" style={{ fontSize: 11 }}>
                    新着
                  </span>
                  <span style={{ fontSize: 12, color: SUBTLE }}>{NEWS[0].date}</span>
                </span>
                <span className="mt-[6px] line-clamp-2 font-semibold leading-[1.4]" style={{ fontSize: 14, color: INK }}>
                  {NEWS[0].title}
                </span>
              </span>
              <ChevronRight size={17} strokeWidth={2} absoluteStrokeWidth color={FAINT} className="shrink-0" />
            </button>
          )}

          {/* 3. 調査の流れ（押すと使い方） */}
          <section className="menu-rise" style={at(1)}>
            <Head title="調査の流れ" more="使い方" onMore={onHelp} />
            <button onClick={onHelp} aria-label="調査の流れ：探す、確かめる、調べる、記録する、書類にする（使い方を開く）" className="press-soft block w-full rounded-[18px] px-[6px] pb-[12px] pt-[14px]" style={PANEL}>
              <span className="relative grid grid-cols-5">
                <span aria-hidden className="absolute h-px" style={{ left: "10%", right: "10%", top: 18, background: "linear-gradient(90deg, rgba(140,200,255,0.15), rgba(140,200,255,0.45), rgba(140,200,255,0.15))" }} />
                {FLOW.map((s, i) => (
                  <span key={s.label} className="relative flex flex-col items-center">
                    <span className="relative flex size-[36px] items-center justify-center rounded-full" style={{ background: "linear-gradient(160deg, #1d3c6e 0%, #102449 100%)", border: "1px solid rgba(140,200,255,0.4)", boxShadow: "0 4px 12px rgba(0,0,0,0.25)" }}>
                      <s.Icon size={17} strokeWidth={1.8} absoluteStrokeWidth color="#cfe3ff" />
                      <span className="absolute -right-[5px] -top-[4px] flex size-[16px] items-center justify-center rounded-full font-bold leading-none" style={{ fontSize: 10, background: SKY_BLUE, color: "#0b1a33" }}>
                        {i + 1}
                      </span>
                    </span>
                    <span className="mt-[7px] font-semibold leading-none" style={{ fontSize: 12, color: INK }}>
                      {s.label}
                    </span>
                    <span className="mt-[4px] leading-none" style={{ fontSize: 10, color: SUBTLE }}>
                      {s.sub}
                    </span>
                  </span>
                ))}
              </span>
            </button>
          </section>

          {/* 4. 書類の準備 */}
          <section className="menu-rise" style={at(2)}>
            <Head title="書類の準備" />
            <Panel>
              <MenuRow
                Icon={Building2}
                title="書類の差出人"
                badge={
                  sn.set ? (
                    <span className="flex items-center gap-[2px] font-semibold leading-none" style={{ fontSize: 11.5, color: "#7fe0a6" }}>
                      <Check size={13} strokeWidth={2.4} absoluteStrokeWidth />
                      入力済み
                    </span>
                  ) : (
                    <Chip>未設定</Chip>
                  )
                }
                sub={sn.lines.map((l, i) => (
                  <span key={i} className="block">
                    {l.map((part, j) => (
                      <span key={j} className="inline-block" style={{ marginRight: j < l.length - 1 ? "0.6em" : 0 }}>
                        {part}
                      </span>
                    ))}
                  </span>
                ))}
                onClick={onSender}
              />
              <MenuRow Icon={FilePenLine} title="照会の文面（ひな形）" sub={templateNote(templates)} onClick={onTemplates} />
            </Panel>
          </section>

          {/* 5. この端末の記録と、書き出し・読み込み */}
          <section className="menu-rise" style={at(3)}>
            <Head title="この端末の記録" />
            <Records historyCount={historyCount} favoriteCount={favoriteCount} exported={exported} onStorage={onStorage} />
          </section>

          {/* 6. データ */}
          <section className="menu-rise" style={at(4)}>
            <Head title="データ" />
            <Panel>
              <MenuRow
                Icon={MapPin}
                title="対応している市区町村"
                sub={AREA_LABEL}
                onClick={onCities}
                right={
                  <span className="font-bold leading-none" style={{ fontSize: 15, color: INK }}>
                    {MUNICIPALITIES.length.toLocaleString("ja-JP")}
                  </span>
                }
              />
              <MenuRow Icon={Database} title="データの出典と時点" sub="地価・用途地域・地番・取引事例などの時点と出典" onClick={onSources} />
              {!unread && <MenuRow Icon={Bell} title="お知らせ" sub={NEWS[0].title} onClick={onNews} right={<span style={{ fontSize: 12, color: SUBTLE }}>{NEWS[0].date}</span>} clamp />}
            </Panel>
          </section>

          {/* 7. アプリ */}
          <section className="menu-rise" style={at(5)}>
            <Head title="アプリ" />
            <Panel>
              <MenuRow Icon={CircleHelp} title="使い方" sub="住所・地番・地図で調べて、書類にするまで" onClick={onHelp} />
              <MenuRow Icon={Smartphone} title="ホーム画面に追加" sub={standalone ? "追加したアプリで開いています" : "ブラウザの枠なしで、アプリのように使う"} onClick={onInstall} right={standalone ? <span style={{ fontSize: 12, color: SUBTLE }}>追加済み</span> : undefined} />
              <PcRow />
              <MotionRow on={motion} onChange={onMotion} />
              <MenuRow Icon={UserRound} title="アカウント・その他" sub="ログイン・会社での共有（準備中）" onClick={() => onPage("account")} />
            </Panel>
          </section>

          {/* 8. 安心の一言 */}
          <div className="menu-rise mt-[20px] flex gap-[10px] px-[4px]" style={at(6)}>
            <ShieldCheck size={18} strokeWidth={1.8} absoluteStrokeWidth color={SKY_BLUE} className="mt-[2px] shrink-0" />
            <p className="leading-[1.7]" style={{ fontSize: 12, color: SUBTLE }}>
              入れた住所・座標は MICHILU のサーバーには送りません（住所検索は国土地理院へ）。履歴・記録・差出人は、この端末の中だけに残ります。MICHILU は判定をしません。最終確認は役所の窓口・公的な資料で。
            </p>
          </div>
          <p className="mt-[12px] text-center" style={{ fontSize: 11, color: FAINT }}>
            MICHILU（ミチル）・最終更新 {NEWS[0].date}
          </p>
        </div>
      </div>

      {/* 上の帯：ロゴと ×（ページの帯のロゴと ≡ と同じ位置）。中身をスクロールしたら、帯に紺の地を敷く（下を流れる中身は帯の下でふわっと消える） */}
      <div className="pointer-events-none absolute inset-x-0 top-0" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div aria-hidden className="absolute inset-0 transition-opacity duration-200" style={{ opacity: scrolled ? 1 : 0, background: "linear-gradient(180deg, rgba(7,13,28,0.97) 0%, rgba(7,13,28,0.93) 74%, rgba(7,13,28,0) 100%)" }} />
        <div className="relative mx-auto flex items-start justify-between" style={{ width: ART_W, zoom: ZOOM, padding: "16px 18px 18px 20px" }}>
          <PhoneImg src="/home/logo-mark-white.webp" alt="MICHILU" width={802} height={159} draggable={false} className="block" style={{ height: 30, width: "auto", marginTop: 6, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
          <button
            ref={closeBtn}
            onClick={onClose}
            aria-label="メニューを閉じる"
            className="press pointer-events-auto relative flex shrink-0 items-center justify-center rounded-full"
            style={{ width: 46, height: 46, minWidth: HIT, minHeight: HIT, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 24px rgba(0,0,0,0.2)" }}
          >
            <X size={22} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * この端末の記録（履歴・お気に入り・確認の記録の数）と、書き出し・読み込みの行（最後に書き出した日。まだ書き出しておらず、
 * 残っている記録があれば勧める）。メニューを開くたびに作り直すので、確認の記録の数と「今日・昨日」は開いたときの値
 */
function Records({ historyCount, favoriteCount, exported, onStorage }: { historyCount: number; favoriteCount: number; exported: number | null; onStorage: () => void }) {
  const [now] = useState(() => Date.now());
  const [records] = useState(() => recordedCount(allRecords()));
  const backup = backupNote(exported, now, historyCount + favoriteCount + records);
  return (
    <Panel>
      <div className="grid grid-cols-3 px-[6px] pb-[12px] pt-[14px]">
        <Count label="履歴" n={historyCount} />
        <Count label="お気に入り" n={favoriteCount} line />
        <Count label="確認の記録" n={records} line />
      </div>
      <MenuRow Icon={Download} title="書き出し・読み込み" sub={backup.text} dot={backup.warn ? AMBER : undefined} onClick={onStorage} badge={backup.warn ? <Chip>おすすめ</Chip> : undefined} />
    </Panel>
  );
}

/** 調べ始める入口（大きなすりガラスの板。真ん中に青い丸のアイコン、名前、ひとこと） */
function Tile({ Icon, title, sub, label, onClick, busy = false }: { Icon: LucideIcon; title: string; sub: string; label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-busy={busy || undefined}
      className="press-soft flex flex-col items-center justify-center rounded-[20px] px-[4px] text-center"
      style={{ height: 112, background: "linear-gradient(165deg, rgba(255,255,255,0.17) 0%, rgba(255,255,255,0.06) 100%)", border: "1px solid rgba(255,255,255,0.16)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16), 0 10px 26px rgba(0,0,0,0.18)" }}
    >
      <span className="flex size-[44px] items-center justify-center rounded-full" style={{ background: "linear-gradient(150deg, #4c97ff 0%, #1f5fd6 100%)", boxShadow: "0 6px 16px rgba(31,95,214,0.45), inset 0 1px 0 rgba(255,255,255,0.35)" }}>
        {busy ? <LoaderCircle size={21} strokeWidth={2} absoluteStrokeWidth color="#fff" className="animate-spin" /> : <Icon size={21} strokeWidth={1.9} absoluteStrokeWidth color="#fff" />}
      </span>
      <span className="mt-[9px] font-bold leading-none" style={{ fontSize: 14.5, color: INK }}>
        {title}
      </span>
      <span className="mt-[5px] leading-[1.25]" style={{ fontSize: 11, color: SUBTLE }}>
        {sub}
      </span>
    </button>
  );
}

/** 章の見出し（控えめな白の字）と右の「使い方 ›」など（押せる高さは44pt） */
function Head({ title, more, onMore }: { title: string; more?: string; onMore?: () => void }) {
  return (
    <div className="mt-[20px] flex items-end justify-between px-[4px]" style={{ marginBottom: 8 }}>
      <h3 className="font-semibold leading-none" style={{ fontSize: 13, letterSpacing: 1.2, color: "rgba(255,255,255,0.55)", paddingBottom: 2 }}>
        {title}
      </h3>
      {more && onMore && (
        <button onClick={onMore} className="press -my-[14px] -mr-[8px] flex items-center gap-[1px] rounded-full px-[8px]" style={{ minHeight: HIT, fontSize: 13, color: SKY_BLUE }}>
          {more}
          <ChevronRight size={14} strokeWidth={2} absoluteStrokeWidth />
        </button>
      )}
    </div>
  );
}

/** 行をまとめる板（行の間に細い線） */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-white/[0.08] overflow-hidden rounded-[18px]" style={PANEL}>
      {children}
    </div>
  );
}

/** 小さな札（「未設定」「おすすめ」。琥珀色） */
function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full px-[8px] py-[4px] font-bold leading-none" style={{ fontSize: 11, color: AMBER, background: AMBER_TINT.bg, border: `1px solid ${AMBER_TINT.line}` }}>
      {children}
    </span>
  );
}

/** 一覧の1行（左に角の丸いアイコン、名前（横に札）と説明、右に数・日付と ›） */
function MenuRow({ Icon, title, badge, sub, right, dot, clamp = false, onClick }: { Icon: LucideIcon; title: string; badge?: ReactNode; sub?: ReactNode; right?: ReactNode; dot?: string; clamp?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-[12px] px-[14px] text-left transition-colors active:bg-white/[0.08]" style={{ minHeight: 62 }}>
      <span className="relative flex size-[34px] shrink-0 items-center justify-center rounded-[10px]" style={{ background: "rgba(255,255,255,0.1)" }}>
        <Icon size={18} strokeWidth={1.8} absoluteStrokeWidth color="#d6e6ff" />
        {dot && <span className="absolute -right-[3px] -top-[3px] size-[10px] rounded-full border-2" style={{ background: dot, borderColor: "#18233a" }} />}
      </span>
      <span className="min-w-0 flex-1 py-[11px]">
        <span className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px]">
          <span className="font-semibold leading-[1.3]" style={{ fontSize: 15, color: INK }}>
            {title}
          </span>
          {badge}
        </span>
        {sub && (
          <span className={`mt-[3px] break-words leading-[1.45] ${clamp ? "line-clamp-2" : "block"}`} style={{ fontSize: 12.5, color: SUBTLE }}>
            {sub}
          </span>
        )}
      </span>
      {right}
      <ChevronRight size={17} strokeWidth={2} absoluteStrokeWidth color={FAINT} className="shrink-0" />
    </button>
  );
}

/** 記録の数（大きな数字と名前。左に細い線） */
function Count({ label, n, line = false }: { label: string; n: number; line?: boolean }) {
  return (
    <div className="flex flex-col items-center" style={line ? { borderLeft: "1px solid rgba(255,255,255,0.1)" } : undefined}>
      <span className="font-bold leading-none" style={{ fontSize: 24, color: INK, fontVariantNumeric: "tabular-nums" }}>
        {n.toLocaleString("ja-JP")}
        <span className="ml-[2px] font-semibold" style={{ fontSize: 12, color: SUBTLE }}>
          件
        </span>
      </span>
      <span className="mt-[6px] leading-none" style={{ fontSize: 11.5, color: SUBTLE }}>
        {label}
      </span>
    </div>
  );
}

/**
 * パソコンでも使う：同じアドレスをパソコンで開くと、大きな画面の調査デスク（3D の街・カルテ・並べて比較）。押すと、このアプリの
 * アドレス（物件の情報は入れない）を共有シートで送るか、送れない端末ではコピーする。記録は端末ごとなので、書き出し・読み込みで移す
 */
function PcRow() {
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 2600);
    return () => clearTimeout(t);
  }, [done]);
  const send = async () => {
    const url = `${location.origin}/`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "MICHILU（ミチル）", url });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setDone("アドレスをコピーしました。パソコンのブラウザで開いてください");
    } catch {
      setDone(`パソコンのブラウザで ${url} を開いてください`);
    }
  };
  return <MenuRow Icon={Monitor} title="パソコンでも使う" sub={done ?? "同じアドレスを開くと、大きな画面の調査デスク（3Dの街・並べて比較）。記録は端末ごとです"} onClick={() => void send()} />;
}

/** 動きの演出のオン・オフ（押してもメニューは閉じない） */
function MotionRow({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const id = "menu-motion";
  return (
    <label htmlFor={id} className="flex w-full cursor-pointer items-center gap-[12px] px-[14px]" style={{ minHeight: 62 }}>
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px]" style={{ background: "rgba(255,255,255,0.1)" }}>
        <Sparkles size={18} strokeWidth={1.8} absoluteStrokeWidth color="#d6e6ff" />
      </span>
      <span className="min-w-0 flex-1 py-[11px]">
        <span className="block font-semibold leading-[1.3]" style={{ fontSize: 15, color: INK }}>
          動きの演出
        </span>
        <span className="mt-[3px] block leading-[1.45]" style={{ fontSize: 12.5, color: SUBTLE }}>
          調べたときの地球からのズーム・写真のゆっくりした動き
        </span>
      </span>
      <input id={id} type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#9db8e6]" style={{ background: on ? "#2f7cf6" : "rgba(255,255,255,0.2)" }}>
        <span className={`absolute top-[2px] h-[26px] w-[26px] rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-[2px]"}`} />
      </span>
    </label>
  );
}
