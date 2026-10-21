"use client";

// モック画面（機能なし）：ChatGPT で作ったデザインの絵を、絵の座標どおりにコードで描いたもの。
// 幅393ptの絵を、画面の幅に合わせて拡大・縮小して出す（どの機種でも絵と同じ見た目）。
// 写真と地図は NO IMAGE（写真はあとで届く）。押して動くのはタブの切り替えだけ。
// 5枚の絵は上の部分の大きさが少しずつ違うので、タブごとにその絵の配置（layouts.ts）で描く
import { useLayoutEffect, useState } from "react";
import {
  Bookmark,
  Building2,
  ChevronRight,
  Copy,
  Database,
  FileText,
  House,
  LocateFixed,
  MapPin,
  Menu,
  NotepadText,
  Search,
  Share,
  Share2,
  Star,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import { ART_W, at, T } from "./kit";
import { BarsOutline, ClockBack, HouseFill, MockLogoMark } from "./icons";
import { LAYOUTS, type Layout } from "./layouts";
import { applyMockZoom } from "./zoom";
import { BasicTab } from "./tab-basic";
import { AroundTab } from "./tab-around";
import { LawTab } from "./tab-law";
import { HazardTab } from "./tab-hazard";
import { DealsTab } from "./tab-deals";

export type MockTab = "basic" | "around" | "price" | "law" | "hazard" | "deals";

export const NAVY = "#133664";
/** 絵の上端から、絵の中のステータスバー（9:41・電池）の下までの高さ */
const STATUS_BAR = 24;
const ADDRESS = "東京都渋谷区神南１丁目１９-１１";

// 画面の幅 ÷ 絵の幅 で全体を拡大・縮小する。値は app/layout.tsx の <head> のスクリプトが CSS 変数に入れる（zoom.ts）
const ZOOM = "var(--mock-zoom, 1)";

/** 絵ごとに違う小さなアイコン（取引事例のタブ・最近の検索・下のメニューの検索履歴） */
const ICON_VARIANT: Record<
  Exclude<MockTab, "price">,
  {
    deals: "db" | "list" | "doc";
    recent: "clock" | "target";
    history: "clock" | "search";
  }
> = {
  basic: { deals: "db", recent: "clock", history: "clock" },
  around: { deals: "db", recent: "clock", history: "clock" },
  law: { deals: "db", recent: "clock", history: "search" },
  hazard: { deals: "list", recent: "target", history: "clock" },
  deals: { deals: "doc", recent: "clock", history: "clock" },
};

export function MockApp() {
  const [tab, setTab] = useState<Exclude<MockTab, "price">>("basic");
  // 開発中の再マウントで <html> の style が消えたときのため、もう一度入れる（本番では同じ値を入れ直すだけ）
  useLayoutEffect(() => applyMockZoom(), []);
  const L = LAYOUTS[tab];
  const cardBottom = L.buttons.y + L.buttons.h + 1.9;
  const h = cardBottom + 2;
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#f7f9fd]"
      style={{ fontFeatureSettings: "normal", letterSpacing: 0 }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        {/* 絵のいちばん上（時刻・電池のステータスバー）の分は、本物のステータスバーが出るので切り落とす */}
        <div
          className="relative mx-auto select-none overflow-hidden"
          style={{ width: ART_W, height: h - STATUS_BAR, zoom: ZOOM }}
        >
          <div
            className="absolute left-0"
            style={{ top: -STATUS_BAR, width: ART_W, height: h }}
          >
            <Hero L={L} recent={ICON_VARIANT[tab].recent} />
            {/* 台紙（薄い水色）と、その上の白いカード */}
            <div
              className="absolute rounded-t-[18px] bg-[#f7f9fd]"
              style={at(0, L.sheetY, ART_W, h - L.sheetY)}
            />
            <div
              className="absolute rounded-[14px] bg-white"
              style={at(6, L.cardY, 381, cardBottom - L.cardY)}
            />
            <AddressHeader L={L} />
            <Tabs
              L={L}
              tab={tab}
              onTab={setTab}
              dealsIcon={ICON_VARIANT[tab].deals}
            />
            {tab === "basic" && <BasicTab onTab={setTab} />}
            {tab === "around" && <AroundTab />}
            {tab === "law" && <LawTab />}
            {tab === "hazard" && <HazardTab />}
            {tab === "deals" && <DealsTab />}
            <BottomButtons L={L} />
          </div>
        </div>
      </div>
      <BottomNav L={L} history={ICON_VARIANT[tab].history} />
    </div>
  );
}

// ---------- 上：写真（今は無し）・ロゴ・右上のボタン・見出し・検索窓・最近の検索 ----------

function Hero({ L, recent }: { L: Layout; recent: "clock" | "target" }) {
  const { search: S, recent: R } = L;
  const [bx, by, bw, bh] = S.bar;
  const iconSize = (13.5 * bh) / 32.6;
  const btnIcon = (12.5 * S.btn[3]) / 28;
  return (
    <>
      {/* 写真の代わり：空の明るさ → 下に向かって暗く（写真の明るさの分布に合わせる）。左は見出しのために白く */}
      <div
        className="absolute overflow-hidden"
        style={at(0, 0, ART_W, L.heroH)}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#e9f1f9_0%,#e4edf6_22%,#dfe5ec_48%,#b9c3cd_66%,#7d8c9b_82%,#56687a_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0)_45%,rgba(120,160,210,0.28)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(252,251,249,0.97)_0%,rgba(252,251,249,0.9)_32%,rgba(252,251,249,0)_62%)] [mask-image:linear-gradient(180deg,transparent_6%,#000_22%,#000_58%,transparent_74%)]" />
        <div
          className="absolute flex flex-col items-center text-white/80"
          style={at(285, L.heroH * 0.39, 80, 30)}
        >
          <span
            className="font-semibold leading-none"
            style={{ fontSize: 6.5, letterSpacing: "0.14em" }}
          >
            NO IMAGE
          </span>
          <span className="mt-[3px] leading-none" style={{ fontSize: 5.5 }}>
            （背景の写真）
          </span>
        </div>
      </div>

      {/* ロゴ */}
      <MockLogoMark style={at(L.mark[0], L.mark[1], L.mark[2], L.mark[3])} />
      <T
        x={L.word.x}
        y={L.word.y}
        s={L.word.s}
        w={500}
        c="#0f1b33"
        latin
        ls={L.word.ls}
        className="font-latin"
      >
        MICHILU
      </T>
      <T x={L.tag.x} y={L.tag.y} s={L.tag.s} c="#3c4658" ls={L.tag.ls}>
        不動産の現場に、すぐ使える情報を。
      </T>

      {/* 右上：検索履歴・保存・メニュー */}
      <TopButton
        cx={L.btns.cx[0]}
        cy={L.btns.cy}
        lx={L.btns.labelX[0]}
        ly={L.btns.labelY}
        ls={L.btns.labelS}
        label="検索履歴"
      >
        <ClockBack size={14} stroke={1.5} />
      </TopButton>
      <TopButton
        cx={L.btns.cx[1]}
        cy={L.btns.cy}
        lx={L.btns.labelX[1]}
        ly={L.btns.labelY}
        ls={L.btns.labelS}
        label="保存"
      >
        <Bookmark size={13} strokeWidth={1.3} absoluteStrokeWidth />
      </TopButton>
      <div
        className="absolute flex items-center justify-center rounded-full bg-white/40 text-[#0f1b33]"
        style={at(L.btns.menu[0] - 14.75, L.btns.menu[1] - 14.75, 29.5, 29.5)}
      >
        <Menu size={14} strokeWidth={1.3} absoluteStrokeWidth />
      </div>

      {/* 見出し */}
      <T
        x={L.title.x}
        y={L.title.y1}
        s={L.title.s}
        w={500}
        c="#142034"
        ls={L.title.ls}
      >
        調べる時間を、
      </T>
      <T
        x={L.title.x}
        y={L.title.y2}
        s={L.title.s}
        w={500}
        c="#142034"
        ls={L.title.ls}
      >
        商談の時間に。
      </T>
      {L.divider && (
        <div
          className="absolute bg-[#a3aebb]"
          style={at(L.divider[0], L.divider[1], L.divider[2], 0.8)}
        />
      )}

      {/* 検索窓（見本の住所が入った状態） */}
      <div
        className="absolute rounded-full bg-white shadow-[0_2px_6px_rgba(10,25,50,0.12)]"
        style={at(bx, by, bw, bh)}
      />
      <Search
        size={iconSize}
        strokeWidth={1.4}
        absoluteStrokeWidth
        color="#18233a"
        style={at(bx + 14.6, by + (bh - iconSize) / 2 - 0.5)}
      />
      <T x={S.text.x} y={S.text.y} s={S.text.s} c="#121a2b" w={500}>
        {ADDRESS}
      </T>
      <div
        className="absolute flex items-center justify-center rounded-full bg-[#ececee]"
        style={at(
          S.clear[0] - S.clear[2] / 2,
          S.clear[1] - S.clear[2] / 2,
          S.clear[2],
          S.clear[2],
        )}
      >
        <X size={8} strokeWidth={1} absoluteStrokeWidth color="#8e98a6" />
      </div>
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{
          ...at(S.btn[0], S.btn[1], S.btn[2], S.btn[3]),
          background: NAVY,
        }}
      >
        <Search
          size={btnIcon}
          strokeWidth={1.4}
          absoluteStrokeWidth
          color="#fff"
        />
      </div>

      {/* 最近の検索 */}
      {recent === "target" ? (
        <LocateFixed
          size={13}
          strokeWidth={1.5}
          absoluteStrokeWidth
          color="#e8edf2"
          style={at(15.6, R.label.y + 0.45 * R.label.s - 5.5)}
        />
      ) : (
        <ClockBack
          size={12.5}
          stroke={1.5}
          color="#e8edf2"
          style={at(15.8, R.label.y + 0.45 * R.label.s - 5.25)}
        />
      )}
      <T x={R.label.x} y={R.label.y} s={R.label.s} c="#e6ebf0">
        最近の検索
      </T>
      {[
        "渋谷区神南１丁目１９-１１",
        "港区六本木３丁目2-1",
        "千代田区丸の内１丁目",
      ].map((text, i) => (
        <div
          key={text}
          className="absolute flex items-center justify-center rounded-full bg-white/[0.87] text-[#1a2233]"
          style={at(R.chips[i][0], R.chipY, R.chips[i][1], R.chipH)}
        >
          <span className="leading-none" style={{ fontSize: R.chipS }}>
            {text}
          </span>
        </div>
      ))}
    </>
  );
}

