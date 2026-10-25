// スマホの画面の共通のきまり（色・動き・角丸）。仕事の状態を表す色と、光の演出の色（lib/app/sun.ts）は混ぜない。
// 色の名前はここで決め、部品（components/app/r-ui.tsx など）はここを参照する

/** 調査の状況の6つの状態。自動取得済み・公式資料を参照可能・確認済み・一部確認済み・未確認・取得失敗 */
export const STATUS = {
  auto: { color: "#133664", bg: "#e8eef7", label: "取得済み" },
  official: { color: "#1f5fbf", bg: "#e7f0fb", label: "公式図を確認" },
  confirmed: { color: "#1f8f5a", bg: "#e3f5ec", label: "確認済み" },
  partial: { color: "#1f8f5a", bg: "#e3f5ec", label: "一部確認済み" },
  unconfirmed: { color: "#6b7890", bg: "#eef1f5", label: "未確認" },
  failed: { color: "#c2561f", bg: "#fdf1ec", label: "読み込めず" },
} as const;
export type StatusKey = keyof typeof STATUS;

/** お気に入りの星の金色（状態の色とは別。保存できたときだけ） */
export const STAR = "#f5a524";

/**
 * 動きの速さは3つだけ：押した反応は短く（80ms で沈み、220ms で戻る）、画面の切り替えは少しゆったり（300ms 前後）、
 * 空の変化は数分。曲線は「速く始まってゆっくり止まる」
 */
export const MOTION = {
  press: 80,
  release: 220,
  quick: 180,
  content: 160,
  page: 300,
  sheet: 320,
  sheetOut: 240,
  ease: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  easeIn: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

/** 角丸：大きな板 22、カード 18、ボタン 14、札とチップは円 */
export const RADIUS = { panel: 22, card: 18, button: 14 } as const;

/** 動きを減らす設定か */
export const reducedMotion = (): boolean => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** スマホの幅か（PC の画面では動きを付けない） */
export const phoneWidth = (): boolean => typeof matchMedia !== "undefined" && matchMedia("(max-width: 1023px)").matches;
