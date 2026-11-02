"use client";

// スマホの「その他」のページ（ホームの右上のメニュー（≡）から開く。履歴・お気に入り・書類・出力は写真の上のページで components/app/history.tsx・
// favorites.tsx・docs.tsx）。ホームと同じ系統：上にホームと同じ街の帯（時間連動の空と
// PLATEAU の街。components/app/sky.tsx の SkyPhotos）、その帯に重ねるすりガラスのカード（そのページでいちばん使う操作）、白い角丸の一覧。
// 字は端末の標準の字（app/globals.css の .theme-navy）。大きさは iPhone の段階：帯の見出し28pt太字、章の見出し17pt太字、
// 行の名前15.5pt中太字、説明12.5pt、押せる所は44pt以上。寸法は幅393ptの値で、画面の幅に合わせて拡大・縮小する（components/app/zoom.ts）
import { Bell, ChevronRight, CircleHelp, Database, Download, Info, LoaderCircle, LogIn, MapPin, Smartphone, Star, TriangleAlert, type LucideIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { MUNICIPALITIES } from "@/lib/roadmap";
import { AURORA, DARK_GLASS, GLOW, PAGE } from "./home";
import { ClockBack } from "./icons";
import { NEWS } from "./news";
import { CARD, GLASS, Head, HEAD, LIGHT, Note, Row, TEXT } from "./r-ui";
import { BottomFade, CompactBar, SkyPhotos, useShrink } from "./sky";
import { NAVY } from "./ui";

// 絞り込み・日時の書き方は lib/app/history-view.ts（お気に入り・書類・出力・履歴で同じ）
export { matches, when } from "@/lib/app/history-view";

/**
 * 街の帯の高さ（ホームは 275pt。街の絵は 393×275pt で、空は 0〜147pt、街並みは 147pt から下）と、ガラスのカードを重ねる量。
 * 帯の下の 25pt（いちばん手前の街）は切れる。カードは街並みに重なり、見出しは空の部分（ホームと同じ上端 44pt）
 */
const BAND_H = 250;
const OVERLAP = 72;
const PHOTO_H = 275;

/**
 * ページの枠：ホームと同じ街の帯（見出し・副題は空の部分に。字の色は空の明るさで紺↔白、建物に重なっても読めるよう光彩。
 * 右上に小さなボタン）、街並みに重ねるガラスのカード、その下の中身。
 * スクロールが出ると帯が縮み（絵は半分の速さで上へ、見出しは薄れる）、56pt のバーに見出しが残る
 */
function TabScreen({ title, sub, action, hero, banner, children }: { title: string; sub?: string; action?: ReactNode; hero?: ReactNode; banner?: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useShrink(root, BAND_H - 56);
  return (
    <div ref={root} className="app-touch relative pb-[16px]" style={{ background: PAGE }}>
      <CompactBar>
        <span className="min-w-0 flex-1 truncate font-bold leading-none" style={{ fontSize: 17, color: HEAD }}>
          {title}
        </span>
        {action}
      </CompactBar>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: BAND_H, background: AURORA }} />
      <div className="relative overflow-hidden" style={{ height: BAND_H }}>
        <div className="shrink-photo absolute inset-x-0 top-0" style={{ height: PHOTO_H }}>
          <SkyPhotos creditBottom={BAND_H - OVERLAP} />
        </div>
        <BottomFade />
        {action && (
          <div className="absolute" style={{ right: 8, top: 3 }}>
            {action}
          </div>
        )}
        <div className="shrink-title absolute left-[16px] right-[16px]" style={{ top: 44 }}>
          <h1 className="sky-ink truncate font-bold" style={{ fontSize: 26, lineHeight: "34px", letterSpacing: 0.2, textShadow: GLOW }}>
            {title}
          </h1>
          {sub && (
            <p className="sky-ink-soft mt-[3px] truncate leading-none" style={{ fontSize: 13, letterSpacing: 0.2, textShadow: GLOW }}>
              {sub}
            </p>
          )}
        </div>
      </div>
      {hero && (
        <div className="relative mx-[16px] rounded-[22px] p-[9px] shadow-[0_14px_34px_rgba(20,48,95,0.13)]" style={{ ...GLASS, marginTop: -OVERLAP }}>
          <div aria-hidden className="sky-layer pointer-events-none absolute inset-0 rounded-[22px]" style={{ background: "radial-gradient(120% 70% at 14% 0%, var(--sky-hl, #fff) 0%, rgba(255,255,255,0) 60%)", opacity: 0.55, boxShadow: "inset 0 1px 0 var(--sky-hl, #fff)" }} />
          <div className="relative">{hero}</div>
        </div>
      )}
      {banner && <div className="relative mt-[8px] px-[16px]">{banner}</div>}
      <div className="relative px-[16px]">{children}</div>
    </div>
  );
}

