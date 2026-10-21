// モック画面「法令・規制」タブ（デザインの絵 3枚目）。座標は絵の座標のまま（上の部分は layouts.ts の絵ごとの配置）
import { Building, Building2, ChevronRight, Expand, Flame, House, Layers, Map as MapIcon, Sun, TreePine } from "lucide-react";
import { at, MapSlot, PinMark, T } from "./kit";
import { AlertFill, CheckFill, DocFill, RoadIcon, SlopeIcon, SunFill, TowersFill, WidthIcon } from "./icons";


const ADDRESS = "東京都渋谷区神南１丁目１９-１１";
const INK = "#1a2232";
const LABEL = "#4d576b";
const ICON = "#1d3264";

type Row = { Icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties; strokeWidth?: number; absoluteStrokeWidth?: boolean }>; label: string; value?: string; sub?: string; chip?: boolean; latin?: boolean; iconY: number; labelY: number; valueY: number; subY?: number; lineY?: number };

const ROWS: Row[] = [
  { Icon: Building2, label: "用途地域", chip: true, iconY: 303.7, labelY: 306.4, valueY: 0, lineY: 321.3 },
  { Icon: House, label: "建ぺい率", value: "80%", latin: true, iconY: 326.4, labelY: 328.8, valueY: 327.6, lineY: 343.3 },
  { Icon: Layers, label: "容積率", value: "500%", latin: true, iconY: 348.1, labelY: 350.8, valueY: 349.6, lineY: 366.2 },
  { Icon: Building, label: "高度地区", value: "指定なし", sub: "（最高限度なし）", iconY: 374.3, labelY: 377.6, valueY: 372.5, subY: 382.3, lineY: 395.6 },
  { Icon: Flame, label: "防火地域", value: "防火地域", iconY: 401.4, labelY: 403.3, valueY: 403, lineY: 418.5 },
  { Icon: MapIcon, label: "都市計画", value: "都市計画区域内", sub: "（市街化区域）", iconY: 426.9, labelY: 429.6, valueY: 424.2, subY: 435.5, lineY: 448.6 },
  { Icon: RoadIcon, label: "接道", value: "北側 公道", sub: "（幅員 約11.0m）", iconY: 457, labelY: 460.2, valueY: 455.4, subY: 466, lineY: 479.6 },
  { Icon: WidthIcon, label: "道路幅員", value: "約11.0m", iconY: 487.3, labelY: 488.3, valueY: 487.3, lineY: 503.4 },
  { Icon: SlopeIcon, label: "斜線制限", value: "道路斜線・隣地斜線", sub: "北側斜線／隣地斜線", iconY: 512.4, labelY: 514.6, valueY: 511.2, subY: 521.8, lineY: 535.3 },
  { Icon: Sun, label: "日影規制", value: "指定あり", sub: "（測定面 4.0m）", iconY: 543.5, labelY: 546.4, valueY: 542.3, subY: 553.7, lineY: 566.6 },
  { Icon: TreePine, label: "景観関連", value: "渋谷区景観計画区域", sub: "（一般地域）", iconY: 573.8, labelY: 579.2, valueY: 573.8, subY: 584.5 },
];

const LEGEND: { color: string; label: string; x: number; y: number }[] = [
  { color: "#f7a7ba", label: "商業地域", x: 24.6, y: 527.5 },
  { color: "#f9aa6c", label: "近隣商業地域", x: 103.6, y: 527.5 },
  { color: "#fbe38e", label: "第一種住居地域", x: 24.6, y: 546.9 },
  { color: "#b8a1e0", label: "準工業地域", x: 103.6, y: 546.9 },
  { color: "#d1e8bb", label: "第一種低層住居専用地域", x: 24.6, y: 566.9 },
];

const NOTES: { x: number; w: number; icon: React.ReactNode; title: string; titleX: number; lines: string[] }[] = [
  { x: 19.4, w: 115, icon: <AlertFill size={13} style={at(28.5, 639.9)} />, title: "防火地域での建築制限", titleX: 50.6, lines: ["防火地域のため、耐火建築物", "または準耐火建築物の建築が", "必要です。"] },
  { x: 140.1, w: 110.5, icon: <TowersFill size={14} style={at(148.4, 635.6)} />, title: "容積率の活用", titleX: 170.4, lines: ["容積率500%のため、敷地規模", "に応じた中高層建築物の計画", "が可能です。"] },
  { x: 256.3, w: 118.4, icon: <SunFill size={15} style={at(265.1, 637.4)} />, title: "日影規制への配慮", titleX: 289.7, lines: ["周辺の中高層建築物に配慮し、", "日影規制への適合が必要です。"] },
];

