// モック画面「取引事例」タブ（デザインの絵 5枚目）。座標は絵の座標のまま（上の部分は layouts.ts の絵ごとの配置）
import { ChevronDown, ChevronRight, CircleDot, JapaneseYen } from "lucide-react";
import { at, NoImage, T } from "./kit";
import { BarsFill, GrowthChart } from "./icons";


const NAVY = "#143a6c";
const INK = "#141b2b";
const SUB = "#5d6880";

/** 絞り込み（x・幅は枠、tx は字の左端、cx は下向きの矢印の左端） */
const CHIPS: { label: string; x: number; w: number; tx: number; cx?: number; on?: boolean }[] = [
  { label: "すべて", x: 14.6, w: 41, tx: 25, on: true },
  { label: "売買", x: 62.4, w: 34.2, tx: 73.3 },
  { label: "賃貸", x: 104.3, w: 33.7, tx: 114.8 },
  { label: "価格の安い順", x: 153.1, w: 75.1, tx: 163.9, cx: 214 },
  { label: "直近1年", x: 235.6, w: 59.7, tx: 246.8, cx: 280.5 },
  { label: "徒歩10分圏内", x: 303.5, w: 76.8, tx: 314.2, cx: 365.7 },
];

type Line = { label: string; value: React.ReactNode; y: number; kind: "area" | "big" | "unit" };
type Deal = {
  /** 行のカードの上下と、写真・種類の札・左の文字の位置（すべて絵の座標） */
  top: number;
  bottom: number;
  photoY: number;
  photoH: number;
  chipY: number;
  chipH: number;
  kind: "売買" | "賃貸";
  address: string;
  addrY: number;
  date: string;
  dateY: number;
  walk: string;
  walkY: number;
  lines: Line[];
  note: string;
  noteY: number;
  chevY: number;
  divider: [number, number];
};

const AREA = (a: string, b: string) => (
  <>
    {a}
    <span style={{ marginLeft: 1.6 }}>㎡</span>（{b}
    <span style={{ marginLeft: 1.6 }}>坪）</span>
  </>
);

/** 売買の行（土地・建物・価格・単価） */
const sale = (top: number, rest: Omit<Deal, "kind" | "lines" | "top"> & { land: [string, string]; bldg: [string, string]; price: string; unit: string; ys: [number, number, number, number] }): Deal => ({
  ...rest,
  top,
  kind: "売買",
  lines: [
    { label: "土地面積", value: AREA(...rest.land), y: rest.ys[0], kind: "area" },
    { label: "建物面積", value: AREA(...rest.bldg), y: rest.ys[1], kind: "area" },
    { label: "取引価格", value: rest.price, y: rest.ys[2], kind: "big" },
    { label: "単価", value: rest.unit, y: rest.ys[3], kind: "unit" },
  ],
});

/** 賃貸の行（専有面積・賃料・単価） */
const rent = (top: number, rest: Omit<Deal, "kind" | "lines" | "top"> & { area: [string, string]; price: string; unit: string; ys: [number, number, number] }): Deal => ({
  ...rest,
  top,
  kind: "賃貸",
  lines: [
    { label: "専有面積", value: AREA(...rest.area), y: rest.ys[0], kind: "area" },
    { label: "賃料", value: rest.price, y: rest.ys[1], kind: "big" },
    { label: "単価", value: rest.unit, y: rest.ys[2], kind: "unit" },
  ],
});

