// モック画面「ハザード」タブ（デザインの絵 4枚目）。座標は絵の座標のまま（上の部分は layouts.ts の絵ごとの配置）
import { ChevronRight, CircleHelp, Expand, FileText, Map as MapIcon, MapPin, SquareArrowOutUpRight } from "lucide-react";
import { at, MapSlot, NoImage, PinMark, T } from "./kit";
import { Gauge, Landslide, Liquefaction, Quake, RainCloud, Runner, WavesFill } from "./icons";


const ADDRESS = "東京都渋谷区神南１丁目１９-１１";

type Level = { text: string; bg: string; fg: string };
const MID: Level = { text: "やや高い", bg: "#ffe59c", fg: "#1c2740" };
const LOW: Level = { text: "低い", bg: "#d4f1df", fg: "#1c2740" };
const HIGHISH: Level = { text: "やや高い", bg: "#ffd7c6", fg: "#c0391b" };
const NEAR: Level = { text: "近くにあり", bg: "#cdeedc", fg: "#1c2740" };

const CARDS: { x: number; y: number; title: string; icon: React.ReactNode; level: Level; lines: string[] }[] = [
  { x: 200.4, y: 297.4, title: "洪水", icon: <WavesFill size={20} style={at(207.6, 305.6)} />, level: MID, lines: ["想定最大規模で", "0.5〜3.0mの浸水が", "想定されています。"] },
  { x: 291.2, y: 297.4, title: "内水", icon: <RainCloud size={22.5} style={at(298.4, 303.8)} />, level: MID, lines: ["大雨時に0.2〜0.5m", "の浸水が想定されて", "います。"] },
  { x: 200.4, y: 393.7, title: "土砂災害", icon: <Landslide size={22} style={at(207.6, 399.4)} />, level: LOW, lines: ["土砂災害警戒区域", "には指定されていま", "せん。"] },
  { x: 291.2, y: 393.7, title: "液状化", icon: <Liquefaction size={21.5} style={at(299.4, 402.4)} />, level: HIGHISH, lines: ["液状化の可能性が", "やや高い地域です。"] },
  { x: 200.4, y: 490.9, title: "地震", icon: <Quake size={18.5} style={at(209.6, 497.8)} />, level: MID, lines: ["想定震度６弱の揺れ", "が想定されています。"] },
  { x: 291.2, y: 490.9, title: "避難場所", icon: <Runner size={19.5} style={at(299.6, 497.9)} />, level: NEAR, lines: ["最寄りの指定避難所", "まで約620m", "（徒歩8分）。"] },
];

const DEPTHS: { color: string; label: string }[] = [
  { color: "#c2506f", label: "5.0〜" },
  { color: "#ec6d75", label: "3.0〜5.0" },
  { color: "#fbc684", label: "0.5〜3.0" },
  { color: "#9cc5f5", label: "0.0〜0.5" },
];

