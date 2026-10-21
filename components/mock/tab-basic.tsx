// モック画面「基本情報」タブ（デザインの絵 1枚目）。数字や住所は絵の見本のまま
import { Building, Building2, ChevronLeft, ChevronRight, Clock, Expand, FileText, House, Landmark, LandPlot, Map as MapIcon, MapPin, School, Settings, ShoppingCart, SquareArrowOutUpRight, Store, TrainFront, TreeDeciduous, Triangle } from "lucide-react";
import { at, MapSlot, NoImage, PinDot, PinMark, T } from "./kit";
import { CoinStack, GrowthChart } from "./icons";
import type { MockTab } from "./mock-app";

const ADDRESS = "東京都渋谷区神南１丁目１９-１１";

type Row = { label: string; value: React.ReactNode; Icon: typeof MapPin; top: number; labelY: number; valueY: number; latin?: boolean };

const ROWS: Row[] = [
  { label: "所在地", value: ADDRESS, Icon: MapPin, top: 402.5, labelY: 408.2, valueY: 407.8 },
  { label: "地番", value: "１丁目１９番１１号", Icon: LandPlot, top: 420.5, labelY: 426.7, valueY: 426.7 },
  { label: "住居表示", value: ADDRESS, Icon: House, top: 438.6, labelY: 444.7, valueY: 444.7 },
  { label: "用途地域", value: null, Icon: MapIcon, top: 457.1, labelY: 463.6, valueY: 0 },
  { label: "建ぺい率", value: "80%", Icon: Triangle, top: 476, labelY: 481.6, valueY: 482, latin: true },
  { label: "容積率", value: "500%", Icon: Settings, top: 493.8, labelY: 498.6, valueY: 499.1, latin: true },
  { label: "土地面積（公簿）", value: "123.45㎡（約37.34坪）", Icon: Building, top: 510.4, labelY: 517.3, valueY: 516.6, latin: true },
  { label: "現況", value: "建物あり", Icon: Building2, top: 527.9, labelY: 533.7, valueY: 533.2 },
  { label: "地目", value: "宅地", Icon: Clock, top: 545.9, labelY: 551.7, valueY: 551.2 },
  { label: "都市計画", value: "市街化区域", Icon: Landmark, top: 563.9, labelY: 569.2, valueY: 569.2 },
  { label: "防火地域", value: "防火地域", Icon: Settings, top: 581.7, labelY: 587.2, valueY: 587.2 },
];

const FACILITIES: { name: string; dist: string; walk: string; color: string; Icon: typeof MapPin; x: number; w: number; ls?: number }[] = [
  { name: "渋谷駅", dist: "480 m", walk: "徒歩６分", color: "#1f63f0", Icon: TrainFront, x: 15.2, w: 69.7 },
  { name: "神南小学校", dist: "620 m", walk: "徒歩８分", color: "#1f63f0", Icon: School, x: 91.3, w: 66 },
  { name: "セブンイレブン", dist: "160 m", walk: "徒歩２分", color: "#10b07a", Icon: Store, x: 164.7, w: 66.9, ls: -1.45 },
  { name: "東急ストア", dist: "380 m", walk: "徒歩５分", color: "#f7802f", Icon: ShoppingCart, x: 238.5, w: 66.4 },
  { name: "宮下公園", dist: "310 m", walk: "徒歩４分", color: "#16b07a", Icon: TreeDeciduous, x: 312.3, w: 66.4 },
];