/** 調べている・通信の失敗（橙）・お知らせ（青）。ページの上。glass は写真の上のページ（お気に入り）用の暗いすりガラスに白い字 */
export function TabBanner({ loading, error, notice, onDismiss, glass = false }: { loading: boolean; error: string | null; notice: string | null; onDismiss: () => void; glass?: boolean }) {
  if (loading)
    return (
      <p className={`flex items-center gap-[8px] px-[12px] py-[10px] leading-[1.5] ${glass ? "rounded-[16px]" : "rounded-[12px] bg-[#eef4fb]"}`} style={glass ? { ...DARK_GLASS, fontSize: 13, color: "#fff" } : { fontSize: 13, color: "#1c3a6a" }}>
        <LoaderCircle size={16} strokeWidth={1.8} absoluteStrokeWidth className="shrink-0 animate-spin" />
        調べています…
      </p>
    );
  const text = error ?? notice;
  if (!text) return null;
  const warn = !!error;
  return (
    <button
      onClick={onDismiss}
      className={`flex w-full items-start gap-[8px] px-[12px] py-[10px] text-left leading-[1.55] ${glass ? "rounded-[16px]" : "rounded-[12px]"}`}
      style={glass ? { ...DARK_GLASS, fontSize: 13, color: "#fff" } : { fontSize: 13, background: warn ? "#fdf1ec" : "#eef4fb", color: warn ? "#8a4f3a" : "#1c3a6a" }}
    >
      {warn ? <TriangleAlert size={16} strokeWidth={1.8} absoluteStrokeWidth color={glass ? "#ffcf8a" : undefined} className="mt-[1px] shrink-0" /> : <Info size={16} strokeWidth={1.8} absoluteStrokeWidth className="mt-[1px] shrink-0" />}
      {text}
    </button>
  );
}

/** いまの時刻（ページを開いたときに決める。ページは開くたびに作り直されるので、それで足りる） */
export function useNow(): number {
  return useState(() => Date.now())[0];
}