export function HazardTab() {
  return (
    <div className="absolute left-0" style={{ top: 0, width: 393 }}>
      {/* 地図（今は無し）：洪水の深さの色の地図が入る */}
      <MapSlot className="rounded-[7px]" style={at(14.8, 297.6, 177.7, 285.5)}>
        <div className="absolute flex items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(10,30,60,0.15)]" style={at(152.3, 6.3, 20.5, 20.5)}>
          <Expand size={9.5} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" />
        </div>
      </MapSlot>
      <PinMark style={at(100.4, 361.8, 18.6, 27)} />
      <div className="absolute flex items-center justify-center rounded-full bg-white shadow-[0_1px_5px_rgba(10,30,60,0.14)]" style={at(56, 393.3, 104, 15)}>
        <span className="leading-none" style={{ fontSize: 6.1, fontWeight: 600, color: "#1d2433", marginTop: -0.5 }}>
          {ADDRESS}
        </span>
      </div>
      {/* 洪水の凡例 */}
      <div className="absolute rounded-[7px] bg-white/95 shadow-[0_1px_5px_rgba(10,30,60,0.12)]" style={at(20.5, 426.2, 50.5, 80.6)} />
      <T x={26.9} y={432.6} s={6.3} w={700} c="#1c2740">
        洪水
      </T>
      <T x={26.9} y={442} s={6.2} c="#5d6880">
        浸水深 (m)
      </T>
      {DEPTHS.map((d, i) => (
        <div key={d.label}>
          <div className="absolute rounded-[1.5px]" style={{ ...at(26.4, 450.1 + i * 12.55, 6.4, 10.9), background: d.color }} />
          <T x={40.1} y={455.8 + i * 12.75} s={6.1} c="#3f4a5f" latin>
            {d.label}
          </T>
        </div>
      ))}
      <div className="absolute rounded-full bg-white shadow-[0_1px_6px_rgba(10,30,60,0.14)]" style={at(19.8, 551.4, 115.7, 25)}>
        <SquareArrowOutUpRight size={10} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" style={at(11.2, 7.4)} />
        <span className="absolute leading-none" style={{ left: 27.4, top: 7.4, fontSize: 7.5, fontWeight: 500, color: "#1d2433" }}>
          ハザードマップで見る
        </span>
      </div>

      {/* 右：6つの項目 */}
      {CARDS.map((c) => (
        <div key={c.title}>
          <div className="absolute rounded-[8px] border border-[#edf1f6] bg-white" style={at(c.x, c.y, c.x < 250 ? 85 : 86.6, c.y > 480 ? 92 : 90.6)} />
          {c.icon}
          <T x={c.x + 35} y={c.y + 8.9} s={8.6} w={700} c="#141b2b">
            {c.title}
          </T>
          <div className="absolute flex items-center justify-center rounded-full" style={{ ...at(c.x + 7.3, c.y + (c.y > 480 ? 28.4 : 28.6), 58.3, 15.6), background: c.level.bg }}>
            <span className="leading-none" style={{ fontSize: 8.4, fontWeight: 700, color: c.level.fg }}>
              {c.level.text}
            </span>
          </div>
          <ChevronRight size={7} strokeWidth={1.5} absoluteStrokeWidth color="#1f5fd1" style={at(c.x + 72.5, c.y + 33.4)} />
          {c.lines.map((line, i) => (
            <T key={line} x={c.x + 7.2} y={c.y + 51.9 + i * 11.4} s={7.3} c="#4f5b70">
              {line}
            </T>
          ))}
        </div>
      ))}

      {/* 総合ハザード評価 */}
      <div className="absolute rounded-[8px] bg-[#f0f6fd]" style={at(14.8, 589.4, 363.3, 82.2)} />
      <Gauge style={at(20.6, 607, 63.2, 36)} />
      <T x={95.1} y={604.8} s={7.95} w={700} c="#1c2740">
        総合ハザード評価
      </T>
      <CircleHelp size={9.5} strokeWidth={1.2} absoluteStrokeWidth color="#2a4f8f" style={at(162.2, 603.9)} />
      <T x={95.2} y={620} s={17.05} w={700} c="#f7a20c">
        やや高い
      </T>
      <T x={96.4} y={643.9} s={7.2} c="#4f5b70">
        洪水・内水・液状化のリスクがやや高いエリアです。
      </T>
      <T x={95.9} y={655.3} s={7.2} c="#4f5b70">
        ハザードマップで詳細を確認し、適切な対策を検討してください。
      </T>
      <div className="absolute rounded-[9px] border-[1.2px] border-[#1c3a6a] bg-white" style={at(271.4, 604.8, 99.7, 22.7)} />
      <FileText size={11.5} strokeWidth={1.5} absoluteStrokeWidth color="#1f5fd1" style={at(279.4, 610.4)} />
      <T x={296.8} y={613} s={7.3} w={700} c="#1c2740">
        評価の根拠を見る
      </T>
      <ChevronRight size={7.5} strokeWidth={1.5} absoluteStrokeWidth color="#1c2740" style={at(357.7, 612.4)} />

      {/* 避難情報 */}
      <Runner size={13} style={at(15.6, 679.7)} />
      <T x={35.8} y={679.9} s={8.37} w={700} c="#1c2740">
        避難情報
      </T>
      <NoImage small className="rounded-[5px]" style={at(15, 687.6, 79.7, 48.3)} />
      <T x={101.5} y={696.8} s={8} w={700} c="#1c2740">
        渋谷区立 神南小学校
      </T>
      <div className="absolute flex items-center justify-center rounded-[4px] bg-[#d6f1e1]" style={at(184.5, 693.6, 43.4, 13.5)}>
        <span className="leading-none" style={{ fontSize: 6.5, fontWeight: 700, color: "#169b4f" }}>
          指定避難所
        </span>
      </div>
      <MapPin size={9.5} strokeWidth={1.3} absoluteStrokeWidth color="#1f5fd1" style={at(101.2, 709.8)} />
      <T x={114.1} y={711.8} s={7.4} c="#4f5b70" latin>
        約 620 m（徒歩8分）
      </T>
      <T x={112.4} y={726.3} s={7.8} c="#4f5b70">
        東京都渋谷区神南１丁目3-10
      </T>
      <div className="absolute rounded-[9px] border-[1.2px] border-[#1c3a6a] bg-white" style={at(291, 699.5, 86.5, 23.7)} />
      <MapIcon size={11.5} strokeWidth={1.4} absoluteStrokeWidth color="#1c3a6a" style={at(301.7, 705.6)} />
      <T x={319.8} y={709.3} s={7.2} w={700} c="#1c2740">
        地図で確認
      </T>
      <ChevronRight size={7.5} strokeWidth={1.5} absoluteStrokeWidth color="#1c2740" style={at(359.6, 708)} />
    </div>
  );
}
