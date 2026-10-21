// モック画面：絵ごとの「上の部分・下の2つのボタン・下のメニュー」の配置（絵から測った値。scratchpad の genlayout.py で作成）
// 5枚の絵は1枚ずつ作られたので、上の部分の大きさが少しずつ違う。タブを押すと、その絵の配置に切り替わる
import type { MockTab } from "./mock-app";

export type Box = [number, number, number, number];
export type Txt = { x: number; y: number; s: number; ls?: number };
export type Layout = {
  heroH: number;
  sheetY: number;
  cardY: number;
  mark: Box;
  word: Txt;
  tag: Txt;
  btns: {
    cx: [number, number];
    cy: number;
    labelX: [number, number];
    labelY: number;
    labelS: number;
    menu: [number, number];
  };
  title: { x: number; y1: number; y2: number; s: number; ls: number };
  divider: [number, number, number] | null;
  search: { bar: Box; btn: Box; clear: [number, number, number]; text: Txt };
  recent: {
    label: Txt;
    chipY: number;
    chipH: number;
    chipS: number;
    chips: [number, number][];
  };
  addr: {
    pin: [number, number, number];
    title: Txt;
    sub: Txt;
    copy: [number, number] | null;
    fav: Box;
    share: Box;
    favText: Txt;
    shareText: Txt;
  };
  tabs: { y: number; h: number; boxes: [number, number][]; labels: string[] };
  buttons: {
    y: number;
    h: number;
    share: [number, number];
    report: [number, number];
    content: [number, number];
    rcontent: [number, number];
  };
  nav: { cx: number[]; labels: string[] };
};