/** その他：履歴とお気に入りの札、ログイン（準備中）、使い方とデータ、アプリ。1画面に収める */
export function AccountPage({
  onHelp,
  onCities,
  onHistory,
  onFavorites,
  onSources,
  onNews,
  unread,
  onInstall,
  onStorage,
  standalone,
  historyCount,
  favoriteCount,
  banner,
}: {
  onHelp: () => void;
  onCities: () => void;
  onHistory: () => void;
  onFavorites: () => void;
  onSources: () => void;
  onNews: () => void;
  unread: boolean;
  onInstall: () => void;
  /** 調査記録の書き出し・読み込み（データの保存について） */
  onStorage: () => void;
  standalone: boolean;
  historyCount: number;
  favoriteCount: number;
  banner?: ReactNode;
}) {
  const icon = (Icon: LucideIcon) => <Icon size={17} strokeWidth={1.8} absoluteStrokeWidth color={NAVY} />;
  const stat = (label: string, count: number, ic: ReactNode, onClick: () => void) => (
    <button onClick={onClick} className="press-soft flex min-w-0 flex-1 items-center gap-[10px] rounded-[14px] bg-white px-[12px] text-left shadow-[0_2px_8px_rgba(20,45,85,0.06)] active:bg-[#f5f8fc]" style={{ height: 58 }}>
      <span className="flex shrink-0 items-center justify-center rounded-full bg-[#eef3fa]" style={{ width: 34, height: 34 }}>
        {ic}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate leading-none" style={{ fontSize: 12, color: LIGHT }}>
          {label}
        </span>
        <span className="mt-[4px] block truncate font-bold leading-none" style={{ fontSize: 18, color: TEXT }}>
          {count}
          <span className="ml-[2px] font-semibold" style={{ fontSize: 12 }}>
            件
          </span>
        </span>
      </span>
      <ChevronRight size={16} strokeWidth={1.8} absoluteStrokeWidth color="#a3adbd" className="shrink-0" />
    </button>
  );
  return (
    <TabScreen
      title="その他"
      sub="MICHILU（ミチル）・不動産の現場に、すぐ使える情報を。"
      action={
        <button onClick={onNews} aria-label={unread ? "お知らせ（新しいお知らせがあります）" : "お知らせ"} className="press relative flex items-center justify-center" style={{ width: 44, height: 44 }}>
          <span className="flex items-center justify-center rounded-full shadow-[0_4px_14px_rgba(15,47,95,0.14)]" style={{ ...GLASS, width: 38, height: 38 }}>
            <Bell size={19} strokeWidth={1.7} absoluteStrokeWidth color={HEAD} />
          </span>
          {unread && <span className="absolute rounded-full border-2 border-white bg-[#f0263a]" style={{ right: 6, top: 6, width: 11, height: 11 }} />}
        </button>
      }
      hero={
        <>
          <div className="flex gap-[6px]">
            {stat("履歴", historyCount, <ClockBack size={18} stroke={1.8} color={NAVY} />, onHistory)}
            {stat("お気に入り", favoriteCount, <Star size={17} strokeWidth={1.8} absoluteStrokeWidth color="#f5a524" fill="#f5a524" />, onFavorites)}
          </div>
          <div className="mt-[6px] flex items-center gap-[8px] rounded-[14px] px-[12px] text-white" style={{ height: 44, background: "linear-gradient(135deg,#1b4280 0%,#133664 55%,#0a2248 100%)" }}>
            <LogIn size={17} strokeWidth={1.8} absoluteStrokeWidth className="shrink-0" />
            <span className="min-w-0 flex-1 truncate font-semibold leading-none" style={{ fontSize: 14 }}>
              ログイン・会社での共有
            </span>
            <span className="shrink-0 rounded-full bg-white/20 px-[8px] py-[4px] font-bold leading-none" style={{ fontSize: 11 }}>
              準備中
            </span>
          </div>
        </>
      }
      banner={banner}
    >
      <section>
        <Head title="使い方・データ・アプリ" className="mt-[10px]" />
        <div className={`overflow-hidden ${CARD}`}>
          <Row icon={icon(CircleHelp)} title="使い方" sub="住所・地番・地図で調べて、市の地図を開くまで" minH={52} onClick={onHelp} />
          <Row icon={icon(MapPin)} title="対応している市区町村" right={`${MUNICIPALITIES.length}`} rightColor={LIGHT} sub="関東1都6県" minH={52} onClick={onCities} />
          <Row icon={icon(Database)} title="データの出典と時点" sub="国・自治体の公開データ" minH={52} onClick={onSources} />
          <Row
            icon={
              <span className="relative flex">
                <Bell size={17} strokeWidth={1.8} absoluteStrokeWidth color={NAVY} />
                {unread && <span className="absolute -right-[3px] -top-[2px] size-[8px] rounded-full border border-white bg-[#f0263a]" />}
              </span>
            }
            title="お知らせ"
            sub={NEWS[0].title}
            right={unread ? "新着" : NEWS[0].date}
            rightColor={unread ? "#c0391b" : LIGHT}
            minH={52}
            onClick={onNews}
          />
          <Row icon={icon(Smartphone)} title="ホーム画面に追加" sub={standalone ? "追加したアプリで開いています" : "ブラウザの枠なしで、アプリのように使う"} right={standalone ? "追加済み" : undefined} rightColor={LIGHT} minH={52} onClick={onInstall} />
          <Row icon={icon(Download)} title="調査記録の書き出し・読み込み" sub="機種変更・データ消失への備え。保存の仕組みも" minH={52} onClick={onStorage} />
        </div>
      </section>
      <Note className="mt-[12px] px-[4px]">
        MICHILU は不動産会社の営業のための調査アプリ（最終更新 {NEWS[0].date}）。住所はサーバーに送らないので、共有は「結果の文面」で。地図・データは参考情報で、MICHILUは判定をしません。
      </Note>
    </TabScreen>
  );
}