function TopButton({
  cx,
  cy,
  lx,
  ly,
  ls,
  label,
  children,
}: {
  cx: number;
  cy: number;
  lx: number;
  ly: number;
  ls: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="absolute flex justify-center rounded-full bg-white/40 pt-[7px] text-[#0f1b33]"
        style={at(cx - 14.75, cy - 14.75, 29.5, 29.5)}
      >
        {children}
      </div>
      <T x={lx} y={ly} s={ls} c="#1a2840" align="center">
        {label}
      </T>
    </>
  );
}

// ---------- 住所の欄・お気に入り・共有 ----------

function AddressHeader({ L }: { L: Layout }) {
  const A = L.addr;
  const [px, py, pd] = A.pin;
  const k = pd / 30.9;
  return (
    <>
      <div
        className="absolute flex items-center justify-center rounded-full bg-[#eef4fb]"
        style={at(px, py, pd, pd)}
      >
        <svg viewBox="0 0 24 32" width={12 * k} height={16 * k} aria-hidden>
          <path
            d="M12 0C5.4 0 0 5.2 0 11.7 0 20 12 32 12 32s12-12 12-20.3C24 5.2 18.6 0 12 0Z"
            fill={NAVY}
          />
          <circle cx="12" cy="11.5" r="4.4" fill="#eef4fb" />
        </svg>
      </div>
      <T x={A.title.x} y={A.title.y} s={A.title.s} w={700} c="#111827">
        {ADDRESS}
      </T>
      <T x={A.sub.x} y={A.sub.y} s={A.sub.s} c="#6b7789">
        {ADDRESS}
      </T>
      {A.copy && (
        <Copy
          size={7.5}
          strokeWidth={1.1}
          absoluteStrokeWidth
          color="#1b375f"
          style={at(A.copy[0], A.copy[1])}
        />
      )}

      <div
        className="absolute rounded-full border border-[#e3e8ef] bg-white"
        style={at(A.fav[0], A.fav[1], A.fav[2], A.fav[3])}
      />
      <Star
        size={9.6}
        strokeWidth={1.2}
        absoluteStrokeWidth
        color={NAVY}
        style={at(A.fav[0] + 9.9, A.fav[1] + (A.fav[3] - 9.6) / 2 - 0.2)}
      />
      <T x={A.favText.x} y={A.favText.y} s={A.favText.s} c="#1b3768" w={500}>
        お気に入り
      </T>
      <div
        className="absolute rounded-full border border-[#e3e8ef] bg-white"
        style={at(A.share[0], A.share[1], A.share[2], A.share[3])}
      />
      <Share2
        size={9}
        strokeWidth={1.2}
        absoluteStrokeWidth
        color={NAVY}
        style={at(A.share[0] + 6.9, A.share[1] + (A.share[3] - 9) / 2)}
      />
      <T
        x={A.shareText.x}
        y={A.shareText.y}
        s={A.shareText.s}
        c="#1b3768"
        w={500}
      >
        共有
      </T>
    </>
  );
}