export function LawTab() {
  return (
    <div className="absolute left-0" style={{ top: 0, width: 393 }}>
      {/* 地図（今は無し）：用途地域の色の地図が入る */}
      <MapSlot className="rounded-[7px]" style={at(14.8, 297.6, 177.7, 200.4)}>
        <div className="absolute flex items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(10,30,60,0.15)]" style={at(154.9, 6.5, 18.2, 18.2)}>
          <Expand size={9} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" />
        </div>
      </MapSlot>
      <PinMark style={at(96.8, 367, 16.6, 24.4)} />
      <div className="absolute flex items-center justify-center rounded-full bg-white shadow-[0_1px_5px_rgba(10,30,60,0.14)]" style={at(53.5, 399.1, 106, 14.1)}>
        <span className="leading-none" style={{ fontSize: 6.1, fontWeight: 600, color: "#1d2433", marginTop: -1 }}>
          {ADDRESS}
        </span>
      </div>
      <div className="absolute rounded-[9px] bg-white shadow-[0_1px_6px_rgba(10,30,60,0.14)]" style={at(20, 471.3, 111.7, 20.5)}>
        <MapIcon size={9.5} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" style={at(6.9, 5.5)} />
        <span className="absolute leading-none" style={{ left: 23.3, top: 6.4, fontSize: 7.07, color: "#1d2433" }}>
          都市計画図で確認する
        </span>
        <ChevronRight size={7.5} strokeWidth={1.5} absoluteStrokeWidth color="#1d2433" style={at(99.5, 6.6)} />
      </div>

      {/* 右：法令の表 */}
      <div className="absolute rounded-[7px] border border-[#e9eef4] bg-white" style={at(199.8, 297.6, 178.6, 299)} />
      {ROWS.map((r) => (
        <div key={r.label}>
          <r.Icon size={12} strokeWidth={1.3} absoluteStrokeWidth color={ICON} style={at(206, r.iconY)} />
          <T x={231.9} y={r.labelY} s={6.9} c={LABEL}>
            {r.label}
          </T>
          {r.chip ? (
            <div className="absolute flex items-center justify-center rounded-[4px] bg-[#fbdcef]" style={at(283.6, 301.4, 44, 15.5)}>
              <span className="leading-none" style={{ fontSize: 7.6, fontWeight: 700, color: "#c0168a" }}>
                商業地域
              </span>
            </div>
          ) : (
            <T x={284.4} y={r.valueY} s={r.latin ? 7.95 : r.label === "斜線制限" ? 7.15 : 7.5} w={600} c={INK} latin={r.latin}>
              {r.value}
            </T>
          )}
          {r.sub && (
            <T x={283.6} y={(r.subY ?? 0) - 0.8} s={r.label === "斜線制限" ? 6.8 : 7} c="#6b7486" style={{ fontFeatureSettings: '"palt"' }}>
              {r.sub}
            </T>
          )}
          <ChevronRight size={7.5} strokeWidth={1.15} absoluteStrokeWidth color="#1d2b48" style={at(368.6, (r.iconY + 6) - 3.7)} />
          {r.lineY && <div className="absolute bg-[#eef2f6]" style={at(205, r.lineY, 168.5, 0.6)} />}
        </div>
      ))}

      {/* 用途地域の凡例 */}
      <div className="absolute rounded-[8px] bg-[#eef4fb]" style={at(14.8, 503.5, 177.7, 94.5)} />
      <T x={24.6} y={511.2} s={7.72} w={700} c="#1c2740">
        用途地域<span style={{ fontSize: 6.9, fontWeight: 400, color: "#5d6880", marginLeft: -0.4 }}>（都市計画図・凡例）</span>
      </T>
      {LEGEND.map((l) => (
        <div key={l.label}>
          <div className="absolute rounded-[3px]" style={{ ...at(l.x, l.y, 20, 12.6), background: l.color }} />
          <T x={l.x + 27.3} y={l.y + 4} s={6.27} c="#3f4a5f">
            {l.label}
          </T>
        </div>
      ))}

      {/* 建築時の注意点 */}
      <div className="absolute rounded-[8px] bg-[#eef4fb]" style={at(14.8, 604, 363.3, 96)} />
      <DocFill size={15.5} style={at(23.1, 611.6)} />
      <T x={48.5} y={615.9} s={8.95} w={700} c="#1c2740">
        建築時の注意点
      </T>
      <T x={329.2} y={617} s={7} w={500} c="#1f6fe0">
        もっと見る
      </T>
      <ChevronRight size={8} strokeWidth={1.5} absoluteStrokeWidth color="#1f6fe0" style={at(366.2, 616.1)} />
      {NOTES.map((n) => (
        <div key={n.title}>
          <div className="absolute rounded-[7px] bg-white" style={at(n.x, 631.2, n.w, 67.8)} />
          {n.icon}
          <T x={n.titleX} y={642.2} s={n.titleX > 280 ? 7.05 : 7.4} w={700} c="#1c2740">
            {n.title}
          </T>
          {n.lines.map((line, i) => (
            <T key={line} x={n.x + 9.1} y={658.9 + i * 11.4} s={n.x < 100 || n.x > 250 ? 7.45 : 7.1} c="#5d6880">
              {line}
            </T>
          ))}
        </div>
      ))}

      {/* 既存不適格の確認 */}
      <div className="absolute rounded-[8px] bg-[#edf7f1]" style={at(14.8, 705.6, 363.3, 33)} />
      <CheckFill size={14.5} style={at(22.1, 714.3)} />
      <T x={45.1} y={714} s={7.2} w={700} c="#1c2740">
        既存不適格の確認
      </T>
      <T x={45.1} y={725.4} s={6.53} c="#5d6880">
        建築時期や増改築の履歴により、既存不適格となる可能性があります。現地・台帳にて詳細をご確認ください。
      </T>
    </div>
  );
}