export const LAYOUTS: Record<Exclude<MockTab, "price">, Layout> = {
  basic: {
    heroH: 236,
    sheetY: 214.5,
    cardY: 221.5,
    mark: [20.5, 41.0, 35.3, 25.9],
    word: { x: 74.0, y: 44.3, s: 15.2, ls: 3.95 },
    tag: { x: 72.6, y: 60.6, s: 7.2, ls: 0.64 },
    btns: {
      cx: [279.1, 322.2],
      cy: 48.2,
      labelX: [279.3, 322.2],
      labelY: 59.4,
      labelS: 6.4,
      menu: [365.8, 47.5],
    },
    title: { x: 23.5, y1: 87.0, y2: 111.2, s: 18.4, ls: 3.22 },
    divider: [24.0, 138.8, 23.1],
    search: {
      bar: [15.8, 145.2, 360.5, 32.6],
      btn: [335.2, 147.2, 39.2, 28],
      clear: [317.7, 161.7, 16.6],
      text: { x: 54.3, y: 157.9, s: 10.06 },
    },
    recent: {
      label: { x: 33.6, y: 194.2, s: 7.1 },
      chipY: 187.4,
      chipH: 20.7,
      chipS: 7.25,
      chips: [
        [78.3, 107.6],
        [191.2, 91.6],
        [287.8, 91.4],
      ],
    },
    addr: {
      pin: [15.7, 229.9, 30.9],
      title: { x: 54.9, y: 236.6, s: 10.5 },
      sub: { x: 54.4, y: 253.2, s: 7.86 },
      copy: [181.2, 251.8],
      fav: [265.7, 233.8, 68.7, 23.8],
      share: [339, 233.8, 39.2, 23.8],
      favText: { x: 291.0, y: 243.1, s: 6.8 },
      shareText: { x: 359.8, y: 242.4, s: 6.3 },
    },
    tabs: {
      y: 271.9,
      h: 25.4,
      boxes: [
        [15.2, 57.2],
        [76.1, 55.4],
        [134.9, 63.9],
        [201.8, 63.4],
        [269.4, 55.3],
        [328, 50.7],
      ],
      labels: [
        "基本情報",
        "周辺環境",
        "相場・取引",
        "法令・規制",
        "ハザード",
        "取引事例",
      ],
    },
    buttons: {
      y: 770.3,
      h: 26.8,
      share: [14.8, 179.9],
      report: [200.2, 178.5],
      content: [65.04, 141.15],
      rcontent: [250.01, 330.73],
    },
    nav: {
      cx: [49.4, 146.2, 247.7, 345.3],
      labels: ["ホーム", "検索履歴", "お気に入り", "マイページ"],
    },
  },
  around: {
    heroH: 206,
    sheetY: 184.8,
    cardY: 192.3,
    mark: [20.2, 34.1, 34.0, 24.2],
    word: { x: 67.6, y: 38.3, s: 15.1, ls: 3.92 },
    tag: { x: 67.6, y: 52.5, s: 7.13, ls: 0.63 },
    btns: {
      cx: [280.1, 322.6],
      cy: 40.1,
      labelX: [280.1, 322.4],
      labelY: 50.9,
      labelS: 6.49,
      menu: [362.3, 40.3],
    },
    title: { x: 22.3, y1: 74.1, y2: 96.6, s: 17.64, ls: 3.09 },
    divider: null,
    search: {
      bar: [15.5, 124.3, 361.2, 27.8],
      btn: [337.0, 126.6, 37.8, 24.1],
      clear: [320.5, 138.2, 15.5],
      text: { x: 50.4, y: 135.4, s: 9.6 },
    },
    recent: {
      label: { x: 34.1, y: 166.7, s: 8.0 },
      chipY: 160.9,
      chipH: 17.8,
      chipS: 7.38,
      chips: [
        [78.6, 109.5],
        [192.5, 90.4],
        [287.2, 92.2],
      ],
    },
    addr: {
      pin: [15.5, 195.5, 30],
      title: { x: 54.6, y: 201.3, s: 10.37 },
      sub: { x: 54.6, y: 216.8, s: 7.79 },
      copy: null,
      fav: [263.7, 197.4, 67.8, 25.1],
      share: [335.6, 197.4, 43.7, 25.1],
      favText: { x: 289.1, y: 207.7, s: 6.9 },
      shareText: { x: 357.9, y: 206.9, s: 6.46 },
    },
    tabs: {
      y: 233.2,
      h: 21.8,
      boxes: [
        [15, 55],
        [73.8, 58.7],
        [135.5, 61],
        [200, 60.5],
        [264, 56.5],
        [324.5, 54.3],
      ],
      labels: [
        "基本情報",
        "周辺環境",
        "価格・取引",
        "法令・規制",
        "ハザード",
        "取引事例",
      ],
    },
    buttons: {
      y: 766.0,
      h: 21.8,
      share: [13.7, 179.4],
      report: [194.5, 184.4],
      content: [67.4, 139.35],
      rcontent: [249.1, 321.96],
    },
    nav: {
      cx: [46.2, 121.6, 197.9, 273.7, 346.6],
      labels: ["ホーム", "検索履歴", "お気に入り", "周辺環境", "マイページ"],
    },
  },
  law: {
    heroH: 231,
    sheetY: 209.8,
    cardY: 219.3,
    mark: [18.0, 38.7, 36.7, 25.1],
    word: { x: 71.2, y: 42.0, s: 15.2, ls: 3.94 },
    tag: { x: 70.3, y: 58.5, s: 7.16, ls: 0.64 },
    btns: {
      cx: [280.3, 321.7],
      cy: 46.3,
      labelX: [280.1, 321.5],
      labelY: 58.2,
      labelS: 6.14,
      menu: [363.4, 45.5],
    },
    title: { x: 21.4, y1: 84.1, y2: 108.5, s: 18.29, ls: 3.2 },
    divider: [21.4, 133.9, 22.8],
    search: {
      bar: [15.0, 141.6, 361.2, 30.5],
      btn: [334.3, 142.1, 40, 29.1],
      clear: [318.5, 156.8, 16.2],
      text: { x: 52.7, y: 152.7, s: 9.96 },
    },
    recent: {
      label: { x: 33.2, y: 188.6, s: 6.65 },
      chipY: 180.8,
      chipH: 20.5,
      chipS: 7.44,
      chips: [
        [75.0, 110.4],
        [188.8, 93.2],
        [285.8, 93.6],
      ],
    },
    addr: {
      pin: [15.2, 222.9, 31.5],
      title: { x: 54.6, y: 230.4, s: 10.46 },
      sub: { x: 54.6, y: 247.3, s: 7.97 },
      copy: null,
      fav: [262.8, 228.2, 68.7, 22.1],
      share: [337.0, 228.2, 41.9, 22.1],
      favText: { x: 288.2, y: 236.8, s: 7.0 },
      shareText: { x: 358.4, y: 236.5, s: 6.46 },
    },
    tabs: {
      y: 265.0,
      h: 24.6,
      boxes: [
        [15, 55],
        [75, 59],
        [136, 60],
        [200.8, 62.9],
        [268, 55],
        [328, 52],
      ],
      labels: [
        "基本情報",
        "周辺環境",
        "相場・取引",
        "法令・規制",
        "ハザード",
        "取引事例",
      ],
    },
    buttons: {
      y: 744.1,
      h: 23.7,
      share: [13.2, 184.9],
      report: [198.5, 180.4],
      content: [62.39, 139.8],
      rcontent: [247.28, 328.79],
    },
    nav: {
      cx: [47.6, 146.6, 245.9, 344.0],
      labels: ["ホーム", "検索履歴", "お気に入り", "マイページ"],
    },
  },
  hazard: {
    heroH: 231,
    sheetY: 209.8,
    cardY: 219.3,
    mark: [18.4, 39.1, 36.2, 25.6],
    word: { x: 70.8, y: 42.0, s: 15.2, ls: 3.94 },
    tag: { x: 70.3, y: 58.5, s: 7.16, ls: 0.64 },
    btns: {
      cx: [275.3, 317.9],
      cy: 46.7,
      labelX: [276.2, 317.9],
      labelY: 57.7,
      labelS: 6.09,
      menu: [360.9, 46.5],
    },
    title: { x: 22.3, y1: 83.6, y2: 108.5, s: 18.23, ls: 3.19 },
    divider: [22.3, 134.8, 23.7],
    search: {
      bar: [15.0, 143.0, 359.0, 29.6],
      btn: [333.8, 143.0, 38.3, 28.2],
      clear: [315.5, 157.8, 16.2],
      text: { x: 53.1, y: 154.1, s: 9.93 },
    },
    recent: {
      label: { x: 33.6, y: 189.5, s: 6.65 },
      chipY: 182.2,
      chipH: 20.0,
      chipS: 7.35,
      chips: [
        [75.4, 109.1],
        [188.8, 92.7],
        [285.3, 93.7],
      ],
    },
    addr: {
      pin: [15.5, 223.4, 29.5],
      title: { x: 53.7, y: 230.9, s: 10.37 },
      sub: { x: 53.7, y: 247.3, s: 7.67 },
      copy: [177.6, 246.1],
      fav: [263, 228.3, 66.5, 22.7],
      share: [334, 228.3, 43.5, 22.7],
      favText: { x: 288.7, y: 237.2, s: 6.52 },
      shareText: { x: 357.0, y: 236.5, s: 6.46 },
    },
    tabs: {
      y: 264.6,
      h: 23.7,
      boxes: [
        [15, 56],
        [75, 59],
        [136, 59],
        [199, 60],
        [263.7, 55.5],
        [324, 54],
      ],
      labels: [
        "基本情報",
        "周辺環境",
        "相場・取引",
        "法令・規制",
        "ハザード",
        "取引事例",
      ],
    },
    buttons: {
      y: 743.6,
      h: 26.9,
      share: [14.6, 182.5],
      report: [197.6, 179.9],
      content: [63.3, 139.35],
      rcontent: [247.28, 326.51],
    },
    nav: {
      cx: [46.5, 144.1, 244.8, 343.1],
      labels: ["ホーム", "検索履歴", "お気に入り", "マイページ"],
    },
  },
  deals: {
    heroH: 221,
    sheetY: 199.8,
    cardY: 208.3,
    mark: [19.8, 37.8, 34.9, 25.1],
    word: { x: 71.2, y: 41.5, s: 14.9, ls: 3.88 },
    tag: { x: 70.8, y: 56.6, s: 7.08, ls: 0.63 },
    btns: {
      cx: [277.3, 320.6],
      cy: 45.4,
      labelX: [277.3, 321.0],
      labelY: 56.4,
      labelS: 6.49,
      menu: [365.9, 44.6],
    },
    title: { x: 23.2, y1: 81.4, y2: 103.9, s: 18.01, ls: 3.15 },
    divider: [23.2, 129.3, 21.9],
    search: {
      bar: [16.4, 135.3, 358.5, 30.0],
      btn: [334.7, 136.1, 38.3, 27.8],
      clear: [315.5, 150.3, 16.2],
      text: { x: 52.7, y: 146.8, s: 10.02 },
    },
    recent: {
      label: { x: 32.7, y: 180.4, s: 7.19 },
      chipY: 173.4,
      chipH: 20.0,
      chipS: 7.22,
      chips: [
        [76.8, 107.2],
        [189.7, 91.3],
        [286.3, 91.3],
      ],
    },
    addr: {
      pin: [15.8, 212.1, 29],
      title: { x: 53.3, y: 217.7, s: 10.46 },
      sub: { x: 53.2, y: 233.2, s: 7.79 },
      copy: [176.2, 232.4],
      fav: [264.6, 215.4, 68.7, 22.8],
      share: [338.4, 215.4, 40.9, 22.8],
      favText: { x: 289.1, y: 224.5, s: 6.71 },
      shareText: { x: 358.9, y: 223.8, s: 6.7 },
    },
    tabs: {
      y: 251.4,
      h: 23.2,
      boxes: [
        [15, 55],
        [75, 53],
        [132, 62],
        [199, 60],
        [263, 56],
        [323.3, 58.3],
      ],
      labels: [
        "基本情報",
        "周辺環境",
        "相場・取引",
        "法令・規制",
        "ハザード",
        "取引事例",
      ],
    },
    buttons: {
      y: 768.7,
      h: 22.8,
      share: [15.0, 183],
      report: [199.5, 178],
      content: [64.67, 140.26],
      rcontent: [250.01, 327.42],
    },
    nav: {
      cx: [42.6, 144.8, 248.0, 350.4],
      labels: ["ホーム", "検索履歴", "お気に入り", "マイページ"],
    },
  },
};