// ---------- タブ ----------

const TAB_KEYS: MockTab[] = [
  "basic",
  "around",
  "price",
  "law",
  "hazard",
  "deals",
];
const DEALS_ICONS = {
  db: (c: string) => (
    <Database size={10} strokeWidth={1.1} absoluteStrokeWidth color={c} />
  ),
  list: (c: string) => (
    <NotepadText size={10.5} strokeWidth={1.1} absoluteStrokeWidth color={c} />
  ),
  doc: (c: string) => (
    <FileText size={10.5} strokeWidth={1.2} absoluteStrokeWidth color={c} />
  ),
};
const TAB_ICONS: ((c: string) => React.ReactNode)[] = [
  (c) => <House size={10.8} strokeWidth={1.1} absoluteStrokeWidth color={c} />,
  (c) => <MapPin size={10.5} strokeWidth={1.1} absoluteStrokeWidth color={c} />,
  (c) => <BarsOutline size={10.5} stroke={2.2} color={c} />,
  (c) => (
    <FileText size={10.5} strokeWidth={1.1} absoluteStrokeWidth color={c} />
  ),
  (c) => (
    <TriangleAlert size={11} strokeWidth={1.1} absoluteStrokeWidth color={c} />
  ),
];

function Tabs({
  L,
  tab,
  onTab,
  dealsIcon,
}: {
  L: Layout;
  tab: MockTab;
  onTab: (t: Exclude<MockTab, "price">) => void;
  dealsIcon: keyof typeof DEALS_ICONS;
}) {
  return (
    <>
      {TAB_KEYS.map((key, i) => {
        const on = key === tab;
        const [x, w] = L.tabs.boxes[i];
        return (
          <button
            key={key}
            // 「相場・取引」は絵がまだ無いので切り替えない
            onClick={() => key !== "price" && onTab(key)}
            className="absolute flex items-center justify-center gap-[5px] rounded-[5px]"
            style={{
              ...at(x, L.tabs.y, w, L.tabs.h),
              background: on ? NAVY : "#f2f5f9",
            }}
          >
            {(i < 5 ? TAB_ICONS[i] : DEALS_ICONS[dealsIcon])(
              on ? "#fff" : "#516379",
            )}
            <span
              className="leading-none"
              style={{
                fontSize: 6.43,
                color: on ? "#fff" : "#2b3d58",
                fontWeight: on ? 600 : 500,
                marginTop: 1.5,
              }}
            >
              {L.tabs.labels[i]}
            </span>
          </button>
        );
      })}
    </>
  );
}