export function BasicTab({ onTab }: { onTab: (t: Exclude<MockTab, "price">) => void }) {
  return (
    <>
      {/* 地図（今は無し）。ピン・住所の吹き出し・拡大・地図アプリで開く */}
      <MapSlot className="rounded-[8px]" style={at(15.2, 305.8, 179.5, 208)}>
        <div className="absolute flex items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(10,30,60,0.15)]" style={at(154.8, 5.2, 19.5, 19.5)}>
          <Expand size={9.5} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" />
        </div>
        <PinMark style={at(82.8, 63.2, 19, 25.3)} />
        <PinDot style={at(88.8, 89.2, 7, 7)} />
        <div className="absolute flex items-center justify-center rounded-full bg-white shadow-[0_1px_5px_rgba(10,30,60,0.14)]" style={at(39.8, 98.2, 105, 19)}>
          <span className="leading-none" style={{ fontSize: 5.87, fontWeight: 600, color: "#1d2433" }}>
            {ADDRESS}
          </span>
        </div>
        <div className="absolute rounded-full bg-white shadow-[0_1px_6px_rgba(10,30,60,0.14)]" style={at(4.8, 177.8, 103, 24)}>
          <SquareArrowOutUpRight size={9.5} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" style={at(10, 7.2)} />
          <span className="absolute leading-none" style={{ left: 25.5, top: 7.2, fontSize: 7.38, color: "#1d2433" }}>
            地図アプリで開く
          </span>
          <ChevronRight size={7} strokeWidth={1.4} absoluteStrokeWidth color="#1d2433" style={at(88, 8.6)} />
        </div>
      </MapSlot>

      {/* 建物の写真（今は無し）。左右の矢印と枚数 */}
      <NoImage className="rounded-[8px]" style={at(202.5, 305.8, 176.2, 90.4)} />
      <Arrow x={207.5} y={376} dir="left" />
      <Arrow x={358} y={376} dir="right" />
      <T x={336.5} y={381.6} s={7.6} c="#fff" latin ls={1.15} style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}>
        1/5
      </T>

      {/* 物件の要点の表 */}
      {ROWS.map((r, i) => (
        <div key={r.label}>
          <r.Icon size={8.2} strokeWidth={1.1} absoluteStrokeWidth color="#5a6b81" style={at(207.8, r.top + 5)} />
          <T x={224.6} y={r.labelY + 0.5} s={6.29} c="#6b778a">
            {r.label === "土地面積（公簿）" ? (
              <>
                土地面積<span style={{ fontFeatureSettings: '"palt"' }}>（公簿）</span>
              </>
            ) : (
              r.label
            )}
          </T>
          {r.value !== null ? (
            <T x={277.7} y={r.valueY + 0.2} s={r.latin ? 6.98 : 6.67} c="#1a2232" latin={r.latin} ls={r.label === "土地面積（公簿）" ? 0.45 : 0}>
              {r.value}
            </T>
          ) : (
            <div className="absolute flex items-center justify-center rounded-[4px] bg-[#fadbf6]" style={at(276.7, 459.3, 38.8, 15.1)}>
              <span className="leading-none" style={{ fontSize: 7.4, color: "#a03f95" }}>
                商業地域
              </span>
            </div>
          )}
          {i < ROWS.length - 1 && <div className="absolute bg-[#eef2f6]" style={at(207.8, (ROWS[i + 1].top ?? 0) - 0.3, 170.9, 0.6)} />}
        </div>
      ))}

      {/* 土地の参考価格 */}
      <div className="absolute rounded-[6px] bg-[#ebf4fd]" style={at(15.7, 520.8, 179, 49.4)} />
      <CoinStack size={19} color="#1c3a6a" style={at(24.8, 530.4)} />
      <T x={55} y={528.6} s={7.49} c="#1a2333" w={500}>
        土地の参考価格<span style={{ color: "#6b7a8f", fontWeight: 400 }}>（公示地価）</span>
      </T>
      <T x={54.5} y={542} s={14} w={700} c="#0f1623" latin>
        2,430,000
        <span style={{ fontSize: 9.6, fontWeight: 500, marginLeft: 4, color: "#1a2232" }}>円/㎡</span>
      </T>
      <T x={55} y={557.2} s={7.6} c="#66758a" latin>
        (約8,033,000 円/坪)
      </T>
      <ChevronRight size={10} strokeWidth={1.5} absoluteStrokeWidth color="#1c3460" style={at(176.5, 541)} />

      {/* 周辺の取引相場 */}
      <div className="absolute rounded-[6px] bg-[#eef8f2]" style={at(15.2, 576.1, 179.5, 47.5)} />
      <GrowthChart size={18} color="#12b076" style={at(25.5, 586)} />
      <T x={55.5} y={584.7} s={7.66} c="#1a2333" w={500}>
        周辺の取引相場（直近1年）
      </T>
      <T x={55.5} y={599.2} s={9.89} w={600} c="#111827" latin>
        2,200,000 〜 2,850,000
        <span style={{ fontSize: 8, fontWeight: 500, marginLeft: 3 }}>円/㎡</span>
      </T>
      <div className="absolute rounded-full bg-[#d5eee2]" style={at(55, 613, 130, 2.6)} />
      <div className="absolute rounded-full bg-[#71d3ab]" style={at(55, 613, 85, 2.6)} />
      <div className="absolute rounded-full bg-[#08a86f]" style={at(137.5, 611.3, 5.6, 5.6)} />

      {/* 周辺の施設 */}
      <T x={16.1} y={632.8} s={9.8} w={700} c="#111827">
        周辺の施設
      </T>
      <T x={330.6} y={631.8} s={7.6} w={500} c="#1f5fd1">
        もっと見る
      </T>
      <ChevronRight size={8} strokeWidth={1.4} absoluteStrokeWidth color="#1f5fd1" style={at(370.5, 630.6)} />
      {FACILITIES.map((f) => (
        <div key={f.name}>
          <div className="absolute rounded-[7px] bg-white shadow-[0_1px_5px_rgba(20,45,85,0.11)]" style={at(f.x, 647.2, f.w, 70)} />
          <NoImage small className="rounded-t-[7px]" style={at(f.x, 647.2, f.w, 37.5)} />
          <div className="absolute flex items-center justify-center rounded-full bg-white" style={at(f.x + 4.4, 673.4, 22, 22)}>
            <f.Icon size={12} strokeWidth={1.6} absoluteStrokeWidth color={f.color} />
          </div>
          <T x={f.x + 7} y={694.1} s={6.6} w={700} c="#111827" ls={f.ls}>
            {f.name}
          </T>
          <T x={f.x + f.w - 5.5} y={696} s={6.22} c="#6a7891" latin align="right">
            {f.dist}
          </T>
          <T x={f.x + 7.1} y={707} s={6.38} w={500} c="#f0232d">
            {f.walk}
          </T>
        </div>
      ))}

      {/* 周辺の取引事例・法令・規制の詳細 */}
      <button onClick={() => onTab("deals")} className="absolute rounded-[8px] bg-[#f1f6fc]" style={at(15.2, 725.6, 178.5, 39.2)} />
      <GrowthChart size={20} color="#1a3263" style={{ ...at(26.5, 735.5), pointerEvents: "none" }} />
      <T x={59} y={736.4} s={9.2} w={700} c="#111827" className="pointer-events-none">
        周辺の取引事例
      </T>
      <T x={59} y={749.4} s={7.05} c="#5f6d84" className="pointer-events-none">
        近隣の売買・賃貸事例を確認
      </T>
      <ChevronRight size={10} strokeWidth={1.5} absoluteStrokeWidth color="#1a2f5a" style={{ ...at(174.5, 741.5), pointerEvents: "none" }} />

      <button onClick={() => onTab("law")} className="absolute rounded-[8px] bg-[#f1f6fc]" style={at(200.7, 725.6, 177.5, 39.2)} />
      <FileText size={21} strokeWidth={1.7} absoluteStrokeWidth color="#6d32f2" style={{ ...at(213.5, 735), pointerEvents: "none" }} />
      <T x={246} y={735.8} s={9.23} w={700} c="#111827" className="pointer-events-none">
        法令・規制の詳細
      </T>
      <T x={246} y={749.4} s={7.05} c="#5f6d84" className="pointer-events-none">
        用途地域・建築制限などを確認
      </T>
      <ChevronRight size={10} strokeWidth={1.5} absoluteStrokeWidth color="#1a2f5a" style={{ ...at(358.5, 741.5), pointerEvents: "none" }} />
    </>
  );
}

function Arrow({ x, y, dir }: { x: number; y: number; dir: "left" | "right" }) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return (
    <div className="absolute flex items-center justify-center rounded-full bg-white/80" style={at(x, y, 15.3, 15.3)}>
      <Icon size={9} strokeWidth={1.5} absoluteStrokeWidth color="#26344a" />
    </div>
  );
}