const DEALS: Deal[] = [
  sale(399.8, {
    bottom: 453.6,
    photoY: 400.3,
    photoH: 50.1,
    chipY: 402.6,
    chipH: 17.3,
    address: "東京都渋谷区神南1丁目１８-７",
    addrY: 417.1,
    date: "2024年11月 成約",
    dateY: 429.9,
    walk: "徒歩3分",
    walkY: 440.8,
    land: ["245.30", "74.20"],
    bldg: ["892.17", "269.78"],
    price: "6.80",
    unit: "2,767,000",
    ys: [400.3, 410.3, 420.8, 432.6],
    note: "（坪単価 約9,144,000円）",
    noteY: 443.6,
    chevY: 420.3,
    divider: [401.2, 448.6],
  }),
  rent(456.3, {
    bottom: 510,
    photoY: 457.2,
    photoH: 50.6,
    chipY: 459.9,
    chipH: 16,
    address: "東京都渋谷区神南１丁目２０-５",
    addrY: 475,
    date: "2024年10月 成約",
    dateY: 487.3,
    walk: "徒歩4分",
    walkY: 498.2,
    area: ["32.15", "9.72"],
    price: "240,000",
    unit: "7,460",
    ys: [461.8, 474.1, 486.8],
    note: "（坪単価 約24,700円）",
    noteY: 497.7,
    chevY: 478.6,
    divider: [460.9, 504.6],
  }),
  sale(513.2, {
    bottom: 572.4,
    photoY: 514.1,
    photoH: 54.7,
    chipY: 516.9,
    chipH: 16.8,
    address: "東京都渋谷区宇田川町３２-１２",
    addrY: 533.3,
    date: "2024年8月 成約",
    dateY: 546,
    walk: "徒歩6分",
    walkY: 556.9,
    land: ["118.62", "35.88"],
    bldg: ["356.11", "107.72"],
    price: "3.95",
    unit: "2,578,000",
    ys: [518.2, 528.7, 539.6, 551.9],
    note: "（坪単価 約8,522,000円）",
    noteY: 562.4,
    chevY: 538.3,
    divider: [518.2, 567.4],
  }),
  rent(575.6, {
    bottom: 629.3,
    photoY: 576.1,
    photoH: 51,
    chipY: 577.9,
    chipH: 16.8,
    address: "東京都渋谷区神南１丁目１９-８",
    addrY: 594.3,
    date: "2024年7月 成約",
    dateY: 607,
    walk: "徒歩1分",
    walkY: 618,
    area: ["28.44", "8.60"],
    price: "210,000",
    unit: "7,380",
    ys: [581.1, 592.9, 605.2],
    note: "（坪単価 約24,400円）",
    noteY: 617.5,
    chevY: 597.5,
    divider: [580.2, 623.9],
  }),
  sale(632.5, {
    bottom: 687.6,
    photoY: 634.4,
    photoH: 52.4,
    chipY: 636.6,
    chipH: 16.6,
    address: "東京都渋谷区神南１丁目１７-３",
    addrY: 653.5,
    date: "2024年5月 成約",
    dateY: 665.3,
    walk: "徒歩5分",
    walkY: 676.3,
    land: ["162.11", "49.04"],
    bldg: ["482.33", "145.90"],
    price: "4.90",
    unit: "2,740,000",
    ys: [638, 648, 659, 671.2],
    note: "（坪単価 約9,058,000円）",
    noteY: 682.2,
    chevY: 657.6,
    divider: [638, 685.4],
  }),
];