// ---------- 下：この情報を共有・レポートを作成 ----------

function BottomButtons({ L }: { L: Layout }) {
  const B = L.buttons;
  const k = (B.content[1] - B.content[0]) / 76.11;
  const kr = (B.rcontent[1] - B.rcontent[0]) / 80.72;
  const s1 = 8.18 * k;
  const s2 = 8.72 * kr;
  return (
    <>
      <div
        className="absolute rounded-full border-[1.2px] bg-white"
        style={{ ...at(B.share[0], B.y, B.share[1], B.h), borderColor: NAVY }}
      />
      <Share
        size={12 * k}
        strokeWidth={1.3}
        absoluteStrokeWidth
        color={NAVY}
        style={at(B.content[0] - 0.84, B.y + (B.h - 12 * k) / 2 - 0.4)}
      />
      <T
        x={B.content[0] + 18.46 * k}
        y={B.y + B.h / 2 - 0.38 * s1}
        s={s1}
        w={700}
        c={NAVY}
      >
        この情報を共有
      </T>
      <div
        className="absolute rounded-full"
        style={{ ...at(B.report[0], B.y, B.report[1], B.h), background: NAVY }}
      />
      <FileText
        size={13.5 * kr}
        strokeWidth={1.3}
        absoluteStrokeWidth
        color="#fff"
        style={at(B.rcontent[0] - 1.2, B.y + (B.h - 13.5 * kr) / 2)}
      />
      <T
        x={B.rcontent[0] + 20 * kr}
        y={B.y + B.h / 2 - 0.38 * s2}
        s={s2}
        w={700}
        c="#fff"
      >
        レポートを作成
      </T>
      <ChevronRight
        size={10}
        strokeWidth={1.5}
        absoluteStrokeWidth
        color="#fff"
        style={at(B.report[0] + B.report[1] - 27.4, B.y + (B.h - 10) / 2)}
      />
    </>
  );
}

