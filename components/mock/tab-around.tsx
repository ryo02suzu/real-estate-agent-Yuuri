// モック画面「周辺環境」タブ（デザインの絵 2枚目）。座標は絵の座標のまま（上の部分は layouts.ts の絵ごとの配置）
import { Baby, Car, ChevronRight, Cross, Expand, FileText, MapPin, ShieldCheck, ShoppingCart, SquareArrowOutUpRight, Store, TrainFront, Utensils } from "lucide-react";
import { at, MapSlot, NoImage, PinMark, T } from "./kit";
import { AwardFill, BarsFill, CapFill, CutleryFill, HospitalFill, PillIcon, StarMark, TrainOutline, TreeFill, Walker } from "./icons";

const BLUE = "#1f6fe0";
const RED = "#f0263a";
const GRAY = "#5d6880";

const ADDRESS = "東京都渋谷区神南１丁目１９-１１";

/** 「もっと見る ›」 */
function More({ x, y }: { x: number; y: number }) {
  return (
    <>
      <T x={x} y={y - 0.8} s={6.7} w={500} c={BLUE}>
        もっと見る
      </T>
      <ChevronRight size={7} strokeWidth={1.5} absoluteStrokeWidth color={BLUE} style={at(x + 36.6, y - 0.8)} />
    </>
  );
}

/** 「🚶 徒歩 6分　📍 約480 m」 */
function Walk({ x, y, walk, dist }: { x: number; y: number; walk: string; dist: string }) {
  return (
    <>
      <Walker size={10.8} color="#5d6880" style={at(x - 3.7, y - 3)} />
      <T x={x + 8.7} y={y - 0.5} s={7.6} w={700} c={RED}>
        {walk.split(" ")[0]}
        <span style={{ marginLeft: 2.6 }}>{walk.split(" ")[1]}</span>
      </T>
      <MapPin size={8.4} strokeWidth={1.1} absoluteStrokeWidth color="#5d6880" style={at(x + 48.4, y - 1.1)} />
      <T x={x + 58} y={y} s={6.7} c={GRAY}>
        {dist.replace(" m", "")}
        <span style={{ marginLeft: 1.6 }}>m</span>
      </T>
    </>
  );
}

/** 地図の上の施設の印（色の丸に白いアイコン） */
function Poi({ cx, cy, color, children, d = 12.4 }: { cx: number; cy: number; color: string; children: React.ReactNode; d?: number }) {
  return (
    <div className="absolute flex items-center justify-center rounded-full border border-white text-white shadow-[0_1px_2px_rgba(0,0,0,0.25)]" style={{ ...at(cx - d / 2, cy - d / 2, d, d), background: color }}>
      {children}
    </div>
  );
}

const CATS: {
  x: number;
  y: number;
  title: string;
  icon: React.ReactNode;
  name: string;
  sub: string;
  sub2Bold?: boolean;
  latinSub?: boolean;
  walk: string;
  dist: string;
}[] = [
  { x: 14.1, y: 433.5, title: "コンビニエンスストア", icon: <Store size={14.5} strokeWidth={2} absoluteStrokeWidth color="#ef4444" />, name: "セブン-イレブン", sub: "渋谷神南１丁目店", walk: "徒歩 2分", dist: "約160 m" },
  { x: 199.5, y: 433.5, title: "スーパーマーケット", icon: <ShoppingCart size={14.5} strokeWidth={2.2} absoluteStrokeWidth color="#f59a23" />, name: "東急ストア", sub: "渋谷店", walk: "徒歩 5分", dist: "約382 m" },
  { x: 14.1, y: 510, title: "公園", icon: <TreeFill size={14} color="#1e9e55" />, name: "宮下公園", sub: "MIYASHITA PARK", latinSub: true, walk: "徒歩 4分", dist: "約310 m" },
  { x: 199.5, y: 510, title: "病院", icon: <HospitalFill size={14} color="#e8423f" />, name: "東邦大学医療センター", sub: "渋谷病院", sub2Bold: true, walk: "徒歩 12分", dist: "約900 m" },
  { x: 14.1, y: 586.1, title: "ドラッグストア", icon: <PillIcon size={14} color="#5b6df2" />, name: "マツモトキヨシ", sub: "渋谷Part1店", walk: "徒歩 3分", dist: "約210 m" },
  { x: 199.5, y: 586.1, title: "飲食店", icon: <CutleryFill size={14} color="#f59a23" />, name: "RACINES 渋谷", sub: "カフェ・レストラン", walk: "徒歩 4分", dist: "約300 m" },
];