export function DealsTab() {
  return (
    <div className="absolute left-0" style={{ top: 0, width: 393 }}>
      <T x={14.6} y={286.3} s={11.2} w={700} c={INK}>
        周辺の取引事例
      </T>
      <T x={14.5} y={300.4} s={7.75} c={SUB}>
        このエリアの実際の成約事例から、価格の目安を確認できます。
      </T>

      {/* 絞り込み */}
      {CHIPS.map((c) => (
        <div key={c.label}>
          <div className="absolute rounded-[6px] border" style={{ ...at(c.x, 315.6, c.w, 20.9), background: c.on ? NAVY : "#fff", borderColor: c.on ? NAVY : "#e3e8ef" }} />
          <T x={c.tx} y={323.2} s={6.85} w={c.on ? 700 : 500} c={c.on ? "#fff" : "#26324a"} latin={/^[0-9]/.test(c.label)}>
            {c.label}
          </T>
          {c.cx !== undefined && <ChevronDown size={12} strokeWidth={1.4} absoluteStrokeWidth color="#26324a" style={at(c.cx - 3, 320.2)} />}
        </div>
      ))}

      {/* 3つの数字 */}
      <div className="absolute rounded-[7px] bg-[#edf5fd]" style={at(14.6, 344.7, 116.1, 55.1)} />
      <BarsFill size={15.5} color="#1f5fd1" style={at(23.8, 356.1)} />
      <T x={49.2} y={351.9} s={6.75} c="#3f4a5f">
        取引事例件数
      </T>
      <T x={49.2} y={363.8} s={10.8} w={700} c={INK}>
        24件
      </T>
      <T x={44.9} y={378.8} s={6.8} c={SUB}>
        （直近1年・半径500m）
      </T>

      <div className="absolute rounded-[7px] bg-[#fbe7f0]" style={at(138, 344.7, 119.8, 55.1)} />
      <div className="absolute flex items-center justify-center rounded-full bg-[#cd3279]" style={at(147.1, 355.7, 15.9, 15.9)}>
        <JapaneseYen size={9.5} strokeWidth={1.8} absoluteStrokeWidth color="#fff" />
      </div>
      <T x={172.6} y={352.9} s={6.75} c="#3f4a5f">
        売買の平均単価
      </T>
      <T x={172.1} y={365.6} s={10.6} w={700} c={INK} latin>
        2,580,000
        <span style={{ fontSize: 7.4, fontWeight: 600, marginLeft: 2.6 }}>円/㎡</span>
      </T>
      <T x={168.4} y={378.4} s={6.9} c={SUB}>
        （坪単価 約8,530,000円）
      </T>

      <div className="absolute rounded-[7px] bg-[#edf6f1]" style={at(265, 344.7, 116.2, 55.1)} />
      <GrowthChart size={15.5} color="#12a36a" style={at(276.2, 356.3)} />
      <T x={304.2} y={352.9} s={6.85} c="#3f4a5f">
        賃料の平均単価
      </T>
      <T x={303.7} y={365.1} s={10.8} w={700} c={INK} latin>
        22,500
        <span style={{ fontSize: 7.4, fontWeight: 600, marginLeft: 2.6 }}>円/㎡</span>
      </T>
      <T x={296.4} y={378.4} s={6.8} c={SUB}>
        （共益費除く・直近1年）
      </T>

      {/* 事例の一覧 */}
      {DEALS.map((d) => (
        <div key={d.address}>
          <div className="absolute rounded-[7px] border border-[#edf1f6] bg-white" style={at(89.3, d.top, 291.6, d.bottom - d.top)} />
          <div className="absolute bg-[#e8edf3]" style={at(225, d.divider[0], 0.6, d.divider[1] - d.divider[0])} />
          <NoImage small className="rounded-[5px]" style={at(15.1, d.photoY, 73.7, d.photoH)} />
          <div className="absolute flex items-center justify-center rounded-[4px]" style={{ ...at(98.4, d.chipY, 29.6, d.chipH), background: d.kind === "売買" ? "#fad1e1" : "#cfe4fd" }}>
            <span className="leading-none" style={{ fontSize: 7.2, fontWeight: 700, color: d.kind === "売買" ? "#c1246c" : "#1f5fd1" }}>
              {d.kind}
            </span>
          </div>
          <T x={99.3} y={d.addrY + (d.kind === "売買" ? 1.3 : 0.9)} s={7.8} w={700} c={INK}>
            {d.address}
          </T>
          <CircleDot size={5.6} strokeWidth={1} absoluteStrokeWidth color={SUB} style={at(98.6, d.dateY + 0.3)} />
          <T x={106.1} y={d.dateY} s={6.6} c={SUB}>
            {d.date}
          </T>
          <CircleDot size={5.6} strokeWidth={1} absoluteStrokeWidth color={SUB} style={at(98.6, d.walkY + 0.3)} />
          <T x={106.1} y={d.walkY} s={6.6} c={SUB}>
            {d.walk}
          </T>
          {d.lines.map((r) => (
            <div key={r.label}>
              <T x={239.1} y={r.kind === "area" ? r.y + 0.5 : r.kind === "big" ? r.y + 1.4 : r.y + 1.4} s={6.6} c={SUB}>
                {r.label}
              </T>
              {r.kind === "big" ? (
                <T x={280.5} y={r.y + 1.1} s={d.kind === "売買" ? 11.2 : 10.7} w={700} c={INK} latin>
                  {r.value}
                  <span style={{ fontSize: 8.2, marginLeft: 3 }}>{d.kind === "売買" ? "億円" : "円/月"}</span>
                </T>
              ) : r.kind === "unit" ? (
                <T x={280.5} y={r.y + 0.6} s={8.3} w={500} c={INK} latin>
                  {r.value}
                  <span style={{ fontSize: 7.3, marginLeft: 2.4 }}>円/㎡</span>
                </T>
              ) : (
                <T x={280.5} y={r.y + (d.kind === "売買" ? 1.1 : 2.1)} s={6.75} c={INK} latin>
                  {r.value}
                </T>
              )}
            </div>
          ))}
          <T x={279.7} y={d.noteY + 0.7} s={6.65} c={SUB}>
            {d.note}
          </T>
          <ChevronRight size={14.4} strokeWidth={1.3} absoluteStrokeWidth color="#1c3460" style={at(372 - 5.4, d.chevY - 3.6)} />
        </div>
      ))}

      {/* 対象物件との比較 */}
      <div className="absolute rounded-[8px] bg-[#e9f3fd]" style={at(15, 689.9, 363.3, 76)} />
      <GrowthChart size={13.5} color="#1a3263" style={at(22.6, 701)} />
      <T x={46} y={699.4} s={8} w={700} c={INK}>
        対象物件との比較
      </T>
      <T x={46} y={711.8} s={6.4} c={SUB}>
        周辺の取引事例と比較した価格水準の目安です。
      </T>
      <T x={334.2} y={705.3} s={6.8} w={500} c="#1f6fe0">
        もっと見る
      </T>
      <ChevronRight size={12.6} strokeWidth={1.4} absoluteStrokeWidth color="#1f6fe0" style={at(371.6 - 4.7, 704.5 - 3.15)} />
      <div className="absolute rounded-[7px] bg-[#fcfcfe]" style={at(20, 717.7, 355.6, 42.8)} />
      {[
        { label: "本物件の参考単価（公示地価）", value: "2,430,000", note: "（約8,033,000 円/坪）", lx: 37.3, vx: 44.6, nx: 45.5 },
        { label: "周辺の取引事例平均（売買）", value: "2,580,000", note: "（約8,530,000 円/坪）", lx: 160.3, vx: 166.2, nx: 167.1 },
        { label: "周辺の取引事例平均（賃貸）", value: "22,500", note: "（約74,400 円/坪・月額）", lx: 279.2, vx: 293.3, nx: 282.3 },
      ].map((c) => (
        <div key={c.label}>
          <T x={c.lx} y={727.3} s={6.5} c="#3f4a5f">
            {c.label}
          </T>
          <T x={c.vx} y={738.5} s={10} w={700} c={INK} latin>
            {c.value}
            <span style={{ fontSize: 7.4, fontWeight: 600, marginLeft: 2.6 }}>円/㎡</span>
          </T>
          <T x={c.nx - 0.9} y={752} s={6.75} c={SUB}>
            {c.note}
          </T>
        </div>
      ))}
      <div className="absolute bg-[#d5dce6]" style={at(139.3, 726, 0.6, 28)} />
      <div className="absolute bg-[#d5dce6]" style={at(262.3, 726, 0.6, 28)} />
    </div>
  );
}