// ---------- いちばん下のメニュー ----------

const NAV_ICON: Record<string, (on: boolean) => React.ReactNode> = {
  ホーム: () => <HouseFill size={15.5} color="#1b3563" />,
  検索履歴: () => <ClockBack size={15.5} stroke={1.45} color="#5f697c" />,
  お気に入り: () => (
    <Bookmark size={15} strokeWidth={1.3} absoluteStrokeWidth color="#5f697c" />
  ),
  周辺環境: () => (
    <Building2
      size={15.5}
      strokeWidth={1.6}
      absoluteStrokeWidth
      color="#1b3563"
    />
  ),
  マイページ: () => (
    <User size={15} strokeWidth={1.3} absoluteStrokeWidth color="#5f697c" />
  ),
};
/** 絵の中で濃い紺になっている項目（周辺環境の絵では「周辺環境」も濃い） */
const NAV_DARK = ["ホーム", "周辺環境"];

function BottomNav({ L, history }: { L: Layout; history: "clock" | "search" }) {
  return (
    <nav className="shrink-0 overflow-hidden bg-white pb-[max(0px,calc(env(safe-area-inset-bottom)-12px))] shadow-[0_-1px_6px_rgba(16,40,80,0.06)]">
      <div
        className="relative mx-auto"
        style={{ width: ART_W, height: 51, zoom: ZOOM }}
      >
        {L.nav.labels.map((label, i) => {
          const dark = NAV_DARK.includes(label);
          return (
            <div
              key={label}
              className="absolute flex flex-col items-center"
              style={at(L.nav.cx[i] - 40, 7.4, 80, 40)}
            >
              {label === "検索履歴" && history === "search" ? (
                <Search
                  size={15.5}
                  strokeWidth={1.4}
                  absoluteStrokeWidth
                  color="#5f697c"
                />
              ) : (
                NAV_ICON[label](dark)
              )}
              <span
                className="leading-none"
                style={{
                  marginTop: dark ? 5.2 : 4.7,
                  fontSize: dark ? 7.3 : 7.44,
                  color: dark ? "#1b3563" : "#6a7385",
                  fontWeight: dark ? 700 : 400,
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