const RATINGS: { label: string; Icon: typeof Car; fill: number; value: string }[] = [
  { label: "交通の利便性", Icon: Car, fill: 0.5, value: "4.9" },
  { label: "買い物の利便性", Icon: ShoppingCart, fill: 0.5, value: "4.7" },
  { label: "飲食店の充実度", Icon: Utensils, fill: 0, value: "4.6" },
  { label: "医療の利便性", Icon: Cross, fill: 0, value: "4.3" },
  { label: "子育て環境", Icon: Baby, fill: 0, value: "4.2" },
  { label: "治安・安全性", Icon: ShieldCheck, fill: 0, value: "4.4" },
];

export function AroundTab() {
  return (
    <div className="absolute left-0" style={{ top: 0, width: 393 }}>
      {/* 地図（今は無し）と施設の印 */}
      <MapSlot className="rounded-[7px]" style={at(14.8, 262.8, 185.2, 164.4)}>
        <div className="absolute flex items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(10,30,60,0.15)]" style={at(162.8, 6.2, 17.8, 17.8)}>
          <Expand size={9} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" />
        </div>
      </MapSlot>
      <Poi cx={31.4} cy={305.7} color="#f39a1c">
        <StarMark size={6.5} color="#fff" empty="#fff" />
      </Poi>
      <Poi cx={65} cy={302.6} color="#6b7280">
        <span className="h-[4px] w-[4px] rounded-full bg-white" />
      </Poi>
      <Poi cx={128.6} cy={300.5} color="#2b7de0">
        <span className="h-[4px] w-[4px] rounded-full bg-white" />
      </Poi>
      <Poi cx={114} cy={286.3} color="#5cb85c">
        <TreeFill size={6.5} color="#fff" />
      </Poi>
      <Poi cx={150.9} cy={328.9} color="#1a9a52">
        <TreeFill size={6.5} color="#fff" />
      </Poi>
      <Poi cx={53.2} cy={339.3} color="#1f6fe0">
        <StarMark size={6.5} color="#fff" empty="#fff" />
      </Poi>
      <Poi cx={184.3} cy={348.3} color="#f39a1c">
        <CutleryFill size={6.5} color="#fff" />
      </Poi>
      <Poi cx={51.1} cy={364.1} color="#f4a050">
        <ShoppingCart size={6.5} strokeWidth={1.4} absoluteStrokeWidth color="#fff" />
      </Poi>
      <Poi cx={97.4} cy={374.3} color="#e64646">
        <HospitalFill size={6.5} color="#e64646" />
      </Poi>
      <Poi cx={125.3} cy={368.9} color="#fff">
        <TrainFront size={7.5} strokeWidth={1.4} absoluteStrokeWidth color="#1d3264" />
      </Poi>
      <Poi cx={181.4} cy={371.8} color="#5a6888">
        <StarMark size={6.5} color="#fff" empty="#fff" />
      </Poi>
      <Poi cx={72.6} cy={387.3} color="#19b5d6">
        <TreeFill size={6.5} color="#fff" />
      </Poi>
      <Poi cx={166.8} cy={384.9} color="#d93636">
        <CutleryFill size={6.5} color="#fff" />
      </Poi>
      <Poi cx={112.2} cy={395.1} color="#1f6fe0" d={11}>
        <TrainFront size={7} strokeWidth={1.4} absoluteStrokeWidth color="#fff" />
      </Poi>
      <PinMark style={at(96.8, 316.3, 16.6, 22)} />
      <div className="absolute flex items-center justify-center rounded-full bg-white shadow-[0_1px_5px_rgba(10,30,60,0.14)]" style={at(55.8, 342, 107.5, 15)}>
        <span className="leading-none" style={{ fontSize: 6.07, fontWeight: 600, color: "#1d2433" }}>
          {ADDRESS}
        </span>
      </div>
      <div className="absolute rounded-full bg-white shadow-[0_1px_6px_rgba(10,30,60,0.14)]" style={at(19.4, 406, 89.9, 18.7)}>
        <SquareArrowOutUpRight size={9} strokeWidth={1.3} absoluteStrokeWidth color="#1c3a63" style={at(6.8, 4.8)} />
        <span className="absolute leading-none" style={{ left: 23.9, top: 5, fontSize: 6.7, color: "#1d2433" }}>
          地図アプリで開く
        </span>
        <ChevronRight size={7} strokeWidth={1.4} absoluteStrokeWidth color="#1d2433" style={at(79.4, 6)} />
      </div>

      {/* 最寄り駅 */}
      <Card x={204.9} y={262.8} w={174} h={83.8} />
      <TrainOutline size={14.6} stroke={1.9} color="#5b6df2" style={at(212.4, 267.6)} />
      <T x={235.7} y={270.4} s={7.46} w={700} c="#141b2b">
        最寄り駅
      </T>
      <More x={331.6} y={272.2} />
      <NoImage small className="rounded-[4px]" style={at(211.2, 285.8, 71.5, 48.1)} />
      <T x={289} y={287.3} s={7.5} w={700} c="#141b2b">
        渋谷駅
      </T>
      {["JR山手線・埼京線", "東京メトロ各線", "東急各線・京王井の頭線"].map((l, i) => (
        <T key={l} x={289} y={[298.8, 307.6, 316.8][i]} s={6.95} c="#6b7486">
          {l}
        </T>
      ))}
      <Walk x={289.4} y={331.6} walk="徒歩 6分" dist="約480 m" />

      {/* 学校 */}
      <Card x={204.9} y={351.1} w={174} h={76.1} />
      <CapFill size={15.5} color="#169b5d" style={at(211.7, 355.3)} />
      <T x={235.7} y={358.9} s={7.57} w={700} c="#141b2b">
        学校
      </T>
      <More x={331.6} y={360.2} />
      <NoImage small className="rounded-[4px]" style={at(211.2, 373.5, 71.5, 48.1)} />
      <T x={289.1} y={377.3} s={7.6} w={700} c="#141b2b">
        神南小学校
      </T>
      <T x={289.1} y={388.1} s={6.7} c="#6b7486">
        渋谷区立神南小学校
      </T>
      <Walk x={289.4} y={410.3} walk="徒歩 9分" dist="約620 m" />

      {/* 施設の種類ごとのカード（2列×3段） */}
      {CATS.map((c) => (
        <div key={c.title}>
          <Card x={c.x} y={c.y} w={c.x < 100 ? 180.4 : 178.9} h={c.y === 433.5 ? 72 : 71.5} />
          <div className="absolute" style={at(c.x + 8.3, c.y + 5.2)}>
            {c.icon}
          </div>
          <T x={c.x + 29.6} y={c.y + 7} s={7.6} w={700} c="#141b2b" style={{ fontFeatureSettings: '"palt"' }}>
            {c.title}
          </T>
          <More x={c.x + 132.4} y={c.y + 8.7} />
          <NoImage small className="rounded-[4px]" style={at(c.x + 6.3, c.y + 22.7, 76.8, 44.3)} />
          <T x={c.x + 90} y={c.y + 25.3} s={7.65} w={700} c="#141b2b">
            {c.name}
          </T>
          <T x={c.x + 90} y={c.y + (c.sub2Bold ? 35.4 : 37.2)} s={c.sub2Bold ? 7.8 : c.latinSub ? 7.5 : 6.85} w={c.sub2Bold ? 700 : 400} c={c.sub2Bold ? "#141b2b" : "#6b7486"} latin={c.latinSub}>
            {c.sub}
          </T>
          <Walk x={c.x + 89.8} y={c.y + 57.7} walk={c.walk} dist={c.dist} />
        </div>
      ))}

      {/* 生活利便性 */}
      <div className="absolute rounded-[8px] bg-[#eef4fb]" style={at(14.9, 662.3, 172.7, 101.6)} />
      <div className="absolute rounded-[7px] bg-white" style={at(17.8, 682.9, 167, 79.6)} />
      <BarsFill size={11.5} color="#7e8fb0" style={at(21.4, 668.4)} />
      <T x={42.4} y={668.6} s={8.15} w={700} c="#1c2740">
        生活利便性
      </T>
      <div className="absolute flex items-center justify-center rounded-full bg-[#aab5c7] text-white" style={at(86.7, 669.4, 7.8, 7.8)}>
        <span className="font-bold leading-none" style={{ fontSize: 6 }}>
          ?
        </span>
      </div>
      {RATINGS.map((r, i) => {
        const y = 688.3 + i * 12.35;
        return (
          <div key={r.label}>
            <r.Icon size={9.5} strokeWidth={1.3} absoluteStrokeWidth color="#1d2b48" style={at(24.8, y - 1.6)} />
            <T x={42.6} y={y - 1} s={6.6} c="#4d576b">
              {r.label}
            </T>
            {[0, 1, 2, 3, 4].map((k) => (
              <StarMark key={k} size={6.4} fill={k < 4 ? 1 : r.fill} style={at(108.7 + k * 8.25, y - 0.6)} />
            ))}
            <T x={157.6} y={y + 0.2} s={6.95} c="#4d576b" latin>
              {r.value}
            </T>
          </div>
        );
      })}

      {/* 周辺環境総合評価 */}
      <div className="absolute rounded-[8px] bg-[#e9f2fc]" style={at(193.5, 662.3, 184.5, 101.6)} />
      <div className="absolute flex items-center justify-center rounded-full bg-[#d8e7f8]" style={at(202.8, 670.1, 25.6, 25.6)}>
        <AwardFill size={14} color="#1f6fe0" />
      </div>
      <T x={232.9} y={670.3} s={7.85} w={700} c="#1d2a44">
        周辺環境総合評価
      </T>
      <T x={231} y={684.9} s={24} w={700} c="#13284e" latin>
        4.6
      </T>
      <T x={272.5} y={693.6} s={11.75} c="#1d2a44" latin>
        /5.0
      </T>
      {[0, 1, 2, 3, 4].map((k) => (
        <StarMark key={k} size={11.2} fill={k < 4 ? 1 : 0.5} color="#13284e" style={at(300.5 + k * 9.9, 689.6)} />
      ))}
      <T x={233.6} y={711.6} s={7.17} c="#4f5b70">
        渋谷の利便性と快適な住環境が
      </T>
      <T x={233.6} y={721.4} s={7.17} c="#4f5b70">
        バランスよく整ったエリアです。
      </T>
      <div className="absolute rounded-full bg-[#133664]" style={at(199.2, 734.1, 174.3, 24.2)} />
      <FileText size={11} strokeWidth={1.4} absoluteStrokeWidth color="#fff" style={at(223.3, 742.4)} />
      <T x={241.8} y={742.5} s={8.04} w={600} c="#fff">
        詳しい周辺環境レポートを作成
      </T>
      <ChevronRight size={9} strokeWidth={1.6} absoluteStrokeWidth color="#fff" style={at(347.4, 741.7)} />
    </div>
  );
}

function Card({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <div className="absolute rounded-[7px] border border-[#e9eef4] bg-white shadow-[0_1px_4px_rgba(20,45,85,0.05)]" style={at(x, y, w, h)} />;
}
